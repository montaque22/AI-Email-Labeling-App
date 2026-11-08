import { describe, expect, it } from "vitest";
import { ACTIVITY_CALLBACK_EXAMPLES } from "../shared/webhook-contracts.js";
import { parseActivityCallback, resolveActivityLifecycle } from "./automation-activity.js";

describe("automation activity callback contract", () => {
  it.each(["started", "completed", "failed"])("accepts the canonical %s example", (status) => {
    const parsed = parseActivityCallback(ACTIVITY_CALLBACK_EXAMPLES[status]);
    expect(parsed.ok).toBe(true);
    expect(parsed.value.status).toBe(status);
    expect(parsed.value.timestamp).toBeInstanceOf(Date);
    expect(parsed.value.data).toEqual(ACTIVITY_CALLBACK_EXAMPLES[status].data);
  });

  it("rejects obsolete callback fields instead of silently interpreting them", () => {
    expect(parseActivityCallback({ ...ACTIVITY_CALLBACK_EXAMPLES.completed, started_at: "2026-11-07T18:14:02Z" }).ok).toBe(false);
  });

  it("rejects unsupported versions, statuses, malformed timestamps, and oversized data", () => {
    expect(parseActivityCallback({ ...ACTIVITY_CALLBACK_EXAMPLES.started, schema_version: "2.0" }).ok).toBe(false);
    expect(parseActivityCallback({ ...ACTIVITY_CALLBACK_EXAMPLES.started, status: "waiting" }).ok).toBe(false);
    expect(parseActivityCallback({ ...ACTIVITY_CALLBACK_EXAMPLES.started, timestamp: "not-a-date" }).ok).toBe(false);
    expect(parseActivityCallback({ ...ACTIVITY_CALLBACK_EXAMPLES.started, data: { value: "x".repeat(33_000) } }).ok).toBe(false);
  });

  it("only accepts error details for a failed callback", () => {
    expect(parseActivityCallback({ ...ACTIVITY_CALLBACK_EXAMPLES.completed, error: { message: "no" } }).ok).toBe(false);
    expect(parseActivityCallback(ACTIVITY_CALLBACK_EXAMPLES.failed).ok).toBe(true);
  });

  it("derives timestamps for normal and terminal-before-start ordering", () => {
    const endedAt = new Date("2026-11-07T18:14:05Z");
    expect(resolveActivityLifecycle(null, { status: "completed", timestamp: endedAt })).toMatchObject({ status: "completed", preserveTerminal: false, reportedStartedAt: null, reportedEndedAt: endedAt });
    const startedAt = new Date("2026-11-07T18:14:02Z");
    expect(resolveActivityLifecycle({ status: "completed" }, { status: "started", timestamp: startedAt })).toMatchObject({ status: "completed", preserveTerminal: true, reportedStartedAt: startedAt, reportedEndedAt: null });
  });
});
