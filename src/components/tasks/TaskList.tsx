import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "../ui/button";
import { LiquidGlassCard } from "../ui/liquid-glass";
import type { Task } from "./types";

type TaskListProps = {
  tasks: Task[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onEdit: (task: Task) => void;
};

export function TaskList({ tasks, expanded, onExpandedChange, onEdit }: TaskListProps) {
  const visibleTasks = expanded ? tasks : tasks.slice(0, 5);

  return (
    <LiquidGlassCard shadowIntensity="xs" borderRadius="8px" glowIntensity="none" className="bg-white/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">Remaining tasks</h2>
          <p className="text-sm text-zinc-600">{tasks.length} task{tasks.length === 1 ? "" : "s"} outside the top three.</p>
        </div>
        {tasks.length > 5 ? (
          <Button variant="outline" onClick={() => onExpandedChange(!expanded)}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {expanded ? "Show less" : "Show more"}
          </Button>
        ) : null}
      </div>

      <div className="mt-4 divide-y divide-zinc-200/70">
        {visibleTasks.length ? (
          visibleTasks.map((task) => (
            <button
              type="button"
              key={task.id}
              className="flex w-full items-center justify-between gap-3 py-3 text-left transition hover:bg-white/40"
              onClick={() => onEdit(task)}
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-zinc-950">{task.title}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
                  <span>Priority {task.priority}</span>
                  <span>Score {Math.round(task.effectiveScore)}</span>
                  {task.dueDate ? <span>Due {new Date(task.dueDate).toLocaleDateString()}</span> : null}
                  {task.deferCount ? <span>Deferred {task.deferCount}</span> : null}
                </div>
              </div>
              <span className="shrink-0 text-sm text-zinc-500">{task.project || "No project"}</span>
            </button>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
            No remaining tasks.
          </div>
        )}
      </div>
    </LiquidGlassCard>
  );
}
