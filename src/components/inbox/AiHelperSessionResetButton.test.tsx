// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiHelperSessionResetButton } from "./AiHelperSessionResetButton";

afterEach(cleanup);

describe("AiHelperSessionResetButton", () => {
  it("starts a new session when clicked", () => {
    const onReset = vi.fn();

    render(<AiHelperSessionResetButton onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: "Start a new AI Helper session" }));

    expect(onReset).toHaveBeenCalledOnce();
  });

  it("cannot reset while the agent is responding", () => {
    const onReset = vi.fn();

    render(<AiHelperSessionResetButton disabled onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: "Start a new AI Helper session" }));

    expect(onReset).not.toHaveBeenCalled();
  });
});
