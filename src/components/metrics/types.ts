export type TimelinePoint = {
  date: string;
  value: number;
};

export type AiUsageSeries = {
  model: string;
  points: TimelinePoint[];
};

export type MetricsTab = "metrics" | "logs" | "alarms";

export type AlarmStatus = "ok" | "unknown" | "error";

export type AlarmSimulationPoint = {
  timestamp: string;
  errors: number;
  threshold: number;
};

export type AlarmGranularity = "day" | "hour" | "minute";

export type LogAlarm = {
  id: string;
  name: string;
  description: string;
  logGroup: string;
  alarmType: "aggregate";
  thresholdOperator: "above" | "below";
  thresholdCount: number;
  filterMode: "none" | "contains";
  filterText: string;
  periodMinutes: number;
  status: AlarmStatus;
  simulation: AlarmSimulationPoint[];
  createdAt: string;
  updatedAt: string;
};

export type LogAlarmDraft = {
  name: string;
  description: string;
  logGroup: string;
  thresholdOperator: "above" | "below";
  thresholdCount: number;
  filterMode: "none" | "contains";
  filterText: string;
  periodMinutes: number;
};
