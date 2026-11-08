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
      result_url text,
      reported_started_at timestamptz,
      reported_ended_at timestamptz,
      started_received_at timestamptz,
      terminal_received_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(user_id, event_id, activity_id)
    );
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
      const outcome = await recordActivityCallback(owner.userId, input.value);
      res.status(outcome.duplicate ? 200 : 201).json(outcome);
    } catch (error) {
      if (owner?.userId) void logSystemEvent(owner.userId, { category: "webhook", eventName: "activity_callback.rejected", status: "error", message: error.message, payload: { status: error.status || 500 } });
      sendError(res, error);
    }
  });
}

export async function emitReadyForProcessingEvent(userId, { target, labelsApplied = [] }) {
  if (!dbPool) return null;
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
  const result = await dbPool.query(`select id, event_id as "eventId", activity_id as "activityId", source, status, title, description, details as data, error, reported_started_at as "reportedStartedAt", reported_ended_at as "reportedEndedAt", started_received_at as "startedReceivedAt", terminal_received_at as "terminalReceivedAt", created_at as "createdAt", updated_at as "updatedAt" from email_automation_activities where user_id=$1 and email_account_id=$2 and email_id=$3 order by coalesce(terminal_received_at,started_received_at,created_at) desc`, [userId, accountId, emailId]);
  return result.rows.map((row) => ({ ...row, durationMs: row.reportedStartedAt && row.reportedEndedAt && new Date(row.reportedEndedAt) >= new Date(row.reportedStartedAt) ? new Date(row.reportedEndedAt).getTime() - new Date(row.reportedStartedAt).getTime() : null, reportedByExternalSystem: true }));
}

async function recordActivityCallback(userId, input) {
  const client = await dbPool.connect();
  try {
    await client.query("begin");
    const eventResult = await client.query(`select event_id, email_index_id, email_account_id, email_id from post_processing_events where user_id=$1 and event_id=$2 for update`, [userId, input.eventId]);
    const event = eventResult.rows[0];
    if (!event) throw httpError(404, "Event was not found for this callback owner");
    const existingResult = await client.query(`select * from email_automation_activities where user_id=$1 and event_id=$2 and activity_id=$3 for update`, [userId, input.eventId, input.activityId]);
    const existing = existingResult.rows[0];
    if (existing && isExactDuplicate(existing, input)) { await client.query("rollback"); return { ok: true, duplicate: true, activityId: input.activityId }; }
    if (existing && isTerminal(existing.status) && input.status !== "started") throw httpError(409, "A different terminal result is already recorded for this activity");
    await consumeRateLimit(client, userId);
    const now = new Date();
    const lifecycle = resolveActivityLifecycle(existing, input);
    const nextStatus = lifecycle.status;
    await client.query(`
      insert into email_automation_activities(id,user_id,event_id,email_index_id,email_account_id,email_id,activity_id,source,status,title,description,details,error,result_url,reported_started_at,reported_ended_at,started_received_at,terminal_received_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18)
      on conflict(user_id,event_id,activity_id) do update set
        source=case when $19 then email_automation_activities.source else excluded.source end,
        status=$9, title=case when $19 then email_automation_activities.title else excluded.title end,
        description=case when $19 then email_automation_activities.description else excluded.description end,
        details=case when $19 then email_automation_activities.details else email_automation_activities.details || excluded.details end,
        error=coalesce(excluded.error,email_automation_activities.error), result_url=coalesce(excluded.result_url,email_automation_activities.result_url),
        reported_started_at=coalesce(email_automation_activities.reported_started_at,excluded.reported_started_at), reported_ended_at=coalesce(excluded.reported_ended_at,email_automation_activities.reported_ended_at),
        started_received_at=coalesce(email_automation_activities.started_received_at,excluded.started_received_at), terminal_received_at=coalesce(excluded.terminal_received_at,email_automation_activities.terminal_received_at), updated_at=now()
    `, [crypto.randomUUID(), userId, input.eventId, event.email_index_id, event.email_account_id, event.email_id, input.activityId, input.source, nextStatus, input.title, input.description, JSON.stringify(input.data), input.error ? JSON.stringify(input.error) : null, null, lifecycle.reportedStartedAt, lifecycle.reportedEndedAt, input.status === "started" ? now : null, input.status !== "started" ? now : null, lifecycle.preserveTerminal]);
    await client.query(`insert into activity_callback_usage(user_id,usage_date,callback_count) values($1,(now() at time zone 'UTC')::date,1) on conflict(user_id,usage_date) do update set callback_count=activity_callback_usage.callback_count+1`, [userId]);
    await client.query("commit");
    const eventName = `activity_callback.${input.status}`;
    await logSystemEvent(userId, { category: "webhook", eventName, status: input.status === "failed" ? "error" : "success", message: `${input.source} reported ${input.status}.`, payload: { eventId: input.eventId, activityId: input.activityId } });
    return { ok: true, duplicate: false, activityId: input.activityId, status: nextStatus };
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
  return parseActivityCallbackPayload(body);
}

export function resolveActivityLifecycle(existing, input) {
  const isStarted = input.status === "started";
  return {
    status: isStarted && existing?.status ? existing.status : input.status,
    preserveTerminal: isStarted && isTerminal(existing?.status),
    reportedStartedAt: isStarted ? input.timestamp : null,
    reportedEndedAt: isStarted ? null : input.timestamp,
  };
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
function isTerminal(status) { return status === "completed" || status === "failed"; }
function isExactDuplicate(row, input) { const reportedTimestamp = input.status === "started" ? row.reported_started_at : row.reported_ended_at; if (!reportedTimestamp || new Date(reportedTimestamp).getTime() !== input.timestamp.getTime()) return false; if (input.status === "started" && isTerminal(row.status)) return true; return row.status===input.status && row.source===input.source && row.title===input.title && row.description===input.description && JSON.stringify(row.details||{})===JSON.stringify(input.data||{}) && JSON.stringify(row.error||null)===JSON.stringify(input.error||null); }
function httpError(status, message) { const error=new Error(message); error.status=status; return error; }
function sendError(res,error) { const status=Number(error.status)||500; if(status>=500) console.error("Automation activity error:",error); res.status(status).json({error:status>=500?"Automation activity request failed":error.message}); }
function nextUtcMidnight() { const date=new Date(); date.setUTCHours(24,0,0,0); return date.toISOString(); }
function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
