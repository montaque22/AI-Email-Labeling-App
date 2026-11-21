import { useEffect } from "react";
import { syncPushSubscription } from "../lib/push-subscription";

export function usePushSubscriptionSync(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;

    let synchronization: Promise<unknown> | null = null;
    const synchronize = () => {
      if (synchronization) return;
      synchronization = syncPushSubscription()
        .catch((error) => console.warn("Push subscription synchronization failed:", error))
        .finally(() => { synchronization = null; });
    };
    const synchronizeWhenVisible = () => {
      if (document.visibilityState === "visible") synchronize();
    };

    synchronize();
    window.addEventListener("online", synchronize);
    window.addEventListener("focus", synchronize);
    document.addEventListener("visibilitychange", synchronizeWhenVisible);
    return () => {
      window.removeEventListener("online", synchronize);
      window.removeEventListener("focus", synchronize);
      document.removeEventListener("visibilitychange", synchronizeWhenVisible);
    };
  }, [userId]);
}
