import { auth } from "./auth.js";
import { dbPool } from "./db.js";
import { getConnectedEmailAccounts, getValidEmailAccountAccessToken } from "./email-accounts.js";
import {
  createImapComposeDraft,
  fetchImapInboxMessage,
  getImapInboxCount,
  moveImapInboxMessageToFolder,
  moveImapInboxMessageToTrash,
  searchImapInboxMessages,
} from "./imap-provider.js";
import { modifyGmailMessageLabels } from "./integrations.js";
import { emitWebhookEvent } from "./webhooks.js";

const INBOX_PAGE_SIZE = 10;

export function registerInboxRoutes(app) {
  app.get("/api/inbox/messages", requireSession, async (req, res) => {
    try {
      const input = parseInboxListQuery(req.query);
      if (!input.ok) {
        res.status(400).json({ error: input.error });
        return;
      }

      const result = await listInboxMessages(req.user.id, input.query);
      res.json(result);
    } catch (error) {
      handleProviderError(res, error);
    }
  });

  app.get("/api/inbox/drafts", requireSession, async (req, res) => {
    try {
      const input = parseMailboxListQuery(req.query);
      const result = await listInboxDrafts(req.user.id, input.query);
      res.json(result);
    } catch (error) {
      handleProviderError(res, error);
    }
  });

  app.get("/api/inbox/sent", requireSession, async (req, res) => {
    try {
      const input = parseMailboxListQuery(req.query);
      const result = await listInboxSentMessages(req.user.id, input.query);
      res.json(result);
    } catch (error) {
      handleProviderError(res, error);
    }
  });

  app.get("/api/inbox/message", requireSession, async (req, res) => {
    try {
      const input = parseInboxDetailQuery(req.query);
      if (!input.ok) {
        res.status(400).json({ error: input.error });
        return;
      }

      const message = await getInboxMessage(req.user.id, input.query);
      res.json({ message });
    } catch (error) {
      handleProviderError(res, error);
    }
  });

  app.get("/api/inbox/label-counts", requireSession, async (req, res) => {
    try {
      const input = parseLabelCountsQuery(req.query);
      const counts = await getInboxLabelCounts(req.user.id, input);
      res.json({ counts });
    } catch (error) {
      handleProviderError(res, error);
    }
  });

  app.post("/api/inbox/compose", requireSession, async (req, res) => {
    try {
      const input = parseComposeInput(req.body);
      if (!input.ok) {
        res.status(400).json({ error: input.error });
        return;
      }

      const draft = await createInboxDraft(req.user.id, input.compose);
      res.status(201).json({ draft });
    } catch (error) {
      handleProviderError(res, error);
    }
  });

  app.post("/api/inbox/send", requireSession, async (req, res) => {
    try {
      const input = parseComposeInput(req.body);
      if (!input.ok) {
        res.status(400).json({ error: input.error });
        return;
      }

      const sent = await sendInboxEmail(req.user.id, input.compose);
      res.status(201).json({ sent });
    } catch (error) {
      handleProviderError(res, error);
    }
  });

  app.post("/api/inbox/messages/relabel", requireSession, async (req, res) => {
    try {
      const input = parseBulkRelabelInput(req.body);
      if (!input.ok) {
        res.status(400).json({ error: input.error });
        return;
      }

      const result = await relabelInboxMessages(req.user.id, input.action);
      res.json(result);
    } catch (error) {
      handleProviderError(res, error);
    }
  });

  app.post("/api/inbox/messages/set-label", requireSession, async (req, res) => {
    try {
      const input = parseSetMessageLabelInput(req.body);
      if (!input.ok) {
        res.status(400).json({ error: input.error });
        return;
      }

      const result = await setInboxMessagesLabel(req.user.id, input.action);
      res.json(result);
    } catch (error) {
      handleProviderError(res, error);
    }
  });

  app.post("/api/inbox/messages/delete", requireSession, async (req, res) => {
    try {
      const input = parseBulkMessageInput(req.body);
      if (!input.ok) {
        res.status(400).json({ error: input.error });
        return;
      }

      const result = await deleteInboxMessages(req.user.id, input.messages);
      res.json(result);
    } catch (error) {
      handleProviderError(res, error);
    }
  });
}

async function listInboxDrafts(userId, query) {
  return listSpecialMailboxMessages(userId, query, {
    gmailLabelId: "DRAFT",
    imapMetadataKey: "draftsMailbox",
    fallbackMailbox: "Drafts",
    labelName: "Draft",
    unsupportedReason: "Provider drafts are not implemented yet",
  });
}

