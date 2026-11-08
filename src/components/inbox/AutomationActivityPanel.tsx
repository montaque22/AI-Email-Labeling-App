import { useEffect, useState } from "react";
import { AlertCircle, Bot, CheckCircle2, ChevronRight, ExternalLink } from "lucide-react";
import { Badge } from "../ui/badge";

export type AutomationActivity = {
  id: string;
  eventId: string;
  activityId: string;
  source: string;
  status: "completed" | "failed";
  title: string;
  description: string;
  data?: Record<string, unknown>;
  error?: Record<string, unknown> | null;
  reportedAt: string;
  receivedAt: string;
  reportedByExternalSystem?: boolean;
};

type Props = {
  accountId: string;
  emailId: string;
  initialActivities?: AutomationActivity[];
};

export function AutomationActivityPanel({ accountId, emailId, initialActivities = [] }: Props) {
  const [activities, setActivities] = useState(initialActivities);

  useEffect(() => setActivities(initialActivities), [initialActivities]);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const query = new URLSearchParams({ accountId, emailId });
        const response = await fetch(`/api/automation-activities?${query}`, { credentials: "include", cache: "no-store" });
        const data = await response.json();
        if (active && response.ok) setActivities(data.activities ?? []);
      } catch {
        // A refresh failure must not disturb the email reader.
      }
    }
    const timer = window.setInterval(() => void refresh(), 8000);
    return () => { active = false; window.clearInterval(timer); };
  }, [accountId, emailId]);

  if (activities.length === 0) return null;
  return (
    <details className="group mb-4 rounded-xl border border-white/70 bg-white/45 p-3 shadow-sm backdrop-blur-xl" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-zinc-950 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2"><Bot className="h-4 w-4 text-zinc-600" />Automation Activity<Badge className="bg-zinc-100 text-zinc-600">{activities.length}</Badge></span>
        <ChevronRight className="h-4 w-4 text-zinc-400 transition group-open:rotate-90" />
      </summary>
      <div className="mt-3 divide-y divide-zinc-200/70 border-t border-zinc-200/70">
        {activities.map((activity) => <AutomationActivityRow activity={activity} key={activity.id} />)}
      </div>
    </details>
  );
}

function AutomationActivityRow({ activity }: { activity: AutomationActivity }) {
  const Icon = activity.status === "completed" ? CheckCircle2 : AlertCircle;
  const statusStyle = activity.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700";
  const iconStyle = activity.status === "completed" ? "text-emerald-600" : "text-red-600";
  const resultUrl = getExternalResultUrl(activity.data);
  return (
    <article className="flex items-start gap-3 py-3">
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconStyle}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-semibold text-zinc-950">{activity.title}</p><Badge className={statusStyle}>{formatStatus(activity.status)}</Badge></div>
        <p className="mt-0.5 text-xs text-zinc-500">{activity.source} · {formatDate(activity.reportedAt)}</p>
        {activity.description ? <p className="mt-1 text-sm text-zinc-700">{activity.description}</p> : null}
        {activity.status === "failed" && activity.error ? <p className="mt-1 text-sm text-red-700">{String(activity.error.message || activity.error.code || "External automation failed")}</p> : null}
        <div className="mt-2 flex items-center gap-3 text-xs">
          {resultUrl ? <a className="inline-flex items-center gap-1 font-medium text-blue-700 underline underline-offset-4" href={resultUrl} rel="noreferrer" target="_blank">View details<ExternalLink className="h-3 w-3" /></a> : null}
          {Object.keys(activity.data ?? {}).length > 0 ? <details><summary className="cursor-pointer text-zinc-600 underline underline-offset-4">Technical details</summary><pre className="mt-2 max-w-full overflow-x-auto rounded-md bg-zinc-950 p-2 text-[11px] text-white">{JSON.stringify(activity.data, null, 2)}</pre></details> : null}
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">Reported by {activity.source}; Emailable does not independently verify external outcomes.</p>
      </div>
    </article>
  );
}

function formatStatus(status: AutomationActivity["status"]) { return status.charAt(0).toUpperCase() + status.slice(1); }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function getExternalResultUrl(data?: Record<string, unknown>) { const value = data?.url; if (typeof value !== "string") return null; try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? value : null; } catch { return null; } }
