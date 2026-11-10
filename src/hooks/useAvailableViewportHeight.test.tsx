// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAvailableViewportHeight } from "./useAvailableViewportHeight";

function HeightProbe() {
  const ref = useRef<HTMLDivElement>(null);
  const height = useAvailableViewportHeight(ref, true);
  return (
    <div ref={ref} data-testid="height-probe">
      {height ?? "unset"}
    </div>
  );
}

describe("useAvailableViewportHeight", () => {
  const originalMatchMedia = window.matchMedia;
  const originalVisualViewport = window.visualViewport;
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
      addEventListener: vi.fn(),
      matches: true,
      media: "(min-width: 768px)",
      onchange: null,
      removeEventListener: vi.fn(),
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        height: 900,
        offsetTop: 0,
        removeEventListener: vi.fn(),
      },
    });
    HTMLElement.prototype.getBoundingClientRect = vi.fn().mockReturnValue({ top: 250 });
  });

  afterEach(() => {
    cleanup();
    window.matchMedia = originalMatchMedia;
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: originalVisualViewport,
    });
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it("fills the remaining desktop viewport below the workspace", () => {
    render(<HeightProbe />);
    expect(screen.getByTestId("height-probe").textContent).toBe("650");
  });
});
