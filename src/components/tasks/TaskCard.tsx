import { AlertCircle, Check, Clock, Mail, Lightbulb, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { LiquidGlassCard } from "../ui/liquid-glass";
import { cn } from "../../lib/utils";
import type { Task } from "./types";

type TaskCardProps = {
  task: Task;
  rank?: number;
  busy?: boolean;
  onComplete: (task: Task) => void;
  onDefer: (task: Task) => void;
  onDelete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onOpenSourceEmail: (task: Task) => void;
  onGenerateNudge: (task: Task) => void;
  onSimplifyNudge: (task: Task) => void;
  onCompleteNudgeStep: (task: Task) => void;
};

export function TaskCard({
  task,
  rank,
  busy,
  onComplete,
  onDefer,
  onDelete,
  onEdit,
  onOpenSourceEmail,
  onGenerateNudge,
  onSimplifyNudge,
  onCompleteNudgeStep,
}: TaskCardProps) {
  const currentStep = task.nudge.steps[task.nudge.currentStepIndex] ?? task.nudge.steps[0];

  return (
    <LiquidGlassCard
      shadowIntensity="xs"
      borderRadius="8px"
      glowIntensity={task.stuck ? "sm" : "none"}
      className={cn("min-w-0 bg-white/50 p-4 text-zinc-950", task.stuck && "border-amber-200")}
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onEdit(task)}>
          <div className="flex flex-wrap items-center gap-2">
            {rank ? <Badge>{rank}</Badge> : null}
            <h3 className="min-w-0 max-w-full truncate text-base font-semibold text-zinc-950">{task.title}</h3>
            {task.stuck ? (
              <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                <AlertCircle className="h-3 w-3" />
                Stuck
              </Badge>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
            <span>Priority {task.priority}</span>
            <span>Score {Math.round(task.effectiveScore)}</span>
            {task.dueDate ? <span>Due {formatShortDate(task.dueDate)}</span> : null}
            {task.project ? <span>{task.project}</span> : null}
          </div>
          {task.notes ? <p className="mt-2 line-clamp-2 text-sm text-zinc-600">{task.notes}</p> : null}
          {task.tags.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {task.tags.map((tag) => (
                <Badge key={tag} className="bg-white/60 text-zinc-700">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </button>

        <div className="flex shrink-0 flex-wrap justify-start gap-2 sm:justify-end">
          {task.sourceEmailId ? (
            <Button aria-label="Open source email" size="sm" variant="outline" disabled={busy} onClick={() => onOpenSourceEmail(task)}>
              <Mail className="h-4 w-4" />
            </Button>
          ) : null}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onComplete(task)}>
            <Check className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onDefer(task)}>
            <Clock className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onDelete(task)}>
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      </div>

      {task.stuck ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900">
            <Lightbulb className="h-4 w-4" />
            Get unstuck
          </div>
          {currentStep ? (
            <p className="text-sm text-amber-900">{currentStep}</p>
          ) : (
            <p className="text-sm text-amber-900">Generate a small next step to get moving again.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy || !currentStep} onClick={() => onCompleteNudgeStep(task)}>
              Done
            </Button>
            <Button size="sm" variant="outline" disabled={busy || !currentStep} onClick={() => onSimplifyNudge(task)}>
              Make it simpler
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onGenerateNudge(task)}>
              <Sparkles className="h-4 w-4" />
              Generate
            </Button>
          </div>
        </div>
      ) : null}
    </LiquidGlassCard>
  );
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}
