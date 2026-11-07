import { describe, expect, it } from "vitest";
import { parseActivityCallback } from "./automation-activity.js";

describe("automation activity callbacks", () => {
  it("accepts a complete terminal activity report", () => {
    const parsed = parseActivityCallback({
      event_id: "event-1",
      activity_id: "run-1",
      source: "n8n",
      status: "completed",
      title: "Calendar event created",
      description: "Appointment added",
      started_at: "2026-11-07T18:14:02.000Z",
      ended_at: "2026-11-07T18:14:05.000Z",
      details: { calendar_event_id: "event-9" },
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.value.status).toBe("completed");
    expect(parsed.value.details).toEqual({ calendar_event_id: "event-9" });
  });

  it("supports terminal-before-start ordering and rejects unknown statuses", () => {
    expect(parseActivityCallback({ event_id: "e", activity_id: "a", source: "workflow", status: "failed", title: "Task failed" }).ok).toBe(true);
    expect(parseActivityCallback({ event_id: "e", activity_id: "a", source: "workflow", status: "waiting", title: "Task" })).toEqual({ ok: false, error: "status must be started, completed, or failed" });
  });

  it("rejects malformed timestamps and oversized details", () => {
    expect(parseActivityCallback({ event_id: "e", activity_id: "a", source: "workflow", status: "started", title: "Task", started_at: "not-a-date" }).ok).toBe(false);
    expect(parseActivityCallback({ event_id: "e", activity_id: "a", source: "workflow", status: "started", title: "Task", details: { value: "x".repeat(33_000) } }).ok).toBe(false);
  });
});
