import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { dbPool } from "./db.js";
import { createTaskQueue } from "./concurrency.js";
import { fetchWithTimeout } from "./http.js";
import { logSystemEvent } from "./system-logs.js";
import { createWebhookEnvelope, WEBHOOK_SCHEMA_VERSION } from "../shared/webhook-contracts.js";

const WEBHOOK_TIMEOUT_MS = 8000;
const HOME_ASSISTANT_BODY_MAX_LENGTH = 12_000;
// Detached deliveries allowed in flight at once. Sequential awaiting used to cap this at
// one socket; without a bound, one bulk action could open fifty at a time and hold them all
// for the full timeout against an unresponsive receiver. Queued events are not dropped,
// they just wait their turn -- and nobody is waiting on them.
const WEBHOOK_DISPATCH_CONCURRENCY = 6;

const dispatchQueue = createTaskQueue({
  limit: WEBHOOK_DISPATCH_CONCURRENCY,
  onError: (error) => {
    // deliverWebhookEvent already records delivery failures itself, so reaching here means the
    // settings lookup or the log write failed. Swallow it: an unhandled rejection would
    // take the process down over a notification nobody is waiting on.
    console.warn("Webhook could not be dispatched:", error.message);
  },
});

/**
 * Queues a webhook delivery without making the caller wait for it.
 *
 * A webhook is a notification, not part of the action that produced it, so a slow or
 * unreachable receiver must never add its 8s timeout to an API response -- in a batch that
 * cost multiplies by the number of items. Delivery still records the same success/error
 * entries under Metrics > Logs > Webhook Events; only the waiting is gone.
 *
 * @param {string} userId
 * @param {string} eventName
 * @param {unknown} payload
 * @returns {void}
 */
export function emitWebhookEventDetached(userId, eventName, payload, options = {}) {
  dispatchQueue.push(() => deliverWebhookEvent(userId, eventName, payload, options));
}

/**
 * Resolves once every queued delivery has settled. Intended for shutdown and for checks
 * that need to observe delivery; request handlers must not await this or they reintroduce
 * the stall it exists to avoid.
 *
 * @returns {Promise<void>}
 */
export async function waitForPendingWebhookDeliveries() {
  await dispatchQueue.drain();
}

export async function ensureHomeAssistantWebhookDestinationsTable() {
  if (!dbPool) return;
  await dbPool.query(`
    create table if not exists home_assistant_webhook_destinations (
      id uuid primary key,
      user_id text not null references "user"(id) on delete cascade,
      config_entry_id text not null,
      webhook_url text not null,
      include_body boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(user_id, config_entry_id)
    );
    create index if not exists home_assistant_webhook_destinations_user_idx
      on home_assistant_webhook_destinations(user_id);
  `);
}

export async function upsertHomeAssistantWebhookDestination(
  userId,
  { configEntryId, webhookUrl, includeBody = false },
) {
  await assertSafeHomeAssistantWebhookUrl(webhookUrl);
  await dbPool.query(
    `insert into home_assistant_webhook_destinations
       (id,user_id,config_entry_id,webhook_url,include_body)
     values($1,$2,$3,$4,$5)
     on conflict(user_id,config_entry_id) do update
       set webhook_url=excluded.webhook_url,
           include_body=excluded.include_body,
           updated_at=now()`,
    [crypto.randomUUID(), userId, configEntryId, webhookUrl, includeBody],
  );
}

export async function removeHomeAssistantWebhookDestination(userId, configEntryId) {
  const result = await dbPool.query(
    `delete from home_assistant_webhook_destinations
     where user_id=$1 and config_entry_id=$2`,
    [userId, configEntryId],
  );
  return result.rowCount > 0;
}

export function emitHomeAssistantWebhookEventDetached(userId, eventName, payload, options = {}) {
  dispatchQueue.push(() => emitHomeAssistantWebhookEvent(userId, eventName, payload, options));
}

async function emitHomeAssistantWebhookEvent(userId, eventName, payload, options = {}) {
  if (!dbPool || eventName !== "email.ready_for_processing") return;
  const result = await dbPool.query(
    `select config_entry_id as "configEntryId",webhook_url as "webhookUrl",include_body as "includeBody"
     from home_assistant_webhook_destinations where user_id=$1`,
    [userId],
  );
  await Promise.all(result.rows.map((destination) => deliverHomeAssistantWebhook(
    userId,
    destination,
    createWebhookEnvelope(
      eventName,
      buildHomeAssistantWebhookPayload(payload, destination.includeBody === true),
      {
        eventId: options.eventId || crypto.randomUUID(),
        schemaVersion: options.schemaVersion || WEBHOOK_SCHEMA_VERSION,
        timestamp: new Date().toISOString(),
      },
    ),
  )));
}

