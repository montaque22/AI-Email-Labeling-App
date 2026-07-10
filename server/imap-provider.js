import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { decryptToken } from "./email-accounts.js";
import nodemailer from "nodemailer";

const DEFAULT_IMAP_MAILBOX = "INBOX";
const DEFAULT_DRAFTS_MAILBOX = "Drafts";
const DEFAULT_SENT_MAILBOX = "Sent";

export async function withImapClient(account, fn, oauthAccessToken = "") {
  const metadata = account.metadata ?? {};
  const usesOAuth = account.provider === "yahoo" || account.provider === "microsoft";
  const defaultHost = account.provider === "yahoo" ? "imap.mail.yahoo.com" : account.provider === "microsoft" ? "outlook.office365.com" : "";
  const client = new ImapFlow({
    host: metadata.imapHost || defaultHost,
    port: Number(metadata.imapPort ?? 993),
    secure: metadata.imapSecure !== false,
    auth: {
      user: metadata.imapUsername || account.email,
      ...(usesOAuth ? { accessToken: oauthAccessToken } : { pass: decryptToken(account.access_token) }),
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

export async function syncImapFolder({ action, account, label, providerLabelId, accessToken = "" }) {
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
  }, accessToken);
}

export async function getImapFolder(account, providerLabelId, accessToken = "") {
  if (!providerLabelId) {
    return null;
  }

  return withImapClient(account, async (client) => {
    const folder = await findImapMailbox(client, providerLabelId);
    return folder ? { id: folder.path, name: folder.name || folder.path } : null;
  }, accessToken);
}

export async function listImapFolders(account, accessToken = "") {
  return withImapClient(account, async (client) => {
    const mailboxes = await client.list();
    return mailboxes
      .filter((mailbox) => !isSystemMailbox(mailbox))
      .map((mailbox) => ({
        id: mailbox.path,
        name: mailbox.name || mailbox.path,
      }));
  }, accessToken);
}

export async function moveImapMessageToFolders({
  account,
  emailId,
  addFolders = [],
  removeFolders = [],
  accessToken = "",
}) {
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
  }, accessToken);
}

export async function moveImapInboxMessageToFolder({ account, emailId, sourceMailbox, targetFolder, accessToken = "" }) {
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
  }, accessToken);
}

export async function moveImapInboxMessageToTrash({ account, emailId, sourceMailbox, accessToken = "" }) {
  const trashMailbox = account.metadata?.trashMailbox || "Trash";
  return moveImapInboxMessageToFolder({ account, emailId, sourceMailbox, targetFolder: trashMailbox, accessToken });
}

export async function createImapDraft({ account, input, accessToken = "" }) {
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
  }, accessToken);
}

export async function createImapComposeDraft({ account, input, accessToken = "" }) {
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
  }, accessToken);
}

export async function updateImapComposeDraft({ account, draftId, mailbox, input, accessToken = "" }) {
  return withImapClient(account, async (client, metadata) => {
    const draftsMailbox = mailbox || metadata.draftsMailbox || DEFAULT_DRAFTS_MAILBOX;
    const existingMailbox = await findImapMailbox(client, draftsMailbox);
    if (!existingMailbox) {
      throw providerNotFoundError("IMAP drafts mailbox was not found");
    }

    await client.mailboxOpen(existingMailbox.path);
    const existing = await client.fetchOne(String(draftId), { uid: true }, { uid: true });
    if (!existing) {
      throw providerNotFoundError("IMAP draft was not found");
    }

    const raw = buildComposeMessage(account.email, input);
    const result = await client.append(existingMailbox.path, raw, ["\\Draft"], new Date());
    await client.mailboxOpen(existingMailbox.path);
    await client.messageDelete([existing.uid], { uid: true });

    return {
      id: result?.uid ? String(result.uid) : cryptoRandomId(),
      mailbox: existingMailbox.path,
      subject: input.subject || "",
      toRecipients: parseAddressList(input.to || ""),
    };
  }, accessToken);
}

