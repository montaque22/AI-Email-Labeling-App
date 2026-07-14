import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import type { LogErrorSeries } from "./types";

const colors = ["#dc2626", "#f97316", "#7c3aed", "#2563eb", "#0891b2", "#16a34a"];

export function LogErrorsTimelineCard({ data, isLoading }: { data: LogErrorSeries[]; isLoading: boolean }) {
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const visibleSeries = selectedGroups.length === 0 ? data : data.filter((series) => selectedGroups.includes(series.logGroup));
  const chartData = useMemo(() => mergeSeries(visibleSeries), [visibleSeries]);
  const total = visibleSeries.reduce((sum, series) => sum + series.points.reduce((inner, point) => inner + Number(point.value), 0), 0);

  function toggleGroup(logGroup: string) {
    setSelectedGroups((current) => (current.includes(logGroup) ? current.filter((group) => group !== logGroup) : [...current, logGroup]));
  }

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle>Errors Over Time</CardTitle>
          <CardDescription>Error volume by log group over the last 14 days</CardDescription>
        </div>
        <div className="relative">
          <Button
            aria-expanded={isOpen}
            className="min-w-40 justify-between rounded-full border-white/70 bg-white/50"
            onClick={() => setIsOpen((open) => !open)}
            type="button"
            variant="outline"
          >
            {selectedGroups.length === 0 ? "All groups" : `${selectedGroups.length} selected`}
            <ChevronDown className="h-4 w-4" />
          </Button>
          {isOpen ? (
            <div className="absolute right-0 top-12 z-20 w-64 rounded-xl border border-white/70 bg-white p-2 shadow-xl shadow-slate-900/10">
              <button
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100"
                onClick={() => setSelectedGroups([])}
                type="button"
              >
                <span className="flex h-4 w-4 items-center justify-center">{selectedGroups.length === 0 ? <Check className="h-3.5 w-3.5" /> : null}</span>
                All log groups
              </button>
              {data.map((series) => (
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100"
                  key={series.logGroup}
                  onClick={() => toggleGroup(series.logGroup)}
                  type="button"
                >
                  <span className="flex h-4 w-4 items-center justify-center">{selectedGroups.includes(series.logGroup) ? <Check className="h-3.5 w-3.5" /> : null}</span>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[data.indexOf(series) % colors.length] }} />
                  {series.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-zinc-300 text-sm text-zinc-500">Loading chart...</div>
        ) : data.length === 0 ? (
          <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-zinc-300 text-sm text-zinc-500">No error logs found yet.</div>
        ) : (
          <div className="space-y-4">
            <p className="text-3xl font-semibold">{total.toLocaleString()}</p>
            <div className="h-48 w-full">
              <ResponsiveContainer height="100%" width="100%">
                <LineChart data={chartData} margin={{ bottom: 4, left: -24, right: 10, top: 8 }}>
                  <XAxis axisLine={false} dataKey="label" interval="preserveStartEnd" tick={{ fill: "#71717a", fontSize: 12 }} tickLine={false} />
                  <YAxis allowDecimals={false} axisLine={false} tick={{ fill: "#71717a", fontSize: 12 }} tickLine={false} width={36} />
                  <RechartsTooltip
                    contentStyle={{
                      border: "1px solid #e4e4e7",
                      borderRadius: 8,
                      boxShadow: "0 8px 24px rgba(24, 24, 27, 0.08)",
                      fontSize: 12,
                    }}
                  />
                  {visibleSeries.map((series) => (
                    <Line
                      activeDot={{ r: 5, stroke: getSeriesColor(data, series.logGroup), strokeWidth: 2 }}
                      dataKey={series.label}
                      dot={{ r: 2 }}
                      key={series.logGroup}
                      stroke={getSeriesColor(data, series.logGroup)}
                      strokeWidth={2.5}
                      type="monotone"
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3">
              {visibleSeries.map((series) => (
                <span className="inline-flex items-center gap-2 text-xs text-zinc-600" key={series.logGroup}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getSeriesColor(data, series.logGroup) }} />
                  {series.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function mergeSeries(series: LogErrorSeries[]) {
  const rows = new Map<string, Record<string, string | number>>();
  for (const item of series) {
    for (const point of item.points) {
      const row = rows.get(point.date) ?? { date: point.date, label: formatShortDate(point.date) };
      row[item.label] = Number(point.value);
      rows.set(point.date, row);
    }
  }
  return Array.from(rows.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function getSeriesColor(series: LogErrorSeries[], logGroup: string) {
  const index = Math.max(0, series.findIndex((item) => item.logGroup === logGroup));
  return colors[index % colors.length];
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}
