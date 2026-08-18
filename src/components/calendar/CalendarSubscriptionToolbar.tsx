import { CalendarPlus, Loader2, MoreVertical, RefreshCw } from "lucide-react";
import { LiquidGlassCard } from "../ui/liquid-glass";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import type { CalendarSubscription } from "./types";

type CalendarSubscriptionToolbarProps = {
  isLoading: boolean;
  selectedIds: string[];
  subscriptions: CalendarSubscription[];
  onOpenSubscribe: () => void;
  onOpenSubscription: (subscription: CalendarSubscription) => void;
  onSync: () => void;
  onToggleSubscription: (subscriptionId: string) => void;
};

export function CalendarSubscriptionToolbar({
  isLoading,
  onOpenSubscribe,
  onOpenSubscription,
  onSync,
  onToggleSubscription,
  selectedIds,
  subscriptions,
}: CalendarSubscriptionToolbarProps) {
  return (
    <LiquidGlassCard
      borderRadius="12px"
      className="bg-white/50 text-zinc-950"
      contentClassName="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between"
      glowIntensity="sm"
      shadowIntensity="sm"
      blurIntensity="sm"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-950">Calendar subscriptions</h3>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" /> : null}
        </div>
        <p className="mt-1 text-sm text-zinc-500">Filter events by subscribed calendar feed.</p>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {subscriptions.length ? (
            subscriptions.map((subscription) => {
              const isSelected = selectedIds.includes(subscription.id);
              return (
                <div
                  className={cn(
                    "flex shrink-0 cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm transition",
                    isSelected ? "border-white/70 bg-white/70 text-zinc-950 shadow-sm" : "border-white/50 bg-white/20 text-zinc-500 hover:bg-white/45",
                  )}
                  key={subscription.id}
                  title={subscription.lastError ? `Last sync error: ${subscription.lastError}` : subscription.url}
                >
                  <button
                    className="flex min-w-0 cursor-pointer items-center gap-2"
                    onClick={() => onToggleSubscription(subscription.id)}
                    type="button"
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: subscription.color }} />
                    <span className="max-w-48 truncate">{subscription.name}</span>
                    <span className="text-xs text-zinc-400">{subscription.eventCount}</span>
                  </button>
                  <span className="h-5 w-px bg-zinc-200/80" />
                  <button
                    aria-label={`Edit ${subscription.name}`}
                    className="-mr-1 rounded-full p-1 text-zinc-400 transition hover:bg-white/70 hover:text-zinc-950"
                    onClick={() => onOpenSubscription(subscription)}
                    type="button"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </div>
              );
            })
          ) : (
            <span className="rounded-full border border-dashed border-white/70 bg-white/20 px-3 py-2 text-sm text-zinc-500">
              No calendar subscriptions yet.
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          className="rounded-full border-white/70 bg-white/55 text-zinc-900 shadow-sm backdrop-blur-xl hover:bg-white/75"
          disabled={isLoading}
          onClick={onSync}
          type="button"
          variant="outline"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Sync
        </Button>
        <Button
          className="rounded-full border-white/70 bg-white/55 text-zinc-900 shadow-sm backdrop-blur-xl hover:bg-white/75"
          onClick={onOpenSubscribe}
          type="button"
          variant="outline"
        >
          <CalendarPlus className="h-4 w-4" />
          Subscribe
        </Button>
      </div>
    </LiquidGlassCard>
  );
}