async function listInboxSentMessages(userId, query) {
  return listSpecialMailboxMessages(userId, query, {
    gmailLabelId: "SENT",
    imapMetadataKey: "sentMailbox",
    fallbackMailbox: "Sent",
    labelName: "Sent",
    unsupportedReason: "Provider sent mail is not implemented yet",
  });
}

async function listSpecialMailboxMessages(userId, query, options) {
  const accounts = await getInboxAccounts(userId, query.accountIds);
  const pageToken = decodePageToken(query.pageToken);
  const nextPageState = {};
  const providerResults = [];
  const skippedAccounts = [];

  for (const account of accounts) {
    if (!["gmail", "imap"].includes(account.provider)) {
      skippedAccounts.push({ accountId: account.id, email: account.email, provider: account.provider, reason: options.unsupportedReason });
      continue;
    }

    try {
      if (account.provider === "gmail") {
        const accessToken = await getValidEmailAccountAccessToken(account);
        const result = await listGmailSystemLabelMessages({
          accessToken,
          account,
          labelId: options.gmailLabelId,
          labelName: options.labelName,
          pageToken: pageToken[account.id] ?? "",
          query: query.search,
        });
        nextPageState[account.id] = result.nextPageToken;
        providerResults.push(...result.messages);
      } else {
        const mailbox = account.metadata?.[options.imapMetadataKey] || options.fallbackMailbox;
        const result = await searchImapInboxMessages(account, {
          folder: mailbox,
          limit: INBOX_PAGE_SIZE,
          pageToken: pageToken[account.id] ?? "",
          query: query.search,
        });
        nextPageState[account.id] = result.nextPageToken;
        providerResults.push(...result.messages.map((message) => ({ ...message, labels: [options.labelName] })));
      }
    } catch (error) {
      skippedAccounts.push({ accountId: account.id, email: account.email, provider: account.provider, reason: error.message });
    }
  }

  const messages = sortInboxMessages(providerResults, query.sort);
  const hasMore = Object.values(nextPageState).some(Boolean);

  return {
    messages,
    nextPageToken: hasMore ? encodePageToken(nextPageState) : null,
    skippedAccounts,
  };
}

async function listInboxMessages(userId, query) {
  const [label, accounts] = await Promise.all([
    getInboxLabel(userId, query.labelId),
    getInboxAccounts(userId, query.accountIds),
  ]);

  if (!label) {
    const error = new Error("Label not found");
    error.status = 404;
    throw error;
  }

  const syncsByAccountId = new Map(label.syncs.map((sync) => [sync.emailAccountId, sync]));
  const pageToken = decodePageToken(query.pageToken);
  const nextPageState = {};
  const providerResults = [];
  const skippedAccounts = [];

  for (const account of accounts) {
    const sync = syncsByAccountId.get(account.id);
    if (!sync?.providerLabelId || sync.syncStatus !== "synced") {
      continue;
    }

    if (!["gmail", "imap"].includes(account.provider)) {
      skippedAccounts.push({ accountId: account.id, email: account.email, provider: account.provider, reason: "Provider inbox is not implemented yet" });
      continue;
    }

    try {
      if (account.provider === "gmail") {
        const accessToken = await getValidEmailAccountAccessToken(account);
        const result = await listGmailInboxMessages({
          accessToken,
          account,
          label,
          providerLabelId: sync.providerLabelId,
          pageToken: pageToken[account.id] ?? "",
          query: query.search,
        });
        nextPageState[account.id] = result.nextPageToken;
        providerResults.push(...result.messages);
      } else {
        if (isSpecialImapMailbox(account, sync.providerLabelId)) {
          continue;
        }
        const result = await searchImapInboxMessages(account, {
          folder: sync.providerLabelId,
          limit: INBOX_PAGE_SIZE,
          pageToken: pageToken[account.id] ?? "",
          query: query.search,
        });
        nextPageState[account.id] = result.nextPageToken;
        providerResults.push(...result.messages.map((message) => ({ ...message, labels: [label.name] })));
      }
    } catch (error) {
      skippedAccounts.push({ accountId: account.id, email: account.email, provider: account.provider, reason: error.message });
    }
  }

  const messages = await attachRuleStatus(userId, sortInboxMessages(providerResults, query.sort));
  const hasMore = Object.values(nextPageState).some(Boolean);

  return {
    label: { id: label.id, name: label.name, description: label.description },
    messages,
    nextPageToken: hasMore ? encodePageToken(nextPageState) : null,
    skippedAccounts,
  };
}

