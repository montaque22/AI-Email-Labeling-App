import crypto from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Exercises `reconcileInterruptedProviderApplies` against a real PostgreSQL server.
 *
 * The sweep is hand-written SQL that runs on every boot and is wrapped in a `try/catch` at its
 * call site, so a statement that throws is invisible: reviewed-but-unapplied rules just sit at
 * "queued" forever. Mocking the pool would re-assert what the author already believed. These
 * tests run the statements, so the database gets the last word.
 *
 * Set `TEST_DATABASE_URL` to point at an existing throwaway database; otherwise a disposable
 * PostgreSQL server is started from the `embedded-postgres` dev dependency and torn down after.
 */

/** Must match `QUEUED_PROVIDER_APPLY_GRACE_MS` in `server/integrations.js`. */
const GRACE_MS = 5 * 60 * 1000;

/**
 * @typedef {object} ProviderApply
 * @property {string} [status]
 * @property {string} [queuedAt]
 * @property {boolean} [ok]
 * @property {string} [error]
 * @property {string} [description]
 * @property {string} [interruptedAt]
 * @property {string[]} [lookupFailures]
 * @property {string} [labelName]
 * @property {string} [providerMessageId]
 */

/**
 * @typedef {object} RuleMetadata
 * @property {ProviderApply | null} [providerApply]
 * @property {string} [accountEmail]
 * @property {string} [reviewedBy]
 */

/**
 * @typedef {object} RuleSeed
 * @property {string} [userId] Owner; defaults to {@link PRIMARY_USER_ID}.
 * @property {string} [subject] Rule subject, surfaced in the system-log payload.
 * @property {ProviderApply | null} [providerApply] Value stored at `metadata.providerApply`.
 * @property {RuleMetadata} [metadata] Sibling metadata keys stored alongside `providerApply`.
 */

/**
 * @typedef {object} SeededRule
 * @property {string} id
 * @property {string} userId
 * @property {string} emailId
 * @property {string} subject
 */

/**
 * @typedef {object} SystemLogRow
 * @property {string} userId
 * @property {string} eventName
 * @property {string} status
 * @property {string} message
 * @property {{ count?: number, description?: string, emails?: Array<{ emailId: string, subject: string }> }} payload
 */

/**
 * @typedef {object} TestDatabase
 * @property {import("pg").Pool} pool
 * @property {() => Promise<void>} stop
 * @property {string} describedAs Human-readable note for the suite title.
 */

const PRIMARY_USER_ID = "user-alpha";
const SECONDARY_USER_ID = "user-beta";

// This suite has to write `DATABASE_URL` before `server/db.js` is first imported. Put it back
// afterwards so a shared-process run cannot hand a later suite a pool pointing at a server that
// no longer exists.
const originalDatabaseUrl = process.env.DATABASE_URL;

/** @type {TestDatabase | null} */
let database = null;
/** @type {string | null} */
let startupFailure = null;
/** @type {typeof import("./integrations.js").reconcileInterruptedProviderApplies | null} */
let reconcileInterruptedProviderApplies = null;

/**
 * Picks a port the kernel just confirmed is free. Embedded PostgreSQL needs a concrete port and
 * the suite must not collide with a developer's own 5432.
 *
 * @returns {Promise<number>}
 */
function reserveFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close(() => reject(new Error("Could not determine a free port")));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Brings up the database the suite will run against and binds `DATABASE_URL` before anything
 * imports `server/db.js` — the pool there is built once, at module load, from that variable.
 *
 * @returns {Promise<TestDatabase>}
 */
