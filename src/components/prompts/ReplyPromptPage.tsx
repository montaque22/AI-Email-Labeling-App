import { useEffect, useState } from "react";
import { Loader, Save } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../../lib/utils";

const REPLY_PROMPT_MAX_LENGTH = 500;

export function ReplyPromptPage() {
  const [markdown, setMarkdown] = useState("");
  const [savedMarkdown, setSavedMarkdown] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasChanges = markdown !== savedMarkdown;

  useEffect(() => {
    async function loadReplyPrompt() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/ai-prompts/draft-reply", { credentials: "include" });
        const data = await response.json();

        if (!response.ok) {
          setError(data.error ?? "Could not load reply prompt.");
          return;
        }

        const nextMarkdown = String(data.markdown ?? "").slice(0, REPLY_PROMPT_MAX_LENGTH);
        setMarkdown(nextMarkdown);
        setSavedMarkdown(nextMarkdown);
      } catch {
        setError("Could not load reply prompt.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadReplyPrompt();
  }, []);

  async function saveReplyPrompt() {
    if (!hasChanges || markdown.length > REPLY_PROMPT_MAX_LENGTH) {
      return;
    }

    setIsSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/ai-prompts/draft-reply", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not save reply prompt.");
        return;
      }

      const nextMarkdown = String(data.prompt?.markdown ?? markdown);
      setMarkdown(nextMarkdown);
      setSavedMarkdown(nextMarkdown);
      setMessage("Reply prompt saved.");
    } catch {
      setError("Could not save reply prompt.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="min-w-0">
          <CardTitle>Reply Prompt</CardTitle>
          <CardDescription>
            Add optional markdown instructions that Emailable prepends to the AI Draft system prompt. Leave it blank to use only the built-in draft behavior.
          </CardDescription>
        </div>
        <Button
          className="shrink-0"
          disabled={isLoading || isSaving || !hasChanges || markdown.length > REPLY_PROMPT_MAX_LENGTH}
          onClick={() => void saveReplyPrompt()}
          type="button"
        >
          {isSaving ? <Loader /> : <Save className="h-4 w-4" />}
          Save
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-700">Markdown instructions</span>
          <textarea
            className="min-h-[280px] w-full resize-y rounded-xl border border-white/70 bg-white/50 px-4 py-3 text-sm leading-6 text-zinc-800 shadow-sm outline-none backdrop-blur-xl transition-colors placeholder:text-zinc-400 focus:border-zinc-400"
            disabled={isLoading || isSaving}
            maxLength={REPLY_PROMPT_MAX_LENGTH}
            onChange={(event) => {
              setMarkdown(event.target.value);
              setMessage(null);
            }}
            placeholder="Example: Write replies in my voice. Be concise, tactful, and clear. Mention next steps when helpful."
            value={markdown}
          />
          <span className={cn("block text-right text-xs", markdown.length > REPLY_PROMPT_MAX_LENGTH ? "text-red-600" : "text-zinc-500")}>
            {markdown.length}/{REPLY_PROMPT_MAX_LENGTH}
          </span>
        </label>
      </CardContent>
    </Card>
  );
}
