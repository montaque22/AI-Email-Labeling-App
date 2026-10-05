import { cn } from "../../lib/utils";
import type { BackgroundTask, BackgroundTaskStatus } from "./types";

type BackgroundTaskRowProps = {
  task: BackgroundTask;
};

const STATUS_LABELS: Record<BackgroundTaskStatus, string> = {
  running: "Running",
  success: "Complete",
  warning: "Warning",
  error: "Error",
  interrupted: "Interrupted",
};

const STATUS_BADGE_CLASSES: Record<BackgroundTaskStatus, string> = {
  running: "bg-blue-50 text-blue-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  error: "bg-red-50 text-red-700",
  interrupted: "bg-amber-50 text-amber-700",
};

const STATUS_BAR_CLASSES: Record<BackgroundTaskStatus, string> = {
  running: "bg-blue-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
  interrupted: "bg-amber-500",
};

const STATUS_TEXT_CLASSES: Record<BackgroundTaskStatus, string> = {
  running: "text-zinc-500",
  success: "text-zinc-500",
  warning: "text-amber-700",
  error: "text-red-700",
  interrupted: "text-amber-700",
};

/**
 * An interrupted task must not read "Done": its counters are whatever they were when the
 * server stopped reporting it, which is explicitly not a finished state.
 */
function footerLabel(task: BackgroundTask, done: number, total: number): string {
  if (task.status === "interrupted") {
    return total > 0 ? `Stopped at ${done}/${total}` : "Stopped";
  }

  if (total > 0) {
    return `${done}/${total}`;
  }

  return task.status === "running" ? "Preparing" : "Done";
}

export function BackgroundTaskRow({ task }: BackgroundTaskRowProps) {
  const done = Math.max(0, Number(task.completed ?? 0) + Number(task.failed ?? 0));
  const total = Math.max(0, Number(task.total ?? 0));
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : task.status === "running" ? 20 : 100;
  const detailMessage = task.status === "success" || task.status === "running"
    ? task.message
    : task.errors?.[0]?.message || task.message;
  const description = task.description || task.errors?.[0]?.description || "";

  return (
    <div className="rounded-xl border border-white/70 bg-white/65 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-900">{task.title}</p>
          <p className={cn("mt-1 text-xs", STATUS_TEXT_CLASSES[task.status])}>
            {detailMessage}
          </p>
          {description ? <p className="mt-2 text-xs leading-relaxed text-zinc-600">{description}</p> : null}
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-1 text-[11px] font-medium", STATUS_BADGE_CLASSES[task.status])}>
          {STATUS_LABELS[task.status]}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200/80">
        <div
          className={cn("h-full rounded-full transition-all", STATUS_BAR_CLASSES[task.status])}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-zinc-500">
        <span>{footerLabel(task, done, total)}</span>
        {task.failed > 0 ? <span>{task.failed} failed</span> : null}
      </div>
    </div>
  );
}