export async function sendImapComposeMessage({ account, input, accessToken = "" }) {
  const metadata = account.metadata ?? {};
  const transport = nodemailer.createTransport({
    host: metadata.smtpHost || inferSmtpHost(account, metadata),
    port: Number(metadata.smtpPort ?? 587),
    secure: metadata.smtpSecure === true,
    requireTLS: metadata.smtpSecure !== true,
    auth: getSmtpAuth(account, accessToken),
  });

  try {
    const result = await transport.sendMail({
      from: account.email,
      to: parseAddressList(input.to || ""),
      cc: parseAddressList(input.cc || ""),
      bcc: parseAddressList(input.bcc || ""),
      subject: input.subject || "",
      text: input.bodyText || "",
      attachments: normalizeComposeAttachments(input.attachments).map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.type,
        content: Buffer.from(attachment.data, "base64"),
      })),
    });
    return { id: result.messageId || cryptoRandomId(), threadId: input.threadId || null };
  } finally {
    transport.close();
  }
}

export async function searchImapInboxMessages(account, { folder, limit, pageToken = "", query = "", accessToken = "" }) {
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
  }, accessToken);
}

export async function getImapInboxCount(account, folder, accessToken = "") {
  return withImapClient(account, async (client) => {
    const mailbox = await findImapMailbox(client, folder);
    if (!mailbox) {
      return null;
    }

    const opened = await client.mailboxOpen(mailbox.path);
    return opened.exists ?? null;
  }, accessToken);
}

export async function fetchImapInboxMessage(account, { emailId, mailbox, accessToken = "" }) {
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
      flags: true,
      bodyStructure: true,
      internalDate: true,
      source: true,
    }, { uid: true });

    if (!message) {
      throw providerNotFoundError("IMAP message was not found");
    }

    const raw = message.source?.toString() ?? "";
    const parsed = await parseRawEmail(raw);

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
      bcc: (message.envelope?.bcc ?? []).map(formatImapAddress).filter(Boolean).join(", "),
      subject: message.envelope?.subject ?? "",
      date: (message.internalDate ?? message.envelope?.date ?? new Date()).toISOString(),
      isRead: hasImapFlag(message.flags, "\\Seen"),
      bodyText: parsed.text,
      bodyHtml: rewriteImapInlineImageSources(parsed.html, account.id, String(message.uid), mailboxInfo.path, parsed.attachments),
      attachments: parsed.attachments,
    };
  }, accessToken);
}

export async function fetchImapAttachment({ account, emailId, mailbox, attachmentId, accessToken = "" }) {
  return withImapClient(account, async (client, metadata) => {
    const targetMailbox = mailbox || metadata.defaultMailbox || DEFAULT_IMAP_MAILBOX;
    const mailboxInfo = await findImapMailbox(client, targetMailbox);
    if (!mailboxInfo) {
      throw providerNotFoundError("IMAP mailbox was not found");
    }

    await client.mailboxOpen(mailboxInfo.path);
    const message = await client.fetchOne(String(emailId), { uid: true, source: true }, { uid: true });
    if (!message) {
      throw providerNotFoundError("IMAP message was not found");
    }

    const parsed = await simpleParser(message.source ?? Buffer.alloc(0));
    const attachmentIndex = Number.parseInt(String(attachmentId), 10);
    const attachment = parsed.attachments?.[attachmentIndex];
    if (!attachment) {
      throw providerNotFoundError("IMAP attachment was not found");
    }

    return {
      buffer: Buffer.isBuffer(attachment.content) ? attachment.content : Buffer.from(attachment.content ?? ""),
      filename: attachment.filename || "attachment",
      type: attachment.contentType || "application/octet-stream",
    };
  }, accessToken);
}

export async function markImapInboxMessageRead(account, { emailId, mailbox }, accessToken = "") {
  return withImapClient(account, async (client, metadata) => {
    const targetMailbox = mailbox || metadata.defaultMailbox || DEFAULT_IMAP_MAILBOX;
    const mailboxInfo = await findImapMailbox(client, targetMailbox);
    if (!mailboxInfo) {
      throw providerNotFoundError("IMAP mailbox was not found");
    }

    await client.mailboxOpen(mailboxInfo.path);
    return client.messageFlagsAdd(String(emailId), ["\\Seen"], { uid: true });
  }, accessToken);
}

export async function searchImapSentEmailContexts(account, filters, limit, accessToken = "") {
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
  }, accessToken);
}

export async function searchImapEmailContexts(account, filters, limit, accessToken = "") {
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
  }, accessToken);
}

