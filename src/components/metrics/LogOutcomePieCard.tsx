import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import type { LogOutcomeSummary } from "./types";

export function LogOutcomePieCard({ data, isLoading }: { data: LogOutcomeSummary | null | undefined; isLoading: boolean }) {
  const success = Number(data?.success ?? 0);
  const errors = Number(data?.errors ?? 0);
  const total = success + errors;
  const errorPercent = total > 0 ? Math.round((errors / total) * 100) : 0;
  const chartData = [
    { name: "Success", value: success, color: "#10b981" },
    { name: "Errors", value: errors, color: "#dc2626" },
  ];
  const renderedData = total > 0 ? chartData : [{ name: "No calls", value: 1, color: "#e4e4e7" }];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Success vs Errors</CardTitle>
        <CardDescription>All log groups over the last 14 days</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-zinc-300 text-sm text-zinc-500">Loading chart...</div>
        ) : (
          <div className="grid items-center gap-6 md:grid-cols-[220px_1fr]">
            <div className="relative h-56 w-56">
              <ResponsiveContainer height="100%" width="100%">
                <PieChart>
                  <Pie
                    data={renderedData}
                    dataKey="value"
                    endAngle={-270}
                    innerRadius={70}
                    outerRadius={98}
                    paddingAngle={total > 0 ? 2 : 0}
                    startAngle={90}
                    stroke="none"
                  >
                    {renderedData.map((entry) => (
                      <Cell fill={entry.color} key={entry.name} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      border: "1px solid #e4e4e7",
                      borderRadius: 8,
                      boxShadow: "0 8px 24px rgba(24, 24, 27, 0.08)",
                      fontSize: 12,
                    }}
                    formatter={(value, name) => [Number(value).toLocaleString(), name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-3xl font-semibold">{errorPercent}%</p>
                <p className="text-xs uppercase text-zinc-500">Errors</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2 text-sm">
                <span className="text-emerald-800">Success</span>
                <span className="font-semibold text-emerald-900">{success.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between rounded-md bg-red-50 px-3 py-2 text-sm">
                <span className="text-red-800">Errors</span>
                <span className="font-semibold text-red-900">{errors.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
