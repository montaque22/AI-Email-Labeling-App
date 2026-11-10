import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, ChevronDown, LoaderCircle } from "lucide-react";
import { cn } from "../../lib/utils";

export type AgentExecutionEvent = {
  callId?: string;
  error?: string;
  occurredAt?: string;
  phase: "started" | "completed" | "failed";
  toolName: string;
};

export function isAgentExecutionEvent(value: unknown): value is AgentExecutionEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<AgentExecutionEvent>;
  return typeof event.toolName === "string"
    && ["started", "completed", "failed"].includes(event.phase ?? "")
    && (event.callId === undefined || typeof event.callId === "string")
    && (event.occurredAt === undefined || typeof event.occurredAt === "string");
}

type AgentExecutionStatusProps = {
  events: AgentExecutionEvent[];
  isRunning: boolean;
  startedAt?: number | null;
};

function humanizeToolName(toolName: string) {
  return toolName.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function activityLabel(toolName: string, phase: AgentExecutionEvent["phase"]) {
  const normalized = toolName.toLowerCase();
  const action = /search.*web|web.*search|browser/.test(normalized)
    ? "Searching the web"
    : /read.*(page|document)|fetch.*(page|document|url)/.test(normalized)
      ? "Reading a source"
      : /find.*email|search.*email/.test(normalized)
        ? "Searching email"
        : /calendar/.test(normalized)
          ? "Checking the calendar"
          : /create.*draft|prepare.*draft/.test(normalized)
            ? "Preparing a draft"
            : humanizeToolName(toolName);
  if (phase === "completed") return `${action} completed`;
  if (phase === "failed") return `${action} failed`;
  return action;
}

function eventKey(event: AgentExecutionEvent, index: number) {
  return event.callId || `${event.toolName}-${index}`;
}

export function AgentExecutionStatus({ events, isRunning, startedAt = null }: AgentExecutionStatusProps) {
  const [expanded, setExpanded] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const latest = events.length > 0 ? events[events.length - 1] : null;
  const completedCount = events.filter((event) => event.phase === "completed").length;
  const failedCount = events.filter((event) => event.phase === "failed").length;

  useEffect(() => {
    if (!isRunning || !startedAt) return;
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [isRunning, startedAt]);

  const summary = useMemo(() => {
    if (!latest) return isRunning ? "Preparing to work…" : "Work complete";
    return activityLabel(latest.toolName, isRunning && latest.phase === "completed" ? "started" : latest.phase);
  }, [isRunning, latest]);

  if (!isRunning && events.length === 0) return null;

  return (
    <section
      aria-label="Agent activity"
      aria-live={isRunning ? "polite" : "off"}
      className="w-full max-w-xl rounded-xl border border-violet-100 bg-white/75 p-3 text-sm text-zinc-700 shadow-sm backdrop-blur-xl"
    >
      <button aria-expanded={expanded} className="flex min-h-10 w-full items-center gap-3 text-left" onClick={() => setExpanded((current) => !current)} type="button">
        {isRunning ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-violet-600 motion-reduce:animate-none" />
          : failedCount > 0 ? <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            : <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-zinc-900">{summary}</span>
          <span className="block text-xs text-zinc-500">
            {completedCount > 0 ? `${completedCount} completed` : "Agent activity"}
            {failedCount > 0 ? ` · ${failedCount} failed` : ""}
            {isRunning && elapsedSeconds > 0 ? ` · ${elapsedSeconds}s` : ""}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-zinc-400 transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded ? (
        <ol className="mt-2 space-y-2 border-t border-zinc-100 pt-3">
          {events.length === 0 ? <li className="text-xs text-zinc-500">Waiting for the first tool…</li> : events.map((event, index) => {
            const Icon = event.phase === "started" ? LoaderCircle : event.phase === "completed" ? Check : AlertCircle;
            return (
              <li className="flex items-start gap-2 text-xs" key={eventKey(event, index)}>
                <Icon className={cn(
                  "mt-0.5 h-3.5 w-3.5 shrink-0",
                  event.phase === "started" && "animate-spin text-violet-600 motion-reduce:animate-none",
                  event.phase === "completed" && "text-emerald-600",
                  event.phase === "failed" && "text-red-600",
                )} />
                <span className="min-w-0">
                  <span className="block font-medium text-zinc-800">{activityLabel(event.toolName, event.phase)}</span>
                  {event.error ? <span className="mt-0.5 block text-red-600">{event.error}</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
