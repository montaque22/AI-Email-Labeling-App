import { fetchNoStore } from "./http";

type AppBadgeNavigator = {
  clearAppBadge?: () => Promise<void>;
  setAppBadge?: (contents?: number) => Promise<void>;
};

function getAppBadgeNavigator(): AppBadgeNavigator | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  const badgeNavigator = navigator as unknown as AppBadgeNavigator;
  return typeof badgeNavigator.setAppBadge === "function" || typeof badgeNavigator.clearAppBadge === "function"
    ? badgeNavigator
    : null;
}

export async function clearPwaUnreadBadge() {
  const badgeNavigator = getAppBadgeNavigator();
  if (!badgeNavigator?.clearAppBadge) {
    return;
  }

  try {
    await badgeNavigator.clearAppBadge();
  } catch {
    // Badge support varies by browser and should never block app usage.
  }
}

export async function refreshPwaUnreadBadge() {
  const badgeNavigator = getAppBadgeNavigator();
  if (!badgeNavigator) {
    return;
  }

  try {
    const response = await fetchNoStore("/api/inbox/unread-count");
    const data = await response.json().catch(() => ({}));
    const count = response.ok ? Number(data.count ?? 0) : 0;
    if (count > 0 && badgeNavigator.setAppBadge) {
      await badgeNavigator.setAppBadge(count);
    } else if (badgeNavigator.clearAppBadge) {
      await badgeNavigator.clearAppBadge();
    }
  } catch {
    // Badge support is best-effort and should never affect inbox use.
  }
}
