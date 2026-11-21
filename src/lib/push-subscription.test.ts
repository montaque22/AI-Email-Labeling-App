// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { syncPushSubscription } from "./push-subscription";

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("syncPushSubscription", () => {
  it("re-registers an existing device subscription with the server", async () => {
    const subscription = {
      toJSON: () => ({ endpoint: "https://push.example/device", keys: { auth: "auth", p256dh: "key" } }),
    } as unknown as PushSubscription;
    const registration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(subscription),
        subscribe: vi.fn(),
      },
    } as unknown as ServiceWorkerRegistration;
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ publicKey: "AQAB" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ subscribed: true }), { status: 201 }));
    vi.stubGlobal("PushManager", class PushManager {});
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {} });

    await expect(syncPushSubscription({ fetcher, notificationPermission: "granted", registration })).resolves.toBe("synced");
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenLastCalledWith("/api/push-notifications/subscriptions", expect.objectContaining({
      method: "POST",
      body: JSON.stringify(subscription.toJSON()),
    }));
  });

  it("repairs a missing browser subscription when permission is already granted", async () => {
    const subscription = { toJSON: () => ({ endpoint: "https://push.example/new-device" }) } as unknown as PushSubscription;
    const subscribe = vi.fn().mockResolvedValue(subscription);
    const registration = {
      pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe },
    } as unknown as ServiceWorkerRegistration;
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ publicKey: "AQAB" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 201 }));
    vi.stubGlobal("PushManager", class PushManager {});
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {} });

    await syncPushSubscription({ fetcher, notificationPermission: "granted", registration });
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
  });
});
