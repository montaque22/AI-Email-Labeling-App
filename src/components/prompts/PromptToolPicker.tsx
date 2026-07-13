import { Check } from "lucide-react";
import { cn } from "../../lib/utils";
import type { PromptSelectedTool, PromptTool, PromptToolChoice } from "./types";

type PromptToolPickerProps = {
  tools: PromptTool[];
  selectedTools: PromptSelectedTool[];
  toolChoice: PromptToolChoice;
  onSelectedToolsChange: (tools: PromptSelectedTool[]) => void;
  onToolChoiceChange: (choice: PromptToolChoice) => void;
};

export function PromptToolPicker({
  tools,
  selectedTools,
  toolChoice,
  onSelectedToolsChange,
  onToolChoiceChange,
}: PromptToolPickerProps) {
  const selectedKeys = new Set(selectedTools.map((tool) => getToolKey(tool.toolClientId, tool.toolName)));

  function toggleTool(tool: PromptTool) {
    const key = getToolKey(tool.clientId, tool.name);
    if (selectedKeys.has(key)) {
      onSelectedToolsChange(selectedTools.filter((entry) => getToolKey(entry.toolClientId, entry.toolName) !== key));
      return;
    }
    onSelectedToolsChange([...selectedTools, { toolClientId: tool.clientId, toolName: tool.name }]);
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-zinc-200 bg-white/50 p-1">
        {(["auto", "required"] as const).map((choice) => (
          <button
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              toolChoice === choice ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:bg-white/60",
            )}
            key={choice}
            onClick={() => onToolChoiceChange(choice)}
            type="button"
          >
            {choice === "auto" ? "Auto" : "Required"}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {tools.length === 0 ? (
          <div className="rounded-md border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">
            No active MCP tools are available. Activate BYOAI and MCP Client tools to use them in prompts.
          </div>
        ) : (
          tools.map((tool) => {
            const selected = selectedKeys.has(getToolKey(tool.clientId, tool.name));
            return (
              <button
                className={cn(
                  "flex w-full cursor-pointer items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors",
                  selected ? "border-emerald-300 bg-emerald-50/70" : "border-zinc-200 bg-white/40 hover:bg-white/70",
                )}
                key={`${tool.clientId}:${tool.name}`}
                onClick={() => toggleTool(tool)}
                type="button"
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    selected ? "border-emerald-400 bg-emerald-500 text-white" : "border-zinc-300 bg-white/60",
                  )}
                >
                  {selected ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-zinc-950">{tool.name}</span>
                  <span className="mt-1 block text-xs text-zinc-500">{tool.clientName}</span>
                  <span className="mt-2 block whitespace-pre-wrap break-words text-sm leading-6 text-zinc-600">
                    {tool.description || "No tool description provided."}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function getToolKey(clientId: string, toolName: string) {
  return `${clientId}:${toolName}`;
}
