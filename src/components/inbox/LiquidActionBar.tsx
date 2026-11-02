import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Archive, Check, Gem, MoreHorizontal, PenLine, Sparkles, Tag, Trash2, X } from "lucide-react";
import { cn } from "../../lib/utils";

type LiquidActionBarProps = {
  canArchive?: boolean;
  canTrash?: boolean;
  disabled?: boolean;
  isAiAvailable: boolean;
  labels?: Array<{ id: string; name: string }>;
  onArchive?: () => void;
  onClearSelection?: () => void;
  onCompose: () => void;
  onOpenAi: () => void;
  onSelectLabel?: (labelId: string) => void;
  onSetCommitment?: () => void;
  onTrash?: () => void;
  selectedCount: number;
  selectedLabelId?: string;
};

type LiquidActionButtonProps = {
  destructive?: boolean;
  disabled?: boolean;
  icon: typeof Sparkles;
  label: string;
  onClick: () => void;
};

export function LiquidActionBar({
  canArchive = true,
  canTrash = true,
  disabled = false,
  isAiAvailable,
  labels = [],
  onArchive,
  onClearSelection,
  onCompose,
  onOpenAi,
  onSelectLabel,
  onSetCommitment,
  onTrash,
  selectedCount,
  selectedLabelId,
}: LiquidActionBarProps) {
  const [isExpanded, setIsExpanded] = useState(selectedCount > 0);
  const [wasAutoExpanded, setWasAutoExpanded] = useState(selectedCount > 0);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const previousSelectedCount = useRef(selectedCount);
  const rootRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();
  const hasSelection = selectedCount > 0;

  useEffect(() => {
    const previous = previousSelectedCount.current;
    previousSelectedCount.current = selectedCount;
    if (previous === 0 && selectedCount > 0) {
      setIsExpanded(true);
      setWasAutoExpanded(true);
    } else if (previous > 0 && selectedCount === 0 && wasAutoExpanded) {
      setIsExpanded(false);
      setWasAutoExpanded(false);
    }
  }, [selectedCount, wasAutoExpanded]);

  useEffect(() => {
    if (!isExpanded) return;
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setIsExpanded(false);
        setIsMoreOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (isMoreOpen) {
          setIsMoreOpen(false);
          return;
        }
        setIsExpanded(false);
        orbRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isExpanded, isMoreOpen]);

  function runGeneralAction(action: () => void) {
    setIsExpanded(false);
    setWasAutoExpanded(false);
    action();
  }

  const liquidSpring = reduceMotion
    ? { duration: 0.12 }
    : { type: "spring" as const, visualDuration: 0.5, bounce: 0.28 };
  const contentSpring = reduceMotion
    ? { duration: 0.1 }
    : { type: "spring" as const, visualDuration: 0.42, bounce: 0.3, delay: isExpanded ? 0.08 : 0 };

  return (
    <div
      className="liquid-action-position fixed z-[100] max-w-[calc(100vw-1.5rem)]"
      ref={rootRef}
    >
      <motion.div
        animate={isExpanded ? "expanded" : "collapsed"}
        aria-label="Inbox actions"
        className={cn(
          "relative ml-auto flex min-h-14 items-center justify-end border border-white/80 shadow-2xl shadow-indigo-950/20 backdrop-blur-2xl",
          isExpanded ? "overflow-visible bg-white/90" : "overflow-hidden bg-gradient-to-br from-sky-400 via-indigo-500 to-fuchsia-500",
        )}
        initial={false}
        layout
        role={isExpanded ? "toolbar" : undefined}
        style={{ transformOrigin: "right center" }}
        transition={{
          borderRadius: liquidSpring,
          layout: liquidSpring,
          scaleY: reduceMotion ? { duration: 0.12 } : { duration: 0.5, ease: [0.34, 1.56, 0.64, 1], times: [0, 0.3, 0.7, 1] },
        }}
        variants={{
          collapsed: { borderRadius: 999, scaleY: reduceMotion ? 1 : [1, 0.9, 1.025, 1] },
          expanded: { borderRadius: 28, scaleY: reduceMotion ? 1 : [1, 0.91, 1.03, 1] },
        }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {isExpanded ? (
            <motion.div
              animate={{ opacity: 1, scale: 1, x: 0 }}
              className="flex min-w-0 items-center pl-2"
              exit={{ opacity: 0, scale: 0.86, x: 18 }}
              initial={{ opacity: 0, scale: 0.86, x: 18 }}
              id="liquid-action-content"
              key="actions"
              style={{ transformOrigin: "right center" }}
              transition={contentSpring}
            >
              {hasSelection ? (
                <>
                  <div className="flex min-h-11 items-center gap-1 px-2">
                    <span aria-live="polite" className="whitespace-nowrap text-sm font-semibold text-indigo-950">
                      {selectedCount} selected
                    </span>
                    {onClearSelection ? (
                      <button
                        aria-label="Clear selection"
                        className="hidden rounded-full px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 sm:block"
                        disabled={disabled}
                        onClick={onClearSelection}
                        title="Clear selection"
                        type="button"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                  <LiquidDivider />
                  {canArchive && onArchive ? <LiquidActionButton disabled={disabled} icon={Archive} label="Archive selected emails" onClick={onArchive} /> : null}
                  {canTrash && onTrash ? <LiquidActionButton destructive disabled={disabled} icon={Trash2} label="Move selected emails to Trash" onClick={onTrash} /> : null}
                  {onSetCommitment || onSelectLabel ? (
                    <div className="relative">
                      <LiquidActionButton disabled={disabled} icon={MoreHorizontal} label="More selection actions" onClick={() => setIsMoreOpen((current) => !current)} />
                      {isMoreOpen ? (
                        <div className="absolute bottom-14 right-0 z-20 w-64 overflow-hidden rounded-2xl border border-violet-100 bg-white p-2 text-zinc-800 shadow-2xl">
                          {onSetCommitment ? (
                            <button className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium hover:bg-violet-50" onClick={() => { setIsMoreOpen(false); onSetCommitment(); }} type="button">
                              <Gem className="h-4 w-4 text-violet-600" />Set commitment
                            </button>
                          ) : null}
                          {onSelectLabel ? (
                            <>
                              <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500"><Tag className="mr-1 inline h-3.5 w-3.5" />Move to label</p>
                              <div className="max-h-52 overflow-y-auto">
                                {[{ id: "", name: "No label" }, ...labels].map((label) => (
                                  <button className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm hover:bg-violet-50" key={label.id || "no-label"} onClick={() => { setIsMoreOpen(false); onSelectLabel(label.id); }} type="button">
                                    <span className="truncate">{label.name}</span>{selectedLabelId === label.id ? <Check className="h-4 w-4 text-violet-600" /> : null}
                                  </button>
                                ))}
                              </div>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <LiquidDivider />
                </>
              ) : null}
              {isAiAvailable ? <LiquidActionButton icon={Sparkles} label="Open AI Assistant" onClick={() => runGeneralAction(onOpenAi)} /> : null}
              <LiquidActionButton icon={PenLine} label="Compose email" onClick={() => runGeneralAction(onCompose)} />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.button
          aria-controls="liquid-action-content"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Collapse actions" : hasSelection ? `Open actions for ${selectedCount} selected emails` : "Open inbox actions"}
          className={cn(
            "relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
            isExpanded && "bg-gradient-to-br from-sky-400 via-indigo-500 to-fuchsia-500 shadow-lg shadow-violet-500/25",
          )}
          onClick={() => {
            setIsExpanded((current) => !current);
            setWasAutoExpanded(false);
          }}
          ref={orbRef}
          transition={liquidSpring}
          type="button"
          whileHover={reduceMotion ? undefined : { scale: 1.05 }}
          whileTap={reduceMotion ? undefined : { scale: 0.9 }}
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: isExpanded ? -45 : 45, scale: 0.6 }}
              initial={{ opacity: 0, rotate: isExpanded ? 45 : -45, scale: 0.6 }}
              key={isExpanded ? "close" : "sparkles"}
              transition={reduceMotion ? { duration: 0.08 } : { type: "spring", visualDuration: 0.45, bounce: 0.35 }}
            >
              {isExpanded ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </motion.div>
      {!isExpanded && hasSelection ? (
        <span className="pointer-events-none absolute -left-1.5 -top-1.5 z-20 flex min-h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-violet-700 px-1 text-xs font-bold text-white shadow-sm">
          {selectedCount > 99 ? "99+" : selectedCount}
        </span>
      ) : null}
    </div>
  );
}

function LiquidActionButton({ destructive = false, disabled = false, icon: Icon, label, onClick }: LiquidActionButtonProps) {
  return (
    <button
      aria-label={label}
      className={cn(
        "group flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50",
        destructive ? "text-red-600 hover:bg-red-50" : "text-indigo-950 hover:bg-violet-50",
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="hidden whitespace-nowrap lg:inline">{shortActionLabel(label)}</span>
    </button>
  );
}

function LiquidDivider() {
  return <span aria-hidden="true" className="mx-1 h-7 w-px shrink-0 bg-violet-200/70" />;
}

function shortActionLabel(label: string) {
  if (label.startsWith("Archive")) return "Archive";
  if (label.startsWith("Move")) return "Trash";
  if (label.startsWith("Open AI")) return "AI Assistant";
  return "Compose";
}
