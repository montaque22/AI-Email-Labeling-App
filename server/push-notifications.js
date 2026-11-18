import crypto from "node:crypto";
import webPush from "web-push";
import { dbPool } from "./db.js";
import { decryptToken, encryptToken } from "./email-accounts.js";
import { countUnreadEmailIndexEntries } from "./email-index.js";
import { requireSession } from "./session.js";
import { logSystemEvent } from "./system-logs.js";

const PUSH_CONFIGURATION_ID = "default";
const DEFAULT_VAPID_SUBJECT = "mailto:notifications@emailable.local";

export async function ensurePushNotificationTables() {
  if (!dbPool) return;

  await dbPool.query(`
    create table if not exists push_notification_configuration (
      id text primary key,
      public_key text not null,
      encrypted_private_key text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await dbPool.query(`
    create table if not exists push_subscriptions (
      id uuid primary key,
      user_id text not null references "user"(id) on delete cascade,
      endpoint text not null,
      endpoint_hash text not null,
      expiration_time bigint,
      p256dh text not null,
      auth text not null,
      user_agent text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await dbPool.query("create unique index if not exists push_subscriptions_endpoint_hash_idx on push_subscriptions(endpoint_hash)");
  await dbPool.query("create index if not exists push_subscriptions_user_id_idx on push_subscriptions(user_id)");
}

export function registerPushNotificationRoutes(app) {
  app.get("/api/push-notifications/status", requireSession, async (req, res) => {
    try {
      const [keys, subscriptions] = await Promise.all([
        getVapidKeys(),
        dbPool.query("select count(*)::int as count from push_subscriptions where user_id = $1", [req.user.id]),
      ]);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        configured: true,
        publicKey: keys.publicKey,
        subscriptionCount: Number(subscriptions.rows[0]?.count ?? 0),
      });
    } catch (error) {
      handlePushError(res, error);
    }
  });

  app.post("/api/push-notifications/subscriptions", requireSession, async (req, res) => {
    try {
      const subscription = parsePushSubscription(req.body);
      await savePushSubscription(req.user.id, subscription, req.get("user-agent") || "");
      res.status(201).json({ subscribed: true });
    } catch (error) {
      handlePushError(res, error);
    }
  });

  app.delete("/api/push-notifications/subscriptions", requireSession, async (req, res) => {
    try {
      const endpoint = parsePushEndpoint(req.body?.endpoint);
      const result = await dbPool.query(
        "delete from push_subscriptions where user_id = $1 and endpoint_hash = $2",
        [req.user.id, hashEndpoint(endpoint)],
      );
      res.json({ deleted: result.rowCount });
    } catch (error) {
      handlePushError(res, error);
    }
  });

  app.post("/api/push-notifications/test", requireSession, async (req, res) => {
    try {
      const result = await sendPushNotification(req.user.id, {
        title: "Emailable notifications are ready",
        body: "You will be notified after new email is processed and labeled.",
        tag: "emailable-notification-test",
        url: "inbox",
      });
      res.json(result);
    } catch (error) {
      handlePushError(res, error);
    }
  });
}

export async function sendProcessedEmailNotification(userId, message) {
  const labels = Array.isArray(message.labels) ? message.labels.filter(Boolean) : [];
  const labelText = labels.length > 0 ? labels.join(", ") : "Processed";
  return sendPushNotification(userId, {
    title: `New email labeled ${labelText}`,
    body: buildProcessedEmailNotificationBody(message),
    tag: `email-${String(message.accountId || "account")}-${String(message.emailId || "message")}`.slice(0, 120),
    url: "inbox",
    email: {
      accountId: String(message.accountId || ""),
      emailId: String(message.emailId || ""),
      labels,
    },
  });
}

export async function sendInboxSyncNotification(userId, change) {
  const reason = String(change?.reason || "updated");
  return sendPushNotification(userId, {
    title: "Inbox updated",
    body: syncNotificationBody(reason),
    tag: "emailable-inbox-sync",
    type: "inbox-sync",
    silent: true,
    url: "inbox",
  });
}

export async function sendPushNotification(userId, notification) {
  const subscriptionResult = await dbPool.query(
    `select endpoint, expiration_time as "expirationTime", p256dh, auth
     from push_subscriptions where user_id = $1 order by created_at`,
    [userId],
  );
  const subscriptions = subscriptionResult.rows;
  if (subscriptions.length === 0) {
    return { attempted: 0, delivered: 0, removed: 0 };
  }
  const [keys, unreadCount] = await Promise.all([
    getVapidKeys(),
    countUnreadEmailIndexEntries(userId),
  ]);

  webPush.setVapidDetails(resolveVapidSubject(), keys.publicKey, keys.privateKey);
  const payload = JSON.stringify(buildPushPayload(notification, unreadCount));
  let delivered = 0;
  let removed = 0;
  const failures = [];

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webPush.sendNotification(toWebPushSubscription(subscription), payload, { TTL: 60 * 60, urgency: "normal" });
      delivered += 1;
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await dbPool.query(
          "delete from push_subscriptions where user_id = $1 and endpoint_hash = $2",
          [userId, hashEndpoint(subscription.endpoint)],
        );
        removed += 1;
        return;
      }
      failures.push({ endpointHash: hashEndpoint(subscription.endpoint), statusCode: error?.statusCode ?? null, error: error?.message || "Push delivery failed" });
    }
  }));

  const result = { attempted: subscriptions.length, delivered, removed, failed: failures.length };
  await logSystemEvent(userId, {
    category: "notification",
    eventName: "push_notification.delivery_completed",
    status: failures.length > 0 ? (delivered > 0 ? "warning" : "error") : "success",
    message: `Push delivery attempted for ${subscriptions.length} subscription${subscriptions.length === 1 ? "" : "s"}.`,
    payload: { ...result, failures },
  });
  return result;
}

