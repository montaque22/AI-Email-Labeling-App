import { Plus, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../../lib/utils";
import type { CustomAiPrompt } from "./types";

type PromptListViewProps = {
  prompts: CustomAiPrompt[];
  selectedIds: string[];
  isLoading: boolean;
  onCreate: () => void;
  onOpen: (prompt: CustomAiPrompt) => void;
  onSelectedIdsChange: (ids: string[]) => void;
  onDeleteSelected: () => void;
};

export function PromptListView({
  prompts,
  selectedIds,
  isLoading,
  onCreate,
  onOpen,
  onSelectedIdsChange,
  onDeleteSelected,
}: PromptListViewProps) {
  const selectedSet = new Set(selectedIds);

  function toggleSelected(promptId: string) {
    if (selectedSet.has(promptId)) {
      onSelectedIdsChange(selectedIds.filter((id) => id !== promptId));
      return;
    }
    onSelectedIdsChange([...selectedIds, promptId]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">Prompts</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Create system messages that run after Emailable labels an incoming email. Prompts can use selected MCP tools to
            trigger custom automations from email metadata and labels.
          </p>
        </div>
        <Button className="cursor-pointer self-start" onClick={onCreate} type="button">
          <Plus className="h-4 w-4" />
          Create Prompt
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div>
            <CardTitle>Prompt automations</CardTitle>
            <CardDescription>{prompts.length} saved prompt{prompts.length === 1 ? "" : "s"}</CardDescription>
          </div>
          {selectedIds.length > 0 ? (
            <Button className="cursor-pointer text-red-600" onClick={onDeleteSelected} type="button" variant="outline">
              <Trash2 className="h-4 w-4" />
              Delete selected
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="rounded-md border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500">
              Loading prompts...
            </p>
          ) : prompts.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500">
              No prompts yet.
            </p>
          ) : (
            <div className="divide-y divide-zinc-200 overflow-hidden rounded-md border border-zinc-200">
              {prompts.map((prompt) => (
                <div className="grid grid-cols-[44px_minmax(0,1fr)] items-stretch" key={prompt.id}>
                  <label className="flex cursor-pointer items-center justify-center border-r border-zinc-200 bg-white/30">
                    <input
                      aria-label={`Select ${prompt.name}`}
                      checked={selectedSet.has(prompt.id)}
                      className="h-4 w-4 cursor-pointer"
                      onChange={() => toggleSelected(prompt.id)}
                      type="checkbox"
                    />
                  </label>
                  <button
                    className={cn(
                      "min-w-0 cursor-pointer px-4 py-3 text-left transition-colors hover:bg-white/60",
                      selectedSet.has(prompt.id) && "bg-emerald-50/70",
                    )}
                    onClick={() => onOpen(prompt)}
                    type="button"
                  >
                    <p className="truncate text-sm font-semibold text-zinc-950">{prompt.name}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{prompt.description || "No description"}</p>
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
