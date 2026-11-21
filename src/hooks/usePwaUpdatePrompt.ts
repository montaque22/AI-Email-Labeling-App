import { useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { applyPwaUpdate, type PwaUpdateFunction } from "../lib/pwa-update";

export function usePwaUpdatePrompt() {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [isUpdateCollapsed, setIsUpdateCollapsed] = useState(false);
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== "undefined" ? !navigator.onLine : false);
  const [isUpdating, setIsUpdating] = useState(false);
  const updateServiceWorkerRef = useRef<PwaUpdateFunction | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false);
    }

    function handleOffline() {
      setIsOffline(true);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || updateServiceWorkerRef.current) return;

    const cleanups: Array<() => void> = [];
    updateServiceWorkerRef.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        setIsUpdateAvailable(true);
        setIsUpdateCollapsed(false);
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        registrationRef.current = registration;
        const checkForUpdates = () => {
          if (navigator.onLine) void registration.update();
        };
        const intervalId = window.setInterval(checkForUpdates, 60 * 60 * 1000);
        document.addEventListener("visibilitychange", checkForUpdates);
        window.addEventListener("focus", checkForUpdates);
        cleanups.push(() => {
          window.clearInterval(intervalId);
          document.removeEventListener("visibilitychange", checkForUpdates);
          window.removeEventListener("focus", checkForUpdates);
        });
        checkForUpdates();
      },
      onRegisterError(error) {
        console.error("PWA registration failed:", error);
      },
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  async function applyUpdate() {
    const updateServiceWorker = updateServiceWorkerRef.current;
    if (!updateServiceWorker) {
      window.location.reload();
      return;
    }

    setIsUpdating(true);
    try {
      await applyPwaUpdate({
        registration: registrationRef.current,
        serviceWorker: navigator.serviceWorker,
        updateServiceWorker,
        reload: () => window.location.reload(),
      });
    } finally {
      // Useful in tests and browsers that suppress reload while backgrounded.
      setIsUpdating(false);
    }
  }

  return {
    applyUpdate,
    collapseUpdate: () => setIsUpdateCollapsed(true),
    expandUpdate: () => setIsUpdateCollapsed(false),
    isOffline,
    isUpdateAvailable,
    isUpdateCollapsed,
    isUpdating,
  };
}
