import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { ACTIVITY_CALLBACK_EXAMPLES, WEBHOOK_EVENT_DEFINITIONS, activityCallbackSchema, createWebhookEnvelope } from "./webhook-contracts.js";

describe("shared webhook contracts", () => {
  it("keeps examples valid and envelopes versioned", () => {
    for (const example of Object.values(ACTIVITY_CALLBACK_EXAMPLES)) expect(activityCallbackSchema.safeParse(example).success).toBe(true);
    expect(createWebhookEnvelope("label.created", { label: { name: "Finance" } })).toMatchObject({ event_id: "evt_123", event_name: "label.created", schema_version: "1.0" });
  });

  it("documents every event shown by the settings UI", () => {
    const documentation = fs.readFileSync(new URL("../documentation/19-webhook.md", import.meta.url), "utf8");
    for (const event of WEBHOOK_EVENT_DEFINITIONS) expect(documentation).toContain(event.name);
  });
});
