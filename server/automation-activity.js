import crypto from "node:crypto";
import { dbPool } from "./db.js";
import { requireSession } from "./session.js";
import { emitWebhookEventDetached } from "./webhooks.js";
import { logSystemEvent } from "./system-logs.js";
import { parseActivityCallbackPayload, WEBHOOK_SCHEMA_VERSION } from "../shared/webhook-contracts.js";

export const READY_FOR_PROCESSING_EVENT = "email.ready_for_processing";
export const AUTOMATION_SCHEMA_VERSION = WEBHOOK_SCHEMA_VERSION;
const DAILY_LIMIT = numberFromEnv("ACTIVITY_CALLBACK_DAILY_LIMIT", 500);
const RATE_PER_SECOND = numberFromEnv("ACTIVITY_CALLBACK_RATE_PER_SECOND", 5);
const BURST_LIMIT = numberFromEnv("ACTIVITY_CALLBACK_BURST_LIMIT", 10);
const MAX_CALLBACK_BYTES = numberFromEnv("ACTIVITY_CALLBACK_MAX_BYTES", 64 * 1024);
const EVENT_RETENTION_DAYS = numberFromEnv("POST_PROCESSING_EVENT_RETENTION_DAYS", 14);
const EVENT_BODY_MAX_LENGTH = numberFromEnv("POST_PROCESSING_EVENT_BODY_MAX_LENGTH", 12_000);
const EVENT_FEED_MAX_LIMIT = 100;
const EVENT_FEED_DEFAULT_LIMIT = 50;
let lastRetentionCleanupAt = 0;

export async function ensureAutomationActivityTables() {
  if (!dbPool) return;
  await dbPool.query(`
    alter table user_settings add column if not exists activity_callback_enabled boolean not null default true;
    alter table user_settings add column if not exists activity_callback_secret_salt text;
    alter table user_settings add column if not exists activity_callback_secret_hash text;
    alter table user_settings add column if not exists activity_callback_secret_prefix text;
    alter table user_settings add column if not exists activity_callback_rotated_at timestamptz;

    create table if not exists post_processing_events (
      id uuid primary key,
      user_id text not null references "user"(id) on delete cascade,
      event_id text not null unique,
      email_index_id uuid references email_index(id) on delete cascade,
      email_account_id uuid not null references email_accounts(id) on delete cascade,
      email_id text not null,
      payload jsonb not null,
      delivery_status text not null default 'queued',
      created_at timestamptz not null default now(),
      delivered_at timestamptz
    );
    create index if not exists post_processing_events_owner_idx on post_processing_events(user_id, email_id, created_at desc);
    create index if not exists post_processing_events_feed_idx on post_processing_events(user_id, created_at, id);
    alter table post_processing_events alter column payload drop not null;

    create table if not exists email_automation_activities (
      id uuid primary key,
      user_id text not null references "user"(id) on delete cascade,
      event_id text not null references post_processing_events(event_id) on delete cascade,
      email_index_id uuid references email_index(id) on delete cascade,
      email_account_id uuid not null references email_accounts(id) on delete cascade,
      email_id text not null,
      activity_id text not null,
      source text not null,
      status text not null,
      title text not null,
      description text not null default '',
      details jsonb not null default '{}'::jsonb,
      error jsonb,
      reported_at timestamptz not null,
      received_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(user_id, event_id, activity_id)
    );
    alter table email_automation_activities add column if not exists reported_at timestamptz;
    alter table email_automation_activities add column if not exists received_at timestamptz;
    do $$
    begin
      if exists (select 1 from information_schema.columns where table_name='email_automation_activities' and column_name='reported_ended_at') then
        update email_automation_activities
          set reported_at = coalesce(reported_at, reported_ended_at, created_at),
              received_at = coalesce(received_at, terminal_received_at, created_at)
          where status in ('completed', 'failed');
      end if;
    end $$;
    delete from email_automation_activities where status not in ('completed', 'failed');
    alter table email_automation_activities alter column reported_at set not null;
    alter table email_automation_activities alter column received_at set not null;
    alter table email_automation_activities drop column if exists reported_started_at;
    alter table email_automation_activities drop column if exists reported_ended_at;
    alter table email_automation_activities drop column if exists started_received_at;
    alter table email_automation_activities drop column if exists terminal_received_at;
    alter table email_automation_activities drop column if exists result_url;
    alter table email_automation_activities drop constraint if exists email_automation_activities_status_check;
    alter table email_automation_activities add constraint email_automation_activities_status_check check (status in ('completed', 'failed'));
    create index if not exists email_automation_activities_email_idx on email_automation_activities(user_id, email_index_id, updated_at desc);

    create table if not exists activity_callback_usage (
      user_id text not null references "user"(id) on delete cascade,
      usage_date date not null,
      callback_count integer not null default 0,
      primary key(user_id, usage_date)
    );
    create table if not exists activity_callback_rate_limits (
      user_id text primary key references "user"(id) on delete cascade,
      tokens numeric not null,
      updated_at timestamptz not null default now()
    );
  `);
}

