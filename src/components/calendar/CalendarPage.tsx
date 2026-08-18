import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LiquidGlassCard } from "../ui/liquid-glass";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../../lib/utils";
import { CalendarSubscribeModal } from "./CalendarSubscribeModal";
import { CalendarSubscriptionToolbar } from "./CalendarSubscriptionToolbar";
import {
  CALENDAR_VIEW_STORAGE_KEY,
  addDays,
  buildMonthDays,
  buildWeekDays,
  buildYearOptions,
  calendarViews,
  clampDayToMonth,
  formatEventTime,
  formatFullDate,
  formatHour,
  formatMonthName,
  getCalendarRange,
  groupEventsByDate,
  isSameDay,
  monthLabels,
  readStoredCalendarView,
  startOfDay,
  weekdayLabels,
} from "./calendar-utils";
import type { CalendarDay, CalendarEvent, CalendarSubscription, CalendarView } from "./types";

export function CalendarPage() {
  const [view, setView] = useState<CalendarView>(() => readStoredCalendarView());
  const [visibleDate, setVisibleDate] = useState(() => startOfDay(new Date()));
  const [subscriptions, setSubscriptions] = useState<CalendarSubscription[]>([]);
  const [selectedSubscriptionIds, setSelectedSubscriptionIds] = useState<string[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(true);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isSubscribeOpen, setIsSubscribeOpen] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<CalendarSubscription | null>(null);
  const [isSavingSubscription, setIsSavingSubscription] = useState(false);
  const [isDeletingSubscription, setIsDeletingSubscription] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const today = useMemo(() => startOfDay(new Date()), []);
  const years = useMemo(() => buildYearOptions(visibleDate.getFullYear()), [visibleDate]);
  const monthDays = useMemo(() => buildMonthDays(visibleDate, today), [visibleDate, today]);
  const weekDays = useMemo(() => buildWeekDays(visibleDate, today), [visibleDate, today]);
  const eventGroups = useMemo(() => groupEventsByDate(events), [events]);
  const range = useMemo(() => getCalendarRange(view, visibleDate), [view, visibleDate]);

  useEffect(() => {
    void loadSubscriptions();
  }, []);

  useEffect(() => {
    const enabledIds = subscriptions.map((subscription) => subscription.id);
    setSelectedSubscriptionIds((current) => {
      const retained = current.filter((id) => enabledIds.includes(id));
      return retained.length || !enabledIds.length ? retained : enabledIds;
    });
  }, [subscriptions]);

  useEffect(() => {
    void loadEvents();
  }, [range.start.getTime(), range.end.getTime(), selectedSubscriptionIds.join(",")]);

  async function loadSubscriptions() {
    setIsLoadingSubscriptions(true);
    setCalendarError(null);
    try {
      const response = await fetch("/api/calendar/subscriptions");
      const data = await parseJsonResponse(response);
      setSubscriptions(data.subscriptions || []);
    } catch (error) {
      setCalendarError(error instanceof Error ? error.message : "Could not load calendar subscriptions");
    } finally {
      setIsLoadingSubscriptions(false);
    }
  }

  async function loadEvents() {
    setIsLoadingEvents(true);
    try {
      if (subscriptions.length > 0 && selectedSubscriptionIds.length === 0) {
        setEvents([]);
        return;
      }
      const params = new URLSearchParams({
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      });
      if (selectedSubscriptionIds.length) {
        params.set("subscriptionIds", selectedSubscriptionIds.join(","));
      }
      const response = await fetch(`/api/calendar/events?${params.toString()}`);
      const data = await parseJsonResponse(response);
      setEvents(data.events || []);
    } catch (error) {
      setCalendarError(error instanceof Error ? error.message : "Could not load calendar events");
    } finally {
      setIsLoadingEvents(false);
    }
  }

  async function createSubscription(input: { name: string; url: string; color: string }) {
    setIsSavingSubscription(true);
    setSubscriptionError(null);
    try {
      const response = await fetch("/api/calendar/subscriptions", {
        body: JSON.stringify(input),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await parseJsonResponse(response);
      await loadSubscriptions();
      setIsSubscribeOpen(false);
    } catch (error) {
      setSubscriptionError(error instanceof Error ? error.message : "Could not subscribe to that calendar");
    } finally {
      setIsSavingSubscription(false);
    }
  }

  async function updateSubscription(input: { name: string; url: string; color: string }) {
    if (!editingSubscription) {
      return;
    }
    setIsSavingSubscription(true);
    setSubscriptionError(null);
    try {
      const response = await fetch(`/api/calendar/subscriptions/${editingSubscription.id}`, {
        body: JSON.stringify(input),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });
      await parseJsonResponse(response);
      await loadSubscriptions();
      await loadEvents();
      setIsSubscribeOpen(false);
      setEditingSubscription(null);
    } catch (error) {
      setSubscriptionError(error instanceof Error ? error.message : "Could not update that calendar");
    } finally {
      setIsSavingSubscription(false);
    }
  }

  async function deleteSubscription() {
    if (!editingSubscription) {
      return;
    }
    setIsDeletingSubscription(true);
    setSubscriptionError(null);
    try {
      const response = await fetch(`/api/calendar/subscriptions/${editingSubscription.id}`, {
        method: "DELETE",
      });
      await parseJsonResponse(response);
      setSelectedSubscriptionIds((current) => current.filter((id) => id !== editingSubscription.id));
      await loadSubscriptions();
      await loadEvents();
      setIsSubscribeOpen(false);
      setEditingSubscription(null);
    } catch (error) {
      setSubscriptionError(error instanceof Error ? error.message : "Could not delete that calendar");
    } finally {
      setIsDeletingSubscription(false);
    }
  }

  function updateView(nextView: CalendarView) {
    setView(nextView);
    localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, nextView);
  }

  function movePeriod(direction: -1 | 1) {
    setVisibleDate((current) => {
      if (view === "day") {
        return addDays(current, direction);
      }
      if (view === "week") {
        return addDays(current, direction * 7);
      }
      if (view === "year") {
        return clampDayToMonth(current, current.getFullYear() + direction, current.getMonth());
      }
      return new Date(current.getFullYear(), current.getMonth() + direction, 1);
    });
  }

  function updateMonth(month: number) {
    setVisibleDate((current) => clampDayToMonth(current, current.getFullYear(), month));
  }

  function updateYear(year: number) {
    setVisibleDate((current) => clampDayToMonth(current, year, current.getMonth()));
  }

  function toggleSubscription(subscriptionId: string) {
    setSelectedSubscriptionIds((current) =>
      current.includes(subscriptionId) ? current.filter((id) => id !== subscriptionId) : [...current, subscriptionId],
    );
  }

  async function syncCalendarData() {
    await loadSubscriptions();
    await loadEvents();
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <CalendarSubscriptionToolbar
        isLoading={isLoadingSubscriptions || isLoadingEvents}
        onOpenSubscribe={() => {
          setEditingSubscription(null);
          setSubscriptionError(null);
          setIsSubscribeOpen(true);
        }}
        onOpenSubscription={(subscription) => {
          setEditingSubscription(subscription);
          setSubscriptionError(null);
          setIsSubscribeOpen(true);
        }}
        onSync={() => {
          void syncCalendarData();
        }}
        onToggleSubscription={toggleSubscription}
        selectedIds={selectedSubscriptionIds}
        subscriptions={subscriptions}
      />

      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
          <div>
            <CardTitle>Calendar</CardTitle>
            <CardDescription>Switch between day, week, month, and year views.</CardDescription>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <CalendarViewToggle value={view} onChange={updateView} />
            <div className="flex items-center gap-2">
              <Button aria-label="Previous period" className="rounded-full border-white/70 bg-white/50" onClick={() => movePeriod(-1)} size="icon" type="button" variant="outline">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button className="rounded-full border-white/70 bg-white/50" onClick={() => setVisibleDate(startOfDay(new Date()))} type="button" variant="outline">
                Today
              </Button>
              <Button aria-label="Next period" className="rounded-full border-white/70 bg-white/50" onClick={() => movePeriod(1)} size="icon" type="button" variant="outline">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {calendarError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{calendarError}</div> : null}

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <select
              aria-label="Calendar month"
              className="h-11 rounded-full border border-white/70 bg-white/50 px-4 text-sm shadow-sm outline-none backdrop-blur-xl"
              onChange={(event) => updateMonth(Number(event.target.value))}
              value={visibleDate.getMonth()}
            >
              {monthLabels.map((month, index) => (
                <option key={month} value={index}>
                  {month}
                </option>
              ))}
            </select>
            <select
              aria-label="Calendar year"
              className="h-11 rounded-full border border-white/70 bg-white/50 px-4 text-sm shadow-sm outline-none backdrop-blur-xl"
              onChange={(event) => updateYear(Number(event.target.value))}
              value={visibleDate.getFullYear()}
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {view === "month" ? <MonthCalendar days={monthDays} eventGroups={eventGroups} visibleDate={visibleDate} /> : null}
          {view === "week" ? <WeekCalendar days={weekDays} eventGroups={eventGroups} /> : null}
          {view === "day" ? <DayCalendar date={visibleDate} events={eventGroups[toDateKey(visibleDate)] || []} isToday={isSameDay(visibleDate, today)} /> : null}
          {view === "year" ? <YearCalendar eventGroups={eventGroups} visibleDate={visibleDate} today={today} onSelectMonth={updateMonth} /> : null}
        </CardContent>
      </Card>

      {isSubscribeOpen ? (
        <CalendarSubscribeModal
          error={subscriptionError}
          initialSubscription={editingSubscription}
          isDeleting={isDeletingSubscription}
          isSaving={isSavingSubscription}
          onClose={() => {
            setIsSubscribeOpen(false);
            setEditingSubscription(null);
          }}
          onDelete={editingSubscription ? deleteSubscription : undefined}
          onSubmit={editingSubscription ? updateSubscription : createSubscription}
        />
      ) : null}
    </div>
  );
}

function CalendarViewToggle({ value, onChange }: { value: CalendarView; onChange: (view: CalendarView) => void }) {
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

function MonthCalendar({ days, eventGroups, visibleDate }: { days: CalendarDay[]; eventGroups: Record<string, CalendarEvent[]>; visibleDate: Date }) {
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
          <CalendarCell day={day} events={eventGroups[day.isoDate] || []} key={day.isoDate} visibleMonth={visibleDate.getMonth()} />
        ))}
      </div>
    </div>
  );
}

