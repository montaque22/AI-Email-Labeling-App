import { useEffect, useState } from "react";

export function useVisualViewportHeight() {
  const [height, setHeight] = useState<number | null>(() => getVisualViewportHeight());

  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => setHeight(getVisualViewportHeight());
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return height;
}

function getVisualViewportHeight() {
  if (typeof window === "undefined") return null;
  return Math.round(window.visualViewport?.height ?? window.innerHeight);
}
