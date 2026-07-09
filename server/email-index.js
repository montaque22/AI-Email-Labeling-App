import crypto from "node:crypto";
import { dbPool } from "./db.js";

export const EMAIL_INDEX_PAGE_SIZE = 30;

export async function ensureEmailIndexTable() {
  if (!dbPool) {
    return;
  }

  await dbPool.query(`
    create table if not exists email_index (
      id uuid primary key,
      user_id text not null references "user"(id) on delete cascade,
      email_account_id uuid not null references email_accounts(id) on delete cascade,
      account_email text not null,
      provider text not null,
      email_id text not null,
      thread_id text not null default '',
      mailbox text not null default '',
      direction text not null default 'inbox',
      from_email text not null default '',
      from_name text not null default '',
      to_emails text not null default '',
      subject text not null default '',
      snippet text not null default '',
      labels text[] not null default '{}',
      received_at timestamptz not null default now(),
      is_read boolean not null default true,
      has_attachments boolean not null default false,
      archived boolean not null default false,
      reply_count integer not null default 0,
      responding_to_email_id text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await dbPool.query("alter table email_index add column if not exists direction text not null default 'inbox'");
  await dbPool.query("alter table email_index add column if not exists responding_to_email_id text");
  await dbPool.query("alter table email_index add column if not exists metadata jsonb not null default '{}'::jsonb");
  await dbPool.query("alter table email_index add column if not exists archived boolean not null default false");
  await dbPool.query("alter table email_index add column if not exists commitment_text text");
  await dbPool.query("alter table email_index add column if not exists commitment_due_at timestamptz");
  await dbPool.query("alter table email_index add column if not exists commitment_set_at timestamptz");
  await dbPool.query("alter table email_index add column if not exists commitment_completed_at timestamptz");
  await dbPool.query(`
    create unique index if not exists email_index_message_unique
      on email_index (user_id, email_account_id, email_id, mailbox)
  `);
  await dbPool.query("create index if not exists email_index_user_received_idx on email_index (user_id, received_at desc)");
  await dbPool.query("create index if not exists email_index_user_direction_idx on email_index (user_id, direction)");
  await dbPool.query("create index if not exists email_index_user_labels_idx on email_index using gin (labels)");
  await dbPool.query("create index if not exists email_index_user_commitment_idx on email_index (user_id, commitment_due_at) where commitment_set_at is not null");
}

export async function upsertEmailIndexEntry(userId, input) {
  if (!dbPool || !input?.emailAccountId || !input?.emailId) {
    return null;
  }

  const labels = normalizeLabels(input.labels);
  const result = await dbPool.query(
    `
      insert into email_index (
        id, user_id, email_account_id, account_email, provider, email_id, thread_id, mailbox,
        direction, from_email, from_name, to_emails, subject, snippet, labels, received_at,
        is_read, has_attachments, reply_count, responding_to_email_id, metadata
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15::text[], $16,
        $17, $18, $19, $20, $21::jsonb
      )
      on conflict (user_id, email_account_id, email_id, mailbox)
      do update set
        account_email = excluded.account_email,
        provider = excluded.provider,
        thread_id = coalesce(nullif(excluded.thread_id, ''), email_index.thread_id),
        direction = excluded.direction,
        from_email = excluded.from_email,
        from_name = excluded.from_name,
        to_emails = excluded.to_emails,
        subject = excluded.subject,
        snippet = excluded.snippet,
        labels = excluded.labels,
        received_at = excluded.received_at,
        is_read = excluded.is_read,
        has_attachments = excluded.has_attachments,
        reply_count = excluded.reply_count,
        responding_to_email_id = excluded.responding_to_email_id,
        metadata = email_index.metadata || excluded.metadata,
        updated_at = now()
      returning *
    `,
    [
      crypto.randomUUID(),
      userId,
      input.emailAccountId,
      input.accountEmail || "",
      input.provider || "",
      input.emailId,
      input.threadId || input.emailId,
      input.mailbox || "",
      input.direction || "inbox",
      input.fromEmail || "",
      input.fromName || "",
      input.toEmails || "",
      input.subject || "",
      input.snippet || "",
      labels,
      input.receivedAt ? new Date(input.receivedAt) : new Date(),
      input.isRead !== false,
      Boolean(input.hasAttachments),
      Number.isInteger(input.replyCount) ? input.replyCount : 0,
      input.respondingToEmailId || null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  return result.rows[0] ? mapEmailIndexRow(result.rows[0]) : null;
}

export async function updateEmailIndexReadStatus(userId, { accountId, emailId, mailbox = "", isRead }) {
  if (!dbPool) {
    return;
  }
  await dbPool.query(
    `
      update email_index
      set is_read = $5,
          updated_at = now()
      where user_id = $1
        and email_account_id = $2
        and email_id = $3
        and mailbox = $4
    `,
    [userId, accountId, emailId, mailbox || "", Boolean(isRead)],
  );
}

export async function updateEmailIndexLabels(userId, { accountId, emailId, mailbox = "", labels, nextMailbox = "" }) {
  if (!dbPool) {
    return;
  }
  const normalizedLabels = normalizeLabels(labels);
  if (mailbox === null) {
    await dbPool.query(
      `
        update email_index
        set labels = $4::text[],
            mailbox = coalesce(nullif($5, ''), mailbox),
            updated_at = now()
        where user_id = $1
          and email_account_id = $2
          and email_id = $3
      `,
      [userId, accountId, emailId, normalizedLabels, nextMailbox || ""],
    );
    return;
  }

  await dbPool.query(
    `
      update email_index
      set labels = $5::text[],
          mailbox = coalesce(nullif($6, ''), mailbox),
          updated_at = now()
      where user_id = $1
        and email_account_id = $2
        and email_id = $3
        and mailbox = $4
    `,
    [userId, accountId, emailId, mailbox || "", normalizedLabels, nextMailbox || ""],
  );
}

export async function deleteEmailIndexEntries(userId, messages) {
  if (!dbPool || !messages.length) {
    return [];
  }

  const deleted = [];
  for (const message of messages) {
    const result = await dbPool.query(
      `
        delete from email_index
        where user_id = $1
          and email_account_id = $2
          and email_id = $3
          and mailbox = $4
          and commitment_set_at is null
        returning *
      `,
      [userId, message.accountId, message.emailId, message.mailbox || ""],
    );
    deleted.push(...result.rows.map(mapEmailIndexRow));
  }
  return deleted;
}

export async function archiveEmailIndexEntries(userId, messages, { allowCommitted = false } = {}) {
  if (!dbPool || !messages.length) {
    return [];
  }

  const archived = [];
  for (const message of messages) {
    const result = await dbPool.query(
      `
        update email_index
        set archived = true,
            updated_at = now()
        where user_id = $1
          and email_account_id = $2
          and email_id = $3
          and mailbox = $4
          ${allowCommitted ? "" : "and commitment_set_at is null"}
        returning *
      `,
      [userId, message.accountId, message.emailId, message.mailbox || ""],
    );
    archived.push(...result.rows.map(mapEmailIndexRow));
  }
  return archived;
}

export async function setEmailIndexCommitment(userId, messages, { text, dueAt }) {
  if (!dbPool || !messages.length) {
    return [];
  }

  const committed = [];
  for (const message of messages) {
    const result = await dbPool.query(
      `
        update email_index
        set commitment_text = $5,
            commitment_due_at = $6,
            commitment_set_at = now(),
            updated_at = now()
        where user_id = $1
          and email_account_id = $2
          and email_id = $3
          and mailbox = $4
          and commitment_completed_at is null
        returning *
      `,
      [userId, message.accountId, message.emailId, message.mailbox || "", text, dueAt],
    );
    committed.push(...result.rows.map(mapEmailIndexRow));
  }
  return committed;
}

export async function clearEmailIndexCommitment(userId, messages) {
  if (!dbPool || !messages.length) {
    return [];
  }

  const cleared = [];
  for (const message of messages) {
    const result = await dbPool.query(
      `
        update email_index
        set commitment_text = null,
            commitment_due_at = null,
            commitment_set_at = null,
            updated_at = now()
        where user_id = $1
          and email_account_id = $2
          and email_id = $3
          and mailbox = $4
          and commitment_completed_at is null
        returning *
      `,
      [userId, message.accountId, message.emailId, message.mailbox || ""],
    );
    cleared.push(...result.rows.map(mapEmailIndexRow));
  }
  return cleared;
}

export async function completeEmailIndexCommitments(userId, messages) {
  if (!dbPool || !messages.length) {
    return [];
  }

  const completed = [];
  for (const message of messages) {
    const result = await dbPool.query(
      `
        update email_index
        set archived = true,
            commitment_completed_at = coalesce(commitment_completed_at, now()),
            updated_at = now()
        where user_id = $1
          and email_account_id = $2
          and email_id = $3
          and mailbox = $4
          and commitment_set_at is not null
        returning *
      `,
      [userId, message.accountId, message.emailId, message.mailbox || ""],
    );
    completed.push(...result.rows.map(mapEmailIndexRow));
  }
  return completed;
}

export async function listEmailIndexEntries(userId, query) {
  const limit = Math.min(Math.max(Number(query.limit) || EMAIL_INDEX_PAGE_SIZE, 1), 100);
  const offset = Math.max(Number.parseInt(query.pageToken || "0", 10) || 0, 0);
  const values = [userId];
  const conditions = ["user_id = $1"];

  if (query.accountIds?.length) {
    values.push(query.accountIds);
    conditions.push(`email_account_id = any($${values.length}::uuid[])`);
  }

  if (query.direction) {
    values.push(query.direction);
    conditions.push(`direction = $${values.length}`);
  }

  if (query.labelName) {
    values.push(query.labelName);
    conditions.push(`$${values.length} = any(labels)`);
  }

  if (query.search) {
    values.push(`%${escapeLike(query.search)}%`);
    const index = values.length;
    conditions.push(`(
      from_email ilike $${index} escape '\\'
      or from_name ilike $${index} escape '\\'
      or to_emails ilike $${index} escape '\\'
      or subject ilike $${index} escape '\\'
    )`);
  }

  if (query.archivedOnly) {
    conditions.push("archived = true");
  } else if (!query.includeArchived) {
    conditions.push("archived = false");
  }

  const orderBy = getEmailIndexOrderBy(query.sort);
  values.push(limit + 1, offset);
  const limitIndex = values.length - 1;
  const offsetIndex = values.length;
  const result = await dbPool.query(
    `
      select *
      from email_index
      where ${conditions.join(" and ")}
      order by ${orderBy}
      limit $${limitIndex}
      offset $${offsetIndex}
    `,
    values,
  );

  const rows = result.rows.slice(0, limit);
  return {
    messages: rows.map(mapEmailIndexRow),
    nextPageToken: result.rows.length > limit ? String(offset + limit) : null,
  };
}

export async function getEmailIndexLabelCounts(userId, { accountIds = [], archivedOnly = false, labels = [] }) {
  const counts = {};
  if (!labels.length) {
    return counts;
  }

  const values = [userId];
  const accountCondition = accountIds.length ? "and email_account_id = any($2::uuid[])" : "";
  if (accountIds.length) {
    values.push(accountIds);
  }

  const result = await dbPool.query(
    `
      select unnest(labels) as label, count(*)::int as count
      from email_index
      where user_id = $1
        ${accountCondition}
        and direction = 'inbox'
        and archived = $${values.length + 1}
      group by label
    `,
    [...values, Boolean(archivedOnly)],
  );
  const countByName = new Map(result.rows.map((row) => [String(row.label).toLowerCase(), row.count]));
  for (const label of labels) {
    counts[label.id] = countByName.get(String(label.name).toLowerCase()) ?? 0;
  }
  return counts;
}

export async function countUnreadEmailIndexEntries(userId) {
  if (!dbPool) {
    return 0;
  }
  const result = await dbPool.query(
    `
      select count(*)::int as count
      from email_index
      where user_id = $1
        and direction = 'inbox'
        and archived = false
        and is_read = false
    `,
    [userId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export function mapEmailIndexRow(row) {
  return {
    id: row.email_id,
    threadId: row.thread_id || row.email_id,
    accountId: row.email_account_id,
    accountEmail: row.account_email,
    provider: row.provider,
    mailbox: row.mailbox || "",
    from: formatFrom(row),
    sender: row.from_name || row.from_email || row.account_email,
    subject: row.subject || "",
    snippet: row.snippet || "",
    date: new Date(row.received_at || row.created_at || Date.now()).toISOString(),
    isRead: row.is_read !== false,
    labels: normalizeLabels(row.labels),
    hasAttachments: Boolean(row.has_attachments),
    archived: Boolean(row.archived),
    commitment: row.commitment_set_at ? {
      text: row.commitment_text || "",
      dueAt: row.commitment_due_at ? new Date(row.commitment_due_at).toISOString() : "",
      setAt: row.commitment_set_at ? new Date(row.commitment_set_at).toISOString() : "",
      completedAt: row.commitment_completed_at ? new Date(row.commitment_completed_at).toISOString() : "",
      isCompleted: Boolean(row.commitment_completed_at),
    } : null,
    replyCount: Number(row.reply_count || 0),
    respondingToEmailId: row.responding_to_email_id || null,
    direction: row.direction || "inbox",
  };
}

export function emailIndexInputFromInboxMessage(account, message, overrides = {}) {
  const fromParts = parseFrom(message.from || "");
  return {
    emailAccountId: account.id,
    accountEmail: account.email,
    provider: account.provider,
    emailId: message.id,
    threadId: message.threadId || message.id,
    mailbox: message.mailbox || "",
    direction: overrides.direction || "inbox",
    fromEmail: overrides.fromEmail ?? fromParts.email,
    fromName: overrides.fromName ?? (message.sender || fromParts.name || fromParts.email),
    toEmails: overrides.toEmails ?? message.to ?? "",
    subject: message.subject || "",
    snippet: message.snippet || message.bodyText?.slice?.(0, 300) || "",
    labels: overrides.labels ?? message.labels ?? [],
    receivedAt: message.date || new Date(),
    isRead: message.isRead !== false,
    hasAttachments: Boolean(message.hasAttachments || message.attachments?.length),
    replyCount: Number(message.replyCount || 0),
    respondingToEmailId: overrides.respondingToEmailId || null,
    metadata: overrides.metadata ?? {},
  };
}

function getEmailIndexOrderBy(sort = "newest") {
  if (sort === "oldest") {
    return "commitment_due_at asc nulls last, received_at asc, created_at asc";
  }
  if (sort === "sender") {
    return "commitment_due_at asc nulls last, lower(coalesce(nullif(from_name, ''), from_email)) asc, received_at desc";
  }
  if (sort === "subject") {
    return "commitment_due_at asc nulls last, lower(subject) asc, received_at desc";
  }
  return "commitment_due_at asc nulls last, received_at desc, created_at desc";
}

function normalizeLabels(labels) {
  return [...new Set((Array.isArray(labels) ? labels : []).map((label) => String(label).trim()).filter(Boolean))];
}

function formatFrom(row) {
  if (row.from_name && row.from_email) {
    return `${row.from_name} <${row.from_email}>`;
  }
  return row.from_email || row.from_name || "";
}

function parseFrom(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].replace(/^"|"$/g, "").trim(), email: match[2].trim() };
  }
  return { name: "", email: text };
}

function escapeLike(value) {
  return String(value ?? "").replace(/[\\%_]/g, (match) => `\\${match}`);
}