async function deliverHomeAssistantWebhook(userId, destination, event) {
  try {
    await assertSafeHomeAssistantWebhookUrl(destination.webhookUrl);
    const response = await fetchWithTimeout(
      destination.webhookUrl,
      {
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      },
      WEBHOOK_TIMEOUT_MS,
    );
    if (!response.ok) {
      throw new Error(`Home Assistant returned HTTP ${response.status}`);
    }
    await logSystemEvent(userId, {
      category: "webhook",
      eventName: "home_assistant.email.ready_for_processing",
      status: "success",
      message: "Processed-email event delivered to Home Assistant.",
      payload: { eventId: event.event_id, configEntryId: destination.configEntryId },
    });
  } catch (error) {
    await logSystemEvent(userId, {
      category: "webhook",
      eventName: "home_assistant.email.ready_for_processing",
      status: "error",
      message: `Home Assistant webhook delivery failed: ${error.message}`,
      payload: { eventId: event.event_id, configEntryId: destination.configEntryId },
    });
  }
}

export function buildHomeAssistantWebhookPayload(payload, includeBody) {
  const email = payload?.email && typeof payload.email === "object" ? payload.email : {};
  const bodyText = typeof email.body?.text === "string"
    ? email.body.text.slice(0, HOME_ASSISTANT_BODY_MAX_LENGTH)
    : "";
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
      attachments: (Array.isArray(email.attachments) ? email.attachments : []).map(
        ({ content_base64: _content, ...attachment }) => attachment,
      ),
      ...(includeBody ? { body: { text: bodyText } } : {}),
    },
    classification: payload?.classification || { labels: [], attention: null },
  };
}

export async function assertSafeHomeAssistantWebhookUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw httpError(400, "webhook_url must be a valid URL");
  }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
    throw httpError(400, "webhook_url must be a public HTTPS URL without embedded credentials");
  }
  const addresses = net.isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await dns.lookup(url.hostname, { all: true, verbatim: true }).catch(() => []);
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw httpError(400, "webhook_url must resolve only to public internet addresses");
  }
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b, c] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || b === 168))
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113);
  }
  const normalized = address.toLowerCase();
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc")
    || normalized.startsWith("fd") || normalized.startsWith("fe8")
    || normalized.startsWith("fe9") || normalized.startsWith("fea")
    || normalized.startsWith("feb") || normalized.startsWith("ff")
    || normalized.startsWith("2001:db8:") || normalized.startsWith("::ffff:");
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function deliverWebhookEvent(userId, eventName, payload, options = {}) {
  if (!dbPool) {
    return;
  }

  const settings = await getWebhookSettings(userId);
  if (!settings?.url) {
    await options.onDelivery?.({ status: "skipped" });
    return;
  }

  const event = createWebhookEnvelope(eventName, payload, {
    eventId: options.eventId || crypto.randomUUID(),
    schemaVersion: options.schemaVersion || WEBHOOK_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
  });
  const loggedEvent = redactWebhookEvent(event);

  try {
    const response = await fetchWithTimeout(
      settings.url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(settings.bearerToken ? { Authorization: `Bearer ${settings.bearerToken}` } : {}),
        },
        body: JSON.stringify(event),
      },
      WEBHOOK_TIMEOUT_MS,
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      await logSystemEvent(userId, {
        category: "webhook",
        eventName,
        status: "error",
        message: `Webhook ${eventName} failed with ${response.status}.`,
        payload: { event: loggedEvent, response: eventName === "email.ready_for_processing" ? "[redacted]" : text.slice(0, 500) },
      });
      console.warn(`Webhook ${eventName} failed with ${response.status}: ${text.slice(0, 300)}`);
      await options.onDelivery?.({ status: "failed", httpStatus: response.status });
    } else {
      await logSystemEvent(userId, {
        category: "webhook",
        eventName,
        status: "success",
        message: `Webhook ${eventName} delivered.`,
        payload: loggedEvent,
      });
      await options.onDelivery?.({ status: "delivered" });
    }
  } catch (error) {
    await logSystemEvent(userId, {
      category: "webhook",
      eventName,
      status: "error",
      message: `Webhook ${eventName} delivery failed: ${error.message}`,
      payload: loggedEvent,
    });
    console.warn(`Webhook ${eventName} delivery failed:`, error.message);
    await options.onDelivery?.({ status: "failed", error: error.message });
  }
}

function redactWebhookEvent(event) {
  if (event.event_name !== "email.ready_for_processing") return event;
  return {
    ...event,
    payload: {
      ...event.payload,
      activity_callback: event.payload?.activity_callback ? { ...event.payload.activity_callback, url: "[redacted]" } : undefined,
      email: event.payload?.email ? {
        ...event.payload.email,
        attachments: (event.payload.email.attachments ?? []).map(({ content_base64: _content, ...attachment }) => attachment),
      } : undefined,
    },
  };
}

async function getWebhookSettings(userId) {
  const result = await dbPool.query(
    `
      select webhook_url as "url",
             webhook_bearer_token as "bearerToken"
      from user_settings
      where user_id = $1
      limit 1
    `,
    [userId],
  );

  return result.rows[0] ?? null;
}
