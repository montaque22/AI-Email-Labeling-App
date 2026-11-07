import { describe, expect, it } from "vitest";
import {
  buildReplyComposerFields,
  createReplyDraftArtifact,
  formatReplyDraftForAgent,
  getActiveReplyDraftVersion,
  restorePreviousReplyDraftVersion,
  type PreparedReplyDraft,
} from "./work-artifacts";

const prepared: PreparedReplyDraft = {
  accountId: "account-a",
  bodyText: "Thanks for the update.",
  emailId: "email-a",
  subject: "Re: Project update",
  threadId: "thread-a",
  to: "sender@example.com",
  type: "email_draft",
};

describe("Work mode reply artifacts", () => {
  it("versions refinements without losing the previous draft", () => {
    const first = createReplyDraftArtifact(prepared, undefined, "2026-11-06T10:00:00.000Z");
    const second = createReplyDraftArtifact({ ...prepared, bodyText: "Thanks. I will review it tomorrow." }, first, "2026-11-06T10:01:00.000Z");

    expect(second.versions).toHaveLength(2);
    expect(getActiveReplyDraftVersion(second).bodyText).toContain("tomorrow");
    expect(getActiveReplyDraftVersion(restorePreviousReplyDraftVersion(second)).bodyText).toBe("Thanks for the update.");
  });

  it("keeps account, message, and thread context in agent history", () => {
    const artifact = createReplyDraftArtifact(prepared);
    const history = formatReplyDraftForAgent(artifact);

    expect(history).toContain("accountId: account-a");
    expect(history).toContain("emailId: email-a");
    expect(history).toContain("threadId: thread-a");
    expect(history).toContain("Thanks for the update.");
  });

  it("builds a composer payload from the active version without sending", () => {
    const artifact = createReplyDraftArtifact(prepared);

    expect(buildReplyComposerFields(artifact)).toEqual({
      accountId: "account-a",
      bodyText: "Thanks for the update.",
      subject: "Re: Project update",
      threadId: "thread-a",
      to: "sender@example.com",
    });
  });

  it("isolates artifacts created for different threads", () => {
    const first = createReplyDraftArtifact(prepared);
    const second = createReplyDraftArtifact({ ...prepared, emailId: "email-b", threadId: "thread-b" });

    expect(first.threadId).not.toBe(second.threadId);
    expect(first.id).not.toBe(second.id);
  });
});
