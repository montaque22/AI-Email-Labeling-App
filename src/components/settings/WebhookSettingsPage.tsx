import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Save } from "lucide-react";
import { WEBHOOK_EVENT_DEFINITIONS, createWebhookEnvelope } from "../../../shared/webhook-contracts.js";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { ActivityCallbackSettings } from "./ActivityCallbackSettings";

export function WebhookSettingsPage() {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [savedWebhookUrl, setSavedWebhookUrl] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [savedBearerToken, setSavedBearerToken] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const validationError = validateWebhookUrl(webhookUrl);
  const hasChanges = webhookUrl !== savedWebhookUrl || bearerToken !== savedBearerToken;

  useEffect(() => { void load(); }, []);
  async function load() { setIsLoading(true); setError(null); try { const response = await fetch("/api/settings/webhook", { credentials: "include" }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not load webhook settings."); setWebhookUrl(data.webhookUrl ?? ""); setSavedWebhookUrl(data.webhookUrl ?? ""); setBearerToken(data.bearerToken ?? ""); setSavedBearerToken(data.bearerToken ?? ""); setShowAuth(Boolean(data.bearerToken)); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load webhook settings."); } finally { setIsLoading(false); } }
  async function save() { if (validationError) { setError(validationError); return; } setIsSaving(true); setError(null); setMessage(null); try { const response = await fetch("/api/settings/webhook", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ webhookUrl, bearerToken: showAuth ? bearerToken : "" }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not save webhook settings."); setWebhookUrl(data.webhookUrl ?? ""); setSavedWebhookUrl(data.webhookUrl ?? ""); setBearerToken(data.bearerToken ?? ""); setSavedBearerToken(data.bearerToken ?? ""); setShowAuth(Boolean(data.bearerToken)); setMessage("Outbound webhook settings saved."); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save webhook settings."); } finally { setIsSaving(false); } }

  return <div className="space-y-6">
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0"><div><CardTitle>Outbound Webhooks</CardTitle><CardDescription><strong>Emailable → External system.</strong> Send Emailable events to one external workflow or automation endpoint.</CardDescription></div><Button disabled={isLoading || isSaving || !hasChanges || Boolean(validationError)} onClick={() => void save()} type="button"><Save className="h-4 w-4" />{isSaving ? "Saving…" : "Save"}</Button></CardHeader>
      <CardContent className="space-y-5">
        <label className="block"><span className="mb-1 block text-sm font-medium text-zinc-700">Destination URL</span><input className="glass-panel h-10 w-full rounded-md border px-3 text-sm outline-none focus:border-zinc-400" disabled={isLoading} onChange={(event) => { setWebhookUrl(event.target.value); setMessage(null); }} placeholder="https://example.com/emailable-webhook" type="url" value={webhookUrl} /><span className="mt-1 block text-xs text-zinc-500">Leave blank to disable delivery. Emailable supports one destination per user.</span></label>
        <label className="flex items-center gap-2 text-sm text-zinc-700"><input checked={showAuth} className="h-4 w-4" disabled={isLoading} onChange={(event) => { setShowAuth(event.target.checked); if (!event.target.checked) setBearerToken(""); setMessage(null); }} type="checkbox" />Send Authorization bearer token</label>
        {showAuth ? <label className="block"><span className="mb-1 block text-sm font-medium text-zinc-700">Bearer token</span><input className="glass-panel h-10 w-full rounded-md border px-3 text-sm outline-none focus:border-zinc-400" disabled={isLoading} onChange={(event) => { setBearerToken(event.target.value); setMessage(null); }} placeholder="Paste token" type="password" value={bearerToken} /></label> : null}
        <p className="text-xs text-zinc-500">Delivery is a single attempt with an 8-second timeout and no automatic retry. A successful delivery only confirms that the destination accepted the request; it does not confirm downstream work completed.</p>
        {validationError || error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{validationError || error}</p> : null}{message ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Outbound Events</CardTitle><CardDescription>Every event uses the same versioned envelope. Expand an event to inspect and copy a realistic example.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {WEBHOOK_EVENT_DEFINITIONS.map((definition) => <OutboundEventDefinition definition={definition} key={definition.name} emphasized={definition.name === "email.ready_for_processing"} />)}
        <a className="inline-flex items-center gap-1 text-sm font-medium text-violet-700 underline" href="/documentation/webhook#outbound-events">View the full event reference<ExternalLink className="h-3.5 w-3.5" /></a>
      </CardContent>
    </Card>
    <ActivityCallbackSettings />
  </div>;
}

type EventDefinition = (typeof WEBHOOK_EVENT_DEFINITIONS)[number];
function OutboundEventDefinition({ definition, emphasized }: { definition: EventDefinition; emphasized: boolean }) {
  const [copied, setCopied] = useState(false);
  const example = createWebhookEnvelope(definition.name, definition.payload);
  async function copy() { await navigator.clipboard.writeText(JSON.stringify(example, null, 2)); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
  return <details className={`rounded-lg border ${emphasized ? "border-violet-300 bg-violet-50/70" : "border-zinc-200 bg-white/45"}`} open={emphasized || undefined}>
    <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden"><div className="flex flex-wrap items-center gap-2"><strong className="text-zinc-950">{definition.title}</strong>{emphasized ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">Post-processing entry point</span> : null}<code className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">{definition.name}</code></div><p className="mt-1 text-sm text-zinc-600">{definition.description}</p></summary>
    <div className="space-y-3 border-t border-zinc-200 p-4"><p className="text-sm text-zinc-700"><strong>Common use:</strong> {definition.useCase}</p><div className="relative"><pre className="overflow-x-auto rounded-md bg-zinc-950 p-3 pr-12 text-xs text-white">{JSON.stringify(example, null, 2)}</pre><button aria-label={`Copy ${definition.name} JSON`} className="absolute right-2 top-2 rounded-md bg-white/10 p-2 text-white" onClick={() => void copy()} type="button">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button></div></div>
  </details>;
}

function validateWebhookUrl(value: string) { const trimmed = value.trim(); if (!trimmed) return null; try { const url = new URL(trimmed); return url.protocol === "http:" || url.protocol === "https:" ? null : "Webhook URL must use HTTP or HTTPS."; } catch { return "Enter a valid webhook URL."; } }