export function registerAutomationActivityRoutes(app) {
  app.get("/api/settings/activity-callback", requireSession, async (req, res) => {
    try { res.json(await getActivityCallbackSettings(req.user.id, req)); }
    catch (error) { sendError(res, error); }
  });
  app.put("/api/settings/activity-callback", requireSession, async (req, res) => {
    try {
      const enabled = req.body?.enabled;
      if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be a boolean" });
      await ensureCallbackCredential(req.user.id);
      await dbPool.query("update user_settings set activity_callback_enabled=$2, updated_at=now() where user_id=$1", [req.user.id, enabled]);
      res.json(await getActivityCallbackSettings(req.user.id, req));
    } catch (error) { sendError(res, error); }
  });
  app.post("/api/settings/activity-callback/rotate", requireSession, async (req, res) => {
    try {
      await rotateCallbackCredential(req.user.id);
      await logSystemEvent(req.user.id, { category: "webhook", eventName: "activity_callback.secret_rotated", status: "success", message: "Activity callback URL rotated." });
      res.json(await getActivityCallbackSettings(req.user.id, req));
    } catch (error) { sendError(res, error); }
  });
  app.get("/api/automation-activities", requireSession, async (req, res) => {
    try {
      const accountId = stringValue(req.query.accountId, 200);
      const emailId = stringValue(req.query.emailId, 500);
      if (!accountId || !emailId) return res.status(400).json({ error: "accountId and emailId are required" });
      if (!isUuid(accountId)) return res.status(400).json({ error: "accountId must be a valid identifier" });
      res.json({ activities: await listAutomationActivities(req.user.id, { accountId, emailId }) });
    } catch (error) { sendError(res, error); }
  });
  app.post("/api/v1/activity-callbacks/:secret", async (req, res) => {
    const secret = String(req.params.secret || "");
    let owner = null;
    try {
      if (Buffer.byteLength(JSON.stringify(req.body ?? {})) > MAX_CALLBACK_BYTES) return res.status(413).json({ error: "Callback payload is too large" });
      owner = await resolveCallbackOwner(secret);
      if (!owner?.enabled) return res.status(404).json({ error: "Callback endpoint not found" });
      const input = parseActivityCallback(req.body);
      if (!input.ok) {
        await logSystemEvent(owner.userId, {
          category: "webhook",
          eventName: "activity_callback.rejected",
          status: "error",
          message: input.error,
          payload: { eventId: stringValue(req.body?.event_id, 200), activityId: stringValue(req.body?.activity_id, 200) },
        });
        return res.status(400).json({ error: input.error });
      }
      const outcome = await ingestActivityCallback(owner.userId, input.value);
      res.status(outcome.duplicate ? 200 : 201).json(outcome);
    } catch (error) {
      if (owner?.userId) void logSystemEvent(owner.userId, { category: "webhook", eventName: "activity_callback.rejected", status: "error", message: error.message, payload: { status: error.status || 500 } });
      sendError(res, error);
    }
  });
}

