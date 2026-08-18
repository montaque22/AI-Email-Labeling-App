import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { CalendarEventDetailsModal } from "./CalendarEventDetailsModal";
import { CalendarSubscribeModal } from "./CalendarSubscribeModal";
import { CalendarSubscriptionToolbar } from "./CalendarSubscriptionToolbar";
import { CalendarViewToggle, DayCalendar, MonthCalendar, WeekCalendar, YearCalendar } from "./CalendarViews";
import {
  CALENDAR_VIEW_STORAGE_KEY,
  addDays,
  buildMonthDays,
  buildWeekDays,
  buildYearOptions,
  clampDayToMonth,
  getCalendarRange,
  groupEventsByDate,
  isSameDay,
  monthLabels,
  readStoredCalendarView,
  startOfDay,
} from "./calendar-utils";
import type { CalendarEvent, CalendarSubscription, CalendarView } from "./types";

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
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
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
      const data = await parseJsonResponse(response);
      if (data.subscription?.id) {
        setSelectedSubscriptionIds((current) => (current.includes(data.subscription.id) ? current : [...current, data.subscription.id]));
      }
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

          {view === "month" ? <MonthCalendar days={monthDays} eventGroups={eventGroups} onSelectEvent={setSelectedEvent} visibleDate={visibleDate} /> : null}
          {view === "week" ? <WeekCalendar days={weekDays} eventGroups={eventGroups} onSelectEvent={setSelectedEvent} /> : null}
          {view === "day" ? <DayCalendar date={visibleDate} events={eventGroups[toDateKey(visibleDate)] || []} isToday={isSameDay(visibleDate, today)} onSelectEvent={setSelectedEvent} /> : null}
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

      {selectedEvent ? <CalendarEventDetailsModal event={selectedEvent} onClose={() => setSelectedEvent(null)} /> : null}
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
