export type CalendarView = "day" | "week" | "month" | "year";

export type CalendarDay = {
  date: Date;
  isoDate: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
};

export type CalendarSubscription = {
  id: string;
  name: string;
  url: string;
  color: string;
  enabled: boolean;
  eventCount: number;
  lastFetchedAt: string | null;
  lastError: string | null;
};

export type CalendarEvent = {
  id: string;
  subscriptionId: string;
  subscriptionName: string;
  color: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  url: string;
};
