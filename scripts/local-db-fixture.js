import crypto from "node:crypto";
import { dbPool, databaseUrl } from "../server/db.js";
import { ensureEmailAccountsTable } from "../server/email-accounts.js";
import { ensureEmailIndexTable } from "../server/email-index.js";
import { ensureLabelsTable } from "../server/labels.js";
import { ensureSettingsTable } from "../server/settings.js";

export const LOCAL_SEED_USER_ID = "local-development-seed-user";
export const LOCAL_SEED_USER_EMAIL = "local-user@seed.emailable.local";

const LABEL_FIXTURES = [
  ["Action Required", 27, "Requires a response, decision, approval, or other action."],
  ["Appointments and Events", 25, "Appointments, meetings, reminders, and scheduled events."],
  ["Finance", 40, "Banking, billing, invoices, payments, and other financial mail."],
  ["General", 379, "Newsletters, promotions, social notifications, and routine automated mail."],
  ["Reference", 25, "Receipts, confirmations, documentation, and useful reference material."],
  ["Security", 10, "Security alerts, login notifications, OTPs, and recovery messages."],
  ["Serious", 0, "Important correspondence worth careful review."],
  ["Unemailable", 0, "Messages that could not be categorized safely."],
];

const GENERAL_SENDERS = ["LinkedIn", "Netflix", "Asana", "Zillow", "Kincmo", "Community Digest", "Product Weekly"];
const GENERAL_SUBJECTS = [
  "Your weekly activity summary",
  "New recommendations selected for you",
  "This weekend's subscriber offer",
  "People viewed your profile",
  "Product news and feature updates",
  "Your saved search has new results",
  "Community highlights from this week",
  "Membership renewal reminder",
];

export async function resetLocalDatabaseFixture() {
  assertSafeLocalDatabase();
  if (!dbPool) throw new Error("DATABASE_URL is required to seed the local database.");

  await ensureEmailAccountsTable();
  await ensureLabelsTable();
  await ensureEmailIndexTable();
  await ensureSettingsTable();

  const client = await dbPool.connect();
  try {
    await client.query("begin");
    await client.query(`delete from "user" where id = $1 or lower(email) = lower($2)`, [LOCAL_SEED_USER_ID, LOCAL_SEED_USER_EMAIL]);
    await client.query(
      `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ($1, 'Local Development User', $2, true, now(), now())`,
      [LOCAL_SEED_USER_ID, LOCAL_SEED_USER_EMAIL],
    );

    const accounts = Array.from({ length: 6 }, (_, index) => ({
      id: stableUuid(`account-${index + 1}`),
      email: `account${index + 1}@seed.emailable.local`,
      displayName: `Seed Account ${index + 1}`,
    }));
    for (const account of accounts) {
      await client.query(
        `insert into email_accounts (id, user_id, provider, provider_account_id, email, display_name, source, scopes, metadata) values ($1, $2, 'gmail', $3, $4, $5, 'connected', '{}', $6::jsonb)`,
        [account.id, LOCAL_SEED_USER_ID, account.email, account.email, account.displayName, JSON.stringify({ fixture: true })],
      );
    }

    const labels = LABEL_FIXTURES.map(([name, count, description]) => ({ id: stableUuid(`label-${name}`), name, count, description }));
    for (const label of labels) {
      await client.query(`insert into labels (id, user_id, name, description) values ($1, $2, $3, $4)`, [label.id, LOCAL_SEED_USER_ID, label.name, label.description]);
    }

    const messages = buildEmailFixtures(accounts, labels);
    await client.query(
      `
        insert into email_index (
          id, user_id, email_account_id, account_email, provider, email_id, thread_id, mailbox,
          direction, from_email, from_name, to_emails, subject, snippet, labels, received_at,
          is_read, has_attachments, archived, metadata
        )
        select fixture.id::uuid, $2, fixture.email_account_id::uuid, fixture.account_email, 'gmail',
          fixture.email_id, fixture.thread_id, 'INBOX', 'inbox', fixture.from_email, fixture.from_name,
          fixture.account_email, fixture.subject, fixture.snippet, array[fixture.label_name],
          fixture.received_at::timestamptz, fixture.is_read, fixture.has_attachments, false,
          '{"fixture":true}'::jsonb
        from jsonb_to_recordset($1::jsonb) as fixture(
          id text, email_account_id text, account_email text, email_id text, thread_id text,
          from_email text, from_name text, subject text, snippet text, label_name text,
          received_at text, is_read boolean, has_attachments boolean
        )
      `,
      [JSON.stringify(messages), LOCAL_SEED_USER_ID],
    );
    await client.query(`insert into user_settings (user_id, confidence_threshold) values ($1, 0.90)`, [LOCAL_SEED_USER_ID]);
    await client.query("commit");
    return {
      accounts: accounts.length,
      emails: messages.length,
      labels: Object.fromEntries(labels.map((label) => [label.name, label.count])),
      userEmail: LOCAL_SEED_USER_EMAIL,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function buildEmailFixtures(accounts, labels) {
  const messages = [];
  let sequence = 0;
  for (const label of labels) {
    for (let index = 0; index < label.count; index += 1) {
      sequence += 1;
      const account = accounts[index % accounts.length];
      const content = buildMessageContent(label.name, index);
      messages.push({
        id: stableUuid(`email-${sequence}`), email_account_id: account.id, account_email: account.email,
        email_id: `seed-message-${sequence}`, thread_id: `seed-thread-${sequence}`,
        from_email: content.fromEmail, from_name: content.fromName, subject: content.subject,
        snippet: content.snippet, label_name: label.name,
        received_at: new Date(Date.UTC(2026, 9, 16, 22, 0) - sequence * 60_000).toISOString(),
        is_read: sequence % 4 !== 0, has_attachments: sequence % 17 === 0,
      });
    }
  }
  return messages;
}

function buildMessageContent(labelName, index) {
  if (labelName === "General") {
    const fromName = GENERAL_SENDERS[index % GENERAL_SENDERS.length];
    return {
      fromName,
      fromEmail: `news${index % GENERAL_SENDERS.length}@seed.emailable.local`,
      subject: `${GENERAL_SUBJECTS[index % GENERAL_SUBJECTS.length]} #${index + 1}`,
      snippet: "Routine informational content for deterministic AI Helper review and bulk-action testing.",
    };
  }
  return {
    fromName: `${labelName} Sender`,
    fromEmail: `${slugify(labelName)}${index % 7}@seed.emailable.local`,
    subject: `${labelName} fixture message #${index + 1}`,
    snippet: `Deterministic ${labelName.toLowerCase()} email used by local regression tests.`,
  };
}

function stableUuid(value) {
  const hex = crypto.createHash("sha256").update(`emailable-local-fixture:${value}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const joined = hex.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function assertSafeLocalDatabase() {
  if (process.env.NODE_ENV === "production") throw new Error("Local database fixtures are disabled when NODE_ENV=production.");
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const hostname = new URL(databaseUrl).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error(`Refusing to modify non-local database host: ${hostname}`);
  }
}