async function startDatabase() {
  const external = process.env.TEST_DATABASE_URL;
  if (external) {
    process.env.DATABASE_URL = external;
    const { dbPool } = await import("./db.js");
    if (!dbPool) throw new Error("TEST_DATABASE_URL was set but no pool was created");
    return { pool: dbPool, stop: async () => { await dbPool.end(); }, describedAs: "TEST_DATABASE_URL" };
  }

  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const databaseDir = await fs.mkdtemp(path.join(os.tmpdir(), "emailable-reconcile-pg-"));
  const port = await reserveFreePort();
  const server = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: false,
    // initdb/startup chatter is noise unless the suite fails to come up, and the failure path
    // surfaces the error itself.
    onLog: () => {},
    onError: () => {},
  });

  await server.initialise();
  await server.start();

  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  const { dbPool } = await import("./db.js");
  if (!dbPool) throw new Error("DATABASE_URL was set but no pool was created");

  return {
    pool: dbPool,
    describedAs: "embedded PostgreSQL",
    stop: async () => {
      await dbPool.end();
      await server.stop();
      await fs.rm(databaseDir, { recursive: true, force: true });
    },
  };
}

/**
 * Creates the real schema rather than a hand-rolled stand-in, so the sweep is tested against
 * the column types, defaults and jsonb semantics production actually has. Only the better-auth
 * `user` table is approximated — `email_rules` and `system_logs` only need its `id` to exist.
 *
 * @param {import("pg").Pool} pool
 */
async function createSchema(pool) {
  await pool.query(`
    create table if not exists "user" (
      id text primary key,
      name text not null default '',
      email text not null unique,
      "emailVerified" boolean not null default false,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now()
    )
  `);

  const { ensureIntegrationTables } = await import("./integrations.js");
  const { ensureSystemLogsTable } = await import("./system-logs.js");
  await ensureIntegrationTables();
  await ensureSystemLogsTable();

  for (const userId of [PRIMARY_USER_ID, SECONDARY_USER_ID]) {
    await pool.query(
      `insert into "user" (id, name, email) values ($1, $2, $3) on conflict (id) do nothing`,
      [userId, userId, `${userId}@example.test`],
    );
  }
}

/**
 * An ISO timestamp that is `offsetMs` in the past. Positive offsets are older.
 *
 * @param {number} offsetMs
 * @returns {string}
 */
function isoAgo(offsetMs) {
  return new Date(Date.now() - offsetMs).toISOString();
}

/** A `queuedAt` comfortably outside the grace window, so the row must be swept. */
const beyondGrace = () => isoAgo(GRACE_MS + 60_000);
/** A `queuedAt` comfortably inside the grace window, so the row must be left alone. */
const withinGrace = () => isoAgo(60_000);

/**
 * Inserts one `email_rules` row. Every field the sweep does not care about gets a filler value
 * so individual tests only state what they are actually testing.
 *
 * @param {RuleSeed} [seed]
 * @returns {Promise<SeededRule>}
 */
async function seedRule(seed = {}) {
  if (!database) throw new Error("Database is not running");

  const id = crypto.randomUUID();
  const userId = seed.userId ?? PRIMARY_USER_ID;
  const emailId = `email-${id}`;
  const subject = seed.subject ?? "Quarterly invoice";
  /** @type {RuleMetadata} */
  const metadata = { ...seed.metadata };
  if (seed.providerApply !== undefined) metadata.providerApply = seed.providerApply;

  await database.pool.query(
    `
      insert into email_rules (
        id, user_id, email_id, thread_id, from_email, from_name,
        subject, snippet, confidence, labels_applied, is_pending, metadata
      )
      values ($1, $2, $3, $4, 'billing@example.test', 'Billing', $5, 'snippet', 0.9, '{}', false, $6::jsonb)
    `,
    [id, userId, emailId, `thread-${id}`, subject, JSON.stringify(metadata)],
  );

  return { id, userId, emailId, subject };
}

/**
 * Reads back the full `metadata` object for a seeded rule.
 *
 * @param {SeededRule} rule
 * @returns {Promise<RuleMetadata>}
 */
async function readMetadata(rule) {
  if (!database) throw new Error("Database is not running");
  const result = await database.pool.query(`select metadata from email_rules where id = $1`, [rule.id]);
  return result.rows[0].metadata;
}

/**
 * Reads back the `providerApply` object for a seeded rule.
 *
 * @param {SeededRule} rule
 * @returns {Promise<ProviderApply | null | undefined>}
 */
