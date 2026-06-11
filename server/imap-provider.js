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

    for (const folder of addFolders) {
      await ensureImapMailbox(client, folder);
      await client.mailboxOpen(found.mailbox);
      await client.messageCopy([found.uid], folder, { uid: true });
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
