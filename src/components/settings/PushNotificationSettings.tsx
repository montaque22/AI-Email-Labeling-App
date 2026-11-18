import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Send } from "lucide-react";
import { refreshPwaUnreadBadge } from "../../lib/pwa-badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

type PushStatusResponse = {
  configured: boolean;
  publicKey: string;
  subscriptionCount: number;
};

type ViewStatus = "loading" | "unsupported" | "denied" | "disabled" | "enabled";

export function PushNotificationSettings() {
  const [status, setStatus] = useState<ViewStatus>("loading");
  const [serverStatus, setServerStatus] = useState<PushStatusResponse | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadStatus();
  }, []);

  async function loadStatus() {
    setError(null);
    if (!supportsWebPush()) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
    }
    try {
      const [response, registration] = await Promise.all([
        fetch("/api/push-notifications/status", { credentials: "include", cache: "no-store" }),
        navigator.serviceWorker.ready,
      ]);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load notification settings.");
      const currentSubscription = await registration.pushManager.getSubscription();
      setServerStatus(data);
      setSubscription(currentSubscription);
      setStatus(currentSubscription ? "enabled" : Notification.permission === "denied" ? "denied" : "disabled");
    } catch (caught) {
      setStatus("disabled");
      setError(caught instanceof Error ? caught.message : "Could not load notification settings.");
    }
  }

  async function enableNotifications() {
    if (!serverStatus) {
      await loadStatus();
      return;
    }
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "disabled");
        setError(permission === "denied"
          ? "Notifications are blocked. Allow them in your browser or device settings, then try again."
          : "Notification permission was not granted.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      const nextSubscription = current ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(serverStatus.publicKey),
      });
      const response = await fetch("/api/push-notifications/subscriptions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSubscription.toJSON()),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not save this notification subscription.");
      setSubscription(nextSubscription);
      setStatus("enabled");
      setServerStatus((currentStatus) => currentStatus
        ? { ...currentStatus, subscriptionCount: Math.max(1, currentStatus.subscriptionCount) }
        : currentStatus);
      setMessage("Notifications are enabled on this device.");
      void refreshPwaUnreadBadge();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not enable notifications.");
    } finally {
      setIsSaving(false);
    }
  }

  async function disableNotifications() {
    if (!subscription) return;
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/push-notifications/subscriptions", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not remove this notification subscription.");
      await subscription.unsubscribe();
      setSubscription(null);
      setStatus("disabled");
      setServerStatus((currentStatus) => currentStatus
        ? { ...currentStatus, subscriptionCount: Math.max(0, currentStatus.subscriptionCount - 1) }
        : currentStatus);
      setMessage("Notifications are disabled on this device.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not disable notifications.");
    } finally {
      setIsSaving(false);
    }
  }

  async function sendTestNotification() {
    setIsTesting(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/push-notifications/test", { method: "POST", credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not send the test notification.");
      setMessage(data.delivered > 0 ? "Test notification sent." : "No active notification subscription received the test.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the test notification.");
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />Push notifications</CardTitle>
        <CardDescription>
          Notify this device after polling finishes processing and labeling a new email. The installed app badge tracks unread inbox email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-zinc-200 bg-white/50 p-4 text-sm">
          <p className="font-medium text-zinc-950">{statusLabel(status)}</p>
          <p className="mt-1 text-zinc-500">
            {status === "unsupported"
              ? "This browser or app shell does not expose standards-based Web Push."
              : status === "denied"
                ? "Notifications are blocked in browser or device settings."
                : `${serverStatus?.subscriptionCount ?? 0} registered device${serverStatus?.subscriptionCount === 1 ? "" : "s"}. On iPhone and iPad, install Emailable on the Home Screen before enabling notifications.`}
          </p>
        </div>

        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

        <div className="flex flex-wrap gap-2">
          {status === "enabled" ? (
            <Button disabled={isSaving} onClick={() => void disableNotifications()} type="button" variant="outline">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />}Disable on this device
            </Button>
          ) : (
            <Button disabled={isSaving || status === "loading" || status === "unsupported" || status === "denied"} onClick={() => void enableNotifications()} type="button">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}Enable notifications
            </Button>
          )}
          <Button disabled={status !== "enabled" || isTesting} onClick={() => void sendTestNotification()} type="button" variant="outline">
            {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send test
          </Button>
        </div>
        <p className="text-xs text-zinc-500">Notification previews may show the sender, subject, and applied label on the lock screen.</p>
      </CardContent>
    </Card>
  );
}

export function supportsWebPush() {
  return typeof window !== "undefined"
    && window.isSecureContext
    && "Notification" in window
    && "serviceWorker" in navigator
    && "PushManager" in window;
}

export function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

function statusLabel(status: ViewStatus) {
  if (status === "loading") return "Checking notification support…";
  if (status === "enabled") return "Enabled on this device";
  if (status === "denied") return "Permission blocked";
  if (status === "unsupported") return "Not supported in this environment";
  return "Disabled on this device";
}
