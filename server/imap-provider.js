import { ImapFlow } from "imapflow";
import { decryptToken } from "./email-accounts.js";

const DEFAULT_IMAP_MAILBOX = "INBOX";
const DEFAULT_DRAFTS_MAILBOX = "Drafts";
const DEFAULT_SENT_MAILBOX = "Sent";

export async function withImapClient(account, fn) {
  const metadata = account.metadata ?? {};
  const client = new ImapFlow({
    host: metadata.imapHost,
    port: Number(metadata.imapPort ?? 993),
    secure: metadata.imapSecure !== false,
    auth: {
      user: metadata.imapUsername || account.email,
      pass: decryptToken(account.access_token),
    },
    logger: false,
  });
  client.on("error", () => {});

  await connectImapClient(client);
  try {
    return await fn(client, metadata);
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function testImapConnection(settings) {
  const client = new ImapFlow({
    host: settings.imapHost,
    port: Number(settings.imapPort),
    secure: settings.imapSecure,
    auth: {
      user: settings.imapUsername || settings.email,
      pass: settings.appPassword,
    },
    logger: false,
  });
  client.on("error", () => {});

  try {
    await connectImapClient(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

async function connectImapClient(client) {
  try {
    await client.connect();
  } catch (error) {
    throw normalizeImapConnectionError(error);
  }
}

function normalizeImapConnectionError(error) {
  if (error?.authenticationFailed || error?.serverResponseCode === "AUTHENTICATIONFAILED") {
    return new Error("IMAP authentication failed. Check the username and app password.");
  }

  if (error?.code === "ENOTFOUND") {
    return new Error("IMAP host could not be found. Check the IMAP server host.");
  }

  if (error?.code === "ECONNREFUSED" || error?.code === "ETIMEDOUT" || error?.code === "ECONNRESET") {
    return new Error("Could not connect to the IMAP server. Check the host, port, and SSL setting.");
  }

  return new Error(error?.message || "Could not connect to the IMAP server.");
}

export async function syncImapFolder({ action, account, label, providerLabelId }) {
  return withImapClient(account, async (client) => {
    if (action === "delete") {
      if (!providerLabelId) {
        return null;
      }

      try {
        await client.mailboxDelete(providerLabelId);
      } catch (error) {
        if (!isMissingMailboxError(error)) {
          throw error;
        }
      }
      return providerLabelId;
    }

    if (action === "create" || !providerLabelId) {
      return ensureImapMailbox(client, label.name);
    }

    if (action === "update") {
      const current = await findImapMailbox(client, providerLabelId);
      if (!current) {
        return ensureImapMailbox(client, label.name);
      }

      if (current.path !== label.name) {
        await client.mailboxRename(current.path, label.name);
        return label.name;
      }

      return current.path;
    }

    throw new Error(`Unsupported IMAP folder sync action: ${action}`);
  });
}

export async function getImapFolder(account, providerLabelId) {
  if (!providerLabelId) {
    return null;
  }

  return withImapClient(account, async (client) => {
    const folder = await findImapMailbox(client, providerLabelId);
    return folder ? { id: folder.path, name: folder.name || folder.path } : null;
  });
}

export async function moveImapMessageToFolders({ account, emailId, addFolders = [], removeFolders = [] }) {
  return withImapClient(account, async (client, metadata) => {
    const sourceMailbox = metadata.defaultMailbox || DEFAULT_IMAP_MAILBOX;
    const found = await findImapMessage(client, sourceMailbox, emailId);

    if (!found) {
      throw providerNotFoundError("IMAP message was not found");
    }

    if (addFolders.length > 0) {
      const [targetFolder] = addFolders;
      await ensureImapMailbox(client, targetFolder);
      if (found.mailbox !== targetFolder) {
        await client.mailboxOpen(found.mailbox);
        await client.messageMove([found.uid], targetFolder, { uid: true });
      }
      return { uid: found.uid, mailbox: targetFolder };
    }

    for (const folder of removeFolders) {
      if (found.mailbox === folder) {
        await client.mailboxOpen(found.mailbox);
        await client.messageMove([found.uid], sourceMailbox, { uid: true });
      }
    }

    return { uid: found.uid, mailbox: found.mailbox };
  });
}

export async function moveImapInboxMessageToFolder({ account, emailId, sourceMailbox, targetFolder }) {
  return withImapClient(account, async (client, metadata) => {
    const mailbox = sourceMailbox || metadata.defaultMailbox || DEFAULT_IMAP_MAILBOX;
    const found = await findImapMessage(client, mailbox, emailId);

    if (!found) {
      throw providerNotFoundError("IMAP message was not found");
    }

    await ensureImapMailbox(client, targetFolder);
    if (found.mailbox !== targetFolder) {
      await client.mailboxOpen(found.mailbox);
      await client.messageMove([found.uid], targetFolder, { uid: true });
    }

    return { uid: found.uid, mailbox: targetFolder };
  });
}

export async function moveImapInboxMessageToTrash({ account, emailId, sourceMailbox }) {
  const trashMailbox = account.metadata?.trashMailbox || "Trash";
  return moveImapInboxMessageToFolder({ account, emailId, sourceMailbox, targetFolder: trashMailbox });
}

export async function createImapDraft({ account, input }) {
  return withImapClient(account, async (client, metadata) => {
    const draftsMailbox = metadata.draftsMailbox || DEFAULT_DRAFTS_MAILBOX;
    const sourceMailbox = metadata.defaultMailbox || DEFAULT_IMAP_MAILBOX;
    const original = await findImapMessage(client, sourceMailbox, input.emailId);
    await ensureImapMailbox(client, draftsMailbox);
    const raw = buildDraftMessage(account.email, input, original);
    const result = await client.append(draftsMailbox, raw, ["\\Draft"], new Date());

    return {
      id: result?.uid ? String(result.uid) : cryptoRandomId(),
      mailbox: draftsMailbox,
      subject: getReplySubject(input.subject || original?.subject || ""),
      toRecipients: parseAddressList(input.to || original?.from || ""),
    };
  });
}

export async function createImapComposeDraft({ account, input }) {
  return withImapClient(account, async (client, metadata) => {
    const draftsMailbox = metadata.draftsMailbox || DEFAULT_DRAFTS_MAILBOX;
    await ensureImapMailbox(client, draftsMailbox);
    const raw = buildComposeMessage(account.email, input);
    const result = await client.append(draftsMailbox, raw, ["\\Draft"], new Date());

    return {
      id: result?.uid ? String(result.uid) : cryptoRandomId(),
      mailbox: draftsMailbox,
      subject: input.subject || "",
      toRecipients: parseAddressList(input.to || ""),
    };
  });
}

export async function searchImapInboxMessages(account, { folder, limit, pageToken = "", query = "" }) {
  return withImapClient(account, async (client) => {
    const mailbox = await findImapMailbox(client, folder);
    if (!mailbox) {
      return { messages: [], nextPageToken: null, totalEstimate: 0 };
    }

    const opened = await client.mailboxOpen(mailbox.path);
    const searchQuery = buildImapSearchQuery(query);
    const uids = (await client.search(searchQuery, { uid: true })) || [];
    const sorted = [...uids].sort((a, b) => Number(b) - Number(a));
    const offset = Math.max(Number.parseInt(pageToken || "0", 10) || 0, 0);
    const selected = sorted.slice(offset, offset + limit);
    const messages = [];

    for (const uid of selected) {
      const message = await client.fetchOne(String(uid), {
        uid: true,
        envelope: true,
        flags: true,
        bodyStructure: true,
        internalDate: true,
      }, { uid: true });
      if (!message) {
        continue;
      }

      messages.push(imapMessageToInboxListItem(message, account, mailbox.path));
    }

    return {
      messages,
      nextPageToken: offset + selected.length < sorted.length ? String(offset + selected.length) : null,
      totalEstimate: opened.exists ?? sorted.length,
    };
  });
}

export async function getImapInboxCount(account, folder) {
  return withImapClient(account, async (client) => {
    const mailbox = await findImapMailbox(client, folder);
    if (!mailbox) {
      return null;
    }

    const opened = await client.mailboxOpen(mailbox.path);
    return opened.exists ?? null;
  });
}

export async function fetchImapInboxMessage(account, { emailId, mailbox }) {
  return withImapClient(account, async (client, metadata) => {
    const targetMailbox = mailbox || metadata.defaultMailbox || DEFAULT_IMAP_MAILBOX;
    const mailboxInfo = await findImapMailbox(client, targetMailbox);
    if (!mailboxInfo) {
      throw providerNotFoundError("IMAP mailbox was not found");
    }

    await client.mailboxOpen(mailboxInfo.path);
    const message = await client.fetchOne(String(emailId), {
      uid: true,
      envelope: true,
      bodyStructure: true,
      internalDate: true,
      source: true,
    }, { uid: true });

    if (!message) {
      throw providerNotFoundError("IMAP message was not found");
    }

    const raw = message.source?.toString() ?? "";
    const bodyText = extractTextFromRawMessage(raw);

    return {
      id: String(message.uid),
      threadId: String(message.uid),
      accountId: account.id,
      accountEmail: account.email,
      provider: account.provider,
      mailbox: mailboxInfo.path,
      from: (message.envelope?.from ?? []).map(formatImapAddress).filter(Boolean).join(", "),
      to: (message.envelope?.to ?? []).map(formatImapAddress).filter(Boolean).join(", "),
      cc: (message.envelope?.cc ?? []).map(formatImapAddress).filter(Boolean).join(", "),
      subject: message.envelope?.subject ?? "",
      date: (message.internalDate ?? message.envelope?.date ?? new Date()).toISOString(),
      bodyText,
      bodyHtml: "",
      attachments: collectImapAttachments(message.bodyStructure),
    };
  });
}

export async function searchImapSentEmailContexts(account, filters, limit) {
  return withImapClient(account, async (client, metadata) => {
    const sentMailbox = metadata.sentMailbox || DEFAULT_SENT_MAILBOX;
    const mailbox = await findImapMailbox(client, sentMailbox);
    if (!mailbox) {
      return [];
    }

    await client.mailboxOpen(mailbox.path);
    const query = { all: true };
    if (filters.recipient) {
      query.to = filters.recipient;
    }
    if (filters.subject) {
      query.subject = filters.subject;
    }

    const uids = (await client.search(query, { uid: true })) || [];
    const latest = uids.slice(-Math.min(Math.max(limit, 1), 10)).reverse();
    const results = [];

    for (const uid of latest) {
      const message = await client.fetchOne(String(uid), { uid: true, envelope: true, source: true }, { uid: true });
      if (!message) {
        continue;
      }

      results.push({
        emailId: String(message.uid),
        to: (message.envelope?.to ?? []).map(formatImapAddress).filter(Boolean).join(", "),
        subject: message.envelope?.subject ?? "",
        bodyText: extractTextFromRawMessage(message.source?.toString() ?? ""),
      });
    }

    return results;
  });
}

export async function searchImapEmailContexts(account, filters, limit) {
  return withImapClient(account, async (client, metadata) => {
    const mailbox = metadata.defaultMailbox || DEFAULT_IMAP_MAILBOX;
    await client.mailboxOpen(mailbox);
    const query = { all: true };
    if (filters.subject) {
      query.subject = filters.subject;
    }

    const uids = (await client.search(query, { uid: true })) || [];
    const latest = uids.slice(-Math.min(Math.max(limit, 1), 10)).reverse();
    const results = [];

    for (const uid of latest) {
      const message = await client.fetchOne(String(uid), { uid: true, envelope: true, source: true }, { uid: true });
      if (!message) {
        continue;
      }

      results.push({
        emailId: String(message.uid),
        threadId: String(message.uid),
        fromEmail: (message.envelope?.from ?? []).map(formatImapAddress).filter(Boolean).join(", "),
        fromName: (message.envelope?.from ?? []).map((address) => address?.name).filter(Boolean).join(", "),
        to: (message.envelope?.to ?? []).map(formatImapAddress).filter(Boolean).join(", "),
        subject: message.envelope?.subject ?? "",
        snippet: extractTextFromRawMessage(message.source?.toString() ?? "").slice(0, 300),
      });
    }

    return results;
  });
}

export async function findImapMessageAccountMatch(account, emailId, subject) {
  return withImapClient(account, async (client, metadata) => {
    const mailbox = metadata.defaultMailbox || DEFAULT_IMAP_MAILBOX;
    const found = await findImapMessage(client, mailbox, emailId);
    if (!found) {
      return null;
    }

    if (subject && normalizeSubject(found.subject) !== normalizeSubject(subject)) {
      return null;
    }

    return { subject: found.subject, message: found };
  });
}

export async function fetchImapEmailContextById(account, emailId, subject = "") {
  return withImapClient(account, async (client, metadata) => {
    const mailbox = metadata.defaultMailbox || DEFAULT_IMAP_MAILBOX;
    const found = await findImapMessage(client, mailbox, emailId);
    if (!found) {
      return null;
    }

    if (subject && normalizeSubject(found.subject) !== normalizeSubject(subject)) {
      return null;
    }

    await client.mailboxOpen(found.mailbox);
    const message = await client.fetchOne(String(found.uid), { uid: true, envelope: true, source: true }, { uid: true });
    if (!message) {
      return null;
    }

    const bodyText = extractTextFromRawMessage(message.source?.toString() ?? "");
    return {
      emailId: String(message.uid),
      threadId: String(message.uid),
      accountEmail: account.email,
      provider: account.provider,
      fromEmail: (message.envelope?.from ?? []).map(formatImapAddress).filter(Boolean).join(", "),
      fromName: (message.envelope?.from ?? []).map((address) => address?.name).filter(Boolean).join(", "),
      to: (message.envelope?.to ?? []).map(formatImapAddress).filter(Boolean).join(", "),
      subject: message.envelope?.subject ?? "",
      snippet: bodyText.slice(0, 300),
      bodyText,
    };
  });
}

async function ensureImapMailbox(client, name) {
  const existing = await findImapMailbox(client, name);
  if (existing) {
    return existing.path;
  }

  await client.mailboxCreate(name);
  return name;
}

async function findImapMailbox(client, name) {
  const mailboxes = await client.list();
  const target = normalizeMailboxName(name);
  return mailboxes.find((mailbox) => normalizeMailboxName(mailbox.path) === target || normalizeMailboxName(mailbox.name) === target) ?? null;
}

async function findImapMessage(client, mailbox, emailId) {
  await client.mailboxOpen(mailbox);

  if (/^\d+$/.test(String(emailId))) {
    const byUid = await client.fetchOne(String(emailId), { uid: true, envelope: true }, { uid: true });
    if (byUid) {
      return {
        uid: byUid.uid,
        mailbox,
        subject: byUid.envelope?.subject ?? "",
        from: (byUid.envelope?.from ?? []).map(formatImapAddress).filter(Boolean).join(", "),
      };
    }
  }

  const uids = (await client.search({ header: { "message-id": String(emailId).replace(/^<|>$/g, "") } }, { uid: true })) || [];
  if (uids.length === 0) {
    return null;
  }

  const message = await client.fetchOne(String(uids[0]), { uid: true, envelope: true }, { uid: true });
  return message
    ? {
        uid: message.uid,
        mailbox,
        subject: message.envelope?.subject ?? "",
        from: (message.envelope?.from ?? []).map(formatImapAddress).filter(Boolean).join(", "),
      }
    : null;
}

function buildDraftMessage(from, input, original) {
  const to = input.to || original?.from || "";
  const subject = getReplySubject(input.subject || original?.subject || "");
  const body = input.bodyHtml || input.bodyText || "";
  const contentType = input.bodyHtml ? "text/html" : "text/plain";

  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: ${contentType}; charset=UTF-8`,
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join("\r\n");
}

function buildComposeMessage(from, input) {
  const lines = [
    `From: ${from}`,
    `To: ${input.to}`,
    input.cc ? `Cc: ${input.cc}` : null,
    input.bcc ? `Bcc: ${input.bcc}` : null,
    `Subject: ${input.subject || ""}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.bodyText || "",
  ].filter((line) => line !== null);

  return lines.join("\r\n");
}

function buildImapSearchQuery(query) {
  const trimmed = String(query ?? "").trim();
  if (!trimmed) {
    return { all: true };
  }

  return { or: [{ subject: trimmed }, { from: trimmed }, { body: trimmed }] };
}

function imapMessageToInboxListItem(message, account, mailbox) {
  const from = (message.envelope?.from ?? []).map(formatImapAddress).filter(Boolean).join(", ");
  const date = message.internalDate ?? message.envelope?.date ?? new Date();

  return {
    id: String(message.uid),
    threadId: String(message.uid),
    accountId: account.id,
    accountEmail: account.email,
    provider: account.provider,
    mailbox,
    from,
    sender: from,
    subject: message.envelope?.subject ?? "",
    snippet: "",
    date: date.toISOString(),
    labels: [mailbox],
    hasAttachments: collectImapAttachments(message.bodyStructure).length > 0,
  };
}

function collectImapAttachments(structure) {
  const attachments = [];
  collectImapAttachmentsFromNode(structure, attachments);
  return attachments;
}

function collectImapAttachmentsFromNode(node, attachments) {
  if (!node) {
    return;
  }

  const disposition = String(node.disposition ?? "").toLowerCase();
  if (node.dispositionParameters?.filename || node.parameters?.name || disposition === "attachment") {
    attachments.push({
      filename: node.dispositionParameters?.filename || node.parameters?.name || "Attachment",
      type: [node.type, node.subtype].filter(Boolean).join("/").toLowerCase() || "application/octet-stream",
      size: node.size ?? null,
    });
  }

  for (const child of node.childNodes ?? []) {
    collectImapAttachmentsFromNode(child, attachments);
  }
}

function getReplySubject(subject) {
  return /^re:/i.test(subject) ? subject : `Re: ${subject || "(no subject)"}`;
}

function parseAddressList(value) {
  return String(value)
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
}

function formatImapAddress(address) {
  return address?.address || [address?.name, address?.host].filter(Boolean).join("@");
}

function extractTextFromRawMessage(raw) {
  const body = raw.split(/\r?\n\r?\n/).slice(1).join("\n\n");
  return body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000);
}

function normalizeMailboxName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeSubject(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function isMissingMailboxError(error) {
  return error.responseStatus === "NO" || /not found|doesn't exist|no such/i.test(error.message);
}

function providerNotFoundError(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2);
}
