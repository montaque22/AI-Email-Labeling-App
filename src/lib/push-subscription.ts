type PushStatusResponse = {
  publicKey: string;
};

export type PushSubscriptionSyncResult = "unsupported" | "not-granted" | "synced";

type PushSubscriptionSyncDependencies = {
  fetcher?: typeof fetch;
  notificationPermission?: NotificationPermission;
  registration?: ServiceWorkerRegistration;
};

/**
 * Repairs the current device's server registration. Browser push subscriptions
 * survive app updates, but the matching server row may be stale or missing.
 */
export async function syncPushSubscription({
  fetcher = fetch,
  notificationPermission = typeof Notification === "undefined" ? "default" : Notification.permission,
  registration,
}: PushSubscriptionSyncDependencies = {}): Promise<PushSubscriptionSyncResult> {
  if (!supportsPushSubscriptionSync()) return "unsupported";
  if (notificationPermission !== "granted") return "not-granted";

  const activeRegistration = registration ?? await navigator.serviceWorker.ready;
  const statusResponse = await fetcher("/api/push-notifications/status", {
    credentials: "include",
    cache: "no-store",
  });
  const status = await readJson<PushStatusResponse>(statusResponse);
  if (!statusResponse.ok || !status.publicKey) {
    throw new Error("Could not load push notification configuration.");
  }

  const existingSubscription = await activeRegistration.pushManager.getSubscription();
  const subscription = existingSubscription ?? await activeRegistration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(status.publicKey),
  });
  const saveResponse = await fetcher("/api/push-notifications/subscriptions", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!saveResponse.ok) {
    const body = await readJson<{ error?: string }>(saveResponse);
    throw new Error(body.error || "Could not synchronize the push notification subscription.");
  }
  return "synced";
}

export function supportsPushSubscriptionSync(): boolean {
  return typeof window !== "undefined"
    && window.isSecureContext
    && "serviceWorker" in navigator
    && "PushManager" in window;
}

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

async function readJson<T>(response: Response): Promise<T> {
  return response.json().catch(() => ({} as T)) as Promise<T>;
}
