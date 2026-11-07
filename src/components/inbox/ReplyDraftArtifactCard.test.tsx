// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReplyDraftArtifactCard } from "./ReplyDraftArtifactCard";
import { createReplyDraftArtifact } from "./work-artifacts";

afterEach(cleanup);

describe("ReplyDraftArtifactCard", () => {
  it("shows the actual draft and exposes review actions", () => {
    const handlers = { onRefine: vi.fn(), onRestorePrevious: vi.fn(), onUseInReply: vi.fn() };
    const artifact = createReplyDraftArtifact({
      accountId: "account-a",
      bodyText: "Here is the complete generated reply.",
      emailId: "email-a",
      subject: "Re: Hello",
      threadId: "thread-a",
      to: "person@example.com",
      type: "email_draft",
    });
    render(<ReplyDraftArtifactCard artifact={artifact} {...handlers} />);

    expect(screen.getByText("Here is the complete generated reply.")).toBeTruthy();
    expect(screen.getByText(/person@example.com/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Use in Reply/i }));
    fireEvent.click(screen.getByRole("button", { name: /Refine/i }));
    expect(handlers.onUseInReply).toHaveBeenCalledOnce();
    expect(handlers.onRefine).toHaveBeenCalledOnce();
  });
});
