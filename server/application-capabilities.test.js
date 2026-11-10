import { describe, expect, it } from "vitest";
import {
  buildApplicationCapabilityManifest,
  EMAILABLE_CAPABILITY_MANIFEST_VERSION,
  selectAttentionDashboardResource,
} from "./application-capabilities.js";

function message(id, overrides = {}) {
  return {
    accountId: "account-1",
    accountEmail: "owner@example.com",
    attention: { explanation: "You bookmarked this email.", reasonCode: "followed" },
    date: "2026-11-09T12:00:00.000Z",
    from: "Sender <sender@example.com>",
    id,
    labels: ["Reference"],
    snippet: "A useful message",
    subject: `Message ${id}`,
    threadId: `thread-${id}`,
    ...overrides,
  };
}

describe("application capability manifest", () => {
  it("advertises only tools that are actually registered for the run", () => {
    const manifest = buildApplicationCapabilityManifest({
      accounts: [{ id: "account-1", email: "owner@example.com", provider: "gmail" }],
      labels: [{ name: "Reference", description: "Keep for later." }],
      toolCatalog: [
        { name: "query_attention_dashboard", source: "emailable" },
        { name: "imaginary_tool", source: "emailable" },
      ],
    });

    expect(manifest.version).toBe(EMAILABLE_CAPABILITY_MANIFEST_VERSION);
    expect(manifest.availableInternalTools).toEqual([
      { name: "query_attention_dashboard", source: "emailable" },
    ]);
    expect(manifest.persistentApplicationState.accounts).toEqual([
      { id: "account-1", email: "owner@example.com", provider: "gmail" },
    ]);
    expect(manifest.concepts.find((concept) => concept.key === "of_interest")?.description)
      .toContain("bookmarked");
  });
});

describe("attention dashboard agent query", () => {
  const interest = [message("interest-1"), message("interest-2")];
  const cleanup = [message("cleanup-1")];
  const review = [message("review-1"), message("review-2")];
  const quickWin = message("quick-win-1");
  const commitment = message("commitment-1", { commitment: { id: "commitment", isCompleted: false } });
  const dashboard = {
    categories: { attention: [quickWin, commitment], cleanup, interest },
    cleanupCounts: { likelyClutter: 1, needsReview: 2 },
    cleanupReview: review,
    commitments: [commitment],
    counts: { attention: 2, cleanup: 3, interest: 2 },
    quickWinCount: 1,
    quickWins: [quickWin],
  };

  it("uses persistent bookmark placement for exact Of Interest counts", () => {
    const result = selectAttentionDashboardResource(dashboard, {
      category: "of_interest",
      operation: "count",
      accountIds: ["account-1"],
    });

    expect(result.totalMatches).toBe(2);
    expect(result.returned).toBe(0);
    expect(result.scope.accountIds).toEqual(["account-1"]);
    expect(result.dashboardCounts.ofInterest).toBe(2);
  });

  it("combines likely clutter and needs review for Quick Cleanup", () => {
    const result = selectAttentionDashboardResource(dashboard, {
      category: "quick_cleanup",
      operation: "list",
      limit: 2,
    });

    expect(result.totalMatches).toBe(3);
    expect(result.returned).toBe(2);
    expect(result.nextOffset).toBe(2);
    expect(result.results).toHaveLength(2);
  });

  it("returns commitment and quick-win subsets independently", () => {
    expect(selectAttentionDashboardResource(dashboard, { category: "commitments" }).totalMatches).toBe(1);
    expect(selectAttentionDashboardResource(dashboard, { category: "quick_wins" }).totalMatches).toBe(1);
  });
});
