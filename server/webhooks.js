import { dbPool } from "./db.js";

const WEBHOOK_TIMEOUT_MS = 8000;

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(settings.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(settings.bearerToken ? { Authorization: `Bearer ${settings.bearerToken}` } : {}),
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn(`Webhook ${eventName} failed with ${response.status}: ${text.slice(0, 300)}`);
    }
  } catch (error) {
    console.warn(`Webhook ${eventName} delivery failed:`, error.message);
  } finally {
    clearTimeout(timeout);
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
