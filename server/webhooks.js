import crypto from "node:crypto";
import { dbPool } from "./db.js";
import { createTaskQueue } from "./concurrency.js";
import { fetchWithTimeout } from "./http.js";
import { logSystemEvent } from "./system-logs.js";
import { createWebhookEnvelope, WEBHOOK_SCHEMA_VERSION } from "../shared/webhook-contracts.js";

const WEBHOOK_TIMEOUT_MS = 8000;
// Detached deliveries allowed in flight at once. Sequential awaiting used to cap this at
// one socket; without a bound, one bulk action could open fifty at a time and hold them all
// for the full timeout against an unresponsive receiver. Queued events are not dropped,
// they just wait their turn -- and nobody is waiting on them.
const WEBHOOK_DISPATCH_CONCURRENCY = 6;

const dispatchQueue = createTaskQueue({
  limit: WEBHOOK_DISPATCH_CONCURRENCY,
  onError: (error) => {
    // emitWebhookEvent already records delivery failures itself, so reaching here means the
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
  dispatchQueue.push(() => emitWebhookEvent(userId, eventName, payload, options));
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

export async function emitWebhookEvent(userId, eventName, payload, options = {}) {
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