function WeekCalendar({ days, eventGroups }: { days: CalendarDay[]; eventGroups: Record<string, CalendarEvent[]> }) {
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
            <EventList events={eventGroups[day.isoDate] || []} emptyLabel="No events" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DayCalendar({ date, events, isToday }: { date: Date; events: CalendarEvent[]; isToday: boolean }) {
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
            <EventList events={events} />
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

function YearCalendar({ eventGroups, onSelectMonth, today, visibleDate }: { eventGroups: Record<string, CalendarEvent[]>; onSelectMonth: (month: number) => void; today: Date; visibleDate: Date }) {
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

function CalendarCell({ day, events, visibleMonth }: { day: CalendarDay; events: CalendarEvent[]; visibleMonth: number }) {
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
            <EventPill event={event} key={event.id} />
          ))}
          {hiddenEventCount ? <span className="block truncate text-[11px] text-zinc-400">+{hiddenEventCount} more</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function EventList({ emptyLabel, events }: { emptyLabel?: string; events: CalendarEvent[] }) {
  if (!events.length) {
    return emptyLabel ? <span className="text-sm text-zinc-400">{emptyLabel}</span> : null;
  }

  return (
    <>
      {events.map((event) => (
        <div className="rounded-lg border border-white/70 bg-white/45 p-2 text-sm shadow-sm" key={event.id}>
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
        </div>
      ))}
    </>
  );
}

function EventPill({ event }: { event: CalendarEvent }) {
  return (
    <div className="flex min-w-0 items-center gap-1 rounded-md bg-white/55 px-1.5 py-1 text-[11px] shadow-sm" title={`${event.title} · ${event.subscriptionName}`}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: event.color }} />
      <span className="truncate">{event.allDay ? event.title : `${formatEventTime(event)} ${event.title}`}</span>
    </div>
  );
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function parseJsonResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Calendar request failed");
  }
  return data;
}
