import { Save, Trash2 } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import type { AlarmSimulationPoint, LogAlarm, LogAlarmDraft } from "./types";

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
  isSaving,
  simulation,
  onBack,
  onChange,
  onDelete,
  onSave,
}: {
  alarm: LogAlarm | null;
  draft: LogAlarmDraft;
  error: string | null;
  isSaving: boolean;
  simulation: AlarmSimulationPoint[];
  onBack: () => void;
  onChange: (draft: LogAlarmDraft) => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <button className="text-sm font-medium text-zinc-600 hover:text-zinc-950" onClick={onBack} type="button">
        Back to alarms
      </button>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div>
              <CardTitle>{alarm ? "Edit Alarm" : "Create Alarm"}</CardTitle>
              <CardDescription>Trigger an error state when repeated log errors cross your threshold.</CardDescription>
            </div>
            <div className="flex gap-2">
              {alarm ? (
                <Button onClick={onDelete} type="button" variant="outline">
                  <Trash2 className="h-4 w-4 text-red-600" />
                  Delete
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
            <div className="grid gap-4 md:grid-cols-2">
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
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-700">Log group</span>
                <select
                  className="h-11 w-full rounded-full border border-white/70 bg-white/50 px-4 text-sm outline-none transition-colors focus:border-zinc-300"
                  onChange={(event) => onChange({ ...draft, logGroup: event.target.value })}
                  value={draft.logGroup}
                >
                  {logGroups.map((group) => (
                    <option key={group.value} value={group.value}>{group.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-700">Alarm type</span>
                <select className="h-11 w-full rounded-full border border-white/70 bg-white/40 px-4 text-sm text-zinc-500" disabled value="aggregate">
                  <option value="aggregate">Aggregate</option>
                </select>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-700">Errors</span>
                <input
                  className="h-11 w-full rounded-full border border-white/70 bg-white/50 px-4 text-sm outline-none transition-colors focus:border-zinc-300"
                  min={1}
                  onChange={(event) => onChange({ ...draft, thresholdCount: Number(event.target.value) })}
                  type="number"
                  value={draft.thresholdCount}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-700">Within minutes</span>
                <input
                  className="h-11 w-full rounded-full border border-white/70 bg-white/50 px-4 text-sm outline-none transition-colors focus:border-zinc-300"
                  min={1}
                  onChange={(event) => onChange({ ...draft, periodMinutes: Number(event.target.value) })}
                  type="number"
                  value={draft.periodMinutes}
                />
              </label>
            </div>
          </CardContent>
        </Card>
        <AlarmSimulationChart data={simulation} />
      </div>
    </div>
  );
}

function AlarmSimulationChart({ data }: { data: AlarmSimulationPoint[] }) {
  const chartData = data.map((point) => ({
    ...point,
    label: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(point.timestamp)),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Error Threshold</CardTitle>
        <CardDescription>Current logs simulated against the alarm threshold.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer height="100%" width="100%">
            <LineChart data={chartData} margin={{ bottom: 4, left: -24, right: 10, top: 8 }}>
              <XAxis axisLine={false} dataKey="label" interval="preserveStartEnd" tick={{ fill: "#71717a", fontSize: 12 }} tickLine={false} />
              <YAxis allowDecimals={false} axisLine={false} tick={{ fill: "#71717a", fontSize: 12 }} tickLine={false} width={36} />
              <RechartsTooltip />
              <Line dataKey="errors" dot={{ r: 2 }} stroke="#dc2626" strokeWidth={2.5} type="monotone" />
              <Line dataKey="threshold" dot={false} stroke="#71717a" strokeDasharray="5 5" strokeWidth={2} type="monotone" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
