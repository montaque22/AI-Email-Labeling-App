import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2, Send, X } from "lucide-react";
import { Button } from "../ui/button";
import { MarkdownViewer } from "../ui/MarkdownViewer";
import { getRuntimeUrl } from "../../lib/runtime-base";
import { cn } from "../../lib/utils";
import type { Task } from "./types";

const TASK_AI_HISTORY_LIMIT = 60;
const TASK_AI_STORAGE_KEY = "emailable:task-ai-helper:messages";
const TASK_AI_SESSION_KEY = "emailable:task-ai-helper:session-id";

type AffectedTask = Pick<Task, "id" | "title" | "notes" | "tags" | "priority" | "dueDate" | "project" | "deferCount" | "duplicateCount" | "sourceEmailId" | "stuck" | "completedAt">;

type TaskAiMessage = {
  id: number;
  role: "assistant" | "user";
  text: string;
  affectedTasks?: AffectedTask[];
};

type TaskAiHelperProps = {
  onClose: () => void;
  onOpenTask: (task: AffectedTask) => void;
  onTasksChanged: () => void;
  selectedTask: Task | null;
  tasks: Task[];
};

export function TaskAiHelper({ onClose, onOpenTask, onTasksChanged, selectedTask, tasks }: TaskAiHelperProps) {
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<TaskAiMessage[]>(() => loadStoredMessages());
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const sessionId = useMemo(() => getTaskAiSessionId(), []);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    sessionStorage.setItem(TASK_AI_STORAGE_KEY, JSON.stringify(messages.slice(-TASK_AI_HISTORY_LIMIT)));
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function askTaskAi(prompt: string, nextMessages: TaskAiMessage[]) {
    setIsThinking(true);
    try {
      const response = await fetch(getRuntimeUrl("/api/byoai/helper-chat"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contextDescription: selectedTask ? `Tasks page with selected task: ${selectedTask.title}` : "Tasks page",
          contextTasks: buildTaskContext(tasks, selectedTask),
          conversationHistory: nextMessages.slice(-TASK_AI_HISTORY_LIMIT).map((message) => ({
            role: message.role,
            text: message.text,
          })),
          prompt,
          sessionId,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "AI could not help with tasks.");
      }
      const affectedTasks = normalizeAffectedTasks(data.affectedTasks);
      appendMessage({
        affectedTasks,
        role: "assistant",
        text: String(data.message || "").trim() || "Done.",
      });
      onTasksChanged();
    } catch (error) {
      appendMessage({
        role: "assistant",
        text: error instanceof Error ? error.message : "AI could not help with tasks.",
      });
    } finally {
      setIsThinking(false);
    }
  }

  function appendMessage(message: Omit<TaskAiMessage, "id">) {
    setMessages((current) => [...current, { ...message, id: Date.now() + current.length }]);
  }

  function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || isThinking) {
      return;
    }
    setInput("");
    const userMessage: TaskAiMessage = { id: Date.now() + messages.length, role: "user", text: prompt };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    void askTaskAi(prompt, nextMessages);
  }

  return (
    <aside className="fixed inset-0 z-[120] flex h-[100dvh] w-screen flex-col rounded-none border-0 border-white/70 bg-white/95 shadow-2xl shadow-slate-900/20 backdrop-blur-2xl md:inset-x-auto md:bottom-24 md:right-5 md:top-20 md:h-auto md:w-[420px] md:max-w-[calc(100vw-2.5rem)] md:rounded-2xl md:border md:bg-white/75">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/70 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-950">Task AI</p>
          <p className="truncate text-xs text-zinc-500">{tasks.length} task{tasks.length === 1 ? "" : "s"} in context</p>
        </div>
        <Button aria-label="Close task AI" onClick={onClose} size="icon" type="button" variant="ghost">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="rounded-xl border border-white/70 bg-white/65 px-3 py-3 text-sm leading-6 text-zinc-700 shadow-sm backdrop-blur-xl">
            Ask me to find, summarize, group, open, delete, defer, or close tasks. I can use the task tools directly when an action is needed.
          </div>
        ) : null}
        {messages.map((message) => (
          <div className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")} key={message.id}>
            <div className={cn(
              "min-w-0 max-w-[88%] rounded-xl border border-white/70 bg-white/65 px-3 py-2 text-sm leading-6 shadow-sm backdrop-blur-xl [overflow-wrap:anywhere]",
              message.role === "user" && "bg-zinc-950/85 text-white",
            )}>
              {message.role === "assistant" ? (
                <MarkdownViewer markdown={message.text} />
              ) : (
                <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.text}</p>
              )}
              {message.affectedTasks?.length ? (
                <div className="mt-3 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Related tasks</p>
                  {message.affectedTasks.map((task) => (
                    <button
                      className="block w-full rounded-lg border border-white/70 bg-white/70 px-3 py-2 text-left text-xs text-zinc-600 shadow-sm transition hover:bg-white"
                      key={task.id}
                      onClick={() => onOpenTask(task)}
                      type="button"
                    >
                      <span className="flex items-center justify-between gap-2 font-medium text-zinc-950">
                        <span className="truncate">{task.title}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      </span>
                      <span className="mt-1 block truncate">
                        {task.completedAt ? "Completed" : task.stuck ? "Stuck" : "Open"} · Priority {task.priority || "n/a"}
                        {task.project ? ` · ${task.project}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {isThinking ? (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 rounded-xl border border-white/70 bg-white/65 px-3 py-2 text-sm text-zinc-600 shadow-sm backdrop-blur-xl">
              <Loader2 className="h-4 w-4 animate-spin" />
              Thinking...
            </div>
          </div>
        ) : null}
        <div ref={messagesEndRef} />
      </div>

      <form className="shrink-0 border-t border-white/70 p-3" onSubmit={submitPrompt}>
        <div className="flex items-end gap-2 rounded-xl border border-white/70 bg-white/55 p-2 shadow-sm backdrop-blur-xl">
          <textarea
            className="min-h-10 max-h-28 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 outline-none placeholder:text-zinc-400"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Ask about tasks..."
            rows={1}
            value={input}
          />
          <Button disabled={isThinking || !input.trim()} size="icon" type="submit" variant="ghost">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </aside>
  );
}

function buildTaskContext(tasks: Task[], selectedTask: Task | null) {
  const selected = selectedTask ? [selectedTask] : [];
  const visible = tasks.filter((task) => task.id !== selectedTask?.id);
  return [...selected, ...visible].slice(0, 50);
}

function getTaskAiSessionId() {
  const existing = sessionStorage.getItem(TASK_AI_SESSION_KEY);
  if (existing) {
    return existing;
  }
  const next = crypto.randomUUID();
  sessionStorage.setItem(TASK_AI_SESSION_KEY, next);
  return next;
}

function loadStoredMessages(): TaskAiMessage[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(TASK_AI_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(isTaskAiMessage).slice(-TASK_AI_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

function isTaskAiMessage(value: unknown): value is TaskAiMessage {
  return Boolean(value && typeof value === "object" && ("role" in value) && ("text" in value));
}

function normalizeAffectedTasks(value: unknown): AffectedTask[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((task): task is AffectedTask => Boolean(task && typeof task === "object" && typeof (task as AffectedTask).id === "string" && typeof (task as AffectedTask).title === "string"))
    .slice(0, 50);
}
