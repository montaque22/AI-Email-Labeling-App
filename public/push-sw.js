/* global self */

self.addEventListener("push", (event) => {
  const payload = readPushPayload(event);
  const scope = self.registration.scope;
  const notificationUrl = new URL(payload.url || "inbox", scope).href;
  const work = [];

  if ("setAppBadge" in self.navigator && typeof self.navigator.setAppBadge === "function") {
    work.push(payload.badgeCount > 0
      ? self.navigator.setAppBadge(payload.badgeCount)
      : self.navigator.clearAppBadge?.());
  }

  work.push(self.registration.showNotification(payload.title || "Emailable", {
    body: payload.body || "New email is ready.",
    icon: new URL(payload.icon || "pwa-192.png", scope).href,
    badge: new URL(payload.badge || "pwa-maskable.png", scope).href,
    tag: payload.tag || "emailable-email",
    data: { url: notificationUrl, email: payload.email || null },
  }));
  event.waitUntil(Promise.all(work.filter(Boolean)));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || new URL("inbox", self.registration.scope).href;
  event.waitUntil(openOrFocusApp(targetUrl));
});

function readPushPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch {
    return { body: event.data.text() };
  }
}

async function openOrFocusApp(targetUrl) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const target = new URL(targetUrl);
  const existing = windows.find((client) => new URL(client.url).origin === target.origin);
  if (existing) {
    if (typeof existing.navigate === "function" && existing.url !== target.href) {
      await existing.navigate(target.href);
    }
    return existing.focus();
  }
  return self.clients.openWindow(target.href);
}
