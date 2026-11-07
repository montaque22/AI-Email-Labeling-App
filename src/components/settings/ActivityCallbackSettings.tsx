import { useEffect, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

type CallbackSettings = {
  enabled: boolean;
  callbackUrl: string;
  maskedCallbackUrl: string;
  usage: number;
  dailyLimit: number;
  ratePerSecond: number;
  burstLimit: number;
  resetsAt: string;
};

export function ActivityCallbackSettings() {
  const [settings, setSettings] = useState<CallbackSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExamples, setShowExamples] = useState(false);

  useEffect(() => { void load(); }, []);
  async function load() {
    try {
      const response = await fetch("/api/settings/activity-callback", { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load activity callback settings.");
      setSettings(data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load settings."); }
  }
  async function updateEnabled(enabled: boolean) {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/settings/activity-callback", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update callbacks.");
      setSettings(data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update callbacks."); }
    finally { setBusy(false); }
  }
  async function rotate() {
    if (!window.confirm("Rotate this callback URL? Existing external workflows will stop reporting activity until they use the new URL.")) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/settings/activity-callback/rotate", { method: "POST", credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not rotate the callback URL.");
      setSettings(data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not rotate the callback URL."); }
    finally { setBusy(false); }
  }
  async function copyUrl() { if (settings?.callbackUrl) await navigator.clipboard.writeText(settings.callbackUrl); }

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div><CardTitle>Activity Callbacks</CardTitle><CardDescription>Let external workflows report what they did with an email.</CardDescription></div>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700"><input checked={settings?.enabled ?? false} disabled={busy || !settings} onChange={(event) => void updateEnabled(event.target.checked)} type="checkbox" />Enabled</label>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <label><span className="mb-1 block text-sm font-medium text-zinc-700">Callback URL</span><input className="h-10 w-full rounded-md border border-white/70 bg-white/55 px-3 font-mono text-xs" readOnly type="text" value={settings?.maskedCallbackUrl ?? "Loading…"} /></label>
          <div className="flex items-end gap-2"><Button disabled={!settings || busy} onClick={() => void copyUrl()} type="button" variant="outline"><Copy className="h-4 w-4" />Copy</Button><Button disabled={!settings || busy} onClick={() => void rotate()} type="button" variant="outline"><RefreshCw className="h-4 w-4" />Rotate URL</Button></div>
        </div>
        <p className="text-xs text-zinc-500">Keep this URL secret. Rotation immediately invalidates the previous URL.</p>
        <div>
          <div className="mb-1 flex justify-between text-sm"><span>Usage today</span><strong>{settings?.usage ?? 0} / {settings?.dailyLimit ?? 500}</strong></div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-200"><div className="h-full rounded-full bg-violet-600" style={{ width: `${Math.min(100, ((settings?.usage ?? 0) / (settings?.dailyLimit || 500)) * 100)}%` }} /></div>
          <p className="mt-1 text-xs text-zinc-500">{settings?.dailyLimit ?? 500} callbacks per UTC day · {settings?.ratePerSecond ?? 5} per second · burst {settings?.burstLimit ?? 10}</p>
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
          <button className="flex w-full items-center justify-between text-left text-sm font-semibold text-violet-950" onClick={() => setShowExamples((value) => !value)} type="button"><span>Callback Protocol (v1.0)</span><span>{showExamples ? "Hide examples" : "View examples"}</span></button>
          {showExamples ? <pre className="mt-3 overflow-x-auto rounded-md bg-zinc-950 p-3 text-xs text-white">{JSON.stringify({ event_id: "event-uuid", activity_id: "workflow-run-id", source: "n8n", status: "completed", title: "Summary document created", description: "Saved to the project folder", result_url: "https://example.com/result", started_at: "2026-11-07T18:14:02Z", ended_at: "2026-11-07T18:14:05Z", details: { document_id: "doc-123" } }, null, 2)}</pre> : null}
        </div>
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