export async function searchRecentImapEmailContexts(
  account,
  { since, limit = 100, folder = "", accessToken = "" },
) {
  return withImapClient(account, async (client, metadata) => {
    const mailbox = folder || metadata.defaultMailbox || DEFAULT_IMAP_MAILBOX;
    await client.mailboxOpen(mailbox);
    const uids = (await client.search({ since }, { uid: true })) || [];
    const latest = uids.slice(-Math.min(Math.max(limit, 1), 100)).reverse();
    const results = [];

    for (const uid of latest) {
      const message = await client.fetchOne(String(uid), {
        uid: true,
        envelope: true,
        source: true,
        internalDate: true,
      }, { uid: true });
      if (!message) {
        continue;
      }

      const messageDate = message.internalDate ?? message.envelope?.date ?? new Date(0);
      if (messageDate < since) {
        continue;
      }
      const bodyText = extractTextFromRawMessage(message.source?.toString() ?? "");
      results.push({
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
        date: messageDate.toISOString(),
      });
    }

    return results;
  }, accessToken);
}

export async function findImapMessageAccountMatch(account, emailId, subject, accessToken = "") {
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
  }, accessToken);
}

export async function fetchImapEmailContextById(account, emailId, subject = "", accessToken = "") {
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
    const message = await client.fetchOne(String(found.uid), {
      uid: true,
      envelope: true,
      flags: true,
      bodyStructure: true,
      internalDate: true,
      source: true,
    }, { uid: true });
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
      receivedAt: (message.internalDate ?? message.envelope?.date ?? new Date()).toISOString(),
      isRead: hasImapFlag(message.flags, "\\Seen"),
      hasAttachments: collectImapAttachments(message.bodyStructure).length > 0,
    };
  }, accessToken);
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
  const exact = mailboxes.find(
    (mailbox) => normalizeMailboxName(mailbox.path) === target || normalizeMailboxName(mailbox.name) === target,
  );
  if (exact) {
    return exact;
  }

  const requestedSpecialUse = mailboxSpecialUse(name);
  return requestedSpecialUse
    ? mailboxes.find((mailbox) => String(mailbox.specialUse || "").toLowerCase() === requestedSpecialUse) ?? null
    : null;
}

function mailboxSpecialUse(name) {
  const normalized = normalizeMailboxName(name);
  if (["sent", "sent items", "sent messages"].includes(normalized)) return "\\sent";
  if (["draft", "drafts"].includes(normalized)) return "\\drafts";
  if (["trash", "deleted", "deleted items"].includes(normalized)) return "\\trash";
  return "";
}

function isSystemMailbox(mailbox) {
  if (mailbox.specialUse) {
    return true;
  }

  const normalized = normalizeMailboxName(mailbox.path || mailbox.name || "");
  return ["inbox", "sent", "sent items", "sent messages", "draft", "drafts", "trash", "deleted", "deleted items", "junk", "spam"].includes(
    normalized,
  );
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
  return buildMimeMessage({
    attachments: input.attachments,
    body: input.bodyHtml || input.bodyText || "",
    contentType: input.bodyHtml ? "text/html" : "text/plain",
    from,
    subject,
    to,
  });
}

function buildComposeMessage(from, input) {
  return buildMimeMessage({
    attachments: input.attachments,
    body: input.bodyText || "",
    contentType: "text/plain",
    from,
    subject: input.subject || "",
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
  });
}

