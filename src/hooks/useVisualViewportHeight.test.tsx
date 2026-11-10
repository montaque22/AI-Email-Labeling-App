// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useVisualViewportHeight } from "./useVisualViewportHeight";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "visualViewport");
});

function ViewportHeightProbe() {
  const height = useVisualViewportHeight();
  return <output aria-label="viewport height">{height}</output>;
}

describe("useVisualViewportHeight", () => {
  it("tracks visual viewport resize events used by mobile software keyboards", () => {
    const visualViewport = new EventTarget() as EventTarget & { height: number };
    visualViewport.height = 640;
    Object.defineProperty(window, "visualViewport", { configurable: true, value: visualViewport });

    render(<ViewportHeightProbe />);
    expect(screen.getByLabelText("viewport height").textContent).toBe("640");

    act(() => {
      visualViewport.height = 412;
      visualViewport.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByLabelText("viewport height").textContent).toBe("412");
  });
});
