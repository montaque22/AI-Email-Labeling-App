import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Archive, Bookmark, ChevronDown, ChevronRight, Clock3, Gem, Layers3, Mail, ShieldCheck, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../../lib/utils";

export type AttentionCategory = "attention" | "interest" | "cleanup";

export type AttentionMessage = {
  id: string;
  threadId: string;
  accountId: string;
  accountEmail: string;
  provider: string;
  mailbox?: string;
  from: string;
  sender: string;
  subject: string;
  snippet: string;
  date: string;
  isRead: boolean;
  labels: string[];
  hasAttachments: boolean;
  followed?: boolean;
  commitment?: {
    text: string;
    dueAt: string;
    setAt: string;
    completedAt?: string;
    isCompleted?: boolean;
  } | null;
  attention: {
    category: string;
    explanation: string;
    reasonCode: string;
  };
};

type CleanupGroup = {
  id: string;
  name: string;
  count: number;
  mostRecentAt: string;
  messages: AttentionMessage[];
};

export type AttentionDashboardData = {
  counts: Record<AttentionCategory, number>;
  categories: Record<AttentionCategory, AttentionMessage[]>;
  cleanupGroups: CleanupGroup[];
};

type AttentionDashboardProps = {
  category: AttentionCategory;
  data: AttentionDashboardData | null;
  detailPanel?: ReactNode;
  isLoading: boolean;
  onArchive: (messages: AttentionMessage[]) => Promise<void> | void;
  onDelete: (messages: AttentionMessage[]) => Promise<void> | void;
  onDismiss: (message: AttentionMessage, category: AttentionCategory) => Promise<void> | void;
  onOpen: (message: AttentionMessage) => void;
  onSelectCategory: (category: AttentionCategory) => void;
  onToggleFollow: (message: AttentionMessage) => Promise<void> | void;
};

const cards = [
  { id: "attention" as const, label: "Needs Attention", description: "Emails that may need action or review.", icon: TriangleAlert, tone: "orange" },
  { id: "interest" as const, label: "Of Interest", description: "Messages you follow or return to.", icon: Bookmark, tone: "blue" },
  { id: "cleanup" as const, label: "Quick Cleanup", description: "Lower-priority email to review in batches.", icon: Layers3, tone: "emerald" },
];