async function getInboxMessage(userId, query) {
  const accounts = await getInboxAccounts(userId, [query.accountId]);
  const account = accounts[0];

  if (!account) {
    const error = new Error("Email account not found");
    error.status = 404;
    throw error;
  }

  if (account.provider === "gmail") {
    const accessToken = await getValidEmailAccountAccessToken(account);
    const message = await fetchGmailInboxMessage(accessToken, account, query.emailId);
    return attachSingleRuleStatus(userId, message);
  }

  if (account.provider === "imap") {
    const message = await fetchImapInboxMessage(account, { emailId: query.emailId, mailbox: query.mailbox });
    return attachSingleRuleStatus(userId, message);
  }

  const error = new Error(`${account.provider} inbox detail is not implemented yet`);
  error.status = 501;
  throw error;
}

async function attachRuleStatus(userId, messages) {
  if (!messages.length) {
    return messages;
  }

  const emailIds = [...new Set(messages.map((message) => message.id).filter(Boolean))];
  if (!emailIds.length) {
    return messages;
  }

  const result = await dbPool.query(
    `
      select email_id as "emailId", is_pending as "isPending"
      from email_rules
      where user_id = $1 and email_id = any($2::text[])
    `,
    [userId, emailIds],
  );
  const rulesByEmailId = new Map(result.rows.map((row) => [row.emailId, { emailId: row.emailId, isPending: row.isPending }]));

  return messages.map((message) => ({
    ...message,
    rule: rulesByEmailId.get(message.id) ?? null,
  }));
}

async function attachSingleRuleStatus(userId, message) {
  const [messageWithRule] = await attachRuleStatus(userId, [message]);
  return messageWithRule;
}

async function getInboxLabelCounts(userId, { accountIds }) {
  const [labels, accounts] = await Promise.all([getInboxLabels(userId), getInboxAccounts(userId, accountIds)]);
  const accountIdsSet = new Set(accounts.map((account) => account.id));
  const counts = {};

  for (const label of labels) {
    let count = 0;
    let hasCount = false;

    for (const sync of label.syncs) {
      if (!accountIdsSet.has(sync.emailAccountId) || !sync.providerLabelId || sync.syncStatus !== "synced") {
        continue;
      }

      const account = accounts.find((candidate) => candidate.id === sync.emailAccountId);
      if (!account) {
        continue;
      }

      try {
        if (account.provider === "gmail") {
          const accessToken = await getValidEmailAccountAccessToken(account);
          const estimate = await getGmailLabelEstimate(accessToken, sync.providerLabelId);
          if (typeof estimate === "number") {
            count += estimate;
            hasCount = true;
          }
        } else if (account.provider === "imap") {
          const estimate = await getImapInboxCount(account, sync.providerLabelId);
          if (typeof estimate === "number") {
            count += estimate;
            hasCount = true;
          }
        }
      } catch {
        // Counts are best-effort and should not block the Inbox.
      }
    }

    counts[label.id] = hasCount ? count : null;
  }

  return counts;
}

async function createInboxDraft(userId, compose) {
  const accounts = await getInboxAccounts(userId, [compose.accountId]);
  const account = accounts[0];

  if (!account) {
    const error = new Error("Email account not found");
    error.status = 404;
    throw error;
  }

  let draft;
  if (account.provider === "gmail") {
    const accessToken = await getValidEmailAccountAccessToken(account);
    draft = await createGmailComposeDraft(accessToken, account, compose);
  } else if (account.provider === "imap") {
    draft = await createImapComposeDraft({ account, input: compose });
  } else {
    const error = new Error(`${account.provider} compose is not implemented yet`);
    error.status = 501;
    throw error;
  }

  await emitWebhookEvent(userId, "email.drafted", {
    to: splitAddressList(compose.to),
    from: account.email,
    subject: compose.subject,
    body: { text: compose.bodyText, html: "" },
    accountEmail: account.email,
    draftId: draft?.id ?? null,
    provider: account.provider,
  });

  return {
    id: draft?.id ?? null,
    accountEmail: account.email,
    provider: account.provider,
    subject: compose.subject,
    attachmentNames: compose.attachments.map((attachment) => attachment.filename),
  };
}

