import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../../lib/utils";

type CalendarView = "day" | "week" | "month";

type CalendarDay = {
  date: Date;
  isoDate: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
};

const CALENDAR_VIEW_STORAGE_KEY = "emailable.calendar.view";
const calendarViews: Array<{ id: CalendarView; label: string }> = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];
const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthLabels = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date(2026, index, 1)));

export function CalendarPage() {
  const [view, setView] = useState<CalendarView>(() => readStoredCalendarView());
  const [visibleDate, setVisibleDate] = useState(() => startOfDay(new Date()));
  const today = useMemo(() => startOfDay(new Date()), []);
  const years = useMemo(() => buildYearOptions(visibleDate.getFullYear()), [visibleDate]);
  const monthDays = useMemo(() => buildMonthDays(visibleDate, today), [visibleDate, today]);
  const weekDays = useMemo(() => buildWeekDays(visibleDate, today), [visibleDate, today]);

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
      return new Date(current.getFullYear(), current.getMonth() + direction, 1);
    });
  }

  function updateMonth(month: number) {
    setVisibleDate((current) => clampDayToMonth(current, current.getFullYear(), month));
  }

  function updateYear(year: number) {
    setVisibleDate((current) => clampDayToMonth(current, year, current.getMonth()));
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
          <div>
            <CardTitle>Calendar</CardTitle>
            <CardDescription>Switch between day, week, and month views.</CardDescription>
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

          {view === "month" ? <MonthCalendar days={monthDays} visibleDate={visibleDate} /> : null}
          {view === "week" ? <WeekCalendar days={weekDays} /> : null}
          {view === "day" ? <DayCalendar date={visibleDate} isToday={isSameDay(visibleDate, today)} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function CalendarViewToggle({ value, onChange }: { value: CalendarView; onChange: (view: CalendarView) => void }) {
  return (
    <div className="grid h-11 grid-cols-3 rounded-full bg-white/10 p-1 shadow-sm ring-1 ring-white/60 backdrop-blur-xl">
      {calendarViews.map((view) => (
        <button
          className={cn(
            "min-w-20 rounded-full px-4 text-sm text-zinc-500 transition-colors hover:text-zinc-950",
            value === view.id && "bg-white/50 text-zinc-950 shadow-sm",
          )}
          key={view.id}
          onClick={() => onChange(view.id)}
          type="button"
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}

function MonthCalendar({ days, visibleDate }: { days: CalendarDay[]; visibleDate: Date }) {
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
          <CalendarCell day={day} key={day.isoDate} visibleMonth={visibleDate.getMonth()} />
        ))}
      </div>
    </div>
  );
}

function WeekCalendar({ days }: { days: CalendarDay[] }) {
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
          <div className="border-white/60 p-4 max-sm:min-h-24 max-sm:border-b sm:border-r last:border-r-0" key={`${day.isoDate}-body`}>
            <span className="text-sm text-zinc-400">No events</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DayCalendar({ date, isToday }: { date: Date; isToday: boolean }) {
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
            <p className="text-sm text-zinc-500">No events scheduled.</p>
          </div>
        </div>
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

function CalendarCell({ day, visibleMonth }: { day: CalendarDay; visibleMonth: number }) {
  return (
    <div className={cn("min-h-20 border-r border-t border-white/60 p-2 text-sm last:border-r-0", day.date.getMonth() !== visibleMonth && "bg-white/20 text-zinc-400")}>
      <div className="flex items-center justify-between">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-full font-medium", day.isToday ? "bg-blue-600 text-white shadow-sm" : day.isCurrentMonth ? "text-zinc-950" : "text-zinc-400")}>
          {day.dayNumber}
        </span>
      </div>
    </div>
  );
}

function readStoredCalendarView(): CalendarView {
  const value = localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY);
  return value === "day" || value === "week" || value === "month" ? value : "month";
}

function buildMonthDays(visibleDate: Date, today: Date): CalendarDay[] {
  const firstOfMonth = new Date(visibleDate.getFullYear(), visibleDate.getMonth(), 1);
  const startDate = addDays(firstOfMonth, -firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(startDate, index);
    return toCalendarDay(date, visibleDate.getMonth(), today);
  });
}

function buildWeekDays(visibleDate: Date, today: Date): CalendarDay[] {
  const startDate = addDays(visibleDate, -visibleDate.getDay());
  return Array.from({ length: 7 }, (_, index) => toCalendarDay(addDays(startDate, index), visibleDate.getMonth(), today));
}

function toCalendarDay(date: Date, visibleMonth: number, today: Date): CalendarDay {
  return {
    date,
    isoDate: toIsoDate(date),
    dayNumber: date.getDate(),
    isCurrentMonth: date.getMonth() === visibleMonth,
    isToday: isSameDay(date, today),
  };
}

function buildYearOptions(currentYear: number) {
  return Array.from({ length: 21 }, (_, index) => currentYear - 10 + index);
}

function clampDayToMonth(current: Date, year: number, month: number) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(current.getDate(), lastDay));
}

function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatFullDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(date);
}

function formatMonthName(date: Date) {
  return new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);
}

function formatHour(hour: number) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(new Date(2026, 0, 1, hour));
}
