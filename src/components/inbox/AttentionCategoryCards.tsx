import { Bookmark, ChevronRight, Layers3, TriangleAlert } from "lucide-react";
import { cn } from "../../lib/utils";
import type { AttentionCategory } from "./attention-dashboard-types";

export const ATTENTION_CATEGORY_CARDS = [
  { id: "attention" as const, label: "Needs Attention", description: "Emails requiring action or review.", icon: TriangleAlert, tone: "orange" },
  { id: "interest" as const, label: "Of Interest", description: "Emails frequently revisited or explicitly followed.", icon: Bookmark, tone: "blue" },
  { id: "cleanup" as const, label: "Quick Cleanup", description: "Low-priority emails grouped for batch review.", icon: Layers3, tone: "emerald" },
];

export function AttentionCategoryCards({ category, counts, isLoading, onSelect }: {
  category: AttentionCategory;
  counts?: Record<AttentionCategory, number>;
  isLoading: boolean;
  onSelect: (category: AttentionCategory) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
      {ATTENTION_CATEGORY_CARDS.map((card) => {
        const Icon = card.icon;
        const selected = category === card.id;
        return (
          <button
            aria-pressed={selected}
            className={cn(
              "min-h-[118px] rounded-2xl border bg-white/65 p-4 text-left shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/85 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 sm:min-h-36 md:p-5",
              selected ? "border-violet-400 ring-1 ring-violet-300" : "border-white/80",
            )}
            key={card.id}
            onClick={() => onSelect(card.id)}
            type="button"
          >
            <div className="relative flex h-full items-center gap-4 sm:block">
              <span className={cn(
                "inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12",
                card.tone === "orange" && "bg-orange-100 text-orange-600",
                card.tone === "blue" && "bg-blue-100 text-blue-600",
                card.tone === "emerald" && "bg-emerald-100 text-emerald-600",
              )}><Icon className="h-7 w-7 sm:h-6 sm:w-6" /></span>
              <span className="min-w-0 flex-1 sm:mt-3 sm:block">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-lg font-semibold text-zinc-950">{card.label}</span>
                  <span className="rounded-full bg-violet-100 px-3 py-1 text-xl font-semibold text-indigo-950 sm:absolute sm:right-0 sm:top-0 sm:bg-transparent sm:p-0 sm:text-3xl">{isLoading ? "–" : counts?.[card.id] ?? 0}</span>
                </span>
                <span className="mt-1 block text-sm text-zinc-500">{card.description}</span>
              </span>
              <ChevronRight className="h-6 w-6 shrink-0 text-zinc-500 sm:absolute sm:bottom-0 sm:right-0 sm:h-5 sm:w-5" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
