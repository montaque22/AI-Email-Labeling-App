// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBodyScrollLock, useIsMobileViewport } from "./useResponsiveScrollLock";

function HelperScrollLock() {
  const isMobileViewport = useIsMobileViewport();
  useBodyScrollLock(isMobileViewport);
  return null;
}

describe("responsive helper scroll lock", () => {
  afterEach(() => {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    vi.unstubAllGlobals();
  });

  it("keeps the page scrollable on desktop", () => {
    stubMatchMedia(false);
    render(<HelperScrollLock />);

    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("locks page scrolling on mobile", () => {
    stubMatchMedia(true);
    render(<HelperScrollLock />);

    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");
  });
});

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
    addEventListener: vi.fn(),
    matches,
    media: "(max-width: 767px)",
    removeEventListener: vi.fn(),
  }));
}