export function AttentionDashboard({ category, data, detailPanel, isLoading, onArchive, onDelete, onDismiss, onOpen, onSelectCategory, onToggleFollow }: AttentionDashboardProps) {
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const selectedCleanupMessages = useMemo(() => {
    const selected = new Set(selectedKeys);
    return (data?.categories.cleanup ?? []).filter((message) => selected.has(messageKey(message)));
  }, [data, selectedKeys]);

  useEffect(() => {
    setSelectedKeys([]);
  }, [data?.counts.cleanup]);

  return (
    <section className="space-y-5" aria-label="Attention Dashboard">
      <header className="flex items-start gap-3 px-1">
        <div className="rounded-2xl bg-violet-100 p-2.5 text-violet-600"><Sparkles className="h-6 w-6" /></div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 md:text-3xl">Your Inbox</h1>
          <p className="text-sm text-zinc-500 md:text-base">Find what matters. Clear the rest.</p>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3 max-md:overflow-x-auto max-md:pb-2 md:gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const selected = category === card.id;
          return (
            <button
              aria-pressed={selected}
              className={cn(
                "min-w-[150px] rounded-2xl border bg-white/65 p-4 text-left shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/85 hover:shadow-md md:min-h-36 md:p-5",
                selected ? "border-violet-400 ring-1 ring-violet-300" : "border-white/80",
              )}
              key={card.id}
              onClick={() => onSelectCategory(card.id)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <span className={cn(
                  "rounded-full p-3",
                  card.tone === "orange" && "bg-orange-100 text-orange-600",
                  card.tone === "blue" && "bg-blue-100 text-blue-600",
                  card.tone === "emerald" && "bg-emerald-100 text-emerald-600",
                )}><Icon className="h-6 w-6" /></span>
                <span className="text-3xl font-semibold text-indigo-950">{isLoading ? "–" : data?.counts[card.id] ?? 0}</span>
              </div>
              <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                  <p className="text-base font-semibold text-zinc-950 md:text-lg">{card.label}</p>
                  <p className="mt-1 hidden text-sm text-zinc-500 md:block">{card.description}</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-zinc-500" />
              </div>
            </button>
          );
        })}
      </div>

      <div className={cn("min-w-0", detailPanel && "grid items-start gap-4 lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.5fr)]")}>
      <Card className="min-w-0 overflow-hidden bg-white/60">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 border-b border-white/70">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle>{cards.find((card) => card.id === category)?.label}</CardTitle>
              <Badge>{data?.counts[category] ?? 0} emails</Badge>
            </div>
            <CardDescription className="mt-1">{cards.find((card) => card.id === category)?.description}</CardDescription>
          </div>
          {category === "cleanup" && selectedCleanupMessages.length > 0 ? (
            <div className="flex gap-2">
              <Button onClick={() => void onArchive(selectedCleanupMessages)} size="sm" type="button"><Archive className="h-4 w-4" />Archive {selectedCleanupMessages.length}</Button>
              <Button onClick={() => void onDelete(selectedCleanupMessages)} size="sm" type="button" variant="outline"><Trash2 className="h-4 w-4 text-red-600" />Delete</Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <DashboardSkeleton /> : category === "cleanup" ? (
            <CleanupGroups
              expandedGroups={expandedGroups}
              groups={data?.cleanupGroups ?? []}
              onOpen={onOpen}
              onToggleExpanded={(id) => setExpandedGroups((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])}
              onToggleMessage={(message) => setSelectedKeys((current) => toggleKey(current, messageKey(message)))}
              onToggleGroup={(group) => setSelectedKeys((current) => toggleGroup(current, group.messages))}
              selectedKeys={selectedKeys}
            />
          ) : (
            <PriorityMessages
              category={category}
              messages={data?.categories[category] ?? []}
              onDismiss={onDismiss}
              onOpen={onOpen}
              onToggleFollow={onToggleFollow}
            />
          )}
        </CardContent>
      </Card>
      {detailPanel}
      </div>
    </section>
  );
}

function PriorityMessages({ category, messages, onDismiss, onOpen, onToggleFollow }: { category: AttentionCategory; messages: AttentionMessage[]; onDismiss: AttentionDashboardProps["onDismiss"]; onOpen: AttentionDashboardProps["onOpen"]; onToggleFollow: AttentionDashboardProps["onToggleFollow"] }) {
  if (messages.length === 0) return <EmptyCategory category={category} />;
  return <div>{messages.map((message) => (
    <article className="group flex items-center gap-3 border-b border-white/70 px-4 py-4 last:border-b-0 md:px-5" key={messageKey(message)}>
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpen(message)} type="button">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-medium">{senderInitial(message)}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2"><span className="truncate font-semibold text-zinc-950">{message.sender || message.from}</span>{!message.isRead ? <span className="h-2 w-2 rounded-full bg-blue-600" /> : null}</span>
          <span className="block truncate text-sm font-medium text-zinc-800">{message.subject || "No subject"}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            {message.labels[0] ? <Badge>{message.labels[0]}</Badge> : null}
            {message.commitment ? <><Gem className="h-3.5 w-3.5 text-violet-600" />Commitment</> : message.attention.reasonCode === "security_notice" ? <><ShieldCheck className="h-3.5 w-3.5 text-orange-500" />Security notice</> : <><Clock3 className="h-3.5 w-3.5 text-blue-600" />{message.attention.explanation}</>}
          </span>
        </span>
        <span className="shrink-0 text-sm text-zinc-500">{formatDate(message.date)}</span>
      </button>
      <Button aria-label={message.followed ? "Unfollow email" : "Follow email"} onClick={() => void onToggleFollow(message)} size="icon" type="button" variant="ghost"><Bookmark className={cn("h-4 w-4", message.followed && "fill-blue-600 text-blue-600")} /></Button>
      {!message.commitment ? <Button aria-label="Dismiss recommendation" onClick={() => void onDismiss(message, category)} size="icon" type="button" variant="ghost">×</Button> : null}
    </article>
  ))}</div>;
}

