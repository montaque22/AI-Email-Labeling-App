import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";

/**
 * The server-recorded outcome of pushing a reviewed rule's label to Gmail/IMAP, stored on the
 * rule as `metadata.providerApply`.
 *
 * `queued` is written before the provider call starts; `interrupted` is written by the startup
 * sweep for rows a restart orphaned at `queued`. Both mean the provider email was not
 * relabelled, which is exactly what the user cannot otherwise see — the rule row reads as a
 * fully reviewed, 100%-confidence rule either way.
 */
export type RuleProviderApplyStatus = "queued" | "complete" | "warning" | "error" | "interrupted";

export type RuleProviderApply = {
  ok: boolean | null;
  status: RuleProviderApplyStatus;
  error?: string;
  description?: string;
  queuedAt?: string;
  appliedAt?: string;
  failedAt?: string;
  interruptedAt?: string;
};

type RuleProviderApplyNoticeProps = {
  providerApply?: RuleProviderApply | null;
  /** `compact` is the dense rule list; `detail` is the rule modal, which has room for the description. */
  variant?: "compact" | "detail";
  className?: string;
};

const STATUS_COPY: Record<Exclude<RuleProviderApplyStatus, "complete">, { label: string; fallback: string }> = {
  queued: {
    label: "Label pending",
    fallback: "The label has not reached the provider email yet.",
  },
  interrupted: {
    label: "Label not applied",
    fallback: "Emailable restarted before the provider label was applied.",
  },
  warning: {
    label: "Provider email missing",
    fallback: "There was no provider email left to relabel.",
  },
  error: {
    label: "Label failed",
    fallback: "Emailable could not apply the label to the provider email.",
  },
};

const STATUS_CLASSES: Record<Exclude<RuleProviderApplyStatus, "complete">, string> = {
  queued: "border-zinc-200 bg-zinc-50 text-zinc-700",
  interrupted: "border-amber-200 bg-amber-50 text-amber-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  error: "border-red-200 bg-red-50 text-red-700",
};

/**
 * Renders nothing for a clean apply, so the common case stays visually unchanged. Uses the
 * `Badge` tones already used by the Pending/Reviewed badge next to it rather than inventing a
 * new visual state.
 */
export function RuleProviderApplyNotice({ providerApply, variant = "compact", className }: RuleProviderApplyNoticeProps) {
  const status = providerApply?.status;
  if (!status || status === "complete") {
    return null;
  }

  const copy = STATUS_COPY[status];
  if (!copy) {
    return null;
  }

  if (variant === "compact") {
    return <Badge className={cn(STATUS_CLASSES[status], className)}>{copy.label}</Badge>;
  }

  return (
    <div className={cn("rounded-md border px-3 py-2 text-xs leading-relaxed", STATUS_CLASSES[status], className)}>
      <p className="font-medium">{copy.label}</p>
      <p className="mt-1">{providerApply?.error || copy.fallback}</p>
      {providerApply?.description ? <p className="mt-1">{providerApply.description}</p> : null}
    </div>
  );
}
