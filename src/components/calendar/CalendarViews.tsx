import { LiquidGlassCard } from "../ui/liquid-glass";
import { cn } from "../../lib/utils";
import {
  buildMonthDays,
  calendarViews,
  formatEventTime,
  formatFullDate,
  formatHour,
  formatMonthName,
  monthLabels,
  weekdayLabels,
} from "./calendar-utils";
import type { CalendarDay, CalendarEvent, CalendarView } from "./types";

type CalendarEventSelectHandler = (event: CalendarEvent) => void;

export function CalendarViewToggle({ value, onChange }: { value: CalendarView; onChange: (view: CalendarView) => void }) {
  const selectedIndex = calendarViews.findIndex((view) => view.id === value);

  return (
    <LiquidGlassCard
      borderRadius="999px"
      className="relative h-10 w-full rounded-full border border-white/60 bg-white/10 p-1 shadow-sm backdrop-blur-xl sm:w-96"
      contentClassName="grid grid-cols-4"
      glowIntensity="none"
      shadowIntensity="xs"
    >
      <span
        className={cn(
          "absolute bottom-[1%] left-1 top-[1%] w-[calc((100%-0.5rem)/4)] rounded-full bg-white/50 shadow-sm transition-transform duration-300 ease-out",
          selectedIndex === 1 && "translate-x-full",
          selectedIndex === 2 && "translate-x-[200%]",
          selectedIndex === 3 && "translate-x-[300%]",
        )}
      />
      {calendarViews.map((view) => (
        <button
          className={cn(
            "relative z-10 flex cursor-pointer items-center justify-center rounded-full px-3 text-sm font-medium transition-colors duration-200",
            value === view.id ? "text-zinc-950" : "text-zinc-500 hover:text-zinc-800",
          )}
          key={view.id}
          onClick={() => onChange(view.id)}
          type="button"
        >
          {view.label}
        </button>
      ))}
    </LiquidGlassCard>
  );
}

export function MonthCalendar({
  days,
  eventGroups,
  onSelectEvent,
  visibleDate,
}: {
  days: CalendarDay[];
  eventGroups: Record<string, CalendarEvent[]>;
  onSelectEvent: CalendarEventSelectHandler;
  visibleDate: Date;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/70 bg-white/30 shadow-sm backdrop-blur-xl">
      <div className="grid grid-cols-7 border-b border-white/70 bg-white/30">
        {weekdayLabels.map((day) => (
          <div className="px-2 py-3 text-center text-xs font-medium uppercase tracking-wide text-zinc-500" key={day}>
            {day}
          </div>
        ))}
      </div>
      <div className="grid min-h-[34rem] grid-cols-7 auto-rows-fr max-sm:min-h-[30rem]">
        {days.map((day) => (
          <CalendarCell day={day} events={eventGroups[day.isoDate] || []} key={day.isoDate} onSelectEvent={onSelectEvent} visibleMonth={visibleDate.getMonth()} />
        ))}
      </div>
    </div>
  );
}

