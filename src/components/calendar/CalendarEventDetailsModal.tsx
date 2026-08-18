import { CalendarDays, Clock, ExternalLink, MapPin, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { LiquidGlassCard } from "../ui/liquid-glass";
import { formatEventDateRange } from "./calendar-utils";
import type { CalendarEvent } from "./types";

type CalendarEventDetailsModalProps = {
  event: CalendarEvent;
  onClose: () => void;
};

export function CalendarEventDetailsModal({ event, onClose }: CalendarEventDetailsModalProps) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/25 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="calendar-event-title">
      <LiquidGlassCard
        blurIntensity="sm"
        borderRadius="12px"
        className="w-full max-w-2xl bg-white/70 text-zinc-950"
        glowIntensity="sm"
        shadowIntensity="sm"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/70 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{event.subscriptionName}</p>
            <h2 className="mt-1 truncate text-lg font-semibold" id="calendar-event-title">
              {event.title}
            </h2>
          </div>
          <button className="rounded-full p-1 text-zinc-500 transition hover:bg-white/60 hover:text-zinc-950" onClick={onClose} type="button" aria-label="Close event details">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-5">
          <DetailRow icon={<Clock className="h-4 w-4" />} label="When">
            {formatEventDateRange(event)}
          </DetailRow>
          <DetailRow icon={<CalendarDays className="h-4 w-4" />} label="Calendar">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: event.color }} />
              {event.subscriptionName}
            </span>
          </DetailRow>
          {event.location ? (
            <DetailRow icon={<MapPin className="h-4 w-4" />} label="Location">
              {event.location}
            </DetailRow>
          ) : null}
          {event.url ? (
            <DetailRow icon={<ExternalLink className="h-4 w-4" />} label="Link">
              <a className="text-blue-600 underline-offset-2 hover:underline" href={event.url} rel="noreferrer" target="_blank">
                Open event
              </a>
            </DetailRow>
          ) : null}
          {event.description ? (
            <div className="rounded-xl border border-white/70 bg-white/45 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Description</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700">{event.description}</p>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-white/70 px-5 py-4">
          <Button className="rounded-full border-white/70 bg-white/50" onClick={onClose} type="button" variant="outline">
            Close
          </Button>
        </div>
      </LiquidGlassCard>
    </div>
  );
}

function DetailRow({ children, icon, label }: { children: ReactNode; icon: ReactNode; label: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-white/70 bg-white/35 p-4">
      <span className="mt-0.5 text-zinc-500">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
        <div className="mt-1 break-words text-sm text-zinc-800">{children}</div>
      </div>
    </div>
  );
}
