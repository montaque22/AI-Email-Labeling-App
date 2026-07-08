import { resolveRequestUser } from "./session.js";
import { dbPool } from "./db.js";
import {
  getConnectedEmailAccounts,
  getImapAccessToken,
  getValidEmailAccountAccessToken,
  isImapBackedProvider,
} from "./email-accounts.js";
import {
  archiveEmailIndexEntries,
  clearEmailIndexCommitment,
  countUnreadEmailIndexEntries,
  deleteEmailIndexEntries,
  getEmailIndexLabelCounts,
  listEmailIndexEntries,
  setEmailIndexCommitment,
  updateEmailIndexLabels,
  updateEmailIndexReadStatus,
  upsertEmailIndexEntry,
} from "./email-index.js";
import {
  createImapComposeDraft,
  fetchImapAttachment,
  fetchImapInboxMessage,
  getImapInboxCount,
  markImapInboxMessageRead,
  moveImapInboxMessageToFolder,
  moveImapInboxMessageToTrash,
  searchImapInboxMessages,
  sendImapComposeMessage,
  updateImapComposeDraft,
} from "./imap-provider.js";
import { modifyGmailMessageLabels } from "./integrations.js";
import { emitWebhookEvent } from "./webhooks.js";
import { logSystemEvent } from "./system-logs.js";
import crypto from "node:crypto";
import nodemailer from "nodemailer";

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

  app.get("/api/inbox/search", requireSession, async (req, res) => {
    try {
      const input = parseMailboxListQuery(req.query);
      if (!input.query.search) {
        res.json({ messages: [], nextPageToken: null, skippedAccounts: [] });
        return;
      }

      const result = await searchInboxMessages(req.user.id, input.query);
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

  app.get("/api/inbox/attachment", requireSession, async (req, res) => {
    try {
      const input = parseAttachmentDownloadQuery(req.query);
      if (!input.ok) {
        res.status(400).json({ error: input.error });
        return;
      }

      const attachment = await getInboxAttachment(req.user.id, input.query);
      res.setHeader("Content-Type", attachment.type);
      res.setHeader("Content-Length", String(attachment.buffer.length));
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizeDownloadFilename(attachment.filename)}"`);
      res.send(attachment.buffer);
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

  app.get("/api/inbox/unread-count", requireSession, async (req, res) => {
    try {
      const count = await countUnreadEmailIndexEntries(req.user.id);
      res.json({ count });
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

  app.put("/api/inbox/drafts/:draftId", requireSession, async (req, res) => {
    try {
      const input = parseComposeInput(req.body);
      if (!input.ok) {
        res.status(400).json({ error: input.error });
        return;
      }
      const draft = await updateInboxDraft(req.user.id, req.params.draftId, input.compose, req.body?.mailbox);
      res.json({ draft });
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

  app.post("/api/inbox/messages/archive", requireSession, async (req, res) => {
    try {
      const input = parseBulkMessageInput(req.body);
      if (!input.ok) {
        res.status(400).json({ error: input.error });
        return;
      }

      const result = await archiveInboxMessages(req.user.id, input.messages);
      res.json(result);
    } catch (error) {
      handleProviderError(res, error);
    }
  });

  app.post("/api/inbox/messages/commitment", requireSession, async (req, res) => {
    try {
      const input = parseCommitmentInput(req.body);
      if (!input.ok) {
        res.status(400).json({ error: input.error });
        return;
      }

      const result = await setInboxMessageCommitments(req.user.id, input.action);
      res.json(result);
    } catch (error) {
      handleProviderError(res, error);
    }
  });

  app.post("/api/inbox/messages/commitment/complete", requireSession, async (req, res) => {
    try {
      const input = parseBulkMessageInput(req.body);
      if (!input.ok) {
        res.status(400).json({ error: input.error });
        return;
      }

      const result = await completeInboxMessageCommitments(req.user.id, input.messages);
      res.json(result);
    } catch (error) {
      handleProviderError(res, error);
    }
  });

  app.post("/api/inbox/messages/commitment/renege", requireSession, async (req, res) => {
    try {
      const input = parseBulkMessageInput(req.body);
      if (!input.ok) {
        res.status(400).json({ error: input.error });
        return;
      }

      const result = await renegeInboxMessageCommitments(req.user.id, input.messages);
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
  const result = await listEmailIndexEntries(userId, {
    accountIds: query.accountIds,
    direction: "sent",
    pageToken: query.pageToken,
    search: query.search,
    sort: query.sort,
    limit: INBOX_PAGE_SIZE,
  });
  return { ...result, skippedAccounts: [] };
}

async function searchInboxMessages(userId, query) {
  const result = await listEmailIndexEntries(userId, {
    accountIds: query.accountIds,
    direction: "inbox",
    includeArchived: true,
    pageToken: query.pageToken,
    search: query.search,
    sort: query.sort,
    limit: INBOX_PAGE_SIZE,
  });
  return { ...result, messages: await attachRuleStatus(userId, result.messages), skippedAccounts: [] };
}

async function listSpecialMailboxMessages(userId, query, options) {
  const accounts = await getInboxAccounts(userId, query.accountIds);
  const pageToken = decodePageToken(query.pageToken);
  const nextPageState = {};
  const providerResults = [];
  const skippedAccounts = [];

  for (const account of accounts) {
    if (account.provider !== "gmail" && !isImapBackedProvider(account.provider)) {
      skippedAccounts.push({ accountId: account.id, email: account.email, provider: account.provider, reason: options.unsupportedReason });
      continue;
    }

    try {
      if (account.provider === "gmail") {
        const accessToken = await getValidEmailAccountAccessToken(account);
        const result = options.gmailLabelId === "DRAFT"
          ? await listGmailDraftMessages({
              accessToken,
              account,
              pageToken: pageToken[account.id] ?? "",
              query: query.search,
            })
          : await listGmailSystemLabelMessages({
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
        const accessToken = await getImapAccessToken(account);
        const mailbox = account.metadata?.[options.imapMetadataKey] || options.fallbackMailbox;
        const result = await searchImapInboxMessages(account, {
          accessToken,
          folder: mailbox,
          limit: INBOX_PAGE_SIZE,
          pageToken: pageToken[account.id] ?? "",
          query: query.search,
        });
        nextPageState[account.id] = result.nextPageToken;
        providerResults.push(...result.messages.map((message) => ({
          ...message,
          isRead: true,
          labels: [options.labelName],
          ...(options.gmailLabelId === "DRAFT" ? { draftId: message.id } : {}),
        })));
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
  const label = await getInboxLabel(userId, query.labelId);

  if (!label) {
    const error = new Error("Label not found");
    error.status = 404;
    throw error;
  }

  const result = await listEmailIndexEntries(userId, {
    accountIds: query.accountIds,
    direction: "inbox",
    labelName: label.name,
    archivedOnly: Boolean(query.archivedOnly),
    pageToken: query.pageToken,
    search: query.search,
    sort: query.sort,
    limit: INBOX_PAGE_SIZE,
  });

  return {
    label: { id: label.id, name: label.name, description: label.description },
    messages: await attachRuleStatus(userId, result.messages),
    nextPageToken: result.nextPageToken,
    skippedAccounts: [],
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
    const isRead = await markGmailMessageRead(accessToken, message);
    await updateEmailIndexReadStatus(userId, { accountId: account.id, emailId: message.id, mailbox: message.mailbox, isRead });
    return attachSingleRuleStatus(userId, { ...message, isRead });
  }

  if (isImapBackedProvider(account.provider)) {
    const accessToken = await getImapAccessToken(account);
    const message = await fetchImapInboxMessage(account, { accessToken, emailId: query.emailId, mailbox: query.mailbox });
    const isRead = await markImapMessageRead(account, message, accessToken);
    await updateEmailIndexReadStatus(userId, { accountId: account.id, emailId: message.id, mailbox: message.mailbox, isRead });
    return attachSingleRuleStatus(userId, { ...message, isRead });
  }

  const error = new Error(`${account.provider} inbox detail is not implemented yet`);
  error.status = 501;
  throw error;
}

async function getInboxAttachment(userId, query) {
  const accounts = await getInboxAccounts(userId, [query.accountId]);
  const account = accounts[0];

  if (!account) {
    const error = new Error("Email account not found");
    error.status = 404;
    throw error;
  }

  if (isImapBackedProvider(account.provider)) {
    const accessToken = await getImapAccessToken(account);
    return fetchImapAttachment({
      account,
      accessToken,
      attachmentId: query.attachmentId,
      emailId: query.emailId,
      mailbox: query.mailbox,
    });
  }

  if (account.provider === "gmail") {
    const accessToken = await getValidEmailAccountAccessToken(account);
    const buffer = await fetchGmailAttachment(accessToken, query.emailId, query.attachmentId);
    return {
      buffer,
      filename: query.filename || "attachment",
      type: query.type || "application/octet-stream",
    };
  }

  const error = new Error(`${providerDisplayName(account.provider)} attachment downloads are not implemented yet`);
  error.status = 501;
  throw error;
}

async function markGmailMessageRead(accessToken, message) {
  if (message.isRead) {
    return true;
  }

  try {
    await modifyGmailMessageLabels({
      accessToken,
      emailId: message.id,
      addLabelIds: [],
      removeLabelIds: ["UNREAD"],
    });
    return true;
  } catch (error) {
    console.warn(`Could not mark Gmail message ${message.id} as read:`, error.message);
    return false;
  }
}

async function markImapMessageRead(account, message, accessToken = "") {
  if (message.isRead) {
    return true;
  }

  try {
    const marked = await markImapInboxMessageRead(account, { emailId: message.id, mailbox: message.mailbox }, accessToken);
    return marked !== false;
  } catch (error) {
    console.warn(`Could not mark IMAP message ${message.id} as read:`, error.message);
    return false;
  }
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

async function getInboxLabelCounts(userId, { accountIds, archivedOnly = false }) {
  const [labels, accounts] = await Promise.all([getInboxLabels(userId), getInboxAccounts(userId, accountIds)]);
  return getEmailIndexLabelCounts(userId, { accountIds: accounts.map((account) => account.id), archivedOnly, labels });
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
  } else if (isImapBackedProvider(account.provider)) {
    const accessToken = await getImapAccessToken(account);
    draft = await createImapComposeDraft({ account, input: compose, accessToken });
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

async function updateInboxDraft(userId, draftId, compose, mailbox = "") {
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
    draft = await updateGmailComposeDraft(accessToken, account, draftId, compose);
  } else if (isImapBackedProvider(account.provider)) {
    const accessToken = await getImapAccessToken(account);
    draft = await updateImapComposeDraft({ account, draftId, mailbox, input: compose, accessToken });
  } else {
    const error = new Error(`${account.provider} draft updates are not implemented yet`);
    error.status = 501;
    throw error;
  }

  await logSystemEvent(userId, {
    category: "email",
    eventName: "email.draft_updated",
    status: "success",
    message: `Draft updated for ${account.email}.`,
    payload: { accountEmail: account.email, provider: account.provider, draftId: draft?.id ?? draftId, subject: compose.subject },
  });
  return { id: draft?.id ?? draftId, mailbox: draft?.mailbox ?? mailbox, accountEmail: account.email, provider: account.provider };
}

async function sendInboxEmail(userId, compose) {
  const accounts = await getInboxAccounts(userId, [compose.accountId]);
  const account = accounts[0];

  if (!account) {
    const error = new Error("Email account not found");
    error.status = 404;
    throw error;
  }

  if (account.provider !== "gmail" && account.provider !== "microsoft" && !isImapBackedProvider(account.provider)) {
    const error = new Error(`${providerDisplayName(account.provider)} sending is not implemented yet. Save as draft for this provider for now.`);
    error.status = 501;
    throw error;
  }

  const accessToken = account.provider === "gmail" || account.provider === "microsoft"
    ? await getValidEmailAccountAccessToken(account)
    : await getImapAccessToken(account);
  const sent = account.provider === "gmail"
    ? await sendGmailComposeMessage(accessToken, account, compose)
    : account.provider === "microsoft"
      ? await sendMicrosoftComposeMessage(accessToken, account, compose)
      : await sendImapComposeMessage({ account, input: compose, accessToken });
  await upsertEmailIndexEntry(userId, {
    emailAccountId: account.id,
    accountEmail: account.email,
    provider: account.provider,
    emailId: sent?.id ?? crypto.randomUUID(),
    threadId: sent?.threadId ?? compose.threadId ?? sent?.id ?? "",
    mailbox: "sent",
    direction: "sent",
    fromEmail: account.email,
    fromName: account.displayName || account.email,
    toEmails: compose.to,
    subject: compose.subject,
    snippet: compose.bodyText.slice(0, 300),
    labels: ["Sent"],
    receivedAt: new Date(),
    isRead: true,
    hasAttachments: compose.attachments.length > 0,
    respondingToEmailId: compose.replyToEmailId || null,
    metadata: {
      sendType: compose.replyToEmailId ? "reply" : compose.forwardFromEmailId ? "forward" : "sent",
      replyToEmailId: compose.replyToEmailId || null,
      forwardFromEmailId: compose.forwardFromEmailId || null,
    },
  });

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
  await logSystemEvent(userId, {
    category: "email",
    eventName: "email.sent",
    status: "success",
    message: `Email sent from ${account.email}.`,
    payload: { accountEmail: account.email, provider: account.provider, messageId: sent?.id ?? null, subject: compose.subject },
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
      } else if (isImapBackedProvider(account.provider)) {
        const accessToken = await getImapAccessToken(account);
        await moveImapInboxMessageToFolder({
          accessToken,
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
      await updateEmailIndexLabels(userId, {
        accountId: account.id,
        emailId: message.emailId,
        mailbox: message.mailbox || "",
        nextMailbox: account.provider === "gmail" ? "" : targetSync.providerLabelId,
        labels: [targetLabel.name],
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
  const [accounts, labels, allLabels] = await Promise.all([
    getInboxAccounts(userId, []),
    getInboxLabels(userId),
    getInboxLabels(userId, { includeSystem: true }),
  ]);
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

  for (const label of allLabels) {
    for (const sync of label.syncs) {
      if (!sync.providerLabelId) {
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
        const removeLabelIds = [...new Set(
          allAccountSyncs
            .filter(({ sync }) => sync.providerLabelId !== targetSync?.providerLabelId)
            .map(({ sync }) => sync.providerLabelId),
        )];
        await modifyGmailMessageLabels({
          accessToken,
          emailId: message.emailId,
          addLabelIds: targetSync?.providerLabelId ? [targetSync.providerLabelId] : [],
          removeLabelIds,
        });
      } else if (isImapBackedProvider(account.provider)) {
        const accessToken = await getImapAccessToken(account);
        await moveImapInboxMessageToFolder({
          accessToken,
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
      await updateEmailIndexLabels(userId, {
        accountId: account.id,
        emailId: message.emailId,
        mailbox: message.mailbox || "",
        nextMailbox: account.provider === "gmail" ? "" : targetSync?.providerLabelId || account.metadata?.defaultMailbox || "INBOX",
        labels: targetLabel ? [targetLabel.name] : [],
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
      await deleteEmailIndexEntries(userId, [message]);
      queueProviderDelete(userId, account, message);
      results.push({ ...message, ok: true });
    } catch (error) {
      results.push({ ...message, ok: false, error: error.message });
    }
  }

  const deleted = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok);
  await logSystemEvent(userId, {
    category: "email",
    eventName: "email.deleted",
    status: failed.length > 0 ? (deleted > 0 ? "warning" : "error") : "success",
    message: `${deleted} email${deleted === 1 ? "" : "s"} deleted${failed.length ? `; ${failed.length} failed` : ""}.`,
    payload: { deleted, failed, messages },
  });

  return {
    deleted,
    failed,
    results,
  };
}

async function archiveInboxMessages(userId, messages) {
  const archivedRows = await archiveEmailIndexEntries(userId, messages);
  const archivedKeys = new Set(archivedRows.map((message) => `${message.accountId}:${message.id}:${message.mailbox ?? ""}`));
  const results = messages.map((message) => ({
    ...message,
    ok: archivedKeys.has(`${message.accountId}:${message.emailId}:${message.mailbox ?? ""}`),
    error: archivedKeys.has(`${message.accountId}:${message.emailId}:${message.mailbox ?? ""}`) ? undefined : "Message was not found",
  }));
  const archived = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok);

  await logSystemEvent(userId, {
    category: "email",
    eventName: "email.archived",
    status: failed.length > 0 ? (archived > 0 ? "warning" : "error") : "success",
    message: `${archived} email${archived === 1 ? "" : "s"} archived${failed.length ? `; ${failed.length} failed` : ""}.`,
    payload: { archived, failed, messages },
  });

  return {
    archived,
    failed,
    results,
  };
}

async function setInboxMessageCommitments(userId, action) {
  const committedRows = await setEmailIndexCommitment(userId, action.messages, {
    text: action.text,
    dueAt: action.dueAt,
  });
  const committedKeys = new Set(committedRows.map((message) => `${message.accountId}:${message.id}:${message.mailbox ?? ""}`));
  const results = action.messages.map((message) => ({
    ...message,
    ok: committedKeys.has(`${message.accountId}:${message.emailId}:${message.mailbox ?? ""}`),
    commitment: committedRows.find((row) => row.accountId === message.accountId && row.id === message.emailId && (row.mailbox ?? "") === (message.mailbox ?? ""))?.commitment ?? null,
    error: committedKeys.has(`${message.accountId}:${message.emailId}:${message.mailbox ?? ""}`) ? undefined : "Message was not found",
  }));
  const committed = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok);

  await logSystemEvent(userId, {
    category: "email",
    eventName: "email.commitment_set",
    status: failed.length > 0 ? (committed > 0 ? "warning" : "error") : "success",
    message: `${committed} email commitment${committed === 1 ? "" : "s"} set${failed.length ? `; ${failed.length} failed` : ""}.`,
    payload: { committed, failed, dueAt: action.dueAt, text: action.text, messages: action.messages },
  });

  return { committed, failed, results };
}

async function completeInboxMessageCommitments(userId, messages) {
  const archivedRows = await archiveEmailIndexEntries(userId, messages, { allowCommitted: true });
  const archivedKeys = new Set(archivedRows.map((message) => `${message.accountId}:${message.id}:${message.mailbox ?? ""}`));
  const results = messages.map((message) => ({
    ...message,
    ok: archivedKeys.has(`${message.accountId}:${message.emailId}:${message.mailbox ?? ""}`),
    error: archivedKeys.has(`${message.accountId}:${message.emailId}:${message.mailbox ?? ""}`) ? undefined : "Message was not found",
  }));
  const archived = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok);

  await logSystemEvent(userId, {
    category: "email",
    eventName: "email.commitment_completed",
    status: failed.length > 0 ? (archived > 0 ? "warning" : "error") : "success",
    message: `${archived} committed email${archived === 1 ? "" : "s"} completed and archived${failed.length ? `; ${failed.length} failed` : ""}.`,
    payload: { archived, failed, messages },
  });

  return { archived, failed, results };
}

async function renegeInboxMessageCommitments(userId, messages) {
  const clearedRows = await clearEmailIndexCommitment(userId, messages);
  const clearedKeys = new Set(clearedRows.map((message) => `${message.accountId}:${message.id}:${message.mailbox ?? ""}`));
  const results = messages.map((message) => ({
    ...message,
    ok: clearedKeys.has(`${message.accountId}:${message.emailId}:${message.mailbox ?? ""}`),
    error: clearedKeys.has(`${message.accountId}:${message.emailId}:${message.mailbox ?? ""}`) ? undefined : "Message was not found",
  }));
  const cleared = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok);

  await logSystemEvent(userId, {
    category: "email",
    eventName: "email.commitment_reneged",
    status: failed.length > 0 ? (cleared > 0 ? "warning" : "error") : "success",
    message: `${cleared} email commitment${cleared === 1 ? "" : "s"} removed${failed.length ? `; ${failed.length} failed` : ""}.`,
    payload: { cleared, failed, messages },
  });

  return { cleared, failed, results };
}

function queueProviderDelete(userId, account, message) {
  void deleteProviderMessage(userId, account, message).catch((error) => {
    console.warn(`Background provider delete failed for ${account.email} ${message.emailId}:`, error.message);
    void logSystemEvent(userId, {
      category: "email",
      eventName: "email.provider_delete_failed",
      status: "error",
      message: `Provider delete failed for ${account.email}: ${error.message}`,
      payload: { emailId: message.emailId, accountEmail: account.email, provider: account.provider, error: error.message },
    }).catch(() => {});
  });
}

async function deleteProviderMessage(userId, account, message) {
  if (account.provider === "gmail") {
    const accessToken = await getValidEmailAccountAccessToken(account);
    await trashGmailMessage(accessToken, message.emailId);
  } else if (isImapBackedProvider(account.provider)) {
    const accessToken = await getImapAccessToken(account);
    await moveImapInboxMessageToTrash({ account, accessToken, emailId: message.emailId, sourceMailbox: message.mailbox });
  } else {
    throw new Error(`${account.provider} delete is not implemented yet`);
  }

  await emitWebhookEvent(userId, "email.deleted", {
    emailId: message.emailId,
    accountEmail: account.email,
    provider: account.provider,
    source: "inbox",
  });
  await logSystemEvent(userId, {
    category: "email",
    eventName: "email.provider_delete_completed",
    status: "success",
    message: `Provider delete completed for ${account.email}.`,
    payload: { emailId: message.emailId, accountEmail: account.email, provider: account.provider },
  });
}

async function getInboxAccounts(userId, accountIds = []) {
  const accounts = await getConnectedEmailAccounts(userId);
  if (!accountIds.length) {
    return accounts;
  }

  const selected = new Set(accountIds);
  return accounts.filter((account) => selected.has(account.id));
}

async function getInboxLabels(userId, { includeSystem = false } = {}) {
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
        and ($2::boolean or l.system_key is null)
      group by l.id
      order by lower(l.name)
    `,
    [userId, includeSystem],
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

async function searchGmailInboxMessages({ accessToken, account, pageToken, query }) {
  const pageState = decodeGmailSearchPageToken(pageToken);
  const nextPageState = {};
  const messagesById = new Map();

  for (const field of ["from", "to", "subject"]) {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("maxResults", String(INBOX_PAGE_SIZE));
    if (pageState[field]) {
      url.searchParams.set("pageToken", pageState[field]);
    }
    url.searchParams.set("q", buildGmailInboxSearchQuery(field, query));

    const response = await providerFetch(url.toString(), accessToken, { method: "GET" });
    const data = await response.json();
    nextPageState[field] = data.nextPageToken ?? "";

    for (const item of data.messages ?? []) {
      if (!item.id || messagesById.has(item.id)) {
        continue;
      }
      const message = await fetchGmailMessageMetadata(accessToken, item.id);
      if (!gmailMessageMatchesInboxSearch(message, query)) {
        continue;
      }
      messagesById.set(item.id, await gmailMessageToInboxListItem(message, account, { name: "" }, accessToken));
    }
  }

  const messages = sortInboxMessages([...messagesById.values()], "newest").slice(0, INBOX_PAGE_SIZE);
  const hasMore = Object.values(nextPageState).some(Boolean);
  return { messages, nextPageToken: hasMore ? encodeGmailSearchPageToken(nextPageState) : null };
}

function buildGmailInboxSearchQuery(field, query) {
  const term = formatGmailSearchTerm(query);
  return ["-in:sent", "-in:drafts", term ? `${field}:${term}` : ""].filter(Boolean).join(" ");
}

function formatGmailSearchTerm(value) {
  const normalized = String(value ?? "").trim().replace(/[{}()]/g, " ").replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  if (!normalized.includes(" ")) {
    return normalized.replace(/["\\]/g, "\\$&");
  }
  return `"${normalized.replace(/["\\]/g, "\\$&")}"`;
}

function gmailMessageMatchesInboxSearch(message, query) {
  const headers = getGmailHeaders(message);
  const needle = normalizeInboxSearchText(query);
  if (!needle) {
    return false;
  }

  return [headers.from, headers.to, headers.subject].some((value) => normalizeInboxSearchText(value).includes(needle));
}

function normalizeInboxSearchText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function decodeGmailSearchPageToken(token) {
  if (!token) {
    return {};
  }

  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function encodeGmailSearchPageToken(state) {
  const activeState = Object.fromEntries(Object.entries(state).filter(([, value]) => Boolean(value)));
  if (Object.keys(activeState).length === 0) {
    return null;
  }
  return Buffer.from(JSON.stringify(activeState)).toString("base64url");
}

async function fetchGmailMessageMetadata(accessToken, emailId) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(emailId)}`);
  url.searchParams.set("format", "metadata");
  for (const header of ["From", "To", "Cc", "Subject", "Date", "Message-ID", "References"]) {
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
  const threadMessages = await fetchGmailThreadMessages(accessToken, account, message.threadId);

  return {
    id: message.id,
    threadId: message.threadId,
    accountId: account.id,
    accountEmail: account.email,
    provider: account.provider,
    from: headers.from || "",
    to: headers.to || "",
    cc: headers.cc || "",
    bcc: headers.bcc || "",
    subject: headers.subject || "",
    date: new Date(Number(message.internalDate || Date.parse(headers.date) || Date.now())).toISOString(),
    isRead: !Array.isArray(message.labelIds) || !message.labelIds.includes("UNREAD"),
    bodyText: body.text,
    bodyHtml: sanitizeEmailHtml(body.html),
    attachments: collectGmailAttachments(message.payload),
    threadMessages,
    replyCount: threadMessages.filter((threadMessage) => threadMessage.id !== message.id && threadMessage.isSent).length,
  };
}

async function fetchGmailAttachment(accessToken, emailId, attachmentId) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`);
  const response = await providerFetch(url.toString(), accessToken, { method: "GET" });
  const data = await response.json();
  if (!data.data) {
    const error = new Error("Gmail did not return attachment data");
    error.status = 502;
    throw error;
  }

  return Buffer.from(String(data.data).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

async function fetchGmailThreadMessages(accessToken, account, threadId) {
  if (!threadId) {
    return [];
  }

  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}`);
  url.searchParams.set("format", "full");
  const response = await providerFetch(url.toString(), accessToken, { method: "GET" });
  const thread = await response.json();

  return (thread.messages ?? [])
    .map((message) => {
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
        isSent: Array.isArray(message.labelIds) && message.labelIds.includes("SENT"),
      };
    })
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
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
  const original = compose.replyToEmailId ? await fetchGmailMessageMetadata(accessToken, compose.replyToEmailId) : null;
  const raw = buildGmailComposeMessage(account.email, compose, original);
  const response = await providerFetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", accessToken, {
    method: "POST",
    body: JSON.stringify({
      message: {
        raw,
        ...(original?.threadId ? { threadId: original.threadId } : {}),
      },
    }),
  });

  return response.json();
}

async function updateGmailComposeDraft(accessToken, account, draftId, compose) {
  const raw = buildGmailComposeMessage(account.email, compose);
  const response = await providerFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}`,
    accessToken,
    {
      method: "PUT",
      body: JSON.stringify({
        id: draftId,
        message: {
          raw,
          ...(compose.threadId ? { threadId: compose.threadId } : {}),
        },
      }),
    },
  );
  return response.json();
}

async function listGmailDraftMessages({ accessToken, account, pageToken, query }) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/drafts");
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
  for (const draftSummary of data.drafts ?? []) {
    if (!draftSummary.id) {
      continue;
    }
    const draftUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draftSummary.id)}`);
    draftUrl.searchParams.set("format", "metadata");
    for (const header of ["From", "To", "Cc", "Subject", "Date"]) {
      draftUrl.searchParams.append("metadataHeaders", header);
    }
    const draftResponse = await providerFetch(draftUrl.toString(), accessToken, { method: "GET" });
    const draft = await draftResponse.json();
    if (!draft.message?.id) {
      continue;
    }
    messages.push({
      ...await gmailMessageToInboxListItem(draft.message, account, { name: "Draft" }),
      draftId: draft.id,
    });
  }

  return { messages, nextPageToken: data.nextPageToken ?? null };
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
  const original = compose.replyToEmailId ? await fetchGmailMessageMetadata(accessToken, compose.replyToEmailId) : null;
  const raw = buildGmailComposeMessage(account.email, compose, original);
  const response = await providerFetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", accessToken, {
    method: "POST",
    body: JSON.stringify({
      raw,
      ...(original?.threadId ? { threadId: original.threadId } : {}),
    }),
  });

  return response.json();
}

async function sendMicrosoftComposeMessage(accessToken, account, compose) {
  const metadata = account.metadata ?? {};
  const transport = nodemailer.createTransport({
    host: metadata.smtpHost || "smtp-mail.outlook.com",
    port: Number(metadata.smtpPort ?? 587),
    secure: metadata.smtpSecure === true,
    requireTLS: true,
    auth: {
      type: "OAuth2",
      user: account.email,
      accessToken,
    },
  });

	  try {
	    const result = await transport.sendMail({
	      from: account.email,
	      to: splitAddressList(compose.to),
	      cc: splitAddressList(compose.cc),
	      bcc: splitAddressList(compose.bcc),
	      subject: compose.subject,
	      text: compose.bodyText,
	      attachments: normalizeComposeAttachments(compose.attachments).map((attachment) => ({
	        filename: attachment.filename,
	        contentType: attachment.type,
	        content: Buffer.from(attachment.data, "base64"),
	      })),
	    });
    return { id: result.messageId || null, threadId: null };
  } catch (error) {
    const providerError = new Error(
      `Microsoft rejected the send request. Reconnect the account and confirm SMTP AUTH is allowed. ${error?.message || ""}`.trim(),
    );
    providerError.status = 502;
    throw providerError;
  } finally {
    transport.close();
  }
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
    isRead: !Array.isArray(message.labelIds) || !message.labelIds.includes("UNREAD"),
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
      archivedOnly: query.archived === "true",
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

function parseCommitmentInput(body) {
  const bulk = parseBulkMessageInput(body);
  if (!bulk.ok) {
    return bulk;
  }

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const dueAtText = typeof body?.dueAt === "string" ? body.dueAt.trim() : "";
  const dueAt = new Date(dueAtText);

  if (!text) {
    return { ok: false, error: "Describe what needs to be done before this email can be archived." };
  }
  if (text.length > 500) {
    return { ok: false, error: "Commitment text must be 500 characters or less." };
  }
  if (!dueAtText || Number.isNaN(dueAt.getTime())) {
    return { ok: false, error: "Choose a valid commitment due date and time." };
  }
  if (dueAt.getTime() < Date.now() - 60_000) {
    return { ok: false, error: "Commitment due date cannot be in the past." };
  }

  return {
    ok: true,
    action: {
      messages: bulk.messages,
      text,
      dueAt,
    },
  };
}

function parseAttachmentDownloadQuery(query) {
  const accountId = typeof query.accountId === "string" ? query.accountId : "";
  const emailId = typeof query.emailId === "string" ? query.emailId : "";
  const attachmentId = typeof query.attachmentId === "string" ? query.attachmentId : "";
  if (!accountId || !emailId || !attachmentId) {
    return { ok: false, error: "accountId, emailId, and attachmentId are required" };
  }

  return {
    ok: true,
    query: {
      accountId,
      attachmentId,
      emailId,
      filename: typeof query.filename === "string" ? query.filename : "",
      mailbox: typeof query.mailbox === "string" ? query.mailbox : "",
      type: typeof query.type === "string" ? query.type : "",
    },
  };
}

function parseLabelCountsQuery(query) {
  return { accountIds: parseCsv(query.accounts), archivedOnly: query.archived === "true" };
}

function parseComposeInput(body) {
  const compose = {
    accountId: typeof body?.accountId === "string" ? body.accountId : "",
    to: typeof body?.to === "string" ? body.to.trim() : "",
    cc: typeof body?.cc === "string" ? body.cc.trim() : "",
    bcc: typeof body?.bcc === "string" ? body.bcc.trim() : "",
    subject: typeof body?.subject === "string" ? body.subject.trim() : "",
    bodyText: typeof body?.bodyText === "string" ? body.bodyText : "",
    replyToEmailId: typeof body?.replyToEmailId === "string" ? body.replyToEmailId.trim() : "",
    forwardFromEmailId: typeof body?.forwardFromEmailId === "string" ? body.forwardFromEmailId.trim() : "",
    threadId: typeof body?.threadId === "string" ? body.threadId.trim() : "",
    attachments: Array.isArray(body?.attachments)
      ? body.attachments
          .filter((attachment) => attachment && typeof attachment === "object")
          .map((attachment) => ({
            filename: typeof attachment.filename === "string" ? attachment.filename : "Attachment",
            type: typeof attachment.type === "string" ? attachment.type : "application/octet-stream",
            size: Number.isFinite(attachment.size) ? attachment.size : null,
            data: typeof attachment.data === "string" ? attachment.data : "",
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
      attachmentId: part.body.attachmentId,
      filename: part.filename,
      type: part.mimeType || "application/octet-stream",
      size: part.body.size ?? null,
      downloadSupported: true,
    });
  }

  for (const child of part.parts ?? []) {
    collectGmailAttachments(child, attachments);
  }

  return attachments;
}

function buildGmailComposeMessage(from, compose, original = null) {
  const originalHeaders = original ? getGmailHeaders(original) : {};
  const originalMessageId = originalHeaders["message-id"] || "";
  const references = [originalHeaders.references, originalMessageId].filter(Boolean).join(" ");
  const attachments = normalizeComposeAttachments(compose.attachments);
  const baseHeaders = [
    `From: ${from}`,
    `To: ${compose.to}`,
    compose.cc ? `Cc: ${compose.cc}` : null,
    compose.bcc ? `Bcc: ${compose.bcc}` : null,
    `Subject: ${compose.subject}`,
    originalMessageId ? `In-Reply-To: ${originalMessageId}` : null,
    references ? `References: ${references}` : null,
    "MIME-Version: 1.0",
  ].filter((line) => line !== null);

  if (attachments.length > 0) {
    const boundary = `emailable-${crypto.randomUUID()}`;
    const lines = [
      ...baseHeaders,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      compose.bodyText || "",
      ...attachments.flatMap((attachment) => [
        `--${boundary}`,
        `Content-Type: ${attachment.type}; name="${escapeMimeHeader(attachment.filename)}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${escapeMimeHeader(attachment.filename)}"`,
        "",
        wrapBase64(attachment.data),
      ]),
      `--${boundary}--`,
      "",
    ];

    return encodeGmailRawMessage(lines.join("\r\n"));
  }

  const lines = [
    ...baseHeaders,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    compose.bodyText,
  ];

  return encodeGmailRawMessage(lines.join("\r\n"));
}

function encodeGmailRawMessage(raw) {
  return Buffer.from(raw, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function normalizeComposeAttachments(attachments = []) {
  return (Array.isArray(attachments) ? attachments : [])
    .filter((attachment) => attachment?.data && attachment?.filename)
    .map((attachment) => ({
      data: String(attachment.data).replace(/^data:[^;]+;base64,/, ""),
      filename: sanitizeDownloadFilename(attachment.filename),
      type: String(attachment.type || "application/octet-stream"),
    }));
}

function escapeMimeHeader(value) {
  return String(value || "").replace(/["\r\n]/g, "");
}

function wrapBase64(value) {
  return String(value || "").replace(/\s+/g, "").replace(/.{1,76}/g, "$&\r\n").trim();
}

function providerDisplayName(provider) {
  if (provider === "gmail") {
    return "Gmail";
  }
  if (provider === "imap") {
    return "IMAP";
  }
  if (provider === "microsoft") {
    return "Microsoft";
  }
  return provider;
}

function sanitizeDownloadFilename(filename) {
  return String(filename || "attachment")
    .replace(/["\r\n]/g, "")
    .replace(/[\\/]/g, "_")
    .trim()
    || "attachment";
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
  const user = await resolveRequestUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  req.user = user;
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