function CleanupGroups({ expandedGroups, groups, onOpen, onToggleExpanded, onToggleGroup, onToggleMessage, selectedKeys }: { expandedGroups: string[]; groups: CleanupGroup[]; onOpen: (message: AttentionMessage) => void; onToggleExpanded: (id: string) => void; onToggleGroup: (group: CleanupGroup) => void; onToggleMessage: (message: AttentionMessage) => void; selectedKeys: string[] }) {
  if (groups.length === 0) return <EmptyCategory category="cleanup" />;
  const selected = new Set(selectedKeys);
  return <div>{groups.map((group) => {
    const expanded = expandedGroups.includes(group.id);
    const allSelected = group.messages.every((message) => selected.has(messageKey(message)));
    return <div className="border-b border-white/70 last:border-b-0" key={group.id}>
      <div className="flex items-center gap-3 px-4 py-4 md:px-5">
        <input aria-label={`Select all email from ${group.name}`} checked={allSelected} onChange={() => onToggleGroup(group)} type="checkbox" />
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onToggleExpanded(group.id)} type="button">
          <span className="rounded-full bg-emerald-100 p-2 text-emerald-700"><Mail className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{group.name}</span><span className="block truncate text-sm text-zinc-500">{group.messages.slice(0, 2).map((message) => message.subject).join(" · ")}</span></span>
          <Badge>{group.count}</Badge>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
      {expanded ? <div className="border-t border-white/60 bg-white/35 pl-8">{group.messages.map((message) => <div className="flex items-center gap-3 border-b border-white/60 px-4 py-3 last:border-b-0" key={messageKey(message)}><input checked={selected.has(messageKey(message))} onChange={() => onToggleMessage(message)} type="checkbox" /><button className="min-w-0 flex-1 text-left" onClick={() => onOpen(message)} type="button"><span className="block truncate text-sm font-medium">{message.subject || "No subject"}</span><span className="block truncate text-xs text-zinc-500">{message.attention.explanation}</span></button><span className="text-xs text-zinc-500">{formatDate(message.date)}</span></div>)}</div> : null}
    </div>;
  })}</div>;
}

function DashboardSkeleton() { return <div className="space-y-2 p-4">{[0, 1, 2].map((item) => <div className="h-20 animate-pulse rounded-xl bg-white/70" key={item} />)}</div>; }
function EmptyCategory({ category }: { category: AttentionCategory }) { return <div className="p-10 text-center text-sm text-zinc-500">{category === "cleanup" ? "No emails are currently safe to suggest for cleanup." : category === "interest" ? "Follow an email or revisit it across sessions to see it here." : "Nothing needs your attention right now."}</div>; }
function messageKey(message: AttentionMessage) { return `${message.accountId}:${message.mailbox || ""}:${message.id}`; }
function senderInitial(message: AttentionMessage) { return (message.sender || message.from || "?").trim().charAt(0).toUpperCase(); }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function toggleKey(keys: string[], key: string) { return keys.includes(key) ? keys.filter((value) => value !== key) : [...keys, key]; }
function toggleGroup(keys: string[], messages: AttentionMessage[]) { const groupKeys = messages.map(messageKey); const allSelected = groupKeys.every((key) => keys.includes(key)); return allSelected ? keys.filter((key) => !groupKeys.includes(key)) : [...new Set([...keys, ...groupKeys])]; }
