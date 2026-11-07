import { Check, Copy, Mail, Pencil, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { getActiveReplyDraftVersion, type ReplyDraftArtifact } from "./work-artifacts";

type ReplyDraftArtifactCardProps = {
  artifact: ReplyDraftArtifact;
  onRefine: () => void;
  onRestorePrevious: () => void;
  onUseInReply: () => void;
};

export function ReplyDraftArtifactCard({ artifact, onRefine, onRestorePrevious, onUseInReply }: ReplyDraftArtifactCardProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const version = getActiveReplyDraftVersion(artifact);
  const canRestore = artifact.activeVersionIndex > 0;

  async function copyDraft() {
    await navigator.clipboard.writeText(version.bodyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-violet-200/80 bg-white shadow-sm" data-testid="reply-draft-artifact">
      <header className="flex items-center justify-between gap-3 border-b border-violet-100 bg-violet-50/70 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Mail className="h-4 w-4 shrink-0 text-violet-600" />
          <p className="truncate text-xs font-semibold text-zinc-950">Reply Draft</p>
        </div>
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">v{version.version}</span>
      </header>
      <div className="space-y-2 px-3 py-3 text-xs text-zinc-600">
        <p className="truncate"><span className="font-semibold text-zinc-900">To:</span> {version.to || "Current sender"}</p>
        <p className="truncate"><span className="font-semibold text-zinc-900">Subject:</span> {version.subject}</p>
        <div className={cn("whitespace-pre-wrap border-t border-zinc-100 pt-3 text-sm leading-6 text-zinc-800", !expanded && "max-h-64 overflow-hidden [mask-image:linear-gradient(to_bottom,black_75%,transparent)]")}>
          {version.bodyText}
        </div>
        {version.bodyText.length > 700 ? (
          <button className="font-semibold text-violet-700 hover:text-violet-900" onClick={() => setExpanded((value) => !value)} type="button">
            {expanded ? "Show less" : "Show full draft"}
          </button>
        ) : null}
      </div>
      <footer className="flex flex-wrap gap-2 border-t border-zinc-100 px-3 py-2">
        <Button className="bg-violet-600 text-white hover:bg-violet-700" onClick={onUseInReply} size="sm" type="button">
          <Mail className="mr-1.5 h-3.5 w-3.5" /> Use in Reply
        </Button>
        <Button onClick={onRefine} size="sm" type="button" variant="outline">
          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Refine
        </Button>
        <Button onClick={() => void copyDraft()} size="sm" type="button" variant="outline">
          {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
        </Button>
        {canRestore ? (
          <Button onClick={onRestorePrevious} size="sm" type="button" variant="ghost">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Undo
          </Button>
        ) : null}
      </footer>
      {artifact.status === "applied" ? <p className="border-t border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">Applied to the reply composer. Review it before sending.</p> : null}
    </section>
  );
}
