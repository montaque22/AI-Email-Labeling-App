import { Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import type { AiUsageSeries } from "./types";

const colors = ["#2563eb", "#16a34a", "#f97316", "#7c3aed", "#dc2626", "#0891b2"];

export function AiUsageChartCard({ data, isLoading }: { data: AiUsageSeries[]; isLoading: boolean }) {
  const chartData = mergeSeries(data);
  const total = data.reduce((sum, series) => sum + series.points.reduce((inner, point) => inner + Number(point.value), 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Usage</CardTitle>
        <CardDescription>AI calls by configured model over the last 14 days</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-zinc-300 text-sm text-zinc-500">
            Loading chart...
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-zinc-300 text-sm text-zinc-500">
            AI usage appears after AI is activated and used.
          </div>
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
                  {data.map((series, index) => (
                    <Line
                      activeDot={{ r: 5, stroke: colors[index % colors.length], strokeWidth: 2 }}
                      dataKey={series.model}
                      dot={{ r: 2 }}
                      key={series.model}
                      stroke={colors[index % colors.length]}
                      strokeWidth={2.5}
                      type="monotone"
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3">
              {data.map((series, index) => (
                <span className="inline-flex items-center gap-2 text-xs text-zinc-600" key={series.model}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                  {series.model}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function mergeSeries(series: AiUsageSeries[]) {
  const rows = new Map<string, Record<string, string | number>>();
  for (const item of series) {
    for (const point of item.points) {
      const row = rows.get(point.date) ?? { date: point.date, label: formatShortDate(point.date) };
      row[item.model] = Number(point.value);
      rows.set(point.date, row);
    }
  }
  return Array.from(rows.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}
