import fs from "node:fs/promises";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

describe("PWA push service worker", () => {
  it("shows every push as a visible notification, updates the badge, and handles clicks", async () => {
    const source = await fs.readFile("public/push-sw.js", "utf8");

    expect(source).toContain('addEventListener("push"');
    expect(source).toContain("showNotification");
    expect(source).toContain("silent: Boolean(payload.silent)");
    expect(source).toContain("setAppBadge");
    expect(source).toContain("emailable:inbox-changed");
    expect(source).toContain("client.postMessage");
    expect(source).toContain('addEventListener("notificationclick"');
    expect(source).toContain("openWindow");
  });

  it("turns a processed-email push into a non-silent lock-screen notification", async () => {
    const source = await fs.readFile("public/push-sw.js", "utf8");
    const listeners = new Map();
    const showNotification = vi.fn().mockResolvedValue(undefined);
    const setAppBadge = vi.fn().mockResolvedValue(undefined);
    const worker = {
      addEventListener: (name, listener) => listeners.set(name, listener),
      clients: { matchAll: vi.fn().mockResolvedValue([]), openWindow: vi.fn() },
      navigator: { setAppBadge, clearAppBadge: vi.fn() },
      registration: { scope: "https://emailable.example/", showNotification },
    };
    vm.runInNewContext(source, { self: worker, URL });
    let pendingWork;
    listeners.get("push")({
      data: { json: () => ({
        badgeCount: 4,
        body: "Sender: Project update",
        silent: false,
        title: "New email labeled Action Required",
        url: "inbox",
      }) },
      waitUntil: (promise) => { pendingWork = promise; },
    });
    await pendingWork;

    expect(setAppBadge).toHaveBeenCalledWith(4);
    expect(showNotification).toHaveBeenCalledWith(
      "New email labeled Action Required",
      expect.objectContaining({ body: "Sender: Project update", silent: false }),
    );
  });
});
