import { describe, expect, it } from "vitest";
import { buildEngagementSessionKey, DEFAULT_ATTENTION_SETTINGS, deriveAttentionSignals, evaluateAttentionPlacement, paginateAttentionCategory } from "./attention-dashboard.js";

const baseMessage = {
  date: "2026-10-31T12:00:00.000Z",
  labels: [],
  subject: "Hello",
  snippet: "A normal message",
  signals: {},
};
const now = new Date("2026-11-01T12:00:00.000Z");

describe("attention dashboard placement", () => {
  it("always places an active commitment in Needs Attention", () => {
    const result = evaluateAttentionPlacement({ ...baseMessage, commitment: { dueAt: "2026-11-02T12:00:00.000Z" }, signals: { promotion: true } }, { placementOverride: "cleanup" }, DEFAULT_ATTENTION_SETTINGS, now);
    expect(result.category).toBe("attention");
    expect(result.reasonCode).toBe("active_commitment");
  });

  it("places a followed email in Of Interest unless attention takes precedence", () => {
    expect(evaluateAttentionPlacement(baseMessage, { followed: true }, DEFAULT_ATTENTION_SETTINGS, now).category).toBe("interest");
    expect(evaluateAttentionPlacement({ ...baseMessage, signals: { security: true } }, { followed: true }, DEFAULT_ATTENTION_SETTINGS, now).category).toBe("attention");
  });

  it("uses repeated opens for interest without implying action", () => {
    const result = evaluateAttentionPlacement({ ...baseMessage, distinctOpens: 3 }, {}, DEFAULT_ATTENTION_SETTINGS, now);
    expect(result.category).toBe("interest");
    expect(result.attentionScore).toBeLessThan(result.interestScore);
  });

  it("does not suggest protected mail for cleanup", () => {
    const result = evaluateAttentionPlacement({ ...baseMessage, signals: { action: true, promotion: true } }, { placementOverride: "cleanup" }, DEFAULT_ATTENTION_SETTINGS, now);
    expect(result.category).toBe("attention");
  });

  it("keeps unknown mail in All Mail", () => {
    expect(evaluateAttentionPlacement(baseMessage, {}, DEFAULT_ATTENTION_SETTINGS, now).category).toBe("all");
  });

  it("honors dismissal without modifying the underlying email", () => {
    const result = evaluateAttentionPlacement({ ...baseMessage, signals: { security: true } }, { dismissedCategory: "attention" }, DEFAULT_ATTENTION_SETTINGS, now);
    expect(result.category).toBe("all");
    expect(result.reasonCode).toBe("dismissed");
  });

  it("stops using opens when behavioral personalization is disabled", () => {
    const result = evaluateAttentionPlacement({ ...baseMessage, distinctOpens: 5 }, {}, { ...DEFAULT_ATTENTION_SETTINGS, behavioralPersonalization: false }, now);
    expect(result.category).toBe("all");
  });

  it("derives semantic evidence from user label descriptions", () => {
    const signals = deriveAttentionSignals({ ...baseMessage, labels: ["Custom A"] }, [{ name: "Custom A", description: "Messages requiring a response or review." }]);
    expect(signals.action).toBe(true);
  });

  it("gives explicit user placement precedence over learned behavior", () => {
    const result = evaluateAttentionPlacement({ ...baseMessage, distinctOpens: 5 }, { placementOverride: "attention" }, DEFAULT_ATTENTION_SETTINGS, now);
    expect(result.category).toBe("attention");
    expect(result.reasonCode).toBe("explicit_attention");
  });

  it("applies time decay to automatically derived scores", () => {
    const recent = evaluateAttentionPlacement({ ...baseMessage, signals: { reference: true } }, {}, DEFAULT_ATTENTION_SETTINGS, now);
    const old = evaluateAttentionPlacement({ ...baseMessage, date: "2025-01-01T12:00:00.000Z", signals: { reference: true } }, {}, DEFAULT_ATTENTION_SETTINGS, now);
    expect(recent.attentionScore).toBeGreaterThan(old.attentionScore);
  });

  it("deduplicates engagement by email session key", () => {
    expect(buildEngagementSessionKey("open", "session-1", now)).toBe("session-1:open");
    expect(buildEngagementSessionKey("open", "session-1", new Date("2027-01-01"))).toBe("session-1:open");
  });

  it("returns deterministic five-then-ten priority pages without duplicates", () => {
    const messages = Array.from({ length: 18 }, (_, index) => ({ id: `message-${index + 1}` }));
    const firstPage = paginateAttentionCategory(messages, 0, 5);
    const secondPage = paginateAttentionCategory(messages, 5, 10);
    expect(firstPage).toHaveLength(5);
    expect(secondPage).toHaveLength(10);
    expect(new Set([...firstPage, ...secondPage].map((message) => message.id)).size).toBe(15);
  });
});
