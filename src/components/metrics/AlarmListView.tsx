import { Plus, Trash2 } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../../lib/utils";
import type { LogAlarm } from "./types";

export function AlarmListView({
  alarms,
  selectedIds,
  isLoading,
  onCreate,
  onDelete,
  onOpen,
  onToggle,
}: {
  alarms: LogAlarm[];
  selectedIds: string[];
  isLoading: boolean;
  onCreate: () => void;
  onDelete: () => void;
  onOpen: (alarm: LogAlarm) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle>Alarms</CardTitle>
          <CardDescription>
            Create alerts when repeated errors appear in logs. Use alarms to catch AI, email, endpoint, webhook, or MCP failures.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          {selectedIds.length > 0 ? (
            <Button onClick={onDelete} type="button" variant="outline">
              <Trash2 className="h-4 w-4 text-red-600" />
              Delete
            </Button>
          ) : null}
          <Button onClick={onCreate} type="button">
            <Plus className="h-4 w-4" />
            Create Alarm
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="rounded-md border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">Loading alarms...</p>
        ) : alarms.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">No alarms yet.</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white/40">
            {alarms.map((alarm) => (
              <div className="grid grid-cols-[48px_1fr_auto] items-center gap-3 border-b border-zinc-200 px-4 py-3 last:border-b-0" key={alarm.id}>
                <input
                  aria-label={`Select ${alarm.name}`}
                  checked={selectedIds.includes(alarm.id)}
                  onChange={() => onToggle(alarm.id)}
                  type="checkbox"
                />
                <button className="min-w-0 text-left" onClick={() => onOpen(alarm)} type="button">
                  <p className="truncate text-sm font-semibold text-zinc-950">{alarm.name}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{alarm.description || `${alarm.thresholdCount} errors in ${alarm.periodMinutes} minutes`}</p>
                </button>
                <Badge className={cn("capitalize", statusClass(alarm.status))}>{alarm.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function statusClass(status: LogAlarm["status"]) {
  if (status === "ok") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "error") {
    return "bg-red-50 text-red-700";
  }
  return "bg-zinc-100 text-zinc-600";
}
