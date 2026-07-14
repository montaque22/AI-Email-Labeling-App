import { ChevronLeft, Save, Trash2 } from "lucide-react";
import { Brush, Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { AlarmResizableSplit } from "./AlarmResizableSplit";
import type { AlarmGranularity, AlarmSimulationPoint, LogAlarm, LogAlarmDraft } from "./types";

const logGroups = [
  { value: "ai", label: "AI" },
  { value: "email", label: "Email" },
  { value: "endpoints", label: "Endpoints" },
  { value: "webhook", label: "Webhook Events" },
  { value: "mcp-server", label: "MCP Server" },
];

export function AlarmEditorView({
  alarm,
  draft,
  error,
  granularity,
  isSaving,
  simulation,
  onBack,
  onChange,
  onDelete,
  onGranularityChange,
  onSave,
}: {
  alarm: LogAlarm | null;
  draft: LogAlarmDraft;
  error: string | null;
  granularity: AlarmGranularity;
  isSaving: boolean;
  simulation: AlarmSimulationPoint[];
  onBack: () => void;
  onChange: (draft: LogAlarmDraft) => void;
  onDelete: () => void;
  onGranularityChange: (granularity: AlarmGranularity) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <button className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600 hover:text-zinc-950" onClick={onBack} type="button">
        <ChevronLeft className="h-4 w-4" />
        Back to alarms
      </button>
      <AlarmResizableSplit
        defaultLeftWidth={72}
        left={
          <AlarmFormCard alarm={alarm} draft={draft} error={error} isSaving={isSaving} onChange={onChange} onDelete={onDelete} onSave={onSave} />
        }
        right={
          <AlarmSimulationChart data={simulation} granularity={granularity} onGranularityChange={onGranularityChange} />
        }
      />
    </div>
  );
}

function AlarmFormCard({
  alarm,
  draft,
  error,
  isSaving,
  onChange,
  onDelete,
  onSave,
}: {
  alarm: LogAlarm | null;
  draft: LogAlarmDraft;
  error: string | null;
  isSaving: boolean;
  onChange: (draft: LogAlarmDraft) => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle>{alarm ? "Edit Alarm" : "Create Alarm"}</CardTitle>
          <CardDescription>Trigger an error state when repeated log errors cross your threshold.</CardDescription>
        </div>
        <div className="flex gap-2">
          {alarm ? (
            <Button aria-label="Delete alarm" onClick={onDelete} size="icon" title="Delete alarm" type="button" variant="outline">
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          ) : null}
          <Button disabled={isSaving} onClick={onSave} type="button">
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Name</span>
            <input
              className="h-11 w-full rounded-full border border-white/70 bg-white/50 px-4 text-sm outline-none transition-colors focus:border-zinc-300"
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
              value={draft.name}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Description</span>
            <input
              className="h-11 w-full rounded-full border border-white/70 bg-white/50 px-4 text-sm outline-none transition-colors focus:border-zinc-300"
              onChange={(event) => onChange({ ...draft, description: event.target.value })}
              value={draft.description}
            />
          </label>
        </div>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Log group</span>
            <select
              className="h-11 w-full rounded-full border border-white/70 bg-white/50 px-4 text-sm outline-none transition-colors focus:border-zinc-300"
              onChange={(event) => onChange({ ...draft, logGroup: event.target.value })}
              value={draft.logGroup}
            >
              {logGroups.map((group) => (
                <option key={group.value} value={group.value}>
                  {group.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Calculation type</span>
            <div className="grid h-11 w-full grid-cols-[minmax(92px,0.8fr)_minmax(76px,1fr)_minmax(82px,0.8fr)] overflow-hidden rounded-full border border-white/70 bg-white/50 text-sm shadow-sm backdrop-blur-xl focus-within:border-zinc-300">
              <select
                className="min-w-0 border-r border-white/70 bg-transparent px-4 outline-none"
                onChange={(event) => onChange({ ...draft, thresholdOperator: event.target.value as LogAlarmDraft["thresholdOperator"] })}
                value={draft.thresholdOperator}
              >
                <option value="above">Above</option>
                <option value="below">Below</option>
              </select>
              <input
                className="min-w-0 border-r border-white/70 bg-transparent px-4 outline-none"
                min={1}
                onChange={(event) => onChange({ ...draft, thresholdCount: Number(event.target.value) })}
                type="number"
                value={draft.thresholdCount}
              />
              <span className="flex items-center justify-center bg-white/25 px-3 text-zinc-500">
                {Number(draft.thresholdCount) === 1 ? "error" : "errors"}
              </span>
            </div>
          </label>
        </div>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Filter</span>
            <div className="grid h-11 w-full grid-cols-[minmax(96px,0.7fr)_minmax(0,1fr)] overflow-hidden rounded-full border border-white/70 bg-white/50 text-sm shadow-sm backdrop-blur-xl focus-within:border-zinc-300">
              <select
                className="min-w-0 border-r border-white/70 bg-transparent px-4 outline-none"
                onChange={(event) => {
                  const filterMode = event.target.value as LogAlarmDraft["filterMode"];
                  onChange({ ...draft, filterMode, filterText: filterMode === "none" ? "" : draft.filterText });
                }}
                value={draft.filterMode}
              >
                <option value="none">None</option>
                <option value="contains">Contains</option>
              </select>
              <input
                className="min-w-0 bg-transparent px-4 outline-none disabled:text-zinc-400"
                disabled={draft.filterMode === "none"}
                onChange={(event) => onChange({ ...draft, filterText: event.target.value })}
                placeholder={draft.filterMode === "none" ? "" : "Text to match"}
                type="text"
                value={draft.filterMode === "none" ? "" : draft.filterText}
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700">Time</span>
            <div className="grid h-11 w-full grid-cols-[minmax(82px,0.7fr)_minmax(76px,1fr)_minmax(104px,0.8fr)] overflow-hidden rounded-full border border-white/70 bg-white/50 text-sm shadow-sm backdrop-blur-xl focus-within:border-zinc-300">
              <span className="flex items-center justify-center border-r border-white/70 bg-white/25 px-3 text-zinc-500">within</span>
              <input
                className="min-w-0 border-r border-white/70 bg-transparent px-4 outline-none"
                min={1}
                onChange={(event) => onChange({ ...draft, periodMinutes: Number(event.target.value) })}
                type="number"
                value={draft.periodMinutes}
              />
              <select className="min-w-0 bg-white/25 px-3 text-zinc-500 outline-none" disabled value="minutes">
                <option value="minutes">minutes</option>
              </select>
            </div>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

export function AlarmSimulationChart({
  data,
  granularity,
  onGranularityChange,
  title = "Error Threshold",
  description = "Last 14 days of errors compared against the alarm threshold.",
}: {
  data: AlarmSimulationPoint[];
  granularity: AlarmGranularity;
  onGranularityChange: (granularity: AlarmGranularity) => void;
  title?: string;
  description?: string;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <select
          className="h-10 rounded-full border border-white/70 bg-white/50 px-3 text-sm outline-none transition-colors focus:border-zinc-300"
          onChange={(event) => onGranularityChange(event.target.value as AlarmGranularity)}
          value={granularity}
        >
          <option value="day">Day</option>
          <option value="hour">Hour</option>
          <option value="minute">Minutes</option>
        </select>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer height="100%" width="100%">
            <LineChart data={data} margin={{ bottom: 18, left: 8, right: 12, top: 8 }}>
              <XAxis
                axisLine={false}
                dataKey="timestamp"
                interval="preserveStartEnd"
                minTickGap={72}
                tick={{ fill: "#71717a", fontSize: 12 }}
                tickFormatter={(value) => formatAlarmTick(String(value), granularity)}
                tickLine={false}
              />
              <YAxis allowDecimals={false} axisLine={false} tick={{ fill: "#71717a", fontSize: 12 }} tickLine={false} width={44} />
              <RechartsTooltip
                formatter={(value, name) => [Number(value), name === "errors" ? "Errors" : "Threshold"]}
                labelFormatter={(value) => formatAlarmTooltipLabel(String(value))}
              />
              <Line dataKey="errors" dot={{ r: 2 }} stroke="#dc2626" strokeWidth={2.5} type="linear" />
              <Line dataKey="threshold" dot={false} stroke="#71717a" strokeDasharray="5 5" strokeWidth={2} type="linear" />
              <Brush dataKey="timestamp" height={22} tickFormatter={(value) => formatAlarmTick(String(value), granularity)} travellerWidth={8} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function formatAlarmTick(timestamp: string, granularity: AlarmGranularity) {
  const date = new Date(timestamp);
  if (granularity === "day") {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
  }
  if (granularity === "hour") {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric" }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function formatAlarmTooltipLabel(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