function buildMimeMessage({ attachments = [], bcc = "", body = "", cc = "", contentType = "text/plain", from, subject = "", to }) {
  const normalizedAttachments = normalizeComposeAttachments(attachments);
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    bcc ? `Bcc: ${bcc}` : null,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
  ].filter((line) => line !== null);

  if (normalizedAttachments.length === 0) {
    return [
      ...headers,
      `Content-Type: ${contentType}; charset=UTF-8`,
      "Content-Transfer-Encoding: 8bit",
      "",
      body,
    ].join("\r\n");
  }

  const boundary = `emailable-${cryptoRandomId()}`;
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: ${contentType}; charset=UTF-8`,
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
    ...normalizedAttachments.flatMap((attachment) => [
      `--${boundary}`,
      `Content-Type: ${attachment.type}; name="${escapeMimeHeader(attachment.filename)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${escapeMimeHeader(attachment.filename)}"`,
      "",
      wrapBase64(attachment.data),
    ]),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function normalizeComposeAttachments(attachments = []) {
  return (Array.isArray(attachments) ? attachments : [])
    .filter((attachment) => attachment?.data && attachment?.filename)
    .map((attachment) => ({
      data: String(attachment.data).replace(/^data:[^;]+;base64,/, ""),
      filename: String(attachment.filename || "Attachment").replace(/["\r\n]/g, "").replace(/[\\/]/g, "_"),
      type: String(attachment.type || "application/octet-stream"),
    }));
}

function escapeMimeHeader(value) {
  return String(value || "").replace(/["\r\n]/g, "");
}

function wrapBase64(value) {
  return String(value || "").replace(/\s+/g, "").replace(/.{1,76}/g, "$&\r\n").trim();
}

function getSmtpAuth(account, accessToken) {
  const user = account.metadata?.imapUsername || account.email;
  if ((account.provider === "yahoo" || account.provider === "microsoft") && accessToken) {
    return { type: "OAuth2", user, accessToken };
  }
  return { user, pass: decryptToken(account.access_token) };
}

function inferSmtpHost(account, metadata) {
  if (account.provider === "yahoo") return "smtp.mail.yahoo.com";
  if (account.provider === "microsoft") return "smtp-mail.outlook.com";
  const imapHost = String(metadata.imapHost || "");
  if (imapHost.startsWith("imap.")) {
    return imapHost.replace(/^imap\./, "smtp.");
  }
  return imapHost || "localhost";
}

function buildImapSearchQuery(query) {
  const trimmed = String(query ?? "").trim();
  if (!trimmed) {
    return { all: true };
  }

  return { or: [{ subject: trimmed }, { from: trimmed }, { to: trimmed }] };
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
    isRead: hasImapFlag(message.flags, "\\Seen"),
    labels: [mailbox],
    hasAttachments: collectImapAttachments(message.bodyStructure).length > 0,
  };
}

function hasImapFlag(flags, expectedFlag) {
  if (!flags) {
    return false;
  }

  const normalizedExpected = String(expectedFlag).toLowerCase();
  return [...flags].some((flag) => String(flag).toLowerCase() === normalizedExpected);
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

async function parseRawEmail(raw) {
  if (!raw) {
    return { attachments: [], html: "", text: "" };
  }

  try {
    const parsed = await simpleParser(raw);
    const text = String(parsed.text || parsed.textAsHtml?.replace(/<[^>]+>/g, " ") || "")
      .replace(/\s+\n/g, "\n")
      .trim()
      .slice(0, 5000);
    return {
      attachments: (parsed.attachments ?? []).map((attachment, index) => ({
        attachmentId: String(index),
        contentId: normalizeContentId(attachment.cid || attachment.contentId || ""),
        filename: attachment.filename || "Attachment",
        type: attachment.contentType || "application/octet-stream",
        size: attachment.size ?? null,
        downloadSupported: true,
      })),
      html: typeof parsed.html === "string" ? parsed.html : "",
      text,
    };
  } catch {
    return { attachments: [], html: "", text: extractTextFromRawMessage(raw) };
  }
}

function rewriteImapInlineImageSources(html, accountId, emailId, mailbox, attachments = []) {
  if (!html || !attachments.length) {
    return html;
  }
  const attachmentByCid = new Map(
    attachments
      .filter((attachment) => attachment.contentId && attachment.attachmentId)
      .map((attachment) => [String(attachment.contentId).toLowerCase(), attachment]),
  );
  if (attachmentByCid.size === 0) {
    return html;
  }

  return String(html).replace(/cid:([^"')\s>]+)/gi, (match, rawContentId) => {
    const contentId = normalizeContentId(decodeURIComponentSafe(rawContentId)).toLowerCase();
    const attachment = attachmentByCid.get(contentId);
    if (!attachment) {
      return match;
    }
    const params = new URLSearchParams({
      accountId,
      attachmentId: attachment.attachmentId,
      emailId,
      filename: attachment.filename || "inline-image",
      inline: "true",
      mailbox,
      type: attachment.type || "application/octet-stream",
    });
    return `/api/inbox/attachment?${params.toString()}`;
  });
}

function normalizeContentId(value) {
  return String(value || "").trim().replace(/^<|>$/g, "");
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
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
