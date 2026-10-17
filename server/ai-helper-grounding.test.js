import { describe, expect, it } from "vitest";
import { groundAiHelperEmailSearchMessage } from "./byoai.js";

function findEmailResult({ offset, returned, totalMatches = 379 }) {
  return {
    toolName: "find_email",
    input: { label: "General", limit: 100, offset, searchConnectedAccounts: false },
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
  it("uses totalMatches instead of the final page size", () => {
    const toolResults = [
      findEmailResult({ offset: 0, returned: 100 }),
      findEmailResult({ offset: 100, returned: 100 }),
      findEmailResult({ offset: 200, returned: 100 }),
      findEmailResult({ offset: 300, returned: 79 }),
    ];

    const message = groundAiHelperEmailSearchMessage(
      "You have 79 emails labeled as General. Most appear to be newsletters.",
      toolResults,
    );

    expect(message).toContain("**379 emails**");
    expect(message).toContain("the General label");
    expect(message).not.toMatch(/\b79 emails\b/);
  });

  it("does not confuse preview size with the authoritative total", () => {
    const message = groundAiHelperEmailSearchMessage(
      "I found 10 emails matching that label in the preview.",
      [findEmailResult({ offset: 0, returned: 10, totalMatches: 379 })],
    );

    expect(message).toContain("Indexed database total: **379 emails**");
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
    expect(message).toContain("**379 emails**");
  });
});
