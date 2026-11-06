import { describe, expect, it } from "vitest";
import { parseCommitmentInput } from "./inbox.js";

const messages = [{ accountId: "11111111-1111-4111-8111-111111111111", emailId: "email-1", mailbox: "INBOX" }];

describe("commitment input", () => {
  it("allows one-step creation without a deadline", () => {
    const result = parseCommitmentInput({ messages, text: "Review the proposal" });
    expect(result.ok).toBe(true);
    expect(result.action.dueAt).toBeNull();
    expect(result.action.messages[0].emailId).toBe("email-1");
  });

  it("preserves optional valid deadlines and rejects fabricated invalid values", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(parseCommitmentInput({ dueAt: future, messages, text: "Reply" }).action.dueAt.toISOString()).toBe(future);
    expect(parseCommitmentInput({ dueAt: "not-a-date", messages, text: "Reply" }).ok).toBe(false);
  });

  it("requires only a short title and source email identity", () => {
    expect(parseCommitmentInput({ messages, text: "" }).ok).toBe(false);
    expect(parseCommitmentInput({ messages: [], text: "Reply" }).ok).toBe(false);
  });
});
