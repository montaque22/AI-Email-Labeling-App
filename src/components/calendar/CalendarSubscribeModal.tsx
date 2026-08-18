import { Loader2, Trash2, X } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import type { CalendarSubscription } from "./types";

type SubscribeCalendarModalProps = {
  error: string | null;
  initialSubscription?: CalendarSubscription | null;
  isDeleting?: boolean;
  isSaving: boolean;
  onClose: () => void;
  onDelete?: () => Promise<void>;
  onSubmit: (input: { name: string; url: string; color: string }) => Promise<void>;
};

const colorOptions = ["#2563eb", "#059669", "#dc2626", "#7c3aed", "#ea580c", "#0891b2"];

export function CalendarSubscribeModal({
  error,
  initialSubscription = null,
  isDeleting = false,
  isSaving,
  onClose,
  onDelete,
  onSubmit,
}: SubscribeCalendarModalProps) {
  const isEditing = Boolean(initialSubscription);
  const [name, setName] = useState(initialSubscription?.name ?? "");
  const [url, setUrl] = useState(initialSubscription?.url ?? "");
  const [color, setColor] = useState(initialSubscription?.color ?? colorOptions[0]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({ name, url, color });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/20 p-4">
      <Card className="w-full max-w-xl overflow-hidden bg-white/60">
        <div className="flex items-start justify-between border-b border-white/70 p-5">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">{isEditing ? "Update calendar subscription" : "Subscribe to calendar"}</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {isEditing
                ? "Update this iCalendar feed subscription or remove it from Emailable."
                : "Add an iCalendar feed URL. Google, iCloud, Outlook, and many other calendar apps can publish or share one."}
            </p>
          </div>
          <button className="cursor-pointer rounded-full p-1 text-zinc-500 hover:bg-white/60 hover:text-zinc-950" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="space-y-4 p-5" onSubmit={handleSubmit}>
          {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <label className="block text-sm font-medium text-zinc-700">
            Name
            <input
              className="mt-2 h-11 w-full rounded-full border border-white/70 bg-white/50 px-4 text-sm outline-none backdrop-blur-xl"
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              placeholder="Family calendar"
              value={name}
            />
          </label>
          <label className="block text-sm font-medium text-zinc-700">
            Subscription URL
            <input
              className="mt-2 h-11 w-full rounded-full border border-white/70 bg-white/50 px-4 text-sm outline-none backdrop-blur-xl"
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://calendar.google.com/calendar/ical/..."
              required
              value={url}
            />
            <span className="mt-2 block text-xs leading-5 text-zinc-500">
              Use an iCalendar feed URL. A normal Google Calendar page URL will not sync events.
            </span>
          </label>
          <div>
            <p className="text-sm font-medium text-zinc-700">Color</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {colorOptions.map((option) => (
                <button
                  aria-label={`Use calendar color ${option}`}
                  className="h-9 w-9 cursor-pointer rounded-full border-2 border-white shadow-sm transition hover:scale-105"
                  key={option}
                  onClick={() => setColor(option)}
                  style={{ backgroundColor: option, outline: color === option ? "2px solid rgba(24,24,27,0.7)" : "none" }}
                  type="button"
                />
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-white/70 bg-white/35 p-3 text-sm text-zinc-600">
            Subscription feeds are read-only. Emailable stores event titles, dates, locations, and descriptions so the calendar can render quickly.
          </div>
          <div className="flex justify-end gap-2 border-t border-white/70 pt-4">
            {isEditing && onDelete ? (
              <Button
                className="mr-auto border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                disabled={isSaving || isDeleting}
                onClick={() => {
                  void onDelete();
                }}
                type="button"
                variant="outline"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </Button>
            ) : null}
            <Button className="border-white/70 bg-white/50" onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={isSaving || isDeleting} type="submit">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEditing ? "Update" : "Subscribe"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
