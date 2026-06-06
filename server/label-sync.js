import crypto from "node:crypto";
import { dbPool } from "./db.js";
import { getConnectedEmailAccounts, getValidEmailAccountAccessToken } from "./email-accounts.js";

export async function ensureLabelSyncTable() {
  if (!dbPool) {
    return;
  }

  await dbPool.query(`
    create table if not exists label_account_syncs (
      id uuid primary key,
      label_id uuid not null references labels(id) on delete cascade,
      email_account_id uuid not null references email_accounts(id) on delete cascade,
      provider text not null,
      provider_label_id text,
      sync_status text not null default 'pending',
      pending_action text,
      last_error text,
      last_attempt_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (label_id, email_account_id)
    )
  `);
  await dbPool.query("create index if not exists label_account_syncs_label_id_idx on label_account_syncs(label_id)");
  await dbPool.query(
    "create index if not exists label_account_syncs_email_account_id_idx on label_account_syncs(email_account_id)",
  );
}

export async function syncLabelToConnectedAccounts(userId, label, action) {
  const accounts = await getConnectedEmailAccounts(userId);

  for (const account of accounts) {
    await syncLabelToAccount(label, account, action);
  }
}

export async function syncAllLabelsToConnectedAccounts(userId) {
  const [labels, accounts] = await Promise.all([getUserLabels(userId), getConnectedEmailAccounts(userId)]);

  for (const label of labels) {
    for (const account of accounts) {
      await syncLabelToAccount(label, account, "update");
    }
  }
}

export async function refreshAllLabelSyncStatus(userId) {
  const [labels, accounts] = await Promise.all([getUserLabels(userId), getConnectedEmailAccounts(userId)]);

  for (const label of labels) {
    for (const account of accounts) {
      await checkLabelSync(label, account);
    }
  }
}

export async function ensureLabelSyncedToAccount(userId, labelId, emailAccountId) {
  const result = await dbPool.query(
    `
      select l.id, l.user_id as "userId", l.name, l.description,
             ea.id as "accountId",
             ea.provider,
             ea.email,
             ea.access_token,
             ea.refresh_token,
             ea.token_expires_at as "tokenExpiresAt"
      from labels l
      join email_accounts ea on ea.user_id = l.user_id
      where l.user_id = $1
        and l.id = $2
        and ea.id = $3
      limit 1
    `,
    [userId, labelId, emailAccountId],
  );
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  const label = { id: row.id, userId: row.userId, name: row.name, description: row.description };
  const account = {
    id: row.accountId,
    provider: row.provider,
    email: row.email,
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    tokenExpiresAt: row.tokenExpiresAt,
  };

  await syncLabelToAccount(label, account, "update");
  return getSync(labelId, emailAccountId);
}

export async function retryLabelSync(userId, labelId) {
  const label = await getUserLabel(userId, labelId);
  if (!label) {
    return null;
  }

  const failedSyncs = await dbPool.query(
    `
      select las.*,
             ea.id,
             ea.provider,
             ea.email,
             ea.access_token,
             ea.refresh_token,
             ea.token_expires_at as "tokenExpiresAt"
      from label_account_syncs las
      join email_accounts ea on ea.id = las.email_account_id
      where las.label_id = $1
        and ea.user_id = $2
        and las.sync_status = 'failed'
    `,
    [labelId, userId],
  );

  for (const sync of failedSyncs.rows) {
    await syncLabelToAccount(label, sync, sync.pending_action || "update");
  }

  if (failedSyncs.rows.some((sync) => sync.pending_action === "delete")) {
    const remaining = await getFailedDeleteSyncCount(labelId);
    if (remaining === 0) {
      await dbPool.query("delete from labels where id = $1 and user_id = $2", [labelId, userId]);
      return { deleted: true };
    }
  }

  return { deleted: false };
}

export async function tryDeleteLabelEverywhere(userId, labelId) {
  const label = await getUserLabel(userId, labelId);
  if (!label) {
    return { deleted: false, failed: false };
  }

  const accounts = await getConnectedEmailAccounts(userId);

  for (const account of accounts) {
    await syncLabelToAccount(label, account, "delete");
  }

  const failures = await getFailedDeleteSyncCount(labelId);
  if (failures > 0) {
    return { deleted: false, failed: true };
  }

  await dbPool.query("delete from labels where id = $1 and user_id = $2", [labelId, userId]);
  return { deleted: true, failed: false };
}

export async function attachSyncsToLabels(labels) {
  if (labels.length === 0) {
    return labels;
  }

  const result = await dbPool.query(
    `
      select las.label_id as "labelId",
             las.email_account_id as "emailAccountId",
             las.provider,
             las.provider_label_id as "providerLabelId",
             las.sync_status as "syncStatus",
             las.pending_action as "pendingAction",
             las.last_error as "lastError",
             ea.email
      from label_account_syncs las
      join email_accounts ea on ea.id = las.email_account_id
      where las.label_id = any($1::uuid[])
      order by ea.email
    `,
    [labels.map((label) => label.id)],
  );
  const syncsByLabel = new Map();

  for (const sync of result.rows) {
    const list = syncsByLabel.get(sync.labelId) ?? [];
    list.push(sync);
    syncsByLabel.set(sync.labelId, list);
  }

  return labels.map((label) => ({
    ...label,
    syncs: syncsByLabel.get(label.id) ?? [],
  }));
}

