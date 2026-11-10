import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../../lib/utils";
import { useAvailableViewportHeight } from "../../hooks/useAvailableViewportHeight";
import { AttentionCategoryCards, ATTENTION_CATEGORY_CARDS } from "./AttentionCategoryCards";
import { AttentionCleanupGroups } from "./AttentionCleanupGroups";
import { AttentionPriorityList } from "./AttentionPriorityList";
import { AttentionTrashConfirmation } from "./AttentionTrashConfirmation";
import { InboxPageHeader } from "./InboxPageHeader";
import type { AttentionCleanupGroup, AttentionDashboardProps, AttentionMessage } from "./attention-dashboard-types";
import { attentionMessageKey } from "./attention-dashboard-utils";

export type { AttentionCategory, AttentionDashboardData, AttentionMessage } from "./attention-dashboard-types";

export function AttentionDashboard({
  category, data, detailPanel, headerAction, isActionRunning = false, isLoading, onArchive, onCommitment, onDelete,
  onLoadMore, onNotQuickWin, onOpen, onReturnInterest, onSelectAllMatching, onSelectCategory, onSelectionChange,
  onStillInterested, onToggleFollow, selectedMessages,
}: AttentionDashboardProps) {
  const [allResultsSelected, setAllResultsSelected] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isMobileSelectionMode, setIsMobileSelectionMode] = useState(false);
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [pendingTrash, setPendingTrash] = useState<AttentionMessage[] | null>(null);
  const [attentionFilter, setAttentionFilter] = useState<"all" | "quick-wins" | "commitments">("all");
  const [cleanupView, setCleanupView] = useState<"likely-clutter" | "needs-review">("likely-clutter");
  const workModeLayoutRef = useRef<HTMLDivElement>(null);
  const workModeHeight = useAvailableViewportHeight(workModeLayoutRef, Boolean(detailPanel));

  const categoryMessages = category === "cleanup" && cleanupView === "needs-review"
    ? data?.cleanupReview ?? []
    : category === "attention" && attentionFilter === "quick-wins"
      ? data?.quickWins ?? []
      : category === "attention" && attentionFilter === "commitments"
        ? data?.commitments ?? []
        : data?.categories[category] ?? [];
  const selected = selectedMessages;
  const selectedKeys = useMemo(() => new Set(selectedMessages.map(attentionMessageKey)), [selectedMessages]);
  const allLoadedSelected = categoryMessages.length > 0 && categoryMessages.every((message) => selectedKeys.has(attentionMessageKey(message)));
  const pagination = category === "cleanup" || (category === "attention" && attentionFilter !== "all") ? null : data?.pagination?.[category];
  const displayedTotal = category === "attention" && attentionFilter === "quick-wins"
    ? data?.quickWinCount ?? 0
    : category === "attention" && attentionFilter === "commitments"
      ? data?.commitments?.length ?? 0
      : category === "cleanup" && cleanupView === "needs-review"
        ? data?.cleanupCounts?.needsReview ?? 0
        : category === "cleanup"
          ? data?.cleanupCounts?.likelyClutter ?? 0
          : data?.counts[category] ?? 0;
  const card = ATTENTION_CATEGORY_CARDS.find((item) => item.id === category);
  const showInitialLoading = isLoading && !data;

  useEffect(() => {
    onSelectionChange([]);
    setAllResultsSelected(false);
    setIsMobileSelectionMode(false);
    setAttentionFilter("all");
  }, [category, onSelectionChange]);

  useEffect(() => {
    onSelectionChange([]);
    setAllResultsSelected(false);
  }, [attentionFilter, cleanupView, onSelectionChange]);

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
      <InboxPageHeader action={headerAction} />

      <AttentionCategoryCards category={category} counts={data?.counts} isLoading={showInitialLoading} onSelect={onSelectCategory} />

      <div
        className={cn("min-w-0", detailPanel && "attention-work-mode-layout grid min-h-0 items-stretch gap-4 overflow-hidden")}
        ref={workModeLayoutRef}
        style={workModeHeight ? { height: `${workModeHeight}px` } : undefined}
      >
        <Card className={cn("min-w-0 overflow-visible bg-white/60", detailPanel && "attention-work-mode-list flex h-full min-h-0 flex-col overflow-hidden")}>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 border-b border-white/70">
            <div>
              <div className="flex items-center gap-2"><CardTitle>{card?.label}</CardTitle><Badge>{data?.counts[category] ?? 0} emails</Badge></div>
              <CardDescription className="mt-1">{card?.description}</CardDescription>
            </div>
            <Button className="sm:hidden" onClick={() => setIsMobileSelectionMode((current) => !current)} size="sm" type="button" variant="outline">{isMobileSelectionMode ? "Cancel" : "Select"}</Button>
          </CardHeader>
          {category === "attention" ? (
            <DashboardTabs ariaLabel="Needs Attention filters" onChange={(value) => setAttentionFilter(value as typeof attentionFilter)} options={[
              { count: data?.counts.attention ?? 0, label: "All", value: "all" },
              { count: data?.quickWinCount ?? 0, label: "Quick Wins", value: "quick-wins" },
              { count: data?.categories.attention.filter((message) => Boolean(message.commitment && !message.commitment.isCompleted)).length ?? 0, label: "Commitments", value: "commitments" },
            ]} value={attentionFilter} />
          ) : null}
          {category === "cleanup" ? (
            <DashboardTabs ariaLabel="Quick Cleanup views" onChange={(value) => setCleanupView(value as typeof cleanupView)} options={[
              { count: data?.cleanupCounts?.likelyClutter ?? 0, label: "Likely Clutter", value: "likely-clutter" },
              { count: data?.cleanupCounts?.needsReview ?? 0, label: "Needs Review", value: "needs-review" },
            ]} value={cleanupView} />
          ) : null}
          <CardContent className={cn("p-0", detailPanel && "min-h-0 flex-1 overflow-y-auto")}>
            {showInitialLoading ? <DashboardSkeleton /> : (
              <>
                <AttentionSelectionHeader
                  allLoadedSelected={allLoadedSelected} allResultsSelected={allResultsSelected} categoryLabel={card?.label ?? "category"}
                  hasMore={Boolean(pagination?.hasMore)} isMobileSelectionMode={isMobileSelectionMode} isSelectingAll={isSelectingAll}
                  loadedCount={categoryMessages.length} onSelectAllMatching={() => void selectAllMatching()} onToggleLoaded={toggleLoadedMessages}
                  selectedCount={selected.length} totalCount={displayedTotal}
                />
                {category === "cleanup" && cleanupView === "likely-clutter" ? (
                  <AttentionCleanupGroups
                    expandedGroups={expandedGroups} groups={data?.cleanupGroups ?? []} onOpen={onOpen}
                    onToggleExpanded={(id) => setExpandedGroups((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])}
                    onToggleGroup={toggleCleanupGroup} onToggleMessage={toggleMessage} selectedKeys={selectedKeys}
                  />
                ) : (
                  <AttentionPriorityList
                    compact={Boolean(detailPanel)}
                    category={category} isActionRunning={isActionRunning} isMobileSelectionMode={isMobileSelectionMode} messages={categoryMessages}
                    onArchive={(message) => void archiveMessages([message])} onCommitment={onCommitment} onNotQuickWin={(message) => void onNotQuickWin(message)} onOpen={onOpen}
                    onReturnInterest={(message) => void onReturnInterest(message)} onStillInterested={(message) => void onStillInterested(message)}
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

function DashboardTabs({ ariaLabel, onChange, options, value }: {
  ariaLabel: string;
  onChange: (value: string) => void;
  options: Array<{ count: number; label: string; value: string }>;
  value: string;
}) {
  return (
    <div aria-label={ariaLabel} className="flex gap-1 overflow-x-auto border-b border-white/70 bg-white/25 px-4 py-2" role="tablist">
      {options.map((option) => (
        <button aria-selected={value === option.value} className={cn("min-h-10 shrink-0 rounded-full px-4 text-sm font-medium transition", value === option.value ? "bg-violet-600 text-white shadow-sm" : "text-zinc-600 hover:bg-white/70")} key={option.value} onClick={() => onChange(option.value)} role="tab" type="button">
          {option.label} <span className={cn("ml-1", value === option.value ? "text-violet-100" : "text-zinc-400")}>{option.count}</span>
        </button>
      ))}
    </div>
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
