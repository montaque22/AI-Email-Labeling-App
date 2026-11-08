import { AlertCircle, Check, LoaderCircle } from "lucide-react";

export type AgentExecutionEvent = {
  error?: string;
  phase: "started" | "completed" | "failed";
  toolName: string;
};

export function isAgentExecutionEvent(value: unknown): value is AgentExecutionEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<AgentExecutionEvent>;
  return typeof event.toolName === "string" && ["started", "completed", "failed"].includes(event.phase ?? "");
}

type AgentExecutionStatusProps = {
  event: AgentExecutionEvent | null;
};

function humanizeToolName(toolName: string) {
  return toolName.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AgentExecutionStatus({ event }: AgentExecutionStatusProps) {
  if (!event) return null;

  const label = humanizeToolName(event.toolName);
  const Icon = event.phase === "started" ? LoaderCircle : event.phase === "completed" ? Check : AlertCircle;
  const text = event.phase === "started"
    ? `Using ${label}…`
    : event.phase === "completed"
      ? `${label} completed`
      : `${label} failed`;

  return (
    <div
      aria-live="polite"
      className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-xs text-zinc-600 shadow-sm"
      title={event.error}
    >
      <Icon className={event.phase === "started" ? "h-3.5 w-3.5 animate-spin text-violet-600" : event.phase === "completed" ? "h-3.5 w-3.5 text-emerald-600" : "h-3.5 w-3.5 text-red-600"} />
      <span className="truncate">{text}</span>
    </div>
  );
}
