import { ChevronDown, ChevronRight, Mail } from "lucide-react";
import { Badge } from "../ui/badge";
import type { AttentionCleanupGroup, AttentionMessage } from "./attention-dashboard-types";
import { attentionMessageKey, formatAttentionDate } from "./attention-dashboard-utils";
import { AttentionEmptyCategory } from "./AttentionPriorityList";

export function AttentionCleanupGroups({ expandedGroups, groups, onOpen, onToggleExpanded, onToggleGroup, onToggleMessage, selectedKeys }: {
  expandedGroups: string[];
  groups: AttentionCleanupGroup[];
  onOpen: (message: AttentionMessage) => void;
  onToggleExpanded: (id: string) => void;
  onToggleGroup: (group: AttentionCleanupGroup) => void;
  onToggleMessage: (message: AttentionMessage) => void;
  selectedKeys: Set<string>;
}) {
  if (groups.length === 0) return <AttentionEmptyCategory category="cleanup" />;
  return <div>{groups.map((group) => {
    const expanded = expandedGroups.includes(group.id);
    const allSelected = group.messages.every((message) => selectedKeys.has(attentionMessageKey(message)));
    return (
      <div className="border-b border-white/70 last:border-b-0" key={group.id}>
        <div className="flex items-center gap-3 px-4 py-4 md:px-5">
          <input aria-label={`Select all email from ${group.name}`} checked={allSelected} className="h-5 w-5 accent-violet-600" onChange={() => onToggleGroup(group)} type="checkbox" />
          <button className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" onClick={() => onToggleExpanded(group.id)} type="button">
            <span className="rounded-full bg-emerald-100 p-2 text-emerald-700"><Mail className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{group.name}</span><span className="block truncate text-sm text-zinc-500">{group.messages.slice(0, 2).map((message) => message.subject).join(" · ")}</span></span>
            <Badge>{group.count}</Badge>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
        {expanded ? (
          <div className="border-t border-white/60 bg-white/35 sm:pl-8">
            {group.messages.map((message) => (
              <div className="flex items-center gap-3 border-b border-white/60 px-4 py-3 last:border-b-0" key={attentionMessageKey(message)}>
                <input aria-label={`Select ${message.subject || "email"}`} checked={selectedKeys.has(attentionMessageKey(message))} className="h-5 w-5 accent-violet-600" onChange={() => onToggleMessage(message)} type="checkbox" />
                <button className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" onClick={() => onOpen(message)} type="button"><span className="block truncate text-sm font-medium">{message.subject || "No subject"}</span><span className="block truncate text-xs text-zinc-500">{message.attention.explanation}</span></button>
                <span className="text-xs text-zinc-500">{formatAttentionDate(message.date)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  })}</div>;
}
