import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { ACTIVITY_CALLBACK_EXAMPLES, ACTIVITY_CALLBACK_LIMITS, type ActivityCallbackStatus } from "../../../shared/webhook-contracts.js";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

type CallbackSettings = { enabled: boolean; callbackUrl: string; maskedCallbackUrl: string; usage: number; dailyLimit: number; ratePerSecond: number; burstLimit: number; resetsAt: string };
const CALLBACK_GUIDANCE: Record<ActivityCallbackStatus, { when: string; outcome: string }> = {
  completed: { when: "Send after the external work succeeds.", outcome: "Shows the reported Completed outcome on the email." },
  failed: { when: "Send after the external work fails.", outcome: "Shows the reported Failed outcome and optional error on the email." },
};

export function ActivityCallbackSettings() {
  const [settings, setSettings] = useState<CallbackSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeExample, setActiveExample] = useState<ActivityCallbackStatus>("completed");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);
  async function load() { try { const response = await fetch("/api/settings/activity-callback", { credentials: "include", cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not load activity callback settings."); setSettings(data); } catch (caught) { setError(errorMessage(caught, "Could not load settings.")); } }
  async function updateEnabled(enabled: boolean) { setBusy(true); setError(null); try { const response = await fetch("/api/settings/activity-callback", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not update callbacks."); setSettings(data); } catch (caught) { setError(errorMessage(caught, "Could not update callbacks.")); } finally { setBusy(false); } }
  async function rotate() { if (!window.confirm("Rotate this callback URL? Existing external workflows will stop reporting activity until they use the new URL.")) return; setBusy(true); setError(null); try { const response = await fetch("/api/settings/activity-callback/rotate", { method: "POST", credentials: "include" }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not rotate the callback URL."); setSettings(data); } catch (caught) { setError(errorMessage(caught, "Could not rotate the callback URL.")); } finally { setBusy(false); } }
  async function copy(value: string, key: string) { await navigator.clipboard.writeText(value); setCopied(key); window.setTimeout(() => setCopied(null), 1600); }
  const example = ACTIVITY_CALLBACK_EXAMPLES[activeExample];
  const guide = CALLBACK_GUIDANCE[activeExample];

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div><CardTitle>Activity Callbacks</CardTitle><CardDescription><strong>External system → Emailable.</strong> Report work performed on an email so its status appears in Automation Activity.</CardDescription></div>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700"><input checked={settings?.enabled ?? false} disabled={busy || !settings} onChange={(event) => void updateEnabled(event.target.checked)} type="checkbox" />Enabled</label>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <label><span className="mb-1 block text-sm font-medium text-zinc-700">Callback URL (keep secret)</span><input className="h-10 w-full rounded-md border border-white/70 bg-white/55 px-3 font-mono text-xs" readOnly type="text" value={settings?.maskedCallbackUrl ?? "Loading…"} /></label>
          <div className="flex items-end gap-2"><Button disabled={!settings || busy} onClick={() => settings && void copy(settings.callbackUrl, "url")} type="button" variant="outline">{copied === "url" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}Copy URL</Button><Button disabled={!settings || busy} onClick={() => void rotate()} type="button" variant="outline"><RefreshCw className="h-4 w-4" />Rotate URL</Button></div>
        </div>
        <p className="text-xs text-zinc-500">Rotation immediately invalidates the previous URL. Never include this URL in logs or public documentation.</p>
        <div>
          <div className="mb-1 flex justify-between text-sm"><span>Usage today</span><strong>{settings?.usage ?? 0} / {settings?.dailyLimit ?? 500}</strong></div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-200"><div className="h-full rounded-full bg-violet-600" style={{ width: `${Math.min(100, ((settings?.usage ?? 0) / (settings?.dailyLimit || 500)) * 100)}%` }} /></div>
          <p className="mt-1 text-xs text-zinc-500">Resets at 00:00 UTC · {settings?.ratePerSecond ?? 5}/second · burst {settings?.burstLimit ?? 10} · maximum request 64 KB</p>
        </div>

        <section className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-violet-950">Callback protocol v1.0</h3><p className="mt-1 text-sm text-zinc-600">Use the same <code>event_id</code> from the outbound ready event and a stable <code>activity_id</code> for each independent outcome.</p></div><a className="inline-flex items-center gap-1 text-sm font-medium text-violet-700 underline" href="/documentation/webhook#activity-callbacks">Full callback reference<ExternalLink className="h-3.5 w-3.5" /></a></div>
          <div className="mt-4 flex gap-2" role="tablist">{(["completed", "failed"] as const).map((status) => <button aria-selected={activeExample === status} className={`rounded-full px-3 py-1.5 text-sm font-medium ${activeExample === status ? "bg-violet-600 text-white" : "bg-white text-zinc-700"}`} key={status} onClick={() => setActiveExample(status)} role="tab" type="button">{status[0].toUpperCase() + status.slice(1)}</button>)}</div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="relative"><pre className="overflow-x-auto rounded-md bg-zinc-950 p-3 pr-12 text-xs text-white">{JSON.stringify(example, null, 2)}</pre><button aria-label={`Copy ${activeExample} JSON`} className="absolute right-2 top-2 rounded-md bg-white/10 p-2 text-white hover:bg-white/20" onClick={() => void copy(JSON.stringify(example, null, 2), activeExample)} type="button">{copied === activeExample ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button></div>
            <div className="space-y-3 text-sm text-zinc-700"><div><strong className="block text-zinc-950">When to send</strong>{guide.when}</div><div><strong className="block text-zinc-950">Expected outcome</strong>{guide.outcome}</div><div><strong className="block text-zinc-950">Field limits</strong>Title {ACTIVITY_CALLBACK_LIMITS.title} characters; description {ACTIVITY_CALLBACK_LIMITS.description}; data 32 KB; error 16 KB.</div></div>
          </div>
        </section>

        <details className="rounded-xl border border-zinc-200 bg-white/50 p-4"><summary className="cursor-pointer font-semibold text-zinc-950">How callbacks work</summary><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-700"><li>Emailable sends <code>email.ready_for_processing</code> with an <code>event_id</code> and callback URL.</li><li>Your workflow optionally sends <code>completed</code> or <code>failed</code> with that event ID and a stable activity ID.</li><li>Use different activity IDs for independent operations on the same email.</li><li>Emailable displays each reported outcome; it does not verify or supervise the external work.</li></ol><p className="mt-3 text-xs text-zinc-500">If no callback is received, Emailable records no activity.</p></details>
        <details className="rounded-xl border border-zinc-200 bg-white/50 p-4"><summary className="cursor-pointer font-semibold text-zinc-950">Connecting an external workflow</summary><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-700"><li>Save an outbound webhook destination.</li><li>Trigger on <code>email.ready_for_processing</code>.</li><li>Read <code>payload.activity_callback.url</code> and keep it secret.</li><li>POST a Completed or Failed outcome after the operation finishes.</li><li>Home Assistant users may instead use the native Emailable Completed and Failed actions with their integration API key.</li></ol><div className="mt-3 flex flex-wrap gap-3 text-sm"><a className="text-violet-700 underline" href="/documentation/webhook#outbound-webhook-format">Outbound format</a><a className="text-violet-700 underline" href="/documentation/webhook#activity-callbacks">Callback reference</a><a className="text-violet-700 underline" href="/documentation/webhook#troubleshooting">Troubleshooting</a></div></details>
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

function errorMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
