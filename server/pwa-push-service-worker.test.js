import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("PWA push service worker", () => {
  it("shows every push as a visible notification, updates the badge, and handles clicks", async () => {
    const source = await fs.readFile("public/push-sw.js", "utf8");

    expect(source).toContain('addEventListener("push"');
    expect(source).toContain("showNotification");
    expect(source).toContain("setAppBadge");
    expect(source).toContain("emailable:inbox-changed");
    expect(source).toContain("client.postMessage");
    expect(source).toContain('addEventListener("notificationclick"');
    expect(source).toContain("openWindow");
  });
});
