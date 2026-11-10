import { type RefObject, useLayoutEffect, useState } from "react";

const DESKTOP_QUERY = "(min-width: 768px)";

export function useAvailableViewportHeight(ref: RefObject<HTMLElement>, enabled: boolean) {
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!enabled || typeof window.matchMedia !== "function") {
      setHeight(null);
      return;
    }

    const mediaQuery = window.matchMedia(DESKTOP_QUERY);
    const update = () => {
      if (!mediaQuery.matches || !ref.current) {
        setHeight(null);
        return;
      }
      const viewport = window.visualViewport;
      const viewportBottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);
      const available = Math.floor(viewportBottom - ref.current.getBoundingClientRect().top);
      setHeight(available > 0 ? available : null);
    };

    update();
    mediaQuery.addEventListener("change", update);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      mediaQuery.removeEventListener("change", update);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [enabled, ref]);

  return height;
}
