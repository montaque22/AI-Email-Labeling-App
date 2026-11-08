import { describe, expect, it } from "vitest";
import { AI_HELPER_GENERALIZATION_EVALUATIONS } from "./ai-helper-evaluations.js";

describe("Work Mode generalization evaluation corpus", () => {
  it("covers unrelated investigation, action, recovery, and safety categories", () => {
    const categories = new Set(AI_HELPER_GENERALIZATION_EVALUATIONS.map((evaluation) => evaluation.category));

    expect(categories.size).toBe(AI_HELPER_GENERALIZATION_EVALUATIONS.length);
    expect(categories).toEqual(new Set([
      "current-context",
      "cross-source-retrieval",
      "unfamiliar-research",
      "personal-plus-public-context",
      "multi-step-action",
      "resolvable-ambiguity",
      "tool-failure-recovery",
      "authorization-boundary",
      "capability-limit",
    ]));
  });

  it("records explicit expectations rather than phrase-to-handler mappings", () => {
    for (const evaluation of AI_HELPER_GENERALIZATION_EVALUATIONS) {
      expect(evaluation.request.length).toBeGreaterThan(20);
      expect(Object.keys(evaluation.expected).length).toBeGreaterThan(0);
      expect(evaluation).not.toHaveProperty("intentHandler");
      expect(evaluation).not.toHaveProperty("triggerPhrase");
    }
  });
});
