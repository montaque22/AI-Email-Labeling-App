import type { CalendarDay, CalendarEvent, CalendarView } from "./types";

export const CALENDAR_VIEW_STORAGE_KEY = "emailable.calendar.view";

export const calendarViews: Array<{ id: CalendarView; label: string }> = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

export const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const monthLabels = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date(2026, index, 1)),
);

export function readStoredCalendarView(): CalendarView {
  const value = localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY);
  return value === "day" || value === "week" || value === "month" || value === "year" ? value : "month";
}

export function buildMonthDays(visibleDate: Date, today: Date): CalendarDay[] {
  const firstOfMonth = new Date(visibleDate.getFullYear(), visibleDate.getMonth(), 1);
  const startDate = addDays(firstOfMonth, -firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(startDate, index);
    return toCalendarDay(date, visibleDate.getMonth(), today);
  });
}

export function buildWeekDays(visibleDate: Date, today: Date): CalendarDay[] {
  const startDate = addDays(visibleDate, -visibleDate.getDay());
  return Array.from({ length: 7 }, (_, index) => toCalendarDay(addDays(startDate, index), visibleDate.getMonth(), today));
}

export function toCalendarDay(date: Date, visibleMonth: number, today: Date): CalendarDay {
  return {
    date,
    isoDate: toIsoDate(date),
    dayNumber: date.getDate(),
    isCurrentMonth: date.getMonth() === visibleMonth,
    isToday: isSameDay(date, today),
  };
}

export function buildYearOptions(currentYear: number) {
  return Array.from({ length: 21 }, (_, index) => currentYear - 10 + index);
}

export function clampDayToMonth(current: Date, year: number, month: number) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(current.getDate(), lastDay));
}

export function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isSameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

export function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function formatFullDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(date);
}

export function formatMonthName(date: Date) {
  return new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);
}

export function formatHour(hour: number) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(new Date(2026, 0, 1, hour));
}

export function formatEventTime(event: CalendarEvent) {
  if (event.allDay) {
    return "All day";
  }
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(event.startsAt));
}

export function formatEventDateRange(event: CalendarEvent) {
  const startsAt = new Date(event.startsAt);
  const endsAt = event.endsAt ? new Date(event.endsAt) : null;
  if (event.allDay) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(startsAt);
  }
  const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });
  const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  if (!endsAt) {
    return `${dateFormatter.format(startsAt)} at ${timeFormatter.format(startsAt)}`;
  }
  if (isSameDay(startsAt, endsAt)) {
    return `${dateFormatter.format(startsAt)}, ${timeFormatter.format(startsAt)} - ${timeFormatter.format(endsAt)}`;
  }
  return `${dateFormatter.format(startsAt)} at ${timeFormatter.format(startsAt)} - ${dateFormatter.format(endsAt)} at ${timeFormatter.format(endsAt)}`;
}

export function getCalendarRange(view: CalendarView, visibleDate: Date) {
  if (view === "day") {
    const start = startOfDay(visibleDate);
    return { start, end: addDays(start, 1) };
  }
  if (view === "week") {
    const start = addDays(startOfDay(visibleDate), -visibleDate.getDay());
    return { start, end: addDays(start, 7) };
  }
  if (view === "year") {
    return {
      start: new Date(visibleDate.getFullYear(), 0, 1),
      end: new Date(visibleDate.getFullYear() + 1, 0, 1),
    };
  }
  return {
    start: new Date(visibleDate.getFullYear(), visibleDate.getMonth(), 1),
    end: new Date(visibleDate.getFullYear(), visibleDate.getMonth() + 1, 1),
  };
}

export function groupEventsByDate(events: CalendarEvent[]) {
  return events.reduce<Record<string, CalendarEvent[]>>((groups, event) => {
    const date = toIsoDate(new Date(event.startsAt));
    groups[date] = [...(groups[date] || []), event];
    return groups;
  }, {});
}