async function sendInboxEmail(userId, compose) {
  const accounts = await getInboxAccounts(userId, [compose.accountId]);
  const account = accounts[0];

  if (!account) {
    const error = new Error("Email account not found");
    error.status = 404;
    throw error;
  }

  if (account.provider !== "gmail") {
    const error = new Error(`${providerDisplayName(account.provider)} sending is not implemented yet. Save as draft for this provider for now.`);
    error.status = 501;
    throw error;
  }

  const accessToken = await getValidEmailAccountAccessToken(account);
  const sent = await sendGmailComposeMessage(accessToken, account, compose);

  await emitWebhookEvent(userId, "email.sent", {
    to: splitAddressList(compose.to),
    from: account.email,
    subject: compose.subject,
    body: { text: compose.bodyText, html: "" },
    accountEmail: account.email,
    messageId: sent?.id ?? null,
    threadId: sent?.threadId ?? null,
    provider: account.provider,
  });

  return {
    id: sent?.id ?? null,
    threadId: sent?.threadId ?? null,
    accountEmail: account.email,
    provider: account.provider,
    subject: compose.subject,
  };
}

async function relabelInboxMessages(userId, action) {
  const [accounts, targetLabel, sourceLabel] = await Promise.all([
    getInboxAccounts(userId, []),
    getInboxLabel(userId, action.labelId),
    action.sourceLabelId ? getInboxLabel(userId, action.sourceLabelId) : null,
  ]);

  if (!targetLabel) {
    const error = new Error("Target label not found");
    error.status = 404;
    throw error;
  }

  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const targetSyncsByAccountId = new Map(targetLabel.syncs.map((sync) => [sync.emailAccountId, sync]));
  const sourceSyncsByAccountId = new Map((sourceLabel?.syncs ?? []).map((sync) => [sync.emailAccountId, sync]));
  const results = [];

  for (const message of action.messages) {
    const account = accountsById.get(message.accountId);
    if (!account) {
      results.push({ ...message, ok: false, error: "Account not found" });
      continue;
    }

    try {
      const targetSync = targetSyncsByAccountId.get(account.id);
      if (!targetSync?.providerLabelId || targetSync.syncStatus !== "synced") {
        throw new Error("Target label is not synced to this account");
      }

      if (account.provider === "gmail") {
        const accessToken = await getValidEmailAccountAccessToken(account);
        const sourceSync = sourceSyncsByAccountId.get(account.id);
        await modifyGmailMessageLabels({
          accessToken,
          emailId: message.emailId,
          addLabelIds: [targetSync.providerLabelId],
          removeLabelIds:
            sourceSync?.providerLabelId && sourceSync.providerLabelId !== targetSync.providerLabelId
              ? [sourceSync.providerLabelId]
              : [],
        });
      } else if (account.provider === "imap") {
        await moveImapInboxMessageToFolder({
          account,
          emailId: message.emailId,
          sourceMailbox: message.mailbox,
          targetFolder: targetSync.providerLabelId,
        });
      } else {
        throw new Error(`${account.provider} relabel is not implemented yet`);
      }

      await emitWebhookEvent(userId, "email.labels_updated", {
        emailId: message.emailId,
        accountEmail: account.email,
        added: [targetLabel.name],
        removed: sourceLabel && sourceLabel.id !== targetLabel.id ? [sourceLabel.name] : [],
        source: "inbox",
      });
      results.push({ ...message, ok: true });
    } catch (error) {
      results.push({ ...message, ok: false, error: error.message });
    }
  }

  return {
    updated: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok),
    results,
  };
}

