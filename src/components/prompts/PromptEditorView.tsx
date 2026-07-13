import { ChevronLeft, Save, Trash2, Wrench, X } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { PromptToolPicker } from "./PromptToolPicker";
import type { CustomAiPrompt, PromptSelectedTool, PromptTool, PromptToolChoice } from "./types";

export type PromptEditorDraft = {
  id?: string;
  name: string;
  description: string;
  markdown: string;
  toolChoice: PromptToolChoice;
  selectedTools: PromptSelectedTool[];
};

type PromptEditorViewProps = {
  draft: PromptEditorDraft;
  tools: PromptTool[];
  isSaving: boolean;
  onBack: () => void;
  onDelete: () => void;
  onDraftChange: (draft: PromptEditorDraft) => void;
  onSave: () => void;
};

export function toPromptEditorDraft(prompt?: CustomAiPrompt | null): PromptEditorDraft {
  return {
    id: prompt?.id,
    name: prompt?.name ?? "",
    description: prompt?.description ?? "",
    markdown: prompt?.markdown ?? "",
    toolChoice: prompt?.toolChoice ?? "auto",
    selectedTools: prompt?.selectedTools ?? [],
  };
}

export function PromptEditorView({
  draft,
  tools,
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
            <Button className="cursor-pointer" disabled={isSaving} onClick={onSave} type="button">
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
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
          </div>

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
              <div className="h-[560px] overflow-auto rounded-md border border-zinc-200 bg-white/40 p-3">
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
