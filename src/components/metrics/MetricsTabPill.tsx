import { cn } from "../../lib/utils";
import type { MetricsTab } from "./types";

const tabs: Array<{ id: MetricsTab; label: string }> = [
  { id: "metrics", label: "Metrics" },
  { id: "logs", label: "Logs" },
  { id: "alarms", label: "Alarms" },
];

export function MetricsTabPill({ activeTab, onSelect }: { activeTab: MetricsTab; onSelect: (tab: MetricsTab) => void }) {
  return (
    <div className="inline-flex rounded-full border border-white/60 bg-white/10 p-1 shadow-sm [backdrop-filter:blur(14px)] [-webkit-backdrop-filter:blur(14px)]">
      {tabs.map((tab) => (
        <button
          className={cn(
            "rounded-full px-4 py-2 text-sm font-medium text-zinc-500 transition-all hover:text-zinc-950",
            activeTab === tab.id && "bg-white/50 text-zinc-950 shadow-sm",
          )}
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
