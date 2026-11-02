import { Archive, Bookmark, Clock3, Gem, MoreHorizontal, ShieldCheck, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import type { AttentionCategory, AttentionMessage } from "./attention-dashboard-types";
import { attentionMessageKey, attentionSenderInitial, formatAttentionDate, hasActiveCommitment } from "./attention-dashboard-utils";

type AttentionPriorityListProps = {
  category: Exclude<AttentionCategory, "cleanup">;
  isActionRunning: boolean;
  isMobileSelectionMode: boolean;
  messages: AttentionMessage[];
  onArchive: (message: AttentionMessage) => void;
  onCommitment: (message: AttentionMessage) => void;
  onOpen: (message: AttentionMessage) => void;
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
  onArchive,
  onCommitment,
  onOpen,
  onToggleFollow,
  onToggleSelection,
  onTrash,
  selectedKeys,
}: Omit<AttentionPriorityListProps, "category" | "messages"> & { message: AttentionMessage }) {
  const key = attentionMessageKey(message);
  const selected = selectedKeys.has(key);
  const committed = hasActiveCommitment(message);
  return (
    <article className={cn("group flex items-center gap-2 border-b border-white/70 px-3 py-3 last:border-b-0 md:gap-3 md:px-5 md:py-4", selected && "bg-violet-50/60")}>
      <input
        aria-label={`Select ${message.subject || "email"}`}
        checked={selected}
        className={cn("h-5 w-5 shrink-0 accent-violet-600", !isMobileSelectionMode && "max-sm:hidden")}
        onChange={() => onToggleSelection(message)}
        type="checkbox"
      />
      <button className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" onClick={() => onOpen(message)} type="button">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-medium">{attentionSenderInitial(message)}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold text-zinc-950">{message.sender || message.from}</span>
            {!message.isRead ? <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-blue-600" /> : null}
          </span>
          <span className="block truncate text-sm font-medium text-zinc-800">{message.subject || "No subject"}</span>
          <span className="mt-0.5 block truncate text-xs text-zinc-500 sm:hidden">{message.snippet}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            {message.labels[0] ? <Badge>{message.labels[0]}</Badge> : null}
            {committed ? <><Gem className="h-3.5 w-3.5 fill-violet-100 text-violet-600" />Commitment</> : message.attention.reasonCode === "security_notice" ? <><ShieldCheck className="h-3.5 w-3.5 text-orange-500" />Security notice</> : <><Clock3 className="h-3.5 w-3.5 text-blue-600" /><span className="max-w-52 truncate">{message.attention.explanation}</span></>}
          </span>
        </span>
        <span className="shrink-0 self-start pt-1 text-xs text-zinc-500 sm:self-center sm:pt-0 sm:text-sm">{formatAttentionDate(message.date)}</span>
      </button>
      <div className="hidden shrink-0 items-center md:flex">
        <ActionButton label={message.followed ? "Unfollow email" : "Follow email"} onClick={() => onToggleFollow(message)}>
          <Bookmark className={cn("h-4 w-4", message.followed && "fill-blue-600 text-blue-600")} />
        </ActionButton>
        <ActionButton label={committed ? "Manage commitment" : "Set commitment"} onClick={() => onCommitment(message)}>
          <Gem className={cn("h-4 w-4", committed && "fill-violet-200 text-violet-700")} />
        </ActionButton>
        <ActionButton disabled={isActionRunning} label="Archive email" onClick={() => onArchive(message)}><Archive className="h-4 w-4" /></ActionButton>
        <ActionButton disabled={isActionRunning} label="Move email to Trash" onClick={() => onTrash(message)}><Trash2 className="h-4 w-4 text-red-600" /></ActionButton>
      </div>
      {!isMobileSelectionMode ? (
        <div className="flex shrink-0 items-center md:hidden">
          <ActionButton label={message.followed ? "Unfollow email" : "Follow email"} onClick={() => onToggleFollow(message)}>
            <Bookmark className={cn("h-4 w-4", message.followed && "fill-blue-600 text-blue-600")} />
          </ActionButton>
          <ActionButton label={committed ? "Manage commitment" : "Set commitment"} onClick={() => onCommitment(message)}>
            <Gem className={cn("h-4 w-4", committed && "fill-violet-200 text-violet-700")} />
          </ActionButton>
          <details className="relative">
            <summary aria-label="More email actions" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-md hover:bg-zinc-100 [&::-webkit-details-marker]:hidden"><MoreHorizontal className="h-5 w-5" /></summary>
            <div className="absolute right-0 top-11 z-30 min-w-44 rounded-xl border border-white/80 bg-white/95 p-1 shadow-xl">
              <button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm hover:bg-zinc-100" onClick={() => onArchive(message)} type="button"><Archive className="h-4 w-4" />Archive</button>
              <button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm text-red-700 hover:bg-red-50" onClick={() => onTrash(message)} type="button"><Trash2 className="h-4 w-4" />Move to Trash</button>
            </div>
          </details>
        </div>
      ) : null}
    </article>
  );
}

function ActionButton({ children, disabled = false, label, onClick }: { children: ReactNode; disabled?: boolean; label: string; onClick: () => void }) {
  return <Button aria-label={label} disabled={disabled} onClick={onClick} size="icon" title={label} type="button" variant="ghost">{children}</Button>;
}

export function AttentionEmptyCategory({ category }: { category: AttentionCategory }) {
  return <div className="p-10 text-center text-sm text-zinc-500">{category === "cleanup" ? "No emails are currently safe to suggest for cleanup." : category === "interest" ? "Follow an email or revisit it across sessions to see it here." : "Nothing needs your attention right now."}</div>;
}
