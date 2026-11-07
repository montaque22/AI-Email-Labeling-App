// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InboxViewToggle } from "./InboxViewToggle";

afterEach(cleanup);

describe("InboxViewToggle", () => {
  it("switches between Dashboard and All Mail", () => {
    const onChange = vi.fn();
    render(<InboxViewToggle onChange={onChange} value="dashboard" />);
    fireEvent.click(screen.getByRole("button", { name: "All Mail" }));
    expect(onChange).toHaveBeenCalledWith("all-mail");
  });
});