async function setInboxMessagesLabel(userId, action) {
  const [accounts, labels] = await Promise.all([getInboxAccounts(userId, []), getInboxLabels(userId)]);
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const targetLabel = action.labelId ? labels.find((label) => label.id === action.labelId) : null;
  const targetSyncsByAccountId = new Map((targetLabel?.syncs ?? []).map((sync) => [sync.emailAccountId, sync]));
  const allSyncsByAccountId = new Map();
  const results = [];

  if (action.labelId && !targetLabel) {
    const error = new Error("Target label not found");
    error.status = 404;
    throw error;
  }

  for (const label of labels) {
    for (const sync of label.syncs) {
      if (!sync.providerLabelId || sync.syncStatus !== "synced") {
        continue;
      }
      const list = allSyncsByAccountId.get(sync.emailAccountId) ?? [];
      list.push({ label, sync });
      allSyncsByAccountId.set(sync.emailAccountId, list);
    }
  }

  for (const message of action.messages) {
    const account = accountsById.get(message.accountId);
    if (!account) {
      results.push({ ...message, ok: false, error: "Account not found" });
      continue;
    }

    try {
      const allAccountSyncs = allSyncsByAccountId.get(account.id) ?? [];
      const targetSync = targetLabel ? targetSyncsByAccountId.get(account.id) : null;
      if (targetLabel && (!targetSync?.providerLabelId || targetSync.syncStatus !== "synced")) {
        throw new Error("Target label is not synced to this account");
      }

      const removedLabelNames = allAccountSyncs
        .filter(({ label }) => !targetLabel || label.id !== targetLabel.id)
        .map(({ label }) => label.name);

      if (account.provider === "gmail") {
        const accessToken = await getValidEmailAccountAccessToken(account);
        await modifyGmailMessageLabels({
          accessToken,
          emailId: message.emailId,
          addLabelIds: targetSync?.providerLabelId ? [targetSync.providerLabelId] : [],
          removeLabelIds: allAccountSyncs
            .filter(({ sync }) => sync.providerLabelId !== targetSync?.providerLabelId)
            .map(({ sync }) => sync.providerLabelId),
        });
      } else if (account.provider === "imap") {
        await moveImapInboxMessageToFolder({
          account,
          emailId: message.emailId,
          sourceMailbox: message.mailbox,
          targetFolder: targetSync?.providerLabelId || account.metadata?.defaultMailbox || "INBOX",
        });
      } else {
        throw new Error(`${account.provider} label updates are not implemented yet`);
      }

      await emitWebhookEvent(userId, "email.labels_updated", {
        emailId: message.emailId,
        accountEmail: account.email,
        added: targetLabel ? [targetLabel.name] : [],
        removed: removedLabelNames,
        source: "inbox",
      });
      results.push({
        ...message,
        ok: true,
        label: targetLabel ? { id: targetLabel.id, name: targetLabel.name } : null,
      });
    } catch (error) {
      results.push({ ...message, ok: false, error: error.message });
    }
  }

  return {
    updated: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok),
    results,
    label: targetLabel ? { id: targetLabel.id, name: targetLabel.name } : null,
  };
}

async function deleteInboxMessages(userId, messages) {
  const accounts = await getInboxAccounts(userId, []);
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const results = [];

  for (const message of messages) {
    const account = accountsById.get(message.accountId);
    if (!account) {
      results.push({ ...message, ok: false, error: "Account not found" });
      continue;
    }

    try {
      if (account.provider === "gmail") {
        const accessToken = await getValidEmailAccountAccessToken(account);
        await trashGmailMessage(accessToken, message.emailId);
      } else if (account.provider === "imap") {
        await moveImapInboxMessageToTrash({ account, emailId: message.emailId, sourceMailbox: message.mailbox });
      } else {
        throw new Error(`${account.provider} delete is not implemented yet`);
      }

      await emitWebhookEvent(userId, "email.deleted", {
        emailId: message.emailId,
        accountEmail: account.email,
        provider: account.provider,
        source: "inbox",
      });
      results.push({ ...message, ok: true });
    } catch (error) {
      results.push({ ...message, ok: false, error: error.message });
    }
  }

  return {
    deleted: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok),
    results,
  };
}

async function getInboxAccounts(userId, accountIds = []) {
  const accounts = await getConnectedEmailAccounts(userId);
  if (!accountIds.length) {
    return accounts;
  }

  const selected = new Set(accountIds);
  return accounts.filter((account) => selected.has(account.id));
}

async function getInboxLabels(userId) {
  const result = await dbPool.query(
    `
      select l.id,
             l.name,
             l.description,
             coalesce(
               jsonb_agg(
                 jsonb_build_object(
                   'emailAccountId', las.email_account_id,
                   'providerLabelId', las.provider_label_id,
                   'syncStatus', las.sync_status
                 )
               ) filter (where las.id is not null),
               '[]'::jsonb
             ) as syncs
      from labels l
      left join label_account_syncs las on las.label_id = l.id
      where l.user_id = $1
        and l.system_key is null
      group by l.id
      order by lower(l.name)
    `,
    [userId],
  );

  return result.rows;
}

async function getInboxLabel(userId, labelId) {
  const labels = await getInboxLabels(userId);
  return labels.find((label) => label.id === labelId) ?? null;
}