export async function emitReadyForProcessingEvent(userId, { target, labelsApplied = [] }) {
  if (!dbPool) return null;
  await maybePruneExpiredPostProcessingEvents();
  const callback = await ensureCallbackCredential(userId);
  const normalizedLabels = normalizeLabels(labelsApplied);
  const [indexResult, labelResult] = await Promise.all([
    dbPool.query(`select id, metadata from email_index where user_id=$1 and email_account_id=$2 and email_id=$3 order by updated_at desc limit 1`, [userId, target.account.id, target.email.emailId]),
    dbPool.query(`select id,name,description from labels where user_id=$1 and name=any($2::text[]) order by name`, [userId, normalizedLabels]),
  ]);
  const indexRow = indexResult.rows[0] ?? null;
  const eventId = crypto.randomUUID();
  const payload = {
    email: {
      id: target.email.emailId,
      thread_id: target.email.threadId || target.email.emailId,
      account_id: target.account.id,
      account_email: target.account.email,
      provider: target.account.provider,
      from: { email: target.email.fromEmail || "", name: target.email.fromName || "" },
      to: target.email.to || target.account.email,
      cc: target.email.cc || "",
      bcc: target.email.bcc || "",
      subject: target.email.subject || "",
      received_at: target.email.receivedAt || null,
      body: { text: target.email.bodyText || "", html: target.email.bodyHtml || "" },
      headers: target.email.headers || {},
      attachments: (target.email.attachments || []).map((item) => ({ filename: item.filename || "", content_type: item.type || item.contentType || "application/octet-stream", size: item.size ?? null, available: item.available === true, ...(item.available === true && item.contentBase64 ? { content_base64: item.contentBase64 } : { unavailable_reason: item.unavailableReason || "Attachment content was not available during processing." }) })),
    },
    classification: {
      labels: labelResult.rows.map((label) => ({ id: label.id, name: label.name, description: label.description })),
      attention: indexRow?.metadata?.attentionClassification ?? null,
    },
    activity_callback: { url: callback.callbackUrl, schema_version: AUTOMATION_SCHEMA_VERSION },
  };
  const persistedPayload = {
    ...payload,
    activity_callback: { ...payload.activity_callback, url: "[redacted]" },
    email: {
      ...payload.email,
      attachments: payload.email.attachments.map(({ content_base64: _content, ...attachment }) => attachment),
    },
  };
  await dbPool.query(`insert into post_processing_events(id,user_id,event_id,email_index_id,email_account_id,email_id,payload) values($1,$2,$3,$4,$5,$6,$7::jsonb)`, [crypto.randomUUID(), userId, eventId, indexRow?.id ?? null, target.account.id, target.email.emailId, JSON.stringify(persistedPayload)]);
  await logSystemEvent(userId, { category: "webhook", eventName: "post_processing.event_emitted", status: "success", message: "Email is ready for external post-processing.", payload: { eventId, emailId: target.email.emailId } });
  emitWebhookEventDetached(userId, READY_FOR_PROCESSING_EVENT, payload, {
    eventId,
    schemaVersion: AUTOMATION_SCHEMA_VERSION,
    onDelivery: async ({ status }) => {
      await dbPool.query(`update post_processing_events set delivery_status=$2, delivered_at=case when $2='delivered' then now() else delivered_at end where event_id=$1`, [eventId, status]);
      if (status === "delivered" || status === "failed") {
        await logSystemEvent(userId, {
          category: "webhook",
          eventName: status === "delivered" ? "post_processing.delivery_succeeded" : "post_processing.delivery_failed",
          status: status === "delivered" ? "success" : "error",
          message: status === "delivered" ? "Post-processing event delivered." : "Post-processing event delivery failed.",
          payload: { eventId, emailId: target.email.emailId },
        });
      }
    },
  });
  return eventId;
}

export async function listAutomationActivities(userId, { accountId, emailId }) {
  if (!dbPool) return [];
  const result = await dbPool.query(`select id, event_id as "eventId", activity_id as "activityId", source, status, title, description, details as data, error, reported_at as "reportedAt", received_at as "receivedAt", created_at as "createdAt", updated_at as "updatedAt" from email_automation_activities where user_id=$1 and email_account_id=$2 and email_id=$3 order by received_at desc`, [userId, accountId, emailId]);
  return result.rows.map((row) => ({ ...row, reportedByExternalSystem: true }));
}

