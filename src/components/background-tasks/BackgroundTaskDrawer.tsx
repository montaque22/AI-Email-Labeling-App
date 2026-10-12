import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "../ui/button";
import { LiquidGlassCard } from "../ui/liquid-glass";
import { fetchNoStore } from "../../lib/http";
import { refreshPwaUnreadBadge } from "../../lib/pwa-badge";
import { cn } from "../../lib/utils";
import { BackgroundTaskRow } from "./BackgroundTaskRow";
import type { BackgroundTask, BackgroundTaskUser } from "./types";

type BackgroundTaskDrawerProps = {
  user: BackgroundTaskUser | null;
};

const POLL_INTERVAL_MS = 2500;
const REFRESH_EVENT = "emailable:background-tasks-refresh";
const POLLING_COMPLETE_EVENT = "emailable:polling-complete";

/**
 * Turns a task that was running and is no longer reported into an honest interrupted row.
 *
 * The server keeps tasks in memory only, so a restart drops them. Before this, the row simply
 * disappeared from the drawer, which reads identically to "it finished" — the one message that
 * is certainly wrong.
 */
function toInterruptedTask(task: BackgroundTask): BackgroundTask {
  return {
    ...task,
    status: "interrupted",
    message: "Emailable restarted before this finished, so its result is unknown.",
    description: task.type === "rule_review_apply"
      ? "The rule itself is saved. Open it again to re-apply the label to the provider email."
      : "Run it again if you still need it.",
    updatedAt: new Date().toISOString(),
  };
}

export function BackgroundTaskDrawer({ user }: BackgroundTaskDrawerProps) {
  const [serverTasks, setServerTasks] = useState<BackgroundTask[]>([]);
  // Held separately from `serverTasks`: the server has forgotten these, so every subsequent
  // poll would otherwise wipe them out again.
  const [interruptedTasks, setInterruptedTasks] = useState<BackgroundTask[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const lastCompletedTaskIdsRef = useRef(new Set<string>());
  const runningTasksRef = useRef(new Map<string, BackgroundTask>());

  async function loadTasks() {
    if (!user) {
      setServerTasks([]);
      return;
    }

    try {
      const response = await fetchNoStore("/api/background-tasks");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return;
      }

      const nextTasks = Array.isArray(data.tasks) ? data.tasks as BackgroundTask[] : [];
      const nextTaskIds = new Set(nextTasks.map((task) => task.id));
      // Only a *successful* response can prove a task is gone. A failed request leaves
      // `runningTasksRef` alone so a flaky network never fakes an interruption.
      const vanished = [...runningTasksRef.current.values()].filter((task) => !nextTaskIds.has(task.id));
      runningTasksRef.current = new Map(
        nextTasks.filter((task) => task.status === "running").map((task) => [task.id, task]),
      );

      setServerTasks(nextTasks);
      if (vanished.length > 0) {
        setInterruptedTasks((current) => [
          ...current.filter((task) => !nextTaskIds.has(task.id)),
          ...vanished.map(toInterruptedTask),
        ]);
      }

      for (const task of nextTasks) {
        if (task.status === "running" || lastCompletedTaskIdsRef.current.has(task.id)) {
          continue;
        }
        lastCompletedTaskIdsRef.current.add(task.id);
        if (task.type === "polling") {
          void refreshPwaUnreadBadge();
          window.dispatchEvent(new Event(POLLING_COMPLETE_EVENT));
        }
      }
    } catch {
      // Background task polling is best effort.
    }
  }

  useEffect(() => {
    if (!user) {
      setServerTasks([]);
      setInterruptedTasks([]);
      runningTasksRef.current = new Map();
      return;
    }

    void loadTasks();
    const intervalId = window.setInterval(() => {
      void loadTasks();
    }, POLL_INTERVAL_MS);
    const handleRefresh = () => {
      void loadTasks();
    };
    window.addEventListener(REFRESH_EVENT, handleRefresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener(REFRESH_EVENT, handleRefresh);
    };
  }, [user?.email]);

  const visibleTasks = [...serverTasks, ...interruptedTasks];
  const runningCount = visibleTasks.filter((task) => task.status === "running").length;
  const errorCount = visibleTasks.filter((task) => task.status === "error").length;
  const warningCount = visibleTasks.filter((task) => task.status === "warning" || task.status === "interrupted").length;
  const successCount = visibleTasks.filter((task) => task.status === "success").length;

  useEffect(() => {
    if (visibleTasks.length === 0) {
      setIsOpen(false);
    }
  }, [visibleTasks.length]);

  useEffect(() => {
    document.body.classList.toggle("emailable-background-tasks-visible", Boolean(user && visibleTasks.length > 0));
    return () => {
      document.body.classList.remove("emailable-background-tasks-visible");
    };
  }, [user, visibleTasks.length]);

  if (!user || visibleTasks.length === 0) {
    return null;
  }

  async function dismissAll() {
    setIsDismissing(true);
    try {
      // Interrupted rows exist only on this client, so they are cleared here rather than by
      // the response. Done first so a failing request still clears what it can.
      setInterruptedTasks([]);
      const response = await fetch("/api/background-tasks", {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setServerTasks(Array.isArray(data.tasks) ? data.tasks as BackgroundTask[] : []);
      }
    } finally {
      setIsDismissing(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-[9000] flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="relative rounded-full border border-white/70 bg-white/85 px-4 py-2 text-sm font-medium text-zinc-800 shadow-lg backdrop-blur-xl transition hover:bg-white"
        >
          {runningCount > 0 ? "Background tasks" : errorCount > 0 || warningCount > 0 ? "Task needs attention" : "Task complete"}
          {errorCount + warningCount > 0 ? (
            <span
              className={cn(
                "absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-semibold text-white",
                errorCount > 0 ? "bg-red-600" : "bg-amber-500",
              )}
            >
              {errorCount + warningCount}
            </span>
          ) : null}
        </button>
      ) : (
        <LiquidGlassCard
          borderRadius="16px"
          blurIntensity="sm"
          glowIntensity="sm"
          shadowIntensity="sm"
          className="w-[min(420px,calc(100vw-2rem))] bg-white/70 p-0 text-zinc-900"
        >
          <div className="flex items-start justify-between gap-3 border-b border-white/60 px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold">Background tasks</h3>
              <p className="text-xs text-zinc-500">
                {runningCount > 0 ? `${runningCount} running` : `${successCount} complete`}
                {errorCount > 0 ? `, ${errorCount} error${errorCount === 1 ? "" : "s"}` : ""}
                {warningCount > 0 ? `, ${warningCount} warning${warningCount === 1 ? "" : "s"}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                disabled={isDismissing || visibleTasks.every((task) => task.status === "running")}
                onClick={dismissAll}
                size="sm"
                variant="outline"
              >
                Dismiss all
              </Button>
              <button
                aria-label="Close background tasks"
                className="rounded-full p-1 text-zinc-500 transition hover:bg-white/70 hover:text-zinc-900"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="max-h-80 space-y-3 overflow-y-auto px-4 py-3">
            {visibleTasks.map((task) => (
              <BackgroundTaskRow key={task.id} task={task} />
            ))}
          </div>
        </LiquidGlassCard>
      )}
    </div>
  );
}
