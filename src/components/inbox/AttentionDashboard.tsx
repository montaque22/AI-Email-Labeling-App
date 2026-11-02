import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../../lib/utils";
import { AttentionCategoryCards, ATTENTION_CATEGORY_CARDS } from "./AttentionCategoryCards";
import { AttentionCleanupGroups } from "./AttentionCleanupGroups";
import { AttentionPriorityList } from "./AttentionPriorityList";
import { AttentionTrashConfirmation } from "./AttentionTrashConfirmation";
import type { AttentionCleanupGroup, AttentionDashboardProps, AttentionMessage } from "./attention-dashboard-types";
import { attentionMessageKey } from "./attention-dashboard-utils";

export type { AttentionCategory, AttentionDashboardData, AttentionMessage } from "./attention-dashboard-types";

export function AttentionDashboard({
  category, data, detailPanel, isActionRunning = false, isLoading, onArchive, onCommitment, onDelete,
  onLoadMore, onOpen, onSelectAllMatching, onSelectCategory, onSelectionChange, onToggleFollow, selectedMessages,
}: AttentionDashboardProps) {
  const [allResultsSelected, setAllResultsSelected] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isMobileSelectionMode, setIsMobileSelectionMode] = useState(false);
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [pendingTrash, setPendingTrash] = useState<AttentionMessage[] | null>(null);

  const categoryMessages = data?.categories[category] ?? [];
  const selected = selectedMessages;
  const selectedKeys = useMemo(() => new Set(selectedMessages.map(attentionMessageKey)), [selectedMessages]);
  const allLoadedSelected = categoryMessages.length > 0 && categoryMessages.every((message) => selectedKeys.has(attentionMessageKey(message)));
  const pagination = category === "cleanup" ? null : data?.pagination?.[category];
  const card = ATTENTION_CATEGORY_CARDS.find((item) => item.id === category);

  useEffect(() => {
    onSelectionChange([]);
    setAllResultsSelected(false);
    setIsMobileSelectionMode(false);
  }, [category, onSelectionChange]);

  function toggleMessage(message: AttentionMessage) {
    const key = attentionMessageKey(message);
    const next = selectedKeys.has(key)
      ? selected.filter((item) => attentionMessageKey(item) !== key)
      : [...selected, message];
    onSelectionChange(next);
    setAnnouncement(`${next.length} email${next.length === 1 ? "" : "s"} selected.`);
    setAllResultsSelected(false);
  }

  function toggleLoadedMessages() {
    const loadedKeys = new Set(categoryMessages.map(attentionMessageKey));
    const next = allLoadedSelected
      ? selected.filter((message) => !loadedKeys.has(attentionMessageKey(message)))
      : [...new Map([...selected, ...categoryMessages].map((message) => [attentionMessageKey(message), message])).values()];
    onSelectionChange(next);
    setAnnouncement(`${next.length} email${next.length === 1 ? "" : "s"} selected.`);
    setAllResultsSelected(false);
  }

  async function selectAllMatching() {
    if (category === "cleanup") return;
    setIsSelectingAll(true);
    try {
      const messages = await onSelectAllMatching(category);
      onSelectionChange(messages);
      setAllResultsSelected(true);
      setAnnouncement(`All ${messages.length} emails in ${card?.label ?? category} selected.`);
    } finally {
      setIsSelectingAll(false);
    }
  }

  function clearSelection() {
    onSelectionChange([]);
    setAllResultsSelected(false);
    setAnnouncement("Selection cleared.");
  }

  async function archiveMessages(messages: AttentionMessage[]) {
    await onArchive(messages);
    clearSelection();
  }

  async function trashMessages(messages: AttentionMessage[]) {
    await onDelete(messages);
    setPendingTrash(null);
    clearSelection();
  }

  async function loadMore() {
    if (category === "cleanup") return;
    setIsLoadingMore(true);
    try { await onLoadMore(category); } finally { setIsLoadingMore(false); }
  }

  function toggleCleanupGroup(group: AttentionCleanupGroup) {
    const keys = group.messages.map(attentionMessageKey);
    const groupSelected = keys.every((key) => selectedKeys.has(key));
    const groupKeySet = new Set(keys);
    const next = groupSelected
      ? selected.filter((message) => !groupKeySet.has(attentionMessageKey(message)))
      : [...new Map([...selected, ...group.messages].map((message) => [attentionMessageKey(message), message])).values()];
    onSelectionChange(next);
  }

  return (
    <section className="space-y-5" aria-label="Attention Dashboard">
      <header className="flex items-start gap-3 px-1">
        <div className="rounded-2xl bg-violet-100 p-2.5 text-violet-600"><Sparkles className="h-6 w-6" /></div>
        <div><h1 className="text-2xl font-bold tracking-tight text-zinc-950 md:text-3xl">Your Inbox</h1><p className="text-sm text-zinc-500 md:text-base">Find what matters. Clear the rest.</p></div>
      </header>

      <AttentionCategoryCards category={category} counts={data?.counts} isLoading={isLoading} onSelect={onSelectCategory} />

      <div className={cn("min-w-0", detailPanel && "grid items-start gap-4 lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.5fr)]")}>
        <Card className="min-w-0 overflow-hidden bg-white/60">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 border-b border-white/70">
            <div>
              <div className="flex items-center gap-2"><CardTitle>{card?.label}</CardTitle><Badge>{data?.counts[category] ?? 0} emails</Badge></div>
              <CardDescription className="mt-1">{card?.description}</CardDescription>
            </div>
            <Button className="sm:hidden" onClick={() => setIsMobileSelectionMode((current) => !current)} size="sm" type="button" variant="outline">{isMobileSelectionMode ? "Cancel" : "Select"}</Button>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? <DashboardSkeleton /> : (
              <>
                <AttentionSelectionHeader
                  allLoadedSelected={allLoadedSelected} allResultsSelected={allResultsSelected} categoryLabel={card?.label ?? "category"}
                  hasMore={Boolean(pagination?.hasMore)} isMobileSelectionMode={isMobileSelectionMode} isSelectingAll={isSelectingAll}
                  loadedCount={categoryMessages.length} onSelectAllMatching={() => void selectAllMatching()} onToggleLoaded={toggleLoadedMessages}
                  selectedCount={selected.length} totalCount={data?.counts[category] ?? 0}
                />
                {category === "cleanup" ? (
                  <AttentionCleanupGroups
                    expandedGroups={expandedGroups} groups={data?.cleanupGroups ?? []} onOpen={onOpen}
                    onToggleExpanded={(id) => setExpandedGroups((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])}
                    onToggleGroup={toggleCleanupGroup} onToggleMessage={toggleMessage} selectedKeys={selectedKeys}
                  />
                ) : (
                  <AttentionPriorityList
                    category={category} isActionRunning={isActionRunning} isMobileSelectionMode={isMobileSelectionMode} messages={categoryMessages}
                    onArchive={(message) => void archiveMessages([message])} onCommitment={onCommitment} onOpen={onOpen}
                    onToggleFollow={(message) => void onToggleFollow(message)} onToggleSelection={toggleMessage}
                    onTrash={(message) => setPendingTrash([message])} selectedKeys={selectedKeys}
                  />
                )}
                {pagination?.hasMore ? (
                  <div className="flex justify-center border-t border-white/70 p-4">
                    <Button disabled={isLoadingMore} onClick={() => void loadMore()} type="button" variant="outline">{isLoadingMore ? <><Loader2 className="h-4 w-4 animate-spin" />Loading…</> : "Load 10 more"}</Button>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
        {detailPanel}
      </div>

      {pendingTrash ? <AttentionTrashConfirmation isRunning={isActionRunning} messages={pendingTrash} onCancel={() => setPendingTrash(null)} onConfirm={(messages) => void trashMessages(messages)} /> : null}
      <p aria-live="polite" className="sr-only">{announcement}</p>
    </section>
  );
}

function AttentionSelectionHeader({ allLoadedSelected, allResultsSelected, categoryLabel, hasMore, isMobileSelectionMode, isSelectingAll, loadedCount, onSelectAllMatching, onToggleLoaded, selectedCount, totalCount }: {
  allLoadedSelected: boolean; allResultsSelected: boolean; categoryLabel: string; hasMore: boolean; isMobileSelectionMode: boolean; isSelectingAll: boolean;
  loadedCount: number; onSelectAllMatching: () => void; onToggleLoaded: () => void; selectedCount: number; totalCount: number;
}) {
  return (
    <div className={cn("border-b border-white/70 bg-white/30 px-4 py-3 md:px-5", !isMobileSelectionMode && "max-sm:hidden")}>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 font-medium"><input aria-label={`Select loaded emails in ${categoryLabel}`} checked={allLoadedSelected || allResultsSelected} className="h-5 w-5 accent-violet-600" onChange={onToggleLoaded} type="checkbox" />Select loaded ({loadedCount})</label>
        <span className="text-zinc-500">{selectedCount} selected</span>
        {allLoadedSelected && hasMore && !allResultsSelected ? <Button disabled={isSelectingAll} onClick={onSelectAllMatching} size="sm" type="button" variant="outline">{isSelectingAll ? "Selecting…" : `Select all ${totalCount} emails in ${categoryLabel}`}</Button> : null}
        {allResultsSelected ? <span className="font-medium text-violet-700">All {totalCount} matching emails selected</span> : null}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return <div className="space-y-2 p-4" role="status" aria-label="Loading dashboard emails">{[0, 1, 2].map((item) => <div className="h-20 animate-pulse rounded-xl bg-white/70" key={item} />)}</div>;
}