export async function listIntegrationEvents(userId, options = {}) {
  await maybePruneExpiredPostProcessingEvents();
  const eventName = options.eventName || READY_FOR_PROCESSING_EVENT;
  if (eventName !== READY_FOR_PROCESSING_EVENT) throw httpError(400, `Unsupported event_name: ${eventName}`);
  const limit = parseEventLimit(options.limit);
  const includeBody = options.includeBody === true;
  const cutoff = new Date(Date.now() - EVENT_RETENTION_DAYS * 86_400_000);

  if (options.cursor === "latest") {
    const latest = await dbPool.query(
      `select id,created_at from post_processing_events where user_id=$1 and payload is not null and created_at >= $2 order by created_at desc,id desc limit 1`,
      [userId, cutoff],
    );
    const row = latest.rows[0];
    return { events: [], next_cursor: row ? encodeEventCursor(userId, row) : null, has_more: false, cursor_expired: false, retention_days: EVENT_RETENTION_DAYS };
  }

  const position = options.cursor ? decodeEventCursor(userId, options.cursor) : null;
  const oldestResult = await dbPool.query(
    `select id,created_at from post_processing_events where user_id=$1 and payload is not null and created_at >= $2 order by created_at,id limit 1`,
    [userId, cutoff],
  );
  const oldest = oldestResult.rows[0] ?? null;
  const cursorExpired = Boolean(position && oldest && new Date(position.createdAt) < new Date(oldest.created_at));
  const effectivePosition = cursorExpired ? null : position;
  const values = [userId, cutoff];
  let positionSql = "";
  if (effectivePosition) {
    values.push(effectivePosition.createdAt, effectivePosition.id);
    positionSql = `and (created_at,id) > ($3::timestamptz,$4::uuid)`;
  }
  values.push(limit + 1);
  const result = await dbPool.query(
    `select id,event_id,created_at,payload from post_processing_events where user_id=$1 and payload is not null and created_at >= $2 ${positionSql} order by created_at,id limit $${values.length}`,
    values,
  );
  const hasMore = result.rows.length > limit;
  const rows = result.rows.slice(0, limit);
  const events = rows.map((row) => ({
    event_id: row.event_id,
    event_name: READY_FOR_PROCESSING_EVENT,
    created_at: new Date(row.created_at).toISOString(),
    payload: buildEventFeedPayload(row.payload, includeBody),
  }));
  const last = rows.at(-1);
  return {
    events,
    next_cursor: last ? encodeEventCursor(userId, last) : options.cursor && options.cursor !== "latest" ? options.cursor : null,
    has_more: hasMore,
    cursor_expired: cursorExpired,
    retention_days: EVENT_RETENTION_DAYS,
  };
}

export async function maybePruneExpiredPostProcessingEvents({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastRetentionCleanupAt < 3_600_000) return;
  const cutoff = new Date(now - EVENT_RETENTION_DAYS * 86_400_000);
  await dbPool.query(`delete from post_processing_events event where event.created_at < $1 and not exists (select 1 from email_automation_activities activity where activity.event_id=event.event_id)`, [cutoff]);
  await dbPool.query(`update post_processing_events set payload=null where created_at < $1 and payload is not null`, [cutoff]);
  lastRetentionCleanupAt = now;
}

export function buildEventFeedPayload(payload, includeBody) {
  const email = payload?.email && typeof payload.email === "object" ? payload.email : {};
  const bodyText = typeof email.body?.text === "string" ? email.body.text.slice(0, EVENT_BODY_MAX_LENGTH) : "";
  return {
    email: {
      id: email.id || "",
      thread_id: email.thread_id || email.id || "",
      account_id: email.account_id || "",
      account_email: email.account_email || "",
      provider: email.provider || "",
      from: email.from || { email: "", name: "" },
      subject: email.subject || "",
      received_at: email.received_at || null,
      attachments: (Array.isArray(email.attachments) ? email.attachments : []).map(({ content_base64: _content, ...attachment }) => attachment),
      ...(includeBody ? { body: { text: bodyText } } : {}),
    },
    classification: payload?.classification || { labels: [], attention: null },
  };
}

function parseEventLimit(value) {
  if (value === undefined || value === null || value === "") return EVENT_FEED_DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > EVENT_FEED_MAX_LIMIT) throw httpError(400, `limit must be an integer between 1 and ${EVENT_FEED_MAX_LIMIT}`);
  return parsed;
}

function encodeEventCursor(userId, row) {
  const payload = Buffer.from(JSON.stringify({ createdAt: new Date(row.created_at).toISOString(), id: row.id })).toString("base64url");
  const signature = crypto.createHmac("sha256", eventCursorSecret()).update(`${userId}:${payload}`).digest("base64url");
  return `${payload}.${signature}`;
}

function decodeEventCursor(userId, cursor) {
  const [payload, signature, extra] = String(cursor).split(".");
  if (!payload || !signature || extra) throw httpError(400, "cursor is invalid");
  const expected = crypto.createHmac("sha256", eventCursorSecret()).update(`${userId}:${payload}`).digest("base64url");
  if (!timingSafe(signature, expected)) throw httpError(400, "cursor is invalid");
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!isUuid(decoded.id) || Number.isNaN(Date.parse(decoded.createdAt))) throw new Error("invalid cursor payload");
    return decoded;
  } catch {
    throw httpError(400, "cursor is invalid");
  }
}

function eventCursorSecret() { return process.env.EVENT_CURSOR_SECRET || process.env.BETTER_AUTH_SECRET || "local-development-only-event-cursor-key"; }

