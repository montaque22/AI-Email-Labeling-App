import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "../ui/button";
import { LiquidGlassCard } from "../ui/liquid-glass";
import { getRuntimeUrl } from "../../lib/runtime-base";
import { TaskCard } from "./TaskCard";
import { TaskForm } from "./TaskForm";
import { TaskList } from "./TaskList";
import type { Task } from "./types";

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [remainingExpanded, setRemainingExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyTaskId, setBusyTaskId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadTasks();
  }, []);

  const topTasks = useMemo(() => tasks.slice(0, 3), [tasks]);
  const remainingTasks = useMemo(() => tasks.slice(3), [tasks]);

  async function loadTasks() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(getRuntimeUrl("/api/tasks"), { credentials: "include" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not load tasks");
      }
      setTasks(data.tasks || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load tasks");
    } finally {
      setLoading(false);
    }
  }

  function upsertTask(task: Task) {
    setTasks((current) => {
      const next = current.some((item) => item.id === task.id)
        ? current.map((item) => (item.id === task.id ? task : item))
        : [task, ...current];
      return next
        .filter((item) => !item.completedAt)
        .sort((left, right) => left.effectiveScore - right.effectiveScore || new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
    });
    setSelectedTask(task);
    setShowForm(true);
  }

  function removeTask(taskId: string) {
    setTasks((current) => current.filter((task) => task.id !== taskId));
    if (selectedTask?.id === taskId) {
      setSelectedTask(null);
      setShowForm(false);
    }
  }

  async function runTaskAction(task: Task, path: string, options: RequestInit = {}) {
    setBusyTaskId(task.id);
    setError("");
    try {
      const response = await fetch(getRuntimeUrl(path), {
        method: "POST",
        credentials: "include",
        ...options,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Task action failed");
      }
      if (data.task?.completedAt) {
        removeTask(data.task.id);
      } else if (data.task) {
        upsertTask(data.task);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Task action failed");
    } finally {
      setBusyTaskId("");
    }
  }

  async function deleteTask(task: Task) {
    if (!window.confirm("Delete this task? This cannot be undone.")) {
      return;
    }
    setBusyTaskId(task.id);
    setError("");
    try {
      const response = await fetch(getRuntimeUrl(`/api/tasks/${task.id}`), {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not delete task");
      }
      removeTask(task.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete task");
    } finally {
      setBusyTaskId("");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <LiquidGlassCard shadowIntensity="xs" borderRadius="8px" glowIntensity="none" className="bg-white/50 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-950">Tasks</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Keep action items moving. Emailable sorts tasks by priority, urgency, duplicate pressure, and defer history.
            </p>
          </div>
          <Button
            onClick={() => {
              setSelectedTask(null);
              setShowForm(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add task
          </Button>
        </div>
      </LiquidGlassCard>

      {error ? <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <div>
            <h2 className="mb-3 text-lg font-semibold text-zinc-950">Top 3</h2>
            {loading ? (
              <LiquidGlassCard shadowIntensity="xs" borderRadius="8px" glowIntensity="none" className="bg-white/50 p-8 text-center text-zinc-500">
                Loading tasks...
              </LiquidGlassCard>
            ) : topTasks.length ? (
              <div className="grid gap-3">
                {topTasks.map((task, index) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    rank={index + 1}
                    busy={busyTaskId === task.id}
                    onComplete={(item) => runTaskAction(item, `/api/tasks/${item.id}/complete`)}
                    onDefer={(item) => runTaskAction(item, `/api/tasks/${item.id}/defer`)}
                    onDelete={deleteTask}
                    onEdit={(item) => {
                      setSelectedTask(item);
                      setShowForm(true);
                    }}
                    onGenerateNudge={(item) => runTaskAction(item, `/api/tasks/${item.id}/nudge/generate`)}
                    onSimplifyNudge={(item) => runTaskAction(item, `/api/tasks/${item.id}/nudge/simplify`)}
                    onCompleteNudgeStep={(item) => runTaskAction(item, `/api/tasks/${item.id}/nudge/complete-step`)}
                  />
                ))}
              </div>
            ) : (
              <LiquidGlassCard shadowIntensity="xs" borderRadius="8px" glowIntensity="none" className="bg-white/50 p-8 text-center text-zinc-500">
                No open tasks yet.
              </LiquidGlassCard>
            )}
          </div>

          <TaskList
            tasks={remainingTasks}
            expanded={remainingExpanded}
            onExpandedChange={setRemainingExpanded}
            onEdit={(task) => {
              setSelectedTask(task);
              setShowForm(true);
            }}
          />
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          {showForm ? (
            <TaskForm
              task={selectedTask}
              onSaved={upsertTask}
              onDeleted={removeTask}
              onCancel={() => {
                setShowForm(false);
                setSelectedTask(null);
              }}
            />
          ) : (
            <LiquidGlassCard shadowIntensity="xs" borderRadius="8px" glowIntensity="none" className="bg-white/50 p-5 text-sm text-zinc-600">
              Select a task to edit it, or create a new one. Duplicate-aware creation helps keep repeated automation outputs from making noisy task lists.
            </LiquidGlassCard>
          )}
        </div>
      </section>
    </div>
  );
}
