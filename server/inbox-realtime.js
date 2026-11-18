import { runGuardedStep } from "./detached-tasks.js";
import { sendInboxSyncNotification } from "./push-notifications.js";
import { requireSession } from "./session.js";

const clientsByUser = new Map();
const HEARTBEAT_INTERVAL_MS = 25_000;

export function registerInboxRealtimeRoutes(app) {
  app.get("/api/inbox/events", requireSession, (req, res) => {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const removeClient = addClient(req.user.id, res);
    writeEvent(res, "connected", { connected: true, timestamp: new Date().toISOString() });
    const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), HEARTBEAT_INTERVAL_MS);
    heartbeat.unref?.();

    req.on("close", () => {
      clearInterval(heartbeat);
      removeClient();
      res.end();
    });
  });
}

export function publishInboxChange(userId, change, options = {}) {
  const event = {
    reason: String(change?.reason || "updated"),
    messages: normalizeMessages(change?.messages),
    timestamp: new Date().toISOString(),
  };
  broadcastInboxChange(userId, event);

  if (options.push !== false) {
    void runGuardedStep("inbox.realtime.push_sync", () => sendInboxSyncNotification(userId, event));
  }
  return event;
}

export function broadcastInboxChange(userId, event) {
  const clients = clientsByUser.get(userId);
  if (!clients?.size) return 0;

  let delivered = 0;
  for (const client of clients) {
    try {
      writeEvent(client, "inbox-changed", event);
      delivered += 1;
    } catch {
      clients.delete(client);
    }
  }
  if (clients.size === 0) clientsByUser.delete(userId);
  return delivered;
}

function addClient(userId, response) {
  const clients = clientsByUser.get(userId) ?? new Set();
  clients.add(response);
  clientsByUser.set(userId, clients);
  return () => {
    clients.delete(response);
    if (clients.size === 0) clientsByUser.delete(userId);
  };
}

function writeEvent(response, name, payload) {
  response.write(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(0, 100).map((message) => ({
    accountId: String(message?.accountId || ""),
    emailId: String(message?.emailId || message?.id || ""),
    mailbox: String(message?.mailbox || ""),
  })).filter((message) => message.accountId && message.emailId);
}