async function readProviderApply(rule) {
  return (await readMetadata(rule)).providerApply;
}

/**
 * @returns {Promise<SystemLogRow[]>} Interruption events only, oldest first.
 */
async function readInterruptionLogs() {
  if (!database) throw new Error("Database is not running");
  const result = await database.pool.query(`
    select user_id as "userId", event_name as "eventName", status, message, payload
    from system_logs
    where event_name = 'email_rule.provider_apply_interrupted'
    order by created_at asc, user_id asc
  `);
  return result.rows;
}

/**
 * Runs the sweep. Narrowed here so individual tests do not each re-assert that the module
 * loaded.
 *
 * @returns {Promise<number>}
 */
async function runSweep() {
  if (!reconcileInterruptedProviderApplies) throw new Error("Module is not loaded");
  return reconcileInterruptedProviderApplies();
}

try {
  database = await startDatabase();
  await createSchema(database.pool);
  ({ reconcileInterruptedProviderApplies } = await import("./integrations.js"));
} catch (error) {
  startupFailure = error instanceof Error ? error.message : String(error);
  console.error(
    `Skipping reconcileInterruptedProviderApplies tests: no PostgreSQL available (${startupFailure}). ` +
      "Install dev dependencies or set TEST_DATABASE_URL to run them.",
  );
}