export async function ingestActivityCallback(userId, input) {
  const client = await dbPool.connect();
  try {
    await client.query("begin");
    const settingsResult = await client.query(`select activity_callback_enabled as enabled from user_settings where user_id=$1`, [userId]);
    if (settingsResult.rows[0]?.enabled === false) throw httpError(403, "Activity callbacks are disabled");
    const eventResult = await client.query(`select event_id, email_index_id, email_account_id, email_id from post_processing_events where user_id=$1 and event_id=$2 for update`, [userId, input.eventId]);
    const event = eventResult.rows[0];
    if (!event) throw httpError(404, "Event was not found for this callback owner");
    const existingResult = await client.query(`select * from email_automation_activities where user_id=$1 and event_id=$2 and activity_id=$3 for update`, [userId, input.eventId, input.activityId]);
    const existing = existingResult.rows[0];
    if (existing && isExactDuplicate(existing, input)) { await client.query("rollback"); return { ok: true, duplicate: true, activityId: input.activityId }; }
    if (existing) throw httpError(409, "A different outcome is already recorded for this activity");
    await consumeRateLimit(client, userId);
    const now = new Date();
    await client.query(`
      insert into email_automation_activities(id,user_id,event_id,email_index_id,email_account_id,email_id,activity_id,source,status,title,description,details,error,reported_at,received_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15)
    `, [crypto.randomUUID(), userId, input.eventId, event.email_index_id, event.email_account_id, event.email_id, input.activityId, input.source, input.status, input.title, input.description, JSON.stringify(input.data), input.error ? JSON.stringify(input.error) : null, input.timestamp, now]);
    await client.query(`insert into activity_callback_usage(user_id,usage_date,callback_count) values($1,(now() at time zone 'UTC')::date,1) on conflict(user_id,usage_date) do update set callback_count=activity_callback_usage.callback_count+1`, [userId]);
    await client.query("commit");
    const eventName = `activity_callback.${input.status}`;
    await logSystemEvent(userId, { category: "webhook", eventName, status: input.status === "failed" ? "error" : "success", message: `${input.source} reported ${input.status}.`, payload: { eventId: input.eventId, activityId: input.activityId } });
    return { ok: true, duplicate: false, activityId: input.activityId, status: input.status };
  } catch (error) { await client.query("rollback").catch(() => {}); throw error; }
  finally { client.release(); }
}

async function consumeRateLimit(client, userId) {
  await client.query(`insert into activity_callback_usage(user_id,usage_date,callback_count) values($1,(now() at time zone 'UTC')::date,0) on conflict(user_id,usage_date) do nothing`, [userId]);
  const daily = await client.query(`select callback_count from activity_callback_usage where user_id=$1 and usage_date=(now() at time zone 'UTC')::date for update`, [userId]);
  if (Number(daily.rows[0]?.callback_count || 0) >= DAILY_LIMIT) throw httpError(429, "Daily callback limit reached");
  await client.query(`insert into activity_callback_rate_limits(user_id,tokens) values($1,$2) on conflict(user_id) do nothing`, [userId, BURST_LIMIT]);
  const rate = await client.query(`select tokens,updated_at from activity_callback_rate_limits where user_id=$1 for update`, [userId]);
  const elapsed = Math.max(0, (Date.now() - new Date(rate.rows[0].updated_at).getTime()) / 1000);
  const tokens = Math.min(BURST_LIMIT, Number(rate.rows[0].tokens) + elapsed * RATE_PER_SECOND);
  if (tokens < 1) throw httpError(429, "Callback rate limit reached");
  await client.query(`update activity_callback_rate_limits set tokens=$2,updated_at=now() where user_id=$1`, [userId, tokens - 1]);
}

export function parseActivityCallback(body) {
  if (Buffer.byteLength(JSON.stringify(body ?? {})) > MAX_CALLBACK_BYTES) {
    return { ok: false, error: "Callback payload is too large" };
  }
  return parseActivityCallbackPayload(body);
}

