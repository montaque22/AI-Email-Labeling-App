import { useEffect, useRef } from "react";
import { getRuntimeUrl } from "../lib/runtime-base";

export type InboxRealtimeChange = {
  reason: string;
  messages: Array<{ accountId: string; emailId: string; mailbox: string }>;
  timestamp?: string;
};

export function useInboxRealtimeSync(onChange: (change: InboxRealtimeChange) => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    function handleServiceWorkerMessage(event: MessageEvent) {
      if (event.data?.type !== "emailable:inbox-changed") return;
      onChangeRef.current(normalizeChange(event.data.payload));
    }

    navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);
    const eventSource = typeof EventSource === "function"
      ? new EventSource(getRuntimeUrl("/api/inbox/events"), { withCredentials: true })
      : null;
    eventSource?.addEventListener("inbox-changed", (event) => {
      try {
        onChangeRef.current(normalizeChange(JSON.parse((event as MessageEvent).data)));
      } catch {
        onChangeRef.current(normalizeChange(null));
      }
    });

    return () => {
      eventSource?.close();
      navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
    };
  }, []);
}

function normalizeChange(value: unknown): InboxRealtimeChange {
  if (!value || typeof value !== "object") return { reason: "updated", messages: [] };
  const change = value as Partial<InboxRealtimeChange>;
  return {
    reason: typeof change.reason === "string" ? change.reason : "updated",
    messages: Array.isArray(change.messages) ? change.messages : [],
    timestamp: typeof change.timestamp === "string" ? change.timestamp : undefined,
  };
}
