import { describe, expect, it } from "vitest";
import { buildAiHelperSystemPrompt, constrainAiHelperEmailSearchInput } from "./ai-helper-agent.js";
import { groundAiHelperEmailSearchMessage } from "./byoai.js";

function findEmailResult({ offset, returned, totalMatches = 347 }) {
  return {
    toolName: "find_email",
    input: { label: "Category Alpha", limit: 100, offset, searchConnectedAccounts: false },
    result: {
      emails: {
        source: "indexed_database",
        returned,
        totalMatches,
        nextOffset: offset + returned < totalMatches ? offset + returned : null,
        results: [],
      },
    },
  };
}

describe("AI Helper email count grounding", () => {
  it("uses an account- and label-agnostic operating prompt", () => {
    const prompt = buildAiHelperSystemPrompt();

    expect(prompt).toContain("any email account");
    expect(prompt).toContain("call find_email first");
    expect(prompt).toContain("including requests for all mail with no filters");
    expect(prompt).not.toContain("owner@example.test");
    expect(prompt).not.toContain("Category Alpha");
  });

  it("removes account and inbox filters inferred from screen context", () => {
    expect(constrainAiHelperEmailSearchInput({
      label: "Receipts",
      state: "inbox",
      to: "owner@example.test",
      limit: 100,
    }, { prompt: "Check through my Receipts emails. Is there anything I should look at?" }))
      .toEqual({ label: "Receipts", limit: 100 });
  });

  it("keeps requested filters and drops filters that came only from context", () => {
    expect(constrainAiHelperEmailSearchInput({
      label: "Receipts",
      state: "inbox",
      to: "owner@example.test",
      limit: 100,
    }, {
      prompt: "Check receipts from the primary account in the inbox",
      filterEvidence: undefined,
    }))
      .toEqual({
        label: "Receipts",
        state: "inbox",
        limit: 100,
      });
  });

  it("accepts transformed filters only when their evidence is quoted from the request", () => {
    expect(constrainAiHelperEmailSearchInput({
      from: "billing.example",
      label: "Receipts",
      state: "archive",
      to: "owner@example.test",
      filterEvidence: {
        from: "billing team",
        label: "receipt messages",
        state: "saved mail",
        to: "primary account",
      },
    }, { prompt: "Find receipt messages from the billing team in saved mail for my primary account" }))
      .toEqual({
        from: "billing.example",
        label: "Receipts",
        state: "archive",
        to: "owner@example.test",
      });
  });

  it("preserves inherited scope for a short follow-up", () => {
    expect(constrainAiHelperEmailSearchInput({
      label: "Receipts",
      state: "inbox",
      to: "owner@example.test",
    }, { allowInheritedScope: true, prompt: "delete them" }))
      .toEqual({
        label: "Receipts",
        state: "inbox",
        to: "owner@example.test",
      });
  });

  it("uses totalMatches instead of the final page size", () => {
    const toolResults = [
      findEmailResult({ offset: 0, returned: 100 }),
      findEmailResult({ offset: 100, returned: 100 }),
      findEmailResult({ offset: 200, returned: 100 }),
      findEmailResult({ offset: 300, returned: 47 }),
    ];

    const message = groundAiHelperEmailSearchMessage(
      "You have 47 emails labeled as Category Alpha. Most appear to be newsletters.",
      toolResults,
    );

    expect(message).toContain("**347 emails**");
    expect(message).toContain("the Category Alpha label");
    expect(message).not.toMatch(/\b47 emails\b/);
  });

  it("does not confuse preview size with the authoritative total", () => {
    const message = groundAiHelperEmailSearchMessage(
      "I found 10 emails matching that label in the preview.",
      [findEmailResult({ offset: 0, returned: 10, totalMatches: 347 })],
    );

    expect(message).toContain("Indexed database total: **347 emails**");
    expect(message).not.toMatch(/\b10 emails\b/);
  });

  it("leaves responses unchanged when no indexed database evidence exists", () => {
    expect(groundAiHelperEmailSearchMessage("Draft ready.", [])).toBe("Draft ready.");
  });

  it("preserves legitimate subset counts in the analysis", () => {
    const message = groundAiHelperEmailSearchMessage(
      "Three emails look urgent, while the rest appear promotional.",
      [findEmailResult({ offset: 0, returned: 100 })],
    );

    expect(message).toContain("Three emails look urgent");
    expect(message).toContain("**347 emails**");
  });

  it("describes an unfiltered count as all indexed mail", () => {
    const message = groundAiHelperEmailSearchMessage("You have 506 emails.", [{
      toolName: "find_email",
      input: { limit: 20 },
      result: { emails: { source: "indexed_database", returned: 20, totalMatches: 506, results: [] } },
    }]);

    expect(message).toContain("**506 emails**");
    expect(message).toContain("all indexed mail");
  });
});