async function syncLabelToAccount(label, account, action) {
  await markSyncAttempt(label.id, account.id, account.provider, action);

  try {
    const existingSync = await getSync(label.id, account.id);
    const accessToken = await getValidEmailAccountAccessToken(account);
    const providerLabelId = await runProviderAction({
      account,
      action,
      accessToken,
      label,
      providerLabelId: existingSync?.provider_label_id,
    });

    await markSyncSuccess(label.id, account.id, account.provider, providerLabelId, action);
  } catch (error) {
    await markSyncFailure(label.id, account.id, account.provider, action, error);
  }
}

async function checkLabelSync(label, account) {
  try {
    const existingSync = await getSync(label.id, account.id);
    const accessToken = await getValidEmailAccountAccessToken(account);

    if (!existingSync?.provider_label_id) {
      throw new Error("Label is missing from this email account");
    }

    const providerLabel = await getProviderLabel({
      account,
      accessToken,
      providerLabelId: existingSync.provider_label_id,
    });

    if (!providerLabel || providerLabel.name !== label.name) {
      throw new Error("Provider label is missing or has a different name");
    }

    await markSyncSuccess(label.id, account.id, account.provider, existingSync.provider_label_id, "update");
  } catch (error) {
    await markSyncFailure(label.id, account.id, account.provider, "update", error);
  }
}

async function runProviderAction({ account, action, accessToken, label, providerLabelId }) {
  if (account.provider === "gmail") {
    return syncGmailLabel({ action, accessToken, label, providerLabelId });
  }

  if (account.provider === "microsoft") {
    return syncMicrosoftFolder({ action, accessToken, label, providerLabelId });
  }

  throw new Error(`${account.provider} label sync is not implemented yet`);
}

async function getProviderLabel({ account, accessToken, providerLabelId }) {
  if (account.provider === "gmail") {
    return getGmailLabel({ accessToken, providerLabelId });
  }

  if (account.provider === "microsoft") {
    return getMicrosoftFolder({ accessToken, providerLabelId });
  }

  throw new Error(`${account.provider} label validation is not implemented yet`);
}

async function syncGmailLabel({ action, accessToken, label, providerLabelId }) {
  const baseUrl = "https://gmail.googleapis.com/gmail/v1/users/me/labels";

  if (action === "delete" && !providerLabelId) {
    return null;
  }

  if (action === "create" || !providerLabelId) {
    return createGmailLabel({ accessToken, label });
  }

  if (action === "update") {
    try {
      const current = await getGmailLabel({ accessToken, providerLabelId });

      if (!current || current.name !== label.name) {
        await providerFetch(`${baseUrl}/${encodeURIComponent(providerLabelId)}`, accessToken, {
          method: "PATCH",
          body: JSON.stringify({
            name: label.name,
          }),
        });
      }
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }

      return createGmailLabel({ accessToken, label });
    }

    return providerLabelId;
  }

  if (action === "delete") {
    await providerFetch(`${baseUrl}/${encodeURIComponent(providerLabelId)}`, accessToken, {
      method: "DELETE",
    });
    return providerLabelId;
  }

  throw new Error(`Unsupported label sync action: ${action}`);
}

async function createGmailLabel({ accessToken, label }) {
  try {
    const response = await providerFetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", accessToken, {
      method: "POST",
      body: JSON.stringify({
        name: label.name,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      }),
    });
    const created = await response.json();
    return created.id;
  } catch (error) {
    if (error.status !== 409) {
      throw error;
    }

    const existing = await findGmailLabelByName({ accessToken, name: label.name });
    if (!existing) {
      throw error;
    }

    return existing.id;
  }
}

async function findGmailLabelByName({ accessToken, name }) {
  const response = await providerFetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", accessToken, {
    method: "GET",
  });
  const data = await response.json();
  return (data.labels ?? []).find((label) => label.name === name) ?? null;
}

