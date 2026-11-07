import { cn } from "../../lib/utils";

export type InboxViewChoice = "dashboard" | "all-mail";

type InboxViewToggleProps = {
  className?: string;
  onChange: (view: InboxViewChoice) => void;
  value: InboxViewChoice;
};

export function InboxViewToggle({ className, onChange, value }: InboxViewToggleProps) {
  return (
    <div className={cn("inline-flex rounded-full border border-white/80 bg-white/65 p-1 shadow-sm backdrop-blur-xl", className)} role="group" aria-label="Inbox view">
      <button className={cn("flex-1 rounded-full px-5 py-2 text-sm font-medium transition sm:flex-none", value === "dashboard" ? "bg-violet-100 text-violet-700 shadow-sm" : "text-zinc-600 hover:text-zinc-950")} onClick={() => onChange("dashboard")} type="button">Dashboard</button>
      <button className={cn("flex-1 rounded-full px-5 py-2 text-sm font-medium transition sm:flex-none", value === "all-mail" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600 hover:text-zinc-950")} onClick={() => onChange("all-mail")} type="button">All Mail</button>
    </div>
  );
}
