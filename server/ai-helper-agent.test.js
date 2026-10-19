import { describe, expect, it } from "vitest";
import {
  buildAiHelperMessages,
  buildAiHelperSystemPrompt,
  buildAiHelperVerificationPrompt,
  calculateInboxAgentValues,
} from "./ai-helper-agent.js";

describe("inbox agent policy", () => {
  it("sends the current user prompt without appending synthetic context", () => {
    const messages = buildAiHelperMessages([
      { role: "user", text: "Find messages from Acme" },
      { role: "assistant", text: "I found 12 messages." },
    ], "Archive them");

    expect(messages).toEqual([
      { role: "user", content: "Find messages from Acme" },
      { role: "assistant", content: "I found 12 messages." },
      { role: "user", content: "Archive them" },
    ]);
  });

  it("delegates flexible database-first work to the model and tools", () => {
    const prompt = buildAiHelperSystemPrompt();

    expect(prompt).toContain("any email account");
    expect(prompt).toContain("call find_email first");
    expect(prompt).toContain("including requests for all mail with no filters");
    expect(prompt).toContain("You decide which tool properties and filters are needed");
    expect(prompt).toContain("Use the calculate tool whenever the answer requires arithmetic");
    expect(prompt).toContain("inspect your tool results again");
  });

  it("does not contain user-specific accounts or labels", () => {
    const prompt = buildAiHelperSystemPrompt();

    expect(prompt).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(prompt).not.toContain("General");
  });

  it("gives the verifier the request, history, evidence, and candidate answer", () => {
    const prompt = buildAiHelperVerificationPrompt({
      candidate: "The result is 50%.",
      history: "assistant: There are 25 matching messages.",
      request: "What percentage is that?",
      toolResults: '[{"totalMatches":100}]',
    });

    expect(prompt).toContain("What percentage is that?");
    expect(prompt).toContain("There are 25 matching messages.");
    expect(prompt).toContain('"totalMatches":100');
    expect(prompt).toContain("The result is 50%.");
    expect(prompt).toContain("fix unsupported claims, scope mistakes, arithmetic errors");
  });

  it("calculates percentages from authoritative counts", () => {
    expect(calculateInboxAgentValues({ operation: "percentage", left: 379, right: 508 }).result)
      .toBeCloseTo(74.606299, 6);
  });

  it("rejects division by zero", () => {
    expect(() => calculateInboxAgentValues({ operation: "divide", left: 10, right: 0 }))
      .toThrow("Cannot divide by zero");
  });
});