async function getGmailLabel({ accessToken, providerLabelId }) {
  if (!providerLabelId) {
    return null;
  }

  const response = await providerFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/labels/${encodeURIComponent(providerLabelId)}`,
    accessToken,
    { method: "GET" },
  );
  const label = await response.json();
  return { id: label.id, name: label.name };
}

async function syncMicrosoftFolder({ action, accessToken, label, providerLabelId }) {
  const baseUrl = "https://graph.microsoft.com/v1.0/me/mailFolders";

  if (action === "delete" && !providerLabelId) {
    return null;
  }

  if (action === "create" || !providerLabelId) {
    const response = await providerFetch(baseUrl, accessToken, {
      method: "POST",
      body: JSON.stringify({ displayName: label.name }),
    });
    const created = await response.json();
    return created.id;
  }

  if (action === "update") {
    try {
      const current = await getMicrosoftFolder({ accessToken, providerLabelId });

      if (!current || current.name !== label.name) {
        await providerFetch(`${baseUrl}/${encodeURIComponent(providerLabelId)}`, accessToken, {
          method: "PATCH",
          body: JSON.stringify({ displayName: label.name }),
        });
      }
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }

      const response = await providerFetch(baseUrl, accessToken, {
        method: "POST",
        body: JSON.stringify({ displayName: label.name }),
      });
      const created = await response.json();
      return created.id;
    }

    return providerLabelId;
  }

  if (action === "delete") {
    await providerFetch(`${baseUrl}/${encodeURIComponent(providerLabelId)}`, accessToken, {
      method: "DELETE",
    });
    return providerLabelId;
  }

  throw new Error(`Unsupported folder sync action: ${action}`);
}

async function getMicrosoftFolder({ accessToken, providerLabelId }) {
  if (!providerLabelId) {
    return null;
  }

  const response = await providerFetch(
    `https://graph.microsoft.com/v1.0/me/mailFolders/${encodeURIComponent(providerLabelId)}`,
    accessToken,
    { method: "GET" },
  );
  const folder = await response.json();
  return { id: folder.id, name: folder.displayName };
}

async function providerFetch(url, accessToken, options) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Provider request failed with ${response.status}: ${text.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }

  return response;
}

async function getUserLabels(userId) {
  const result = await dbPool.query(
    `
      select id, user_id as "userId", name, description, created_at as "createdAt", updated_at as "updatedAt"
      from labels
      where user_id = $1
      order by lower(name), created_at desc
    `,
    [userId],
  );

  return result.rows;
}

async function getUserLabel(userId, labelId) {
  const result = await dbPool.query(
    `
      select id, user_id as "userId", name, description, created_at as "createdAt", updated_at as "updatedAt"
      from labels
      where user_id = $1 and id = $2
    `,
    [userId, labelId],
  );

  return result.rows[0] ?? null;
}

async function getSync(labelId, accountId) {
  const result = await dbPool.query(
    "select * from label_account_syncs where label_id = $1 and email_account_id = $2",
    [labelId, accountId],
  );

  return result.rows[0] ?? null;
}

async function markSyncAttempt(labelId, accountId, provider, action) {
  await dbPool.query(
    `
      insert into label_account_syncs (
        id, label_id, email_account_id, provider, sync_status, pending_action, last_error, last_attempt_at
      )
      values ($1, $2, $3, $4, 'pending', $5, null, now())
      on conflict (label_id, email_account_id) do update
      set sync_status = 'pending',
          pending_action = excluded.pending_action,
          last_error = null,
          last_attempt_at = now(),
          updated_at = now()
    `,
    [crypto.randomUUID(), labelId, accountId, provider, action],
  );
}

async function markSyncSuccess(labelId, accountId, provider, providerLabelId, action) {
  if (action === "delete") {
    await dbPool.query("delete from label_account_syncs where label_id = $1 and email_account_id = $2", [
      labelId,
      accountId,
    ]);
    return;
  }

  await dbPool.query(
    `
      insert into label_account_syncs (
        id, label_id, email_account_id, provider, provider_label_id,
        sync_status, pending_action, last_error, last_attempt_at
      )
      values ($1, $2, $3, $4, $5, 'synced', null, null, now())
      on conflict (label_id, email_account_id) do update
      set provider_label_id = excluded.provider_label_id,
          sync_status = 'synced',
          pending_action = null,
          last_error = null,
          last_attempt_at = now(),
          updated_at = now()
    `,
    [crypto.randomUUID(), labelId, accountId, provider, providerLabelId],
  );
}

async function markSyncFailure(labelId, accountId, provider, action, error) {
  await dbPool.query(
    `
      insert into label_account_syncs (
        id, label_id, email_account_id, provider, sync_status, pending_action, last_error, last_attempt_at
      )
      values ($1, $2, $3, $4, 'failed', $5, $6, now())
      on conflict (label_id, email_account_id) do update
      set sync_status = 'failed',
          pending_action = excluded.pending_action,
          last_error = excluded.last_error,
          last_attempt_at = now(),
          updated_at = now()
    `,
    [crypto.randomUUID(), labelId, accountId, provider, action, error.message],
  );
}

async function getFailedDeleteSyncCount(labelId) {
  const result = await dbPool.query(
    `
      select count(*)::int as count
      from label_account_syncs
      where label_id = $1
        and sync_status = 'failed'
        and pending_action = 'delete'
    `,
    [labelId],
  );

  return result.rows[0]?.count ?? 0;
}
