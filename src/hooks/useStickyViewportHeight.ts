import { type RefObject, useLayoutEffect, useState } from "react";

const DESKTOP_QUERY = "(min-width: 768px)";
const DESKTOP_HEADER_HEIGHT = 64;
const MINIMUM_WORKSPACE_HEIGHT = 240;

/**
 * Keeps a sticky desktop workspace inside the currently visible viewport.
 * Before it reaches the header its height grows as the page scrolls; once it
 * sticks, it fills the viewport below the header.
 */
export function useStickyViewportHeight(ref: RefObject<HTMLElement | null>) {
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia(DESKTOP_QUERY);

    const update = () => {
      if (!mediaQuery.matches || !ref.current) {
        setHeight(null);
        return;
      }
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const workspaceTop = Math.max(viewportTop + DESKTOP_HEADER_HEIGHT, ref.current.getBoundingClientRect().top);
      setHeight(Math.max(MINIMUM_WORKSPACE_HEIGHT, Math.floor(viewportBottom - workspaceTop)));
    };

    update();
    mediaQuery.addEventListener("change", update);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (ref.current) observer?.observe(ref.current.parentElement ?? ref.current);

    return () => {
      mediaQuery.removeEventListener("change", update);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [ref]);

  return height;
}
