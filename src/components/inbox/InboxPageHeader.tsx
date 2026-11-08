import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

type InboxPageHeaderProps = {
  action?: ReactNode;
};

export function InboxPageHeader({ action }: InboxPageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 px-1">
      <div className="flex min-w-0 items-start gap-3">
        <div className="rounded-2xl bg-violet-100 p-2.5 text-violet-600">
          <Sparkles className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 md:text-3xl">Your Inbox</h1>
          <p className="text-sm text-zinc-500 md:text-base">Find what matters. Clear the rest.</p>
        </div>
      </div>
      {action ? <div className="w-full sm:w-auto">{action}</div> : null}
    </header>
  );
}
