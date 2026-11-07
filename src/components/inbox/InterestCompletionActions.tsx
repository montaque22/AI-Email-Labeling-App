import { Archive, Gem, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";

type InterestCompletionActionsProps = {
  disabled?: boolean;
  onArchive: () => void;
  onCommitment: () => void;
  onDelete: () => void;
  onReturn: () => void;
};

const actions = [
  { icon: RotateCcw, key: "return", label: "Return", description: "Remove bookmark and recalculate placement" },
  { icon: Archive, key: "archive", label: "Archive", description: "Keep for reference" },
  { icon: Trash2, key: "delete", label: "Delete", description: "Move to Trash" },
  { icon: Gem, key: "commitment", label: "Commitment", description: "Create an action in Needs Attention" },
] as const;

export function InterestCompletionActions({ disabled = false, onArchive, onCommitment, onDelete, onReturn }: InterestCompletionActionsProps) {
  const handlers = { archive: onArchive, commitment: onCommitment, delete: onDelete, return: onReturn };
  return (
    <section className="mt-5 rounded-2xl border border-violet-200/80 bg-violet-50/45 p-3 shadow-sm" aria-label="Completion actions">
      <h3 className="px-1 text-sm font-semibold text-zinc-950">I’m done with this email…</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {actions.map(({ description, icon: Icon, key, label }) => (
          <button
            className={cn(
              "flex min-h-16 items-center gap-3 rounded-xl border border-white/80 bg-white/75 px-3 text-left shadow-sm transition hover:border-violet-200 hover:bg-white",
              key === "delete" && "text-red-700 hover:border-red-200 hover:bg-red-50",
            )}
            disabled={disabled}
            key={key}
            onClick={handlers[key]}
            type="button"
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-zinc-500">{description}</span></span>
          </button>
        ))}
      </div>
    </section>
  );
}