async function getActivityCallbackSettings(userId, req) {
  const credential = await ensureCallbackCredential(userId, req);
  const usage = await dbPool.query(`select callback_count from activity_callback_usage where user_id=$1 and usage_date=(now() at time zone 'UTC')::date`, [userId]);
  const callbackUrl = new URL(credential.callbackUrl);
  const secret = callbackUrl.pathname.split("/").pop() || "";
  const maskedCallbackUrl = `${callbackUrl.origin}${callbackUrl.pathname.slice(0, -secret.length)}${secret.slice(0, 8)}••••••••••••`;
  return { enabled: credential.enabled, callbackUrl: credential.callbackUrl, maskedCallbackUrl, usage: Number(usage.rows[0]?.callback_count || 0), dailyLimit: DAILY_LIMIT, ratePerSecond: RATE_PER_SECOND, burstLimit: BURST_LIMIT, resetsAt: nextUtcMidnight() };
}

async function ensureCallbackCredential(userId, req) {
  await dbPool.query(`insert into user_settings(user_id) values($1) on conflict(user_id) do nothing`, [userId]);
  let result = await dbPool.query(`select activity_callback_enabled as enabled,activity_callback_secret_salt as salt,activity_callback_secret_hash as hash from user_settings where user_id=$1`, [userId]);
  if (!result.rows[0]?.salt) { await rotateCallbackCredential(userId); result = await dbPool.query(`select activity_callback_enabled as enabled,activity_callback_secret_salt as salt,activity_callback_secret_hash as hash from user_settings where user_id=$1`, [userId]); }
  const secret = deriveSecret(userId, result.rows[0].salt);
  return { enabled: result.rows[0].enabled, callbackUrl: `${resolveBaseUrl(req)}/api/v1/activity-callbacks/${secret}` };
}

async function rotateCallbackCredential(userId) {
  const salt = crypto.randomBytes(32).toString("base64url"), secret = deriveSecret(userId, salt), hash = hashSecret(secret);
  await dbPool.query(`insert into user_settings(user_id,activity_callback_secret_salt,activity_callback_secret_hash,activity_callback_secret_prefix,activity_callback_enabled,activity_callback_rotated_at) values($1,$2,$3,$4,true,now()) on conflict(user_id) do update set activity_callback_secret_salt=$2,activity_callback_secret_hash=$3,activity_callback_secret_prefix=$4,activity_callback_enabled=true,activity_callback_rotated_at=now(),updated_at=now()`, [userId, salt, hash, secret.slice(0, 8)]);
}

async function resolveCallbackOwner(secret) {
  if (!secret || secret.length > 200) return null;
  const result = await dbPool.query(`select user_id as "userId",activity_callback_enabled as enabled,activity_callback_secret_hash as hash from user_settings where activity_callback_secret_hash=$1 limit 1`, [hashSecret(secret)]);
  const row = result.rows[0];
  return row && timingSafe(row.hash, hashSecret(secret)) ? row : null;
}

function deriveSecret(userId, salt) { return crypto.createHmac("sha256", process.env.ACTIVITY_CALLBACK_SECRET_KEY || process.env.BETTER_AUTH_SECRET || "local-development-only-callback-key").update(`${userId}:${salt}`).digest("base64url"); }
function hashSecret(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function timingSafe(a, b) { const left=Buffer.from(String(a)), right=Buffer.from(String(b)); return left.length===right.length && crypto.timingSafeEqual(left,right); }
function resolveBaseUrl(req) { const configured = process.env.APP_URL || process.env.BETTER_AUTH_URL; if (configured) return configured.replace(/\/$/, ""); return req ? `${req.protocol}://${req.get("host")}` : `http://localhost:${process.env.PORT || 3000}`; }
function normalizeLabels(values) { return (Array.isArray(values) ? values : []).map((item) => typeof item === "string" ? item : item?.labelName || item?.name).filter(Boolean); }
function numberFromEnv(name, fallback) { const value=Number(process.env[name]); return Number.isFinite(value)&&value>0?value:fallback; }
function stringValue(value, max) { return typeof value === "string" ? value.trim().slice(0,max) : ""; }
function isExactDuplicate(row, input) { return Boolean(row.reported_at) && new Date(row.reported_at).getTime()===input.timestamp.getTime() && row.status===input.status && row.source===input.source && row.title===input.title && row.description===input.description && canonicalJson(row.details||{})===canonicalJson(input.data||{}) && canonicalJson(row.error||null)===canonicalJson(input.error||null); }
function canonicalJson(value) { if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function httpError(status, message) { const error=new Error(message); error.status=status; return error; }
function sendError(res,error) { const status=Number(error.status)||500; if(status>=500) console.error("Automation activity error:",error); res.status(status).json({error:status>=500?"Automation activity request failed":error.message}); }
function nextUtcMidnight() { const date=new Date(); date.setUTCHours(24,0,0,0); return date.toISOString(); }
function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
