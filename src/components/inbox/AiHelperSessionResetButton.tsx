import { RefreshCw } from "lucide-react";
import { Button } from "../ui/button";

type AiHelperSessionResetButtonProps = {
  disabled?: boolean;
  onReset: () => void;
};

export function AiHelperSessionResetButton({ disabled = false, onReset }: AiHelperSessionResetButtonProps) {
  return (
    <Button
      aria-label="Start a new AI Helper session"
      className="h-8 gap-1.5 px-2 text-xs text-zinc-600"
      disabled={disabled}
      onClick={onReset}
      title="Clear this conversation and start a new agent session"
      type="button"
      variant="ghost"
    >
      <RefreshCw className="h-3.5 w-3.5" />
      New session
    </Button>
  );
}
