// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InterestCompletionActions } from "./InterestCompletionActions";

afterEach(cleanup);

describe("InterestCompletionActions", () => {
  it("provides every mutually exclusive completion path", () => {
    const handlers = { onArchive: vi.fn(), onCommitment: vi.fn(), onDelete: vi.fn(), onReturn: vi.fn() };
    render(<InterestCompletionActions {...handlers} />);
    for (const label of ["Return", "Archive", "Delete", "Commitment"]) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}`) }));
    }
    expect(handlers.onReturn).toHaveBeenCalledOnce();
    expect(handlers.onArchive).toHaveBeenCalledOnce();
    expect(handlers.onDelete).toHaveBeenCalledOnce();
    expect(handlers.onCommitment).toHaveBeenCalledOnce();
  });
});