export function buildPushPayload(notification, badgeCount) {
  return {
    title: String(notification.title || "Emailable"),
    body: String(notification.body || "New activity is available."),
    icon: "pwa-192.png",
    badge: "pwa-maskable.png",
    tag: String(notification.tag || "emailable-update"),
    type: String(notification.type || "notification"),
    silent: Boolean(notification.silent),
    url: String(notification.url || "inbox"),
    badgeCount: Math.max(0, Number(badgeCount) || 0),
    email: notification.email || null,
  };
}

function syncNotificationBody(reason) {
  if (reason === "deleted") return "An email was moved to Trash. Your devices are now in sync.";
  if (reason === "archived") return "An email was archived. Your devices are now in sync.";
  if (reason === "read") return "Your unread email count changed.";
  if (reason === "restored") return "An email was restored. Your devices are now in sync.";
  return "Your inbox changed. Your devices are now in sync.";
}

export function parsePushSubscription(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createPushInputError("A push subscription is required.");
  }
  const endpoint = parsePushEndpoint(value.endpoint);
  const p256dh = String(value.keys?.p256dh || "").trim();
  const auth = String(value.keys?.auth || "").trim();
  if (!p256dh || p256dh.length > 512 || !auth || auth.length > 512) {
    throw createPushInputError("The push subscription keys are invalid.");
  }
  const expirationTime = value.expirationTime === null || value.expirationTime === undefined
    ? null
    : Number(value.expirationTime);
  if (expirationTime !== null && (!Number.isFinite(expirationTime) || expirationTime < 0)) {
    throw createPushInputError("The push subscription expiration is invalid.");
  }
  return { endpoint, expirationTime, keys: { p256dh, auth } };
}

function parsePushEndpoint(value) {
  const endpoint = String(value || "").trim();
  if (!endpoint || endpoint.length > 2048) throw createPushInputError("A push subscription endpoint is required.");
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw createPushInputError("The push subscription endpoint is invalid.");
  }
  if (url.protocol !== "https:") throw createPushInputError("Push subscription endpoints must use HTTPS.");
  return url.toString();
}

async function savePushSubscription(userId, subscription, userAgent) {
  await dbPool.query(
    `insert into push_subscriptions (
       id, user_id, endpoint, endpoint_hash, expiration_time, p256dh, auth, user_agent
     ) values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (endpoint_hash) do update set
       user_id = excluded.user_id,
       endpoint = excluded.endpoint,
       expiration_time = excluded.expiration_time,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       user_agent = excluded.user_agent,
       updated_at = now()`,
    [
      crypto.randomUUID(),
      userId,
      subscription.endpoint,
      hashEndpoint(subscription.endpoint),
      subscription.expirationTime,
      subscription.keys.p256dh,
      subscription.keys.auth,
      String(userAgent || "").slice(0, 1000),
    ],
  );
}

async function getVapidKeys() {
  const environmentPublicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const environmentPrivateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  if (environmentPublicKey && environmentPrivateKey) {
    return { publicKey: environmentPublicKey, privateKey: environmentPrivateKey };
  }
  if (environmentPublicKey || environmentPrivateKey) {
    throw new Error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be configured together.");
  }

  const existing = await dbPool.query(
    "select public_key as \"publicKey\", encrypted_private_key as \"encryptedPrivateKey\" from push_notification_configuration where id = $1",
    [PUSH_CONFIGURATION_ID],
  );
  if (existing.rows[0]) {
    return {
      publicKey: existing.rows[0].publicKey,
      privateKey: decryptToken(existing.rows[0].encryptedPrivateKey),
    };
  }

  const generated = webPush.generateVAPIDKeys();
  await dbPool.query(
    `insert into push_notification_configuration (id, public_key, encrypted_private_key)
     values ($1, $2, $3) on conflict (id) do nothing`,
    [PUSH_CONFIGURATION_ID, generated.publicKey, encryptToken(generated.privateKey)],
  );
  const stored = await dbPool.query(
    "select public_key as \"publicKey\", encrypted_private_key as \"encryptedPrivateKey\" from push_notification_configuration where id = $1",
    [PUSH_CONFIGURATION_ID],
  );
  return {
    publicKey: stored.rows[0].publicKey,
    privateKey: decryptToken(stored.rows[0].encryptedPrivateKey),
  };
}

function buildProcessedEmailNotificationBody(message) {
  const sender = String(message.sender || message.from || "New sender").trim();
  const subject = String(message.subject || "No subject").trim();
  return `${sender}: ${subject}`.slice(0, 240);
}

function toWebPushSubscription(subscription) {
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime === null ? null : Number(subscription.expirationTime),
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };
}

function resolveVapidSubject() {
  const value = String(process.env.VAPID_SUBJECT || "").trim();
  if (value.startsWith("mailto:") || value.startsWith("https://")) return value;
  return DEFAULT_VAPID_SUBJECT;
}

function hashEndpoint(endpoint) {
  return crypto.createHash("sha256").update(endpoint).digest("hex");
}

function createPushInputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function handlePushError(res, error) {
  console.error("Push notification request failed:", error);
  res.status(error.status || 500).json({ error: error.message || "Push notification request failed." });
}
