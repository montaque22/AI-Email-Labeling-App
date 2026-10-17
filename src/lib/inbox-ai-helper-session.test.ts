import { describe, expect, it } from "vitest";
import {
  INBOX_AI_HELPER_SESSION_CREATED_KEY,
  INBOX_AI_HELPER_SESSION_ID_KEY,
  INBOX_AI_HELPER_SESSION_KEY,
  resetInboxAiHelperSession,
} from "./inbox-ai-helper-session";

describe("resetInboxAiHelperSession", () => {
  it("clears chat history and rotates the agent session", () => {
    const values = new Map<string, string>([
      [INBOX_AI_HELPER_SESSION_KEY, "old conversation"],
      [INBOX_AI_HELPER_SESSION_ID_KEY, "old-session"],
      [INBOX_AI_HELPER_SESSION_CREATED_KEY, "1"],
    ]);
    const storage = {
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    };

    const sessionId = resetInboxAiHelperSession(storage, {
      createId: () => "new-session",
      now: () => 1_729_126_800_000,
    });

    expect(sessionId).toBe("new-session");
    expect(values.has(INBOX_AI_HELPER_SESSION_KEY)).toBe(false);
    expect(values.get(INBOX_AI_HELPER_SESSION_ID_KEY)).toBe("new-session");
    expect(values.get(INBOX_AI_HELPER_SESSION_CREATED_KEY)).toBe("1729126800000");
  });
});
