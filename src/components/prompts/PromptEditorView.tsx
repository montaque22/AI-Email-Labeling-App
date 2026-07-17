import { Check, ChevronDown, ChevronLeft, Save, Trash2, Wrench, X } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../../lib/utils";
import { PromptToolPicker } from "./PromptToolPicker";
import type { CustomAiPrompt, PromptLabel, PromptSelectedTool, PromptTool, PromptToolChoice } from "./types";

export type PromptEditorDraft = {
  id?: string;
  name: string;
  description: string;
  markdown: string;
  toolChoice: PromptToolChoice;
  selectedTools: PromptSelectedTool[];
  selectedLabelIds: string[];
};

type PromptEditorViewProps = {
  draft: PromptEditorDraft;
  tools: PromptTool[];
  labels: PromptLabel[];
  canSave: boolean;
  isSaving: boolean;
  onBack: () => void;
  onDelete: () => void;
  onDraftChange: (draft: PromptEditorDraft) => void;
  onSave: () => void;
};

export function toPromptEditorDraft(prompt?: CustomAiPrompt | null, labels: PromptLabel[] = []): PromptEditorDraft {
  const currentLabelIds = new Set(labels.map((label) => label.id));
  const promptSelectedLabelIds = (prompt?.selectedLabelIds ?? []).filter((labelId) => currentLabelIds.has(labelId));
  const defaultLabelIds = labels.map((label) => label.id);

  return {
    id: prompt?.id,
    name: prompt?.name ?? "",
    description: prompt?.description ?? "",
    markdown: prompt?.markdown ?? "",
    toolChoice: prompt?.toolChoice ?? "auto",
    selectedTools: prompt?.selectedTools ?? [],
    selectedLabelIds: promptSelectedLabelIds.length ? promptSelectedLabelIds : defaultLabelIds,
  };
}

