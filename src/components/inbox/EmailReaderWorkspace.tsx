import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";

export type EmailReaderMode = "read" | "work";

type EmailReaderWorkspaceProps = {
  mode: EmailReaderMode;
  onModeChange: (mode: EmailReaderMode) => void;
  readPane: ReactNode;
  workPane: ReactNode;
};

export function EmailReaderWorkspace({ mode, onModeChange, readPane, workPane }: EmailReaderWorkspaceProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 justify-center border-b border-white/60 bg-white/35 px-4 py-2">
        <EmailReaderModeSwitch mode={mode} onModeChange={onModeChange} />
      </div>
      <div className={cn("min-h-0 flex-1", mode === "work" && "md:grid md:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.8fr)] md:gap-3")}>
        <div className={cn("min-h-0", mode === "work" && "max-md:hidden")}>{readPane}</div>
        {mode === "work" ? <div className="min-h-0 border-white/70 md:border-l">{workPane}</div> : null}
      </div>
    </div>
  );
}

export function EmailReaderModeSwitch({ mode, onModeChange }: Pick<EmailReaderWorkspaceProps, "mode" | "onModeChange">) {
  return (
    <div aria-label="Email reader mode" className="inline-flex min-w-52 rounded-full border border-white/80 bg-white/70 p-1 shadow-sm backdrop-blur-xl" role="group">
      {(["read", "work"] as const).map((value) => (
        <button
          aria-pressed={mode === value}
          className={cn(
            "flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-semibold capitalize transition",
            mode === value ? "bg-violet-600 text-white shadow-md shadow-violet-500/20" : "text-zinc-600 hover:bg-white hover:text-zinc-950",
          )}
          key={value}
          onClick={() => onModeChange(value)}
          type="button"
        >
          {value === "work" ? <Sparkles className="h-3.5 w-3.5" /> : null}
          {value}
        </button>
      ))}
    </div>
  );
}
