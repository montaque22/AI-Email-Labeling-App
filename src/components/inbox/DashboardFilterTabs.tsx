import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";

export type DashboardFilterOption = {
  count: number;
  icon: LucideIcon;
  label: string;
  value: string;
};

type DashboardFilterTabsProps = {
  ariaLabel: string;
  compact?: boolean;
  onChange: (value: string) => void;
  options: DashboardFilterOption[];
  value: string;
};

export function formatDashboardFilterCount(count: number) {
  if (count <= 999) return String(count);
  if (count < 1_000_000) {
    const thousands = count / 1_000;
    return `${formatSingleDecimal(thousands)}k`;
  }
  return `${formatSingleDecimal(count / 1_000_000)}m`;
}

function formatSingleDecimal(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function DashboardFilterTabs({ ariaLabel, compact = false, onChange, options, value }: DashboardFilterTabsProps) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        "flex gap-1 border-b border-white/70 bg-white/25 py-2",
        compact ? "overflow-hidden px-2" : "overflow-x-auto px-4",
      )}
      role="tablist"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const isSelected = value === option.value;
        return (
          <button
            aria-label={`${option.label} ${option.count}`}
            aria-selected={isSelected}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full text-sm font-medium transition",
              compact ? "min-w-0 flex-1 px-2" : "px-4",
              isSelected ? "bg-violet-600 text-white shadow-sm" : "text-zinc-600 hover:bg-white/70",
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="tab"
            title={compact ? option.label : undefined}
            type="button"
          >
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className={compact ? "sr-only" : undefined}>{option.label}</span>
            <span className={cn("tabular-nums", isSelected ? "text-violet-100" : "text-zinc-400")}>{formatDashboardFilterCount(option.count)}</span>
          </button>
        );
      })}
    </div>
  );
}