function isSpecialImapMailbox(account, mailbox) {
  const normalizedMailbox = String(mailbox || "").trim().toLowerCase();
  const sentMailbox = String(account.metadata?.sentMailbox || "Sent").trim().toLowerCase();
  const draftsMailbox = String(account.metadata?.draftsMailbox || "Drafts").trim().toLowerCase();
  return Boolean(normalizedMailbox && (normalizedMailbox === sentMailbox || normalizedMailbox === draftsMailbox));
}

async function listGmailInboxMessages({ accessToken, account, label, providerLabelId, pageToken, query }) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.append("labelIds", providerLabelId);
  url.searchParams.set("maxResults", String(INBOX_PAGE_SIZE));
  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }
  url.searchParams.set("q", ["-in:sent", "-in:drafts", query].filter(Boolean).join(" "));

  const response = await providerFetch(url.toString(), accessToken, { method: "GET" });
  const data = await response.json();
  const messages = [];

  for (const item of data.messages ?? []) {
    const message = await fetchGmailMessageMetadata(accessToken, item.id);
    messages.push(await gmailMessageToInboxListItem(message, account, label, accessToken));
  }

  return { messages, nextPageToken: data.nextPageToken ?? null };
}

async function fetchGmailMessageMetadata(accessToken, emailId) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(emailId)}`);
  url.searchParams.set("format", "metadata");
  for (const header of ["From", "To", "Cc", "Subject", "Date"]) {
    url.searchParams.append("metadataHeaders", header);
  }

  const response = await providerFetch(url.toString(), accessToken, { method: "GET" });
  return response.json();
}

async function fetchGmailInboxMessage(accessToken, account, emailId) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(emailId)}`);
  url.searchParams.set("format", "full");
  const response = await providerFetch(url.toString(), accessToken, { method: "GET" });
  const message = await response.json();
  const headers = getGmailHeaders(message);
  const body = extractGmailBodies(message.payload);

  return {
    id: message.id,
    threadId: message.threadId,
    accountId: account.id,
    accountEmail: account.email,
    provider: account.provider,
    from: headers.from || "",
    to: headers.to || "",
    cc: headers.cc || "",
    subject: headers.subject || "",
    date: new Date(Number(message.internalDate || Date.parse(headers.date) || Date.now())).toISOString(),
    bodyText: body.text,
    bodyHtml: sanitizeEmailHtml(body.html),
    attachments: collectGmailAttachments(message.payload),
    replyCount: await getGmailSentReplyCount(accessToken, message.threadId, message.id),
  };
}

async function getGmailLabelEstimate(accessToken, providerLabelId) {
  const response = await providerFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/labels/${encodeURIComponent(providerLabelId)}`,
    accessToken,
    { method: "GET" },
  );
  const label = await response.json();
  return typeof label.messagesTotal === "number" ? label.messagesTotal : null;
}

async function createGmailComposeDraft(accessToken, account, compose) {
  const raw = buildGmailComposeMessage(account.email, compose);
  const response = await providerFetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", accessToken, {
    method: "POST",
    body: JSON.stringify({ message: { raw } }),
  });

  return response.json();
}

async function listGmailSystemLabelMessages({ accessToken, account, labelId, labelName, pageToken, query }) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.append("labelIds", labelId);
  url.searchParams.set("maxResults", String(INBOX_PAGE_SIZE));
  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }
  if (query) {
    url.searchParams.set("q", query);
  }

  const response = await providerFetch(url.toString(), accessToken, { method: "GET" });
  const data = await response.json();
  const messages = [];

  for (const item of data.messages ?? []) {
    const messageId = item.id;
    if (!messageId) {
      continue;
    }
    const message = await fetchGmailMessageMetadata(accessToken, messageId);
    messages.push(await gmailMessageToInboxListItem(message, account, { name: labelName }, accessToken));
  }

  return { messages, nextPageToken: data.nextPageToken ?? null };
}

async function sendGmailComposeMessage(accessToken, account, compose) {
  const raw = buildGmailComposeMessage(account.email, compose);
  const response = await providerFetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", accessToken, {
    method: "POST",
    body: JSON.stringify({ raw }),
  });

  return response.json();
}

async function trashGmailMessage(accessToken, emailId) {
  const response = await providerFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(emailId)}/trash`,
    accessToken,
    { method: "POST" },
  );
  return response.json();
}

