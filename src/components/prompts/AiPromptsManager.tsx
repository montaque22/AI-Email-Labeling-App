import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { PromptEditorView, toPromptEditorDraft, type PromptEditorDraft } from "./PromptEditorView";
import { PromptListView } from "./PromptListView";
import type { ByoAiToolConfig, CustomAiPrompt, PromptTool } from "./types";

type ViewState =
  | { mode: "list" }
  | { mode: "edit"; prompt: CustomAiPrompt | null };

const SYSTEM_MCP_CLIENT_ID = "system";

export function AiPromptsManager() {
  const [view, setView] = useState<ViewState>({ mode: "list" });
  const [prompts, setPrompts] = useState<CustomAiPrompt[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<PromptEditorDraft>(() => toPromptEditorDraft(null));
  const [tools, setTools] = useState<PromptTool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<"selected" | "single" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([loadPrompts(), loadTools()]).finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (view.mode === "edit") {
      setDraft(toPromptEditorDraft(view.prompt));
      setMessage(null);
      setError(null);
    }
  }, [view]);

  const selectedPromptCount = useMemo(() => selectedIds.length, [selectedIds]);

  async function loadPrompts() {
    try {
      const response = await fetch("/api/ai-prompts/custom", { credentials: "include" });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not load prompts.");
        return;
      }
      setPrompts(data.prompts ?? []);
    } catch {
      setError("Could not load prompts.");
    }
  }

  async function loadTools() {
    try {
      const response = await fetch("/api/byoai/config", { credentials: "include" });
      const config = await response.json();
      if (!response.ok) {
        return;
      }
      setTools(extractActiveTools(config));
    } catch {
      setTools([]);
    }
  }

  function openCreate() {
    setView({ mode: "edit", prompt: null });
  }

  function openEdit(prompt: CustomAiPrompt) {
    setView({ mode: "edit", prompt });
  }

  async function savePrompt() {
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(draft.id ? `/api/ai-prompts/custom/${draft.id}` : "/api/ai-prompts/custom", {
        method: draft.id ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not save prompt.");
        return;
      }
      await loadPrompts();
      setView({ mode: "edit", prompt: data.prompt });
      setMessage("Prompt saved.");
    } catch {
      setError("Could not save prompt.");
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDelete() {
    const ids = deleteTarget === "single" && draft.id ? [draft.id] : selectedIds;
    if (ids.length === 0) {
      setDeleteTarget(null);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/ai-prompts/custom", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not delete prompt.");
        return;
      }
      setSelectedIds([]);
      setDeleteTarget(null);
      await loadPrompts();
      setView({ mode: "list" });
      setMessage(ids.length === 1 ? "Prompt deleted." : "Prompts deleted.");
    } catch {
      setError("Could not delete prompt.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

      {view.mode === "list" ? (
        <PromptListView
          isLoading={isLoading}
          onCreate={openCreate}
          onDeleteSelected={() => setDeleteTarget("selected")}
          onOpen={openEdit}
          onSelectedIdsChange={setSelectedIds}
          prompts={prompts}
          selectedIds={selectedIds}
        />
      ) : (
        <PromptEditorView
          draft={draft}
          isSaving={isSaving}
          onBack={() => setView({ mode: "list" })}
          onDelete={() => setDeleteTarget("single")}
          onDraftChange={setDraft}
          onSave={savePrompt}
          tools={tools}
        />
      )}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/20 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/70 bg-white/90 p-5 shadow-2xl backdrop-blur">
            <h3 className="text-lg font-semibold text-zinc-950">Delete prompt?</h3>
            <p className="mt-2 text-sm text-zinc-600">
              {deleteTarget === "single"
                ? "This prompt will be permanently deleted."
                : `${selectedPromptCount} prompt${selectedPromptCount === 1 ? "" : "s"} will be permanently deleted.`}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button disabled={isSaving} onClick={() => setDeleteTarget(null)} type="button" variant="outline">
                Cancel
              </Button>
              <Button className="bg-red-600 text-white hover:bg-red-700" disabled={isSaving} onClick={confirmDelete} type="button">
                Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function extractActiveTools(config: ByoAiToolConfig): PromptTool[] {
  if (!config.aiEnabled || !config.mcpClientEnabled) {
    return [];
  }

  return (config.mcpClients ?? []).flatMap((client) => {
    if (!client.enabled || client.status !== "connected") {
      return [];
    }
    const selected = new Set(client.selectedTools ?? []);
    const clientId = client.isSystem ? SYSTEM_MCP_CLIENT_ID : client.id ?? "";
    if (!clientId) {
      return [];
    }
    return (client.tools ?? [])
      .filter((tool) => selected.has(tool.name))
      .map((tool) => ({
        clientId,
        clientName: client.name || client.serverUrl || "MCP server",
        name: tool.name,
        description: tool.description || "",
      }));
  });
}
