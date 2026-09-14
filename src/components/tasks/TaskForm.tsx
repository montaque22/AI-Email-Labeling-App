import { FormEvent, useEffect, useMemo, useState } from "react";
import { Save, Trash2, X } from "lucide-react";
import { computeEffectiveScore } from "../../../shared/task-scoring.js";
import { Button } from "../ui/button";
import { LiquidGlassCard } from "../ui/liquid-glass";
import { getRuntimeUrl } from "../../lib/runtime-base";
import type { Task, TaskDraft, TaskPriority } from "./types";
import { emptyTaskDraft } from "./types";

type TaskFormProps = {
  task?: Task | null;
  onSaved: (task: Task) => void;
  onDeleted: (taskId: string) => void;
  onCancel: () => void;
};

export function TaskForm({ task, onSaved, onDeleted, onCancel }: TaskFormProps) {
  const [draft, setDraft] = useState<TaskDraft>(() => taskToDraft(task));
  const [suggestions, setSuggestions] = useState<Task[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(taskToDraft(task));
    setSuggestions([]);
    setError("");
  }, [task?.id]);

  useEffect(() => {
    const title = draft.title.trim();
    if (title.length < 3) {
      setSuggestions([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const response = await fetch(getRuntimeUrl(`/api/tasks/search?q=${encodeURIComponent(title)}&limit=5`), {
          credentials: "include",
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Could not search tasks");
        }
        setSuggestions((data.tasks || []).filter((candidate: Task) => candidate.id !== task?.id));
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [draft.title, task?.id]);

  const score = useMemo(() => {
    return computeEffectiveScore({
      priority: draft.priority,
      dueDate: draft.dueDate || null,
      deferCount: task?.deferCount ?? 0,
      duplicateCount: task?.duplicateCount ?? 0,
      stuck: task?.stuck ?? false,
    });
  }, [draft.priority, draft.dueDate, task?.deferCount, task?.duplicateCount, task?.stuck]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(getRuntimeUrl(task ? `/api/tasks/${task.id}` : "/api/tasks"), {
        method: task ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(draft)),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not save task");
      }
      onSaved(data.task);
      if (!task) {
        setDraft(emptyTaskDraft);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save task");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCurrentTask() {
    if (!task || !window.confirm("Delete this task? This cannot be undone.")) {
      return;
    }
    setSaving(true);
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
      onDeleted(task.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <LiquidGlassCard shadowIntensity="xs" borderRadius="8px" glowIntensity="none" className="bg-white/50 p-4">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">{task ? "Edit task" : "Add task"}</h2>
            <p className="text-sm text-zinc-600">Tasks are sorted by effective score. Lower scores rise first.</p>
          </div>
          <div className="flex gap-2">
            {task ? (
              <Button type="button" variant="outline" disabled={saving} onClick={deleteCurrentTask}>
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={onCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {error ? <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <label className="block text-sm font-medium text-zinc-700">
          Title
          <input
            className="mt-1 w-full rounded-full border border-white/70 bg-white/60 px-4 py-2 outline-none focus:border-zinc-400"
            value={draft.title}
            maxLength={160}
            required
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          />
        </label>

        {(suggestions.length || loadingSuggestions) && !task ? (
          <div className="rounded-lg border border-zinc-200 bg-white/50 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {loadingSuggestions ? "Checking for similar tasks..." : "Possible duplicates"}
            </div>
            <div className="space-y-2">
              {suggestions.map((suggestion) => (
                <button
                  type="button"
                  key={suggestion.id}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-white/70"
                  onClick={() => setDraft(taskToDraft(suggestion))}
                >
                  <span className="font-medium text-zinc-950">{suggestion.title}</span>
                  <span className="ml-2 text-xs text-zinc-500">{Math.round((suggestion.similarity || 0) * 100)}% similar</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-zinc-700">
            Priority
            <input
              className="mt-2 w-full"
              type="range"
              min={1}
              max={3}
              step={1}
              value={draft.priority}
              onChange={(event) => setDraft((current) => ({ ...current, priority: Number(event.target.value) as TaskPriority }))}
            />
            <span className="mt-1 block text-xs text-zinc-500">Priority {draft.priority} · effective score {Math.round(score)}</span>
          </label>

          <label className="block text-sm font-medium text-zinc-700">
            Due date
            <input
              className="mt-1 w-full rounded-full border border-white/70 bg-white/60 px-4 py-2 outline-none focus:border-zinc-400"
              type="datetime-local"
              value={draft.dueDate}
              onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-zinc-700">
            Project
            <input
              className="mt-1 w-full rounded-full border border-white/70 bg-white/60 px-4 py-2 outline-none focus:border-zinc-400"
              value={draft.project}
              maxLength={80}
              onChange={(event) => setDraft((current) => ({ ...current, project: event.target.value }))}
            />
          </label>

          <label className="block text-sm font-medium text-zinc-700">
            Tags
            <input
              className="mt-1 w-full rounded-full border border-white/70 bg-white/60 px-4 py-2 outline-none focus:border-zinc-400"
              placeholder="Comma-separated tags"
              value={draft.tags}
              onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))}
            />
          </label>
        </div>

        <label className="block text-sm font-medium text-zinc-700">
          Notes
          <textarea
            className="mt-1 min-h-28 w-full rounded-lg border border-white/70 bg-white/60 px-4 py-3 outline-none focus:border-zinc-400"
            value={draft.notes}
            maxLength={4000}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
          />
        </label>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving || !draft.title.trim()}>
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </LiquidGlassCard>
  );
}

function taskToDraft(task?: Task | null): TaskDraft {
  if (!task) {
    return emptyTaskDraft;
  }
  return {
    title: task.title,
    notes: task.notes,
    tags: task.tags.join(", "),
    priority: task.priority,
    dueDate: task.dueDate ? toDateTimeLocal(task.dueDate) : "",
    project: task.project,
    sourceEmailId: task.sourceEmailId,
  };
}

function toPayload(draft: TaskDraft) {
  return {
    title: draft.title,
    notes: draft.notes,
    tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    priority: draft.priority,
    dueDate: draft.dueDate ? new Date(draft.dueDate).toISOString() : null,
    project: draft.project,
    sourceEmailId: draft.sourceEmailId,
  };
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}
