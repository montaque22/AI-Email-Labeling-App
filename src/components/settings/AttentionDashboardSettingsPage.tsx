import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

type AttentionSettings = {
  automaticPrioritization: boolean;
  behavioralPersonalization: boolean;
  dashboardEnabled: boolean;
  maxPriorityEmails: number;
  quickCleanupSuggestions: boolean;
};

const defaults: AttentionSettings = {
  automaticPrioritization: true,
  behavioralPersonalization: true,
  dashboardEnabled: true,
  maxPriorityEmails: 5,
  quickCleanupSuggestions: true,
};

export function AttentionDashboardSettingsPage() {
  const [settings, setSettings] = useState(defaults);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [preferenceCount, setPreferenceCount] = useState(0);

  useEffect(() => {
    fetch("/api/settings/attention-dashboard", { credentials: "include" })
      .then(async (response) => ({ data: await response.json(), ok: response.ok }))
      .then(({ data, ok }) => {
        if (!ok) throw new Error(data.error || "Could not load Attention Dashboard settings.");
        setSettings(data);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Could not load settings."))
      .finally(() => setIsLoading(false));
    fetch("/api/settings/attention-dashboard/preferences", { credentials: "include" })
      .then((response) => response.json())
      .then((data) => setPreferenceCount(Number(data.total) || 0))
      .catch(() => undefined);
  }, []);

  async function save() {
    setIsSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings/attention-dashboard", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save Attention Dashboard settings.");
      setSettings(data);
      setMessage("Attention Dashboard settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save settings.");
    } finally {
      setIsSaving(false);
    }
  }

  async function resetLearnedPreferences() {
    setIsSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings/attention-dashboard/preferences", { method: "DELETE", credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not reset learned preferences.");
      setPreferenceCount(0);
      setMessage("Learned preferences and engagement history were reset.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not reset learned preferences.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Focus & Attention</CardTitle>
        <CardDescription>Control how Emailable surfaces important mail and cleanup suggestions. Nothing here enables automatic archive or deletion.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <SettingToggle checked={settings.dashboardEnabled} description="Open Inbox to the Attention Dashboard instead of All Mail." label="Attention Dashboard" onChange={(checked) => setSettings((current) => ({ ...current, dashboardEnabled: checked }))} />
        <SettingToggle checked={settings.automaticPrioritization} description="Use classifications and deterministic safety rules to recommend mail." label="Automatic prioritization" onChange={(checked) => setSettings((current) => ({ ...current, automaticPrioritization: checked }))} />
        <SettingToggle checked={settings.behavioralPersonalization} description="Use distinct revisits and engagement patterns to improve Of Interest." label="Behavioral personalization" onChange={(checked) => setSettings((current) => ({ ...current, behavioralPersonalization: checked }))} />
        <SettingToggle checked={settings.quickCleanupSuggestions} description="Show conservative cleanup suggestions for review. Messages are never acted on automatically." label="Quick Cleanup suggestions" onChange={(checked) => setSettings((current) => ({ ...current, quickCleanupSuggestions: checked }))} />
        <label className="block max-w-sm">
          <span className="mb-1 block text-sm font-medium text-zinc-800">Maximum priority emails</span>
          <select className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm" disabled={isLoading} onChange={(event) => setSettings((current) => ({ ...current, maxPriorityEmails: Number(event.target.value) }))} value={settings.maxPriorityEmails}>
            <option value={3}>3</option><option value={5}>5</option><option value={10}>10</option>
          </select>
          <span className="mt-1 block text-xs text-zinc-500">Controls the initial list length, not total eligibility.</span>
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white/60 p-4">
          <div><p className="text-sm font-medium text-zinc-950">Learned preferences</p><p className="mt-1 text-sm text-zinc-500">{preferenceCount} explicit email preference{preferenceCount === 1 ? "" : "s"} stored. Reset also clears distinct engagement history.</p></div>
          <Button disabled={isLoading || isSaving || preferenceCount === 0} onClick={() => void resetLearnedPreferences()} type="button" variant="outline">Reset learned preferences</Button>
        </div>
        {message ? <p className="text-sm text-zinc-600" role="status">{message}</p> : null}
        <Button disabled={isLoading || isSaving} onClick={() => void save()} type="button">{isSaving ? "Saving..." : "Save settings"}</Button>
      </CardContent>
    </Card>
  );
}

function SettingToggle({ checked, description, label, onChange }: { checked: boolean; description: string; label: string; onChange: (checked: boolean) => void }) {
  return <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-zinc-200 bg-white/60 p-4"><span><span className="block text-sm font-medium text-zinc-950">{label}</span><span className="mt-1 block text-sm text-zinc-500">{description}</span></span><input checked={checked} className="mt-1 h-5 w-5" onChange={(event) => onChange(event.target.checked)} type="checkbox" /></label>;
}
