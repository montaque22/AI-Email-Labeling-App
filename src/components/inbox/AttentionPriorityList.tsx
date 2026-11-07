import { Archive, Bookmark, Check, Clock3, Gem, RotateCcw, ShieldCheck, Sparkles, Trash2, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import type { AttentionCategory, AttentionMessage } from "./attention-dashboard-types";
import { attentionMessageKey, attentionSenderInitial, formatAttentionDate, hasActiveCommitment } from "./attention-dashboard-utils";

type AttentionPriorityListProps = {
  category: AttentionCategory;
  isActionRunning: boolean;
  isMobileSelectionMode: boolean;
  messages: AttentionMessage[];
  onArchive: (message: AttentionMessage) => void;
  onCommitment: (message: AttentionMessage) => void;
  onNotQuickWin: (message: AttentionMessage) => void;
  onOpen: (message: AttentionMessage) => void;
  onReturnInterest: (message: AttentionMessage) => void;
  onStillInterested: (message: AttentionMessage) => void;
  onToggleFollow: (message: AttentionMessage) => void;
  onToggleSelection: (message: AttentionMessage) => void;
  onTrash: (message: AttentionMessage) => void;
  selectedKeys: Set<string>;
};

export function AttentionPriorityList(props: AttentionPriorityListProps) {
  if (props.messages.length === 0) return <AttentionEmptyCategory category={props.category} />;
  return (
    <div>
      {props.messages.map((message) => (
        <AttentionPriorityRow key={attentionMessageKey(message)} message={message} {...props} />
      ))}
    </div>
  );
}

function AttentionPriorityRow({
  isActionRunning,
  isMobileSelectionMode,
  message,
  category,
  onArchive,
  onCommitment,
  onNotQuickWin,
  onOpen,
  onReturnInterest,
  onStillInterested,
  onToggleFollow,
  onToggleSelection,
  onTrash,
  selectedKeys,
}: Omit<AttentionPriorityListProps, "messages"> & { message: AttentionMessage }) {
  const key = attentionMessageKey(message);
  const selected = selectedKeys.has(key);
  const committed = hasActiveCommitment(message);
  return (
    <article className={cn(
      "@container/priority-row group relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 border-b border-white/70 px-3 py-3 last:border-b-0 md:gap-x-3 md:px-5 md:py-4 @[40rem]/priority-row:grid-cols-[auto_minmax(0,1fr)_auto]",
      selected && "bg-violet-50/60",
      category === "interest" && freshnessBorderClass(message.interestFreshness?.state),
    )} data-attention-row>
      <input
        aria-label={`Select ${message.subject || "email"}`}
        checked={selected}
        className={cn("h-5 w-5 shrink-0 accent-violet-600", !isMobileSelectionMode && "max-sm:hidden")}
        onChange={() => onToggleSelection(message)}
        type="checkbox"
      />
      <button className="col-start-2 row-start-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" data-attention-row-content onClick={() => onOpen(message)} type="button">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-medium">{attentionSenderInitial(message)}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold text-zinc-950">{message.sender || message.from}</span>
            {!message.isRead ? <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-blue-600" /> : null}
          </span>
          <span className="block truncate text-sm font-medium text-zinc-800">{message.subject || "No subject"}</span>
          <span className="mt-0.5 block truncate text-xs text-zinc-500 @[40rem]/priority-row:hidden">{message.snippet}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            {message.labels[0] ? <Badge>{message.labels[0]}</Badge> : null}
            {message.attention.quickWin?.isQuickWin ? <Badge className="gap-1 border-violet-200 bg-violet-50 text-violet-700"><Sparkles className="h-3 w-3" />Quick Win</Badge> : null}
            {category === "interest" && message.interestFreshness ? <span title={`${message.interestFreshness.days} days since meaningful interest activity`}>{message.interestFreshness.label}</span> : committed ? <><Gem className="h-3.5 w-3.5 fill-violet-100 text-violet-600" />Commitment</> : message.attention.reasonCode === "security_notice" ? <><ShieldCheck className="h-3.5 w-3.5 text-orange-500" />Security notice</> : <><Clock3 className="h-3.5 w-3.5 text-blue-600" /><span className="max-w-52 truncate">{message.attention.explanation}</span></>}
          </span>
        </span>
        <span className="shrink-0 self-start pt-1 text-xs text-zinc-500 @[40rem]/priority-row:self-center @[40rem]/priority-row:pt-0 @[40rem]/priority-row:text-sm">{formatAttentionDate(message.date)}</span>
      </button>
      <div className={cn(
        "col-start-2 row-start-2 flex w-full min-w-0 flex-nowrap items-center justify-end @[40rem]/priority-row:col-start-3 @[40rem]/priority-row:row-start-1 @[40rem]/priority-row:w-auto",
        isMobileSelectionMode && "hidden @[40rem]/priority-row:flex",
      )} data-attention-row-actions>
        <ActionButton label={message.followed ? "Remove bookmark" : "Bookmark email"} onClick={() => onToggleFollow(message)}>
          <Bookmark className={cn("h-4 w-4", message.followed && "fill-blue-600 text-blue-600")} />
        </ActionButton>
        {category === "interest" ? (
          <>
            {message.interestFreshness?.state === "review" || message.interestFreshness?.state === "stale" ? <Button onClick={() => onStillInterested(message)} size="sm" type="button" variant="ghost">Still interested</Button> : null}
            <InterestDoneMenu disabled={isActionRunning} message={message} onArchive={onArchive} onCommitment={onCommitment} onReturn={onReturnInterest} onTrash={onTrash} />
          </>
        ) : null}
        <ActionButton label={committed ? "Manage commitment" : "Set commitment"} onClick={() => onCommitment(message)}>
          <Gem className={cn("h-4 w-4", committed && "fill-violet-200 text-violet-700")} />
        </ActionButton>
        {message.attention.quickWin?.isQuickWin ? <ActionButton label="Not a Quick Win" onClick={() => onNotQuickWin(message)}><XCircle className="h-4 w-4" /></ActionButton> : null}
        <ActionButton disabled={isActionRunning} label="Archive email" onClick={() => onArchive(message)}><Archive className="h-4 w-4" /></ActionButton>
        <ActionButton disabled={isActionRunning} label="Move email to Trash" onClick={() => onTrash(message)}><Trash2 className="h-4 w-4 text-red-600" /></ActionButton>
      </div>
    </article>
  );
}

function InterestDoneMenu({ disabled, message, onArchive, onCommitment, onReturn, onTrash }: {
  disabled: boolean;
  message: AttentionMessage;
  onArchive: (message: AttentionMessage) => void;
  onCommitment: (message: AttentionMessage) => void;
  onReturn: (message: AttentionMessage) => void;
  onTrash: (message: AttentionMessage) => void;
}) {
  return (
    <details className="relative">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-md px-3 text-sm font-medium text-violet-700 hover:bg-violet-50 [&::-webkit-details-marker]:hidden"><Check className="h-4 w-4" />Done</summary>
      <div className="absolute right-0 top-10 z-30 min-w-48 rounded-xl border border-white/80 bg-white/95 p-1 shadow-xl">
        <MenuAction icon={<RotateCcw className="h-4 w-4" />} label="Return" onClick={() => onReturn(message)} />
        <MenuAction disabled={disabled} icon={<Archive className="h-4 w-4" />} label="Archive" onClick={() => onArchive(message)} />
        <MenuAction icon={<Gem className="h-4 w-4" />} label="Create Commitment" onClick={() => onCommitment(message)} />
        <MenuAction className="text-red-700 hover:bg-red-50" disabled={disabled} icon={<Trash2 className="h-4 w-4" />} label="Move to Trash" onClick={() => onTrash(message)} />
      </div>
    </details>
  );
}

function MenuAction({ className, disabled, icon, label, onClick }: { className?: string; disabled?: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button className={cn("flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-zinc-100", className)} disabled={disabled} onClick={onClick} type="button">{icon}{label}</button>;
}

function freshnessBorderClass(state?: "fresh" | "cooling" | "review" | "stale") {
  if (state === "fresh") return "border-l-4 border-l-emerald-400";
  if (state === "cooling") return "border-l-4 border-l-amber-400";
  if (state === "review") return "border-l-4 border-l-orange-400";
  if (state === "stale") return "border-l-4 border-l-zinc-400";
  return "";
}

function ActionButton({ children, disabled = false, label, onClick }: { children: ReactNode; disabled?: boolean; label: string; onClick: () => void }) {
  return <Button aria-label={label} disabled={disabled} onClick={onClick} size="icon" title={label} type="button" variant="ghost">{children}</Button>;
}

export function AttentionEmptyCategory({ category }: { category: AttentionCategory }) {
  return <div className="p-10 text-center text-sm text-zinc-500">{category === "cleanup" ? "No emails are currently safe to suggest for cleanup." : category === "interest" ? "Follow an email or revisit it across sessions to see it here." : "Nothing needs your attention right now."}</div>;
}
