// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStickyViewportHeight } from "./useStickyViewportHeight";

function HeightProbe() {
  const ref = useRef<HTMLDivElement>(null);
  const height = useStickyViewportHeight(ref);
  return <div data-testid="workspace" ref={ref}>{height ?? "unset"}</div>;
}

describe("useStickyViewportHeight", () => {
  const originalMatchMedia = window.matchMedia;
  const originalVisualViewport = window.visualViewport;
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  let top = 320;

  beforeEach(() => {
    top = 320;
    window.matchMedia = vi.fn().mockReturnValue({
      addEventListener: vi.fn(),
      matches: true,
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
    HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({ top }) as DOMRect);
  });

  afterEach(() => {
    cleanup();
    window.matchMedia = originalMatchMedia;
    Object.defineProperty(window, "visualViewport", { configurable: true, value: originalVisualViewport });
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  });

  it("keeps the composer area inside the viewport and grows to full height when sticky", () => {
    render(<HeightProbe />);
    expect(screen.getByTestId("workspace").textContent).toBe("580");

    top = 64;
    act(() => window.dispatchEvent(new Event("scroll")));
    expect(screen.getByTestId("workspace").textContent).toBe("836");
  });
});
