// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { applyPwaUpdate } from "./pwa-update";

describe("applyPwaUpdate", () => {
  it("forces a reload when the PWA updater never settles", async () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const postMessage = vi.fn();
    const unregister = vi.fn(() => new Promise<boolean>(() => undefined));
    const serviceWorker = new EventTarget() as ServiceWorkerContainer;

    const result = applyPwaUpdate({
      registration: { unregister, waiting: { postMessage } as unknown as ServiceWorker } as unknown as ServiceWorkerRegistration,
      reload,
      serviceWorker,
      timeoutMs: 100,
      updateServiceWorker: vi.fn(() => new Promise<void>(() => undefined)),
    });

    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    await vi.advanceTimersByTimeAsync(200);
    await result;
    expect(reload).toHaveBeenCalledOnce();
    expect(unregister).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("reloads immediately after the new worker takes control", async () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const serviceWorker = new EventTarget() as ServiceWorkerContainer;
    const result = applyPwaUpdate({
      reload,
      serviceWorker,
      timeoutMs: 8_000,
      updateServiceWorker: vi.fn().mockResolvedValue(undefined),
    });

    serviceWorker.dispatchEvent(new Event("controllerchange"));
    await result;
    expect(reload).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
