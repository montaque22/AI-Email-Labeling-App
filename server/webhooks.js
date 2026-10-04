import { dbPool } from "./db.js";
import { createTaskQueue } from "./concurrency.js";
import { fetchWithTimeout } from "./http.js";
import { logSystemEvent } from "./system-logs.js";

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
export function emitWebhookEventDetached(userId, eventName, payload) {
  dispatchQueue.push(() => emitWebhookEvent(userId, eventName, payload));
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

export async function emitWebhookEvent(userId, eventName, payload) {
  if (!dbPool) {
    return;
  }

  const settings = await getWebhookSettings(userId);
  if (!settings?.url) {
    return;
  }

  const event = {
    event_name: eventName,
    payload,
    timestamp: new Date().toISOString(),
  };

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
        payload: { event, response: text.slice(0, 500) },
      });
      console.warn(`Webhook ${eventName} failed with ${response.status}: ${text.slice(0, 300)}`);
    } else {
      await logSystemEvent(userId, {
        category: "webhook",
        eventName,
        status: "success",
        message: `Webhook ${eventName} delivered.`,
        payload: event,
      });
    }
  } catch (error) {
    await logSystemEvent(userId, {
      category: "webhook",
      eventName,
      status: "error",
      message: `Webhook ${eventName} delivery failed: ${error.message}`,
      payload: event,
    });
    console.warn(`Webhook ${eventName} delivery failed:`, error.message);
  }
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