async function gmailMessageToInboxListItem(message, account, label, accessToken = null) {
  const headers = getGmailHeaders(message);
  const date = message.internalDate
    ? new Date(Number(message.internalDate))
    : new Date(headers.date || Date.now());

  return {
    id: message.id,
    threadId: message.threadId,
    accountId: account.id,
    accountEmail: account.email,
    provider: account.provider,
    mailbox: "",
    from: headers.from || "",
    sender: extractDisplayName(headers.from || "") || extractEmailAddress(headers.from || ""),
    subject: headers.subject || "",
    snippet: message.snippet || "",
    date: date.toISOString(),
    labels: [label.name],
    hasAttachments: false,
    replyCount: accessToken && message.threadId ? await getGmailSentReplyCount(accessToken, message.threadId, message.id) : 0,
  };
}

async function getGmailSentReplyCount(accessToken, threadId, currentMessageId = "") {
  if (!threadId) {
    return 0;
  }

  try {
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}`);
    url.searchParams.set("format", "metadata");
    url.searchParams.append("metadataHeaders", "From");
    const response = await providerFetch(url.toString(), accessToken, { method: "GET" });
    const thread = await response.json();
    return (thread.messages ?? []).filter((message) =>
      message.id !== currentMessageId &&
      Array.isArray(message.labelIds) &&
      message.labelIds.includes("SENT"),
    ).length;
  } catch {
    return 0;
  }
}

function sortInboxMessages(messages, sort) {
  const sorted = [...messages];
  sorted.sort((a, b) => {
    if (sort === "oldest") {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    }
    if (sort === "sender") {
      return a.sender.localeCompare(b.sender);
    }
    if (sort === "subject") {
      return a.subject.localeCompare(b.subject);
    }

    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
  return sorted;
}

function parseInboxListQuery(query) {
  const labelId = typeof query.labelId === "string" ? query.labelId : "";
  if (!labelId) {
    return { ok: false, error: "labelId is required" };
  }

  return {
    ok: true,
    query: {
      labelId,
      accountIds: parseCsv(query.accounts),
      pageToken: typeof query.pageToken === "string" ? query.pageToken : "",
      search: typeof query.search === "string" ? query.search.trim() : "",
      sort: ["newest", "oldest", "sender", "subject"].includes(query.sort) ? query.sort : "newest",
    },
  };
}

function parseMailboxListQuery(query) {
  return {
    ok: true,
    query: {
      accountIds: parseCsv(query.accounts),
      pageToken: typeof query.pageToken === "string" ? query.pageToken : "",
      search: typeof query.search === "string" ? query.search.trim() : "",
      sort: ["newest", "oldest", "sender", "subject"].includes(query.sort) ? query.sort : "newest",
    },
  };
}

function parseInboxDetailQuery(query) {
  const accountId = typeof query.accountId === "string" ? query.accountId : "";
  const emailId = typeof query.emailId === "string" ? query.emailId : "";
  if (!accountId || !emailId) {
    return { ok: false, error: "accountId and emailId are required" };
  }

  return {
    ok: true,
    query: {
      accountId,
      emailId,
      mailbox: typeof query.mailbox === "string" ? query.mailbox : "",
    },
  };
}

function parseLabelCountsQuery(query) {
  return { accountIds: parseCsv(query.accounts) };
}

function parseComposeInput(body) {
  const compose = {
    accountId: typeof body?.accountId === "string" ? body.accountId : "",
    to: typeof body?.to === "string" ? body.to.trim() : "",
    cc: typeof body?.cc === "string" ? body.cc.trim() : "",
    bcc: typeof body?.bcc === "string" ? body.bcc.trim() : "",
    subject: typeof body?.subject === "string" ? body.subject.trim() : "",
    bodyText: typeof body?.bodyText === "string" ? body.bodyText : "",
    attachments: Array.isArray(body?.attachments)
      ? body.attachments
          .filter((attachment) => attachment && typeof attachment === "object")
          .map((attachment) => ({
            filename: typeof attachment.filename === "string" ? attachment.filename : "Attachment",
            type: typeof attachment.type === "string" ? attachment.type : "application/octet-stream",
            size: Number.isFinite(attachment.size) ? attachment.size : null,
          }))
      : [],
  };

  if (!compose.accountId) {
    return { ok: false, error: "From account is required" };
  }
  if (!compose.to) {
    return { ok: false, error: "To is required" };
  }
  if (!compose.bodyText.trim()) {
    return { ok: false, error: "Body is required" };
  }

  return { ok: true, compose };
}

function parseBulkRelabelInput(body) {
  const messagesInput = parseBulkMessageInput(body);
  if (!messagesInput.ok) {
    return messagesInput;
  }

  const labelId = typeof body?.labelId === "string" ? body.labelId : "";
  const sourceLabelId = typeof body?.sourceLabelId === "string" ? body.sourceLabelId : "";
  if (!labelId) {
    return { ok: false, error: "labelId is required" };
  }

  return { ok: true, action: { labelId, sourceLabelId, messages: messagesInput.messages } };
}

function parseSetMessageLabelInput(body) {
  const messagesInput = parseBulkMessageInput(body);
  if (!messagesInput.ok) {
    return messagesInput;
  }

  const labelId = typeof body?.labelId === "string" ? body.labelId : "";
  return { ok: true, action: { labelId, messages: messagesInput.messages } };
}

function parseBulkMessageInput(body) {
  if (!Array.isArray(body?.messages)) {
    return { ok: false, error: "messages must be an array" };
  }
  if (body.messages.length === 0) {
    return { ok: false, error: "Select at least one message" };
  }
  if (body.messages.length > 50) {
    return { ok: false, error: "You can update up to 50 messages at a time" };
  }

  const messages = [];
  for (const [index, message] of body.messages.entries()) {
    if (!message || typeof message !== "object") {
      return { ok: false, error: `messages[${index}] must be an object` };
    }

    const accountId = typeof message.accountId === "string" ? message.accountId : "";
    const emailId = typeof message.emailId === "string" ? message.emailId : "";
    const mailbox = typeof message.mailbox === "string" ? message.mailbox : "";
    if (!accountId || !emailId) {
      return { ok: false, error: `messages[${index}] must include accountId and emailId` };
    }

    messages.push({ accountId, emailId, mailbox });
  }

  return { ok: true, messages };
}

function parseCsv(value) {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function encodePageToken(state) {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

function decodePageToken(token) {
  if (!token) {
    return {};
  }

  try {
    return JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

function getGmailHeaders(message) {
  const headers = {};
  for (const header of message.payload?.headers ?? []) {
    headers[header.name.toLowerCase()] = header.value;
  }
  return headers;
}

function extractGmailBodies(part) {
  const result = { text: "", html: "" };
  collectGmailBodies(part, result);
  return result;
}

function collectGmailBodies(part, result) {
  if (!part) {
    return;
  }

  if (part.mimeType === "text/plain" && part.body?.data && !result.text) {
    result.text = decodeBase64Url(part.body.data);
  }
  if (part.mimeType === "text/html" && part.body?.data && !result.html) {
    result.html = decodeBase64Url(part.body.data);
  }

  for (const child of part.parts ?? []) {
    collectGmailBodies(child, result);
  }
}

function collectGmailAttachments(part, attachments = []) {
  if (!part) {
    return attachments;
  }

  if (part.filename && part.body?.attachmentId) {
    attachments.push({
      filename: part.filename,
      type: part.mimeType || "application/octet-stream",
      size: part.body.size ?? null,
      downloadSupported: false,
    });
  }

  for (const child of part.parts ?? []) {
    collectGmailAttachments(child, attachments);
  }

  return attachments;
}

function buildGmailComposeMessage(from, compose) {
  const lines = [
    `From: ${from}`,
    `To: ${compose.to}`,
    compose.cc ? `Cc: ${compose.cc}` : null,
    compose.bcc ? `Bcc: ${compose.bcc}` : null,
    `Subject: ${compose.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    compose.bodyText,
  ].filter((line) => line !== null);

  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function providerDisplayName(provider) {
  if (provider === "gmail") {
    return "Gmail";
  }
  if (provider === "imap") {
    return "IMAP";
  }
  return provider;
}

function sanitizeEmailHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function decodeBase64Url(value) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function splitAddressList(value) {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function extractEmailAddress(value = "") {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim();
}

function extractDisplayName(value = "") {
  const match = String(value).match(/^"?([^"<]+)"?\s*</);
  return (match?.[1] ?? "").trim();
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

async function requireSession(req, res, next) {
  const session = await auth.api.getSession({
    headers: toWebHeaders(req.headers),
  });

  if (!session?.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  req.user = session.user;
  next();
}

function toWebHeaders(headers) {
  const webHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        webHeaders.append(key, item);
      }
    } else if (value !== undefined) {
      webHeaders.set(key, value);
    }
  }
  return webHeaders;
}

function handleProviderError(res, error) {
  console.error("Inbox provider request failed:", error);
  res.status(error.status || 500).json({ error: error.message || "Inbox request failed" });
}
