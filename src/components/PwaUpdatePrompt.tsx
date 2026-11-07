import { RefreshCw } from "lucide-react";
import { Button } from "./ui/button";

export type PwaUpdatePromptProps = {
  applyUpdate: () => Promise<void>;
  collapseUpdate: () => void;
  expandUpdate: () => void;
  isOffline: boolean;
  isUpdateAvailable: boolean;
  isUpdateCollapsed: boolean;
  isUpdating: boolean;
};

export function PwaUpdatePrompt({ applyUpdate, collapseUpdate, expandUpdate, isOffline, isUpdateAvailable, isUpdateCollapsed, isUpdating }: PwaUpdatePromptProps) {
  if (!isOffline && !isUpdateAvailable) return null;

  if (isUpdateAvailable && isUpdateCollapsed) {
    return (
      <button aria-label="Show available update" className="fixed bottom-24 left-4 z-[1000] flex h-12 w-12 items-center justify-center rounded-full border border-emerald-200 bg-white/95 text-emerald-700 shadow-2xl shadow-slate-900/20 backdrop-blur-2xl transition hover:scale-105 hover:bg-emerald-50" onClick={expandUpdate} title="Update available" type="button">
        <RefreshCw className="h-5 w-5" />
        <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-white bg-red-500" />
      </button>
    );
  }

  return (
    <div className="fixed inset-x-3 bottom-4 z-[1000] mx-auto max-w-md rounded-2xl border border-white/70 bg-white/95 p-3 text-sm text-zinc-700 shadow-2xl shadow-slate-900/20 backdrop-blur-2xl md:bottom-6 md:right-6 md:left-auto md:mx-0">
      {isUpdateAvailable ? (
        <div className="flex items-start gap-3">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-zinc-950">Update available</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">A newer version of Emailable is ready. Refresh to stay in sync.</p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button disabled={isUpdating} onClick={collapseUpdate} size="sm" type="button" variant="ghost">Later</Button>
              <Button disabled={isUpdating} onClick={() => void applyUpdate()} size="sm" type="button">{isUpdating ? "Updating..." : "Reload"}</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-[10px] font-bold text-amber-700">!</span>
          <div><p className="font-semibold text-zinc-950">You are offline</p><p className="mt-1 text-xs leading-5 text-zinc-500">Some inbox and API actions may be out of sync until the connection returns.</p></div>
        </div>
      )}
    </div>
  );
}