export function PromptEditorView({
  draft,
  tools,
  labels,
  canSave,
  isSaving,
  onBack,
  onDelete,
  onDraftChange,
  onSave,
}: PromptEditorViewProps) {
  const [isToolSheetOpen, setIsToolSheetOpen] = useState(false);

  function updateDraft(updates: Partial<PromptEditorDraft>) {
    onDraftChange({ ...draft, ...updates });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div className="min-w-0">
            <button className="mb-3 inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-950" onClick={onBack} type="button">
              <ChevronLeft className="h-4 w-4" />
              Back to prompts
            </button>
            <CardTitle>{draft.id ? "Edit Prompt" : "Create Prompt"}</CardTitle>
            <CardDescription>
              Write a system message that runs after an email is labeled. Select only tools this prompt is allowed to call.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {draft.id ? (
              <Button className="cursor-pointer text-red-600" onClick={onDelete} type="button" variant="outline">
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
            <Button className="cursor-pointer" disabled={isSaving || !canSave} onClick={onSave} type="button">
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-zinc-700">Name</span>
              <input
                className="h-11 w-full rounded-full border border-white/70 bg-white/50 px-4 text-sm shadow-sm outline-none backdrop-blur focus:border-zinc-400"
                onChange={(event) => updateDraft({ name: event.target.value })}
                placeholder="Prompt name"
                value={draft.name}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-zinc-700">Description</span>
              <input
                className="h-11 w-full rounded-full border border-white/70 bg-white/50 px-4 text-sm shadow-sm outline-none backdrop-blur focus:border-zinc-400"
                onChange={(event) => updateDraft({ description: event.target.value })}
                placeholder="What this prompt does"
                value={draft.description}
              />
            </label>
            <PromptLabelDropdown
              labels={labels}
              onSelectedLabelIdsChange={(selectedLabelIds) => updateDraft({ selectedLabelIds })}
              selectedLabelIds={draft.selectedLabelIds}
            />
          </div>
          {draft.selectedLabelIds.length === 0 ? (
            <p className="text-sm text-red-600">Select at least one label before saving this prompt.</p>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
            <label className="block min-w-0">
              <span className="mb-1 block text-sm font-medium text-zinc-700">Markdown system message</span>
              <textarea
                className="h-[560px] w-full resize-none overflow-auto rounded-md border border-zinc-200 bg-white/60 px-3 py-3 font-mono text-sm outline-none focus:border-zinc-400"
                onChange={(event) => updateDraft({ markdown: event.target.value })}
                value={draft.markdown}
              />
            </label>
            <div className="hidden xl:block">
              <p className="mb-2 text-sm font-medium text-zinc-700">Available tools</p>
              <div className="h-[560px] overflow-auto rounded-md border border-zinc-200 bg-white/40 px-3 pb-3">
                <PromptToolPicker
                  onSelectedToolsChange={(selectedTools) => updateDraft({ selectedTools })}
                  onToolChoiceChange={(toolChoice) => updateDraft({ toolChoice })}
                  selectedTools={draft.selectedTools}
                  toolChoice={draft.toolChoice}
                  tools={tools}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button
        className="fixed bottom-6 right-6 z-40 cursor-pointer rounded-full shadow-lg xl:hidden"
        onClick={() => setIsToolSheetOpen(true)}
        type="button"
      >
        <Wrench className="h-4 w-4" />
        Tools
      </Button>

      {isToolSheetOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-zinc-950/20 xl:hidden">
          <div className="max-h-[82vh] w-full overflow-auto rounded-t-2xl border border-white/70 bg-white/90 p-5 shadow-2xl backdrop-blur">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-semibold text-zinc-950">Available tools</p>
                <p className="text-sm text-zinc-500">Choose the tools this prompt can call.</p>
              </div>
              <button className="cursor-pointer" onClick={() => setIsToolSheetOpen(false)} type="button">
                <X className="h-5 w-5" />
              </button>
            </div>
            <PromptToolPicker
              onSelectedToolsChange={(selectedTools) => updateDraft({ selectedTools })}
              onToolChoiceChange={(toolChoice) => updateDraft({ toolChoice })}
              selectedTools={draft.selectedTools}
              toolChoice={draft.toolChoice}
              tools={tools}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

type PromptLabelDropdownProps = {
  labels: PromptLabel[];
  selectedLabelIds: string[];
  onSelectedLabelIdsChange: (selectedLabelIds: string[]) => void;
};

function PromptLabelDropdown({ labels, selectedLabelIds, onSelectedLabelIdsChange }: PromptLabelDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedSet = new Set(selectedLabelIds);
  const selectedLabelText = selectedLabelIds.length === labels.length
    ? "All labels"
    : `${selectedLabelIds.length} label${selectedLabelIds.length === 1 ? "" : "s"}`;

  function toggleLabel(labelId: string) {
    const next = selectedSet.has(labelId)
      ? selectedLabelIds.filter((selectedLabelId) => selectedLabelId !== labelId)
      : [...selectedLabelIds, labelId];
    onSelectedLabelIdsChange(next);
  }

  return (
    <div className="relative">
      <span className="mb-1 block text-sm font-medium text-zinc-700">Labels</span>
      <button
        className={cn(
          "flex h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-full border px-4 text-left text-sm shadow-sm outline-none backdrop-blur",
          selectedLabelIds.length === 0 ? "border-red-200 bg-red-50/70 text-red-700" : "border-white/70 bg-white/50 text-zinc-800",
        )}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="truncate">{labels.length ? selectedLabelText : "No labels available"}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
      </button>
      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 max-h-72 w-full overflow-auto rounded-xl border border-zinc-200 bg-white p-2 shadow-xl">
          {labels.length ? (
            labels.map((label) => {
              const isSelected = selectedSet.has(label.id);
              return (
                <button
                  className={cn(
                    "flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-zinc-100",
                    isSelected ? "bg-emerald-50 text-emerald-900" : "text-zinc-700",
                  )}
                  key={label.id}
                  onClick={() => toggleLabel(label.id)}
                  type="button"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                      isSelected ? "border-emerald-500 bg-emerald-500 text-white" : "border-zinc-300 bg-white",
                    )}
                  >
                    {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{label.name}</span>
                    {label.description ? <span className="line-clamp-2 text-xs text-zinc-500">{label.description}</span> : null}
                  </span>
                </button>
              );
            })
          ) : (
            <p className="px-3 py-2 text-sm text-zinc-500">Create a label before saving prompts.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
