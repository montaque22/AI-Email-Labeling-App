import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Home Assistant webhook-only delivery", () => {
  it("contains no event poller, cursor store, or event-feed API route", async () => {
    const [integration, apiClient, constants, routes, manifest] = await Promise.all([
      fs.readFile("custom_components/emailable/__init__.py", "utf8"),
      fs.readFile("custom_components/emailable/api.py", "utf8"),
      fs.readFile("custom_components/emailable/const.py", "utf8"),
      fs.readFile("server/integrations.js", "utf8"),
      fs.readFile("custom_components/emailable/manifest.json", "utf8"),
    ]);

    await expect(fs.access("custom_components/emailable/event_feed.py")).rejects.toThrow();
    expect(integration).not.toContain("async_create_task");
    expect(integration).not.toContain("EmailableEventFeed");
    expect(apiClient).not.toContain("fetch_events");
    expect(constants).not.toContain("EVENT_POLL_INTERVAL_SECONDS");
    expect(routes).not.toContain('app.get("/api/integrations/events"');
    expect(JSON.parse(manifest).iot_class).toBe("cloud_push");
  });
});
