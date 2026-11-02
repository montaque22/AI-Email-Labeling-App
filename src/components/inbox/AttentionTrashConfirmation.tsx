import { Trash2, X } from "lucide-react";
import { Button } from "../ui/button";
import type { AttentionMessage } from "./attention-dashboard-types";
import { hasActiveCommitment } from "./attention-dashboard-utils";

export function AttentionTrashConfirmation({ isRunning, messages, onCancel, onConfirm }: {
  isRunning: boolean;
  messages: AttentionMessage[];
  onCancel: () => void;
  onConfirm: (eligibleMessages: AttentionMessage[]) => void;
}) {
  const protectedMessages = messages.filter(hasActiveCommitment);
  const eligibleMessages = messages.filter((message) => !hasActiveCommitment(message));
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/25 p-4" role="dialog" aria-modal="true" aria-labelledby="attention-trash-title">
      <div className="w-full max-w-md rounded-2xl border border-white/80 bg-white/95 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950" id="attention-trash-title">Move {messages.length} email{messages.length === 1 ? "" : "s"} to Trash?</h2>
            <p className="mt-1 text-sm text-zinc-600">This moves email through the connected provider. Gmail messages can be restored with Undo.</p>
          </div>
          <Button aria-label="Close Trash confirmation" disabled={isRunning} onClick={onCancel} size="icon" type="button" variant="ghost"><X className="h-4 w-4" /></Button>
        </div>
        {protectedMessages.length > 0 ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
            {protectedMessages.length} selected email{protectedMessages.length === 1 ? " has" : "s have"} an active Commitment and will remain in place. Complete or renege the Commitment first.
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button disabled={isRunning} onClick={onCancel} type="button" variant="outline">Cancel</Button>
          <Button className="bg-red-600 text-white hover:bg-red-700" disabled={isRunning || eligibleMessages.length === 0} onClick={() => onConfirm(eligibleMessages)} type="button">
            <Trash2 className="h-4 w-4" />Move {eligibleMessages.length || ""} to Trash
          </Button>
        </div>
      </div>
    </div>
  );
}