export function WeekCalendar({ days, eventGroups, onSelectEvent }: { days: CalendarDay[]; eventGroups: Record<string, CalendarEvent[]>; onSelectEvent: CalendarEventSelectHandler }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/70 bg-white/30 shadow-sm backdrop-blur-xl">
      <div className="grid grid-cols-7 border-b border-white/70 bg-white/30 max-sm:grid-cols-1">
        {days.map((day) => (
          <div className={cn("border-white/60 p-4 max-sm:border-b sm:border-r last:border-r-0", day.isToday && "bg-blue-50/70")} key={day.isoDate}>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{weekdayLabels[day.date.getDay()]}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold", day.isToday ? "bg-blue-600 text-white" : "bg-white/50 text-zinc-950")}>
                {day.dayNumber}
              </span>
              <span className="text-sm text-zinc-500">{formatMonthName(day.date)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="grid min-h-[28rem] grid-cols-7 max-sm:grid-cols-1">
        {days.map((day) => (
          <div className="space-y-2 border-white/60 p-4 max-sm:min-h-24 max-sm:border-b sm:border-r last:border-r-0" key={`${day.isoDate}-body`}>
            <EventList events={eventGroups[day.isoDate] || []} emptyLabel="No events" onSelectEvent={onSelectEvent} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DayCalendar({ date, events, isToday, onSelectEvent }: { date: Date; events: CalendarEvent[]; isToday: boolean; onSelectEvent: CalendarEventSelectHandler }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/70 bg-white/30 shadow-sm backdrop-blur-xl">
      <div className={cn("border-b border-white/70 p-5", isToday && "bg-blue-50/70")}>
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">{weekdayLabels[date.getDay()]}</p>
        <div className="mt-2 flex items-center gap-3">
          <span className={cn("flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold", isToday ? "bg-blue-600 text-white" : "bg-white/50 text-zinc-950")}>
            {date.getDate()}
          </span>
          <div>
            <p className="text-lg font-semibold">{formatFullDate(date)}</p>
            <p className="text-sm text-zinc-500">{events.length ? `${events.length} subscribed event${events.length === 1 ? "" : "s"}.` : "No events scheduled."}</p>
          </div>
        </div>
        {events.length ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <EventList events={events} onSelectEvent={onSelectEvent} />
          </div>
        ) : null}
      </div>
      <div className="divide-y divide-white/60">
        {Array.from({ length: 24 }, (_, hour) => (
          <div className="grid min-h-16 grid-cols-[4.5rem_minmax(0,1fr)]" key={hour}>
            <div className="border-r border-white/60 px-3 py-3 text-right text-xs text-zinc-400">{formatHour(hour)}</div>
            <div className="p-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function YearCalendar({ eventGroups, onSelectMonth, today, visibleDate }: { eventGroups: Record<string, CalendarEvent[]>; onSelectMonth: (month: number) => void; today: Date; visibleDate: Date }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {monthLabels.map((month, monthIndex) => {
        const days = buildMonthDays(new Date(visibleDate.getFullYear(), monthIndex, 1), today);
        const isCurrentMonth = today.getFullYear() === visibleDate.getFullYear() && today.getMonth() === monthIndex;
        return (
          <button
            className={cn(
              "cursor-pointer overflow-hidden rounded-xl border border-white/70 bg-white/30 text-left shadow-sm backdrop-blur-xl transition hover:bg-white/45",
              isCurrentMonth && "border-blue-200 bg-blue-50/60",
            )}
            key={month}
            onClick={() => onSelectMonth(monthIndex)}
            type="button"
          >
            <div className="flex items-center justify-between border-b border-white/70 bg-white/30 px-4 py-3">
              <h3 className="text-sm font-semibold text-zinc-950">{month}</h3>
              {isCurrentMonth ? <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white">Current</span> : null}
            </div>
            <div className="grid grid-cols-7 px-3 pt-3 text-center text-[10px] font-medium uppercase text-zinc-400">
              {weekdayLabels.map((day) => (
                <span key={day}>{day.slice(0, 1)}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 p-3">
              {days.map((day) => {
                const dayEvents = eventGroups[day.isoDate] || [];
                return (
                  <span
                    className={cn(
                      "relative flex aspect-square items-center justify-center rounded-full text-[11px]",
                      !day.isCurrentMonth && "text-zinc-300",
                      day.isCurrentMonth && "text-zinc-600",
                      day.isToday && "bg-blue-600 font-semibold text-white",
                    )}
                    key={day.isoDate}
                  >
                    {day.dayNumber}
                    {dayEvents.length ? <span className="absolute bottom-0 h-1 w-1 rounded-full" style={{ backgroundColor: dayEvents[0]?.color || "#2563eb" }} /> : null}
                  </span>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function CalendarCell({ day, events, onSelectEvent, visibleMonth }: { day: CalendarDay; events: CalendarEvent[]; onSelectEvent: CalendarEventSelectHandler; visibleMonth: number }) {
  const visibleEvents = events.slice(0, 2);
  const hiddenEventCount = Math.max(events.length - visibleEvents.length, 0);

  return (
    <div className={cn("min-h-24 border-r border-t border-white/60 p-2 text-sm last:border-r-0", day.date.getMonth() !== visibleMonth && "bg-white/20 text-zinc-400")}>
      <div className="flex items-center justify-between">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-full font-medium", day.isToday ? "bg-blue-600 text-white shadow-sm" : day.isCurrentMonth ? "text-zinc-950" : "text-zinc-400")}>
          {day.dayNumber}
        </span>
      </div>
      {visibleEvents.length ? (
        <div className="mt-2 space-y-1">
          {visibleEvents.map((event) => (
            <EventPill event={event} key={event.id} onSelectEvent={onSelectEvent} />
          ))}
          {hiddenEventCount ? <span className="block truncate text-[11px] text-zinc-400">+{hiddenEventCount} more</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function EventList({ emptyLabel, events, onSelectEvent }: { emptyLabel?: string; events: CalendarEvent[]; onSelectEvent: CalendarEventSelectHandler }) {
  if (!events.length) {
    return emptyLabel ? <span className="text-sm text-zinc-400">{emptyLabel}</span> : null;
  }

  return (
    <>
      {events.map((event) => (
        <button className="w-full rounded-lg border border-white/70 bg-white/45 p-2 text-left text-sm shadow-sm transition hover:bg-white/70" key={event.id} onClick={() => onSelectEvent(event)} type="button">
          <div className="flex items-start gap-2">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: event.color }} />
            <div className="min-w-0">
              <p className="truncate font-medium text-zinc-950">{event.title}</p>
              <p className="truncate text-xs text-zinc-500">
                {formatEventTime(event)}
                {event.location ? ` · ${event.location}` : ""}
              </p>
            </div>
          </div>
        </button>
      ))}
    </>
  );
}

function EventPill({ event, onSelectEvent }: { event: CalendarEvent; onSelectEvent: CalendarEventSelectHandler }) {
  return (
    <button className="flex min-w-0 cursor-pointer items-center gap-1 rounded-md bg-white/55 px-1.5 py-1 text-left text-[11px] shadow-sm transition hover:bg-white/80" onClick={() => onSelectEvent(event)} title={`${event.title} · ${event.subscriptionName}`} type="button">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: event.color }} />
      <span className="truncate">{event.allDay ? event.title : `${formatEventTime(event)} ${event.title}`}</span>
    </button>
  );
}