describe.skipIf(!database)(`reconcileInterruptedProviderApplies (${database?.describedAs ?? "no database"})`, () => {
  beforeEach(async () => {
    if (!database) return;
    await database.pool.query("truncate email_rules, system_logs");
  });

  afterAll(async () => {
    await database?.stop();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("marks a rule queued longer than the grace window as interrupted", async () => {
    const rule = await seedRule({ providerApply: { status: "queued", queuedAt: beyondGrace() } });

    expect(await runSweep()).toBe(1);

    const providerApply = await readProviderApply(rule);
    expect(providerApply).toMatchObject({
      ok: false,
      status: "interrupted",
      error: "Emailable restarted before the provider label was applied.",
      lookupFailures: [],
    });
    expect(typeof providerApply?.interruptedAt).toBe("string");
    expect(Number.isNaN(Date.parse(providerApply?.interruptedAt ?? ""))).toBe(false);
  });

  it("leaves a rule queued inside the grace window alone", async () => {
    const queuedAt = withinGrace();
    const rule = await seedRule({ providerApply: { status: "queued", queuedAt } });

    expect(await runSweep()).toBe(0);
    expect(await readProviderApply(rule)).toEqual({ status: "queued", queuedAt });
  });

  it("sweeps rules whose queuedAt cannot be read as an instant", async () => {
    // Each of these is a value the grace window cannot be evaluated against. The last two are
    // the regression: they satisfy `^\d{4}-\d{2}-\d{2}T` but are not instants, so the previous
    // `::timestamptz` cast raised and took the entire boot-time sweep down with it.
    const unreadable = [
      { label: "missing", providerApply: /** @type {ProviderApply} */ ({ status: "queued" }) },
      { label: "empty string", providerApply: { status: "queued", queuedAt: "" } },
      { label: "not a date", providerApply: { status: "queued", queuedAt: "not-a-date" } },
      { label: "out of range", providerApply: { status: "queued", queuedAt: "2026-13-45T99:99:99Z" } },
      { label: "date-shaped garbage", providerApply: { status: "queued", queuedAt: "1234-56-78Twhatever" } },
      { label: "impossible calendar day", providerApply: { status: "queued", queuedAt: "2026-02-31T00:00:00Z" } },
    ];
    const rules = [];
    for (const entry of unreadable) {
      rules.push({ label: entry.label, rule: await seedRule({ providerApply: entry.providerApply }) });
    }

    expect(await runSweep()).toBe(unreadable.length);

    for (const { label, rule } of rules) {
      expect(await readProviderApply(rule), label).toMatchObject({ status: "interrupted", ok: false });
    }
  });

  it("ignores rules that are not queued", async () => {
    const untouched = ["applied", "interrupted", "failed", "pending", "", "QUEUED"];
    const rules = [];
    for (const status of untouched) {
      rules.push({ status, rule: await seedRule({ providerApply: { status, queuedAt: beyondGrace() } }) });
    }
    // A rule that was never reviewed has no `providerApply` key at all.
    const neverReviewed = await seedRule({ metadata: { accountEmail: "owner@example.test" } });

    expect(await runSweep()).toBe(0);

    for (const { status, rule } of rules) {
      expect((await readProviderApply(rule))?.status, status).toBe(status);
    }
    expect(await readProviderApply(neverReviewed)).toBeUndefined();
    expect(await readInterruptionLogs()).toHaveLength(0);
  });

  it("merges into providerApply instead of replacing it, and leaves sibling metadata intact", async () => {
    const queuedAt = beyondGrace();
    const rule = await seedRule({
      metadata: { accountEmail: "owner@example.test", reviewedBy: "owner@example.test" },
      providerApply: {
        status: "queued",
        queuedAt,
        labelName: "Receipts",
        providerMessageId: "provider-123",
      },
    });

    expect(await runSweep()).toBe(1);

    const metadata = await readMetadata(rule);
    expect(metadata.accountEmail).toBe("owner@example.test");
    expect(metadata.reviewedBy).toBe("owner@example.test");
    // Keys the sweep does not write survive; keys it does write win.
    expect(metadata.providerApply).toMatchObject({
      labelName: "Receipts",
      providerMessageId: "provider-123",
      queuedAt,
      status: "interrupted",
      ok: false,
    });
  });

  it("returns the number of rows it actually changed", async () => {
    const stale = [];
    for (let index = 0; index < 3; index += 1) {
      stale.push(await seedRule({ subject: `Stale ${index}`, providerApply: { status: "queued", queuedAt: beyondGrace() } }));
    }
    const fresh = await seedRule({ providerApply: { status: "queued", queuedAt: withinGrace() } });
    const settled = await seedRule({ providerApply: { status: "applied", queuedAt: beyondGrace() } });

    expect(await runSweep()).toBe(stale.length);

    const changed = await database?.pool.query(
      `select count(*)::int as count from email_rules where metadata->'providerApply'->>'status' = 'interrupted'`,
    );
    expect(changed?.rows[0].count).toBe(stale.length);
    expect((await readProviderApply(fresh))?.status).toBe("queued");
    expect((await readProviderApply(settled))?.status).toBe("applied");

    // A second pass has nothing left to do, which is what makes the sweep safe to run on
    // every boot.
    expect(await runSweep()).toBe(0);
  });

  it("logs one capped warning per affected user", async () => {
    for (let index = 0; index < 30; index += 1) {
      await seedRule({ subject: `Alpha ${index}`, providerApply: { status: "queued", queuedAt: beyondGrace() } });
    }
    await seedRule({
      userId: SECONDARY_USER_ID,
      subject: "Beta only",
      providerApply: { status: "queued", queuedAt: beyondGrace() },
    });

    expect(await runSweep()).toBe(31);

    const logs = await readInterruptionLogs();
    expect(logs).toHaveLength(2);
    expect(new Set(logs.map((log) => log.userId))).toEqual(new Set([PRIMARY_USER_ID, SECONDARY_USER_ID]));
    expect(logs.every((log) => log.status === "warning")).toBe(true);

    const alpha = logs.find((log) => log.userId === PRIMARY_USER_ID);
    expect(alpha?.payload.count).toBe(30);
    // The count stays truthful while the payload stays bounded.
    expect(alpha?.payload.emails).toHaveLength(25);
    expect(alpha?.payload.emails?.every((entry) => entry.subject.startsWith("Alpha "))).toBe(true);
    expect(alpha?.message).toContain("30 reviewed rules were saved");

    const beta = logs.find((log) => log.userId === SECONDARY_USER_ID);
    expect(beta?.payload.count).toBe(1);
    expect(beta?.payload.emails).toEqual([expect.objectContaining({ subject: "Beta only" })]);
    expect(beta?.message).toContain("1 reviewed rule was saved");
  });
});
