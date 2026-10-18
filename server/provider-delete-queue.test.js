import { describe, expect, it, vi } from "vitest";
import { drainProviderDeleteQueues } from "./provider-delete-queue.js";

describe("provider delete queues", () => {
  it("runs account pools independently in bounded batches", async () => {
    const activeByAccount = new Map();
    const peakByAccount = new Map();
    const worker = vi.fn(async (item) => {
      const active = (activeByAccount.get(item.accountId) ?? 0) + 1;
      activeByAccount.set(item.accountId, active);
      peakByAccount.set(item.accountId, Math.max(peakByAccount.get(item.accountId) ?? 0, active));
      await Promise.resolve();
      activeByAccount.set(item.accountId, (activeByAccount.get(item.accountId) ?? 1) - 1);
    });
    const items = [
      ...Array.from({ length: 17 }, (_, index) => ({ accountId: "account-a", id: `a-${index}` })),
      ...Array.from({ length: 13 }, (_, index) => ({ accountId: "account-b", id: `b-${index}` })),
    ];

    const results = await drainProviderDeleteQueues(items, { batchSize: 10, maxAttempts: 3, worker });

    expect(results).toHaveLength(30);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(peakByAccount.get("account-a")).toBeLessThanOrEqual(10);
    expect(peakByAccount.get("account-b")).toBeLessThanOrEqual(10);
  });

  it("moves failures to the back and retries only twice", async () => {
    const attempts = new Map();
    const worker = vi.fn(async (item) => {
      const count = (attempts.get(item.id) ?? 0) + 1;
      attempts.set(item.id, count);
      if (item.id === "eventual" && count < 3) throw new Error("rate limited");
      if (item.id === "permanent") throw new Error("still rate limited");
    });

    const results = await drainProviderDeleteQueues([
      { accountId: "account-a", id: "eventual" },
      { accountId: "account-a", id: "permanent" },
      { accountId: "account-a", id: "next" },
    ], { batchSize: 1, maxAttempts: 3, worker });

    expect(attempts.get("eventual")).toBe(3);
    expect(attempts.get("permanent")).toBe(3);
    expect(attempts.get("next")).toBe(1);
    expect(results.find((result) => result.item.id === "eventual")?.ok).toBe(true);
    expect(results.find((result) => result.item.id === "permanent")).toMatchObject({ ok: false, error: "still rate limited" });
  });
});
