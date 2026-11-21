export type PwaUpdateFunction = (reloadPage?: boolean) => Promise<void>;

type ServiceWorkerRegistrationLike = Pick<ServiceWorkerRegistration, "unregister" | "waiting">;
type ServiceWorkerContainerLike = Pick<ServiceWorkerContainer, "addEventListener" | "removeEventListener">;

type ApplyPwaUpdateOptions = {
  reload: () => void;
  registration?: ServiceWorkerRegistrationLike | null;
  serviceWorker?: ServiceWorkerContainerLike | null;
  timeoutMs?: number;
  updateServiceWorker: PwaUpdateFunction;
};

const DEFAULT_ACTIVATION_TIMEOUT_MS = 5_000;

/**
 * Activates a waiting service worker and always reloads, even if the PWA update
 * helper never settles. Some mobile browsers leave the helper promise pending
 * while an older worker still controls another tab.
 */
export async function applyPwaUpdate({
  reload,
  registration,
  serviceWorker,
  timeoutMs = DEFAULT_ACTIVATION_TIMEOUT_MS,
  updateServiceWorker,
}: ApplyPwaUpdateOptions): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let handleControllerChange: (() => void) | undefined;

  const controllerChanged = new Promise<void>((resolve) => {
    handleControllerChange = resolve;
    serviceWorker?.addEventListener("controllerchange", handleControllerChange, { once: true });
  });
  const activationTimedOut = new Promise<void>((resolve) => {
    timeoutId = setTimeout(resolve, timeoutMs);
  });

  try {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }

    // Do not await this promise. vite-plugin-pwa can leave it pending on iOS and
    // Chromium when another client still holds the previous worker.
    void updateServiceWorker(false).catch(() => undefined);
    const activated = await Promise.race([
      controllerChanged.then(() => true),
      activationTimedOut.then(() => false),
    ]);
    if (!activated) {
      // A broken or permanently blocked worker must not keep serving the old app
      // shell after the fallback reload. The app registers a fresh worker on load.
      await registration?.unregister().catch(() => false);
    }
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    if (handleControllerChange) serviceWorker?.removeEventListener("controllerchange", handleControllerChange);
    reload();
  }
}
