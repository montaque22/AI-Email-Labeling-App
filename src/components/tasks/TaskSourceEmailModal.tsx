import { useEffect, useState } from "react";
import { Archive, FileText, Loader2, Mail, Paperclip, X } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { LiquidGlassCard } from "../ui/liquid-glass";
import { getRuntimeUrl } from "../../lib/runtime-base";
import type { Task } from "./types";

type TaskSourceEmailSummary = {
  id: string;
  accountId: string;
  accountEmail: string;
  provider: string;
  mailbox?: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  labels: string[];
  archived?: boolean;
  hasAttachments?: boolean;
};

type TaskSourceEmailDetail = TaskSourceEmailSummary & {
  to: string;
  cc?: string;
  bodyText: string;
  attachments: Array<{
    id?: string;
    filename: string;
    mimeType?: string;
    size?: number;
  }>;
};

type TaskSourceEmailModalProps = {
  task: Task;
  onClose: () => void;
};

export function TaskSourceEmailModal({ task, onClose }: TaskSourceEmailModalProps) {
  const [summary, setSummary] = useState<TaskSourceEmailSummary | null>(null);
  const [detail, setDetail] = useState<TaskSourceEmailDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadSourceEmail() {
      setLoading(true);
      setError("");
      setSummary(null);
      setDetail(null);

      try {
        const sourceResponse = await fetch(getRuntimeUrl(`/api/tasks/${task.id}/source-email`), {
          credentials: "include",
        });
        const sourceData = await sourceResponse.json();
        if (!sourceResponse.ok) {
          throw new Error(sourceData.error || "Could not load linked email.");
        }
        if (cancelled) {
          return;
        }

        const nextSummary = sourceData.message as TaskSourceEmailSummary;
        setSummary(nextSummary);

        const detailParams = new URLSearchParams({
          accountId: nextSummary.accountId,
          emailId: nextSummary.id,
        });
        if (nextSummary.mailbox) {
          detailParams.set("mailbox", nextSummary.mailbox);
        }

        const detailResponse = await fetch(getRuntimeUrl(`/api/inbox/message?${detailParams.toString()}`), {
          credentials: "include",
          cache: "no-store",
        });
        const detailData = await detailResponse.json();
        if (!detailResponse.ok) {
          throw new Error(detailData.error || "Could not load email details.");
        }
        if (!cancelled) {
          setDetail(detailData.message as TaskSourceEmailDetail);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load linked email.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSourceEmail();

    return () => {
      cancelled = true;
    };
  }, [task.id]);

  const activeEmail = detail ?? summary;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/30 p-3 backdrop-blur-sm">
      <LiquidGlassCard
        shadowIntensity="sm"
        borderRadius="16px"
        glowIntensity="sm"
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden bg-white/60 text-zinc-950"
      >
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/60 px-5">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Source email</p>
            <h2 className="truncate text-lg font-semibold text-zinc-950">{activeEmail?.subject || task.title}</h2>
          </div>
          <Button aria-label="Close source email" onClick={onClose} size="icon" type="button" variant="ghost">
            <X className="h-5 w-5" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center gap-2 rounded-xl bg-white/50 p-4 text-sm text-zinc-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading linked email...
            </div>
          ) : null}

          {error ? <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

          {activeEmail && !error ? (
            <div className="space-y-4">
              <section className="rounded-xl border border-white/70 bg-white/55 p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {(activeEmail.labels ?? []).map((label) => (
                    <Badge key={label} className="bg-blue-50 text-blue-700">{label}</Badge>
                  ))}
                  {activeEmail.archived ? (
                    <Badge className="bg-zinc-100 text-zinc-700">
                      <Archive className="h-3 w-3" />
                      Archived
                    </Badge>
                  ) : null}
                  {activeEmail.hasAttachments ? (
                    <Badge className="bg-zinc-100 text-zinc-700">
                      <Paperclip className="h-3 w-3" />
                      Attachments
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-4 grid gap-2 text-sm text-zinc-700 md:grid-cols-[120px_minmax(0,1fr)]">
                  <span className="font-medium text-zinc-950">From</span>
                  <span className="break-words">{activeEmail.from || "Unknown sender"}</span>
                  <span className="font-medium text-zinc-950">To</span>
                  <span className="break-words">{detail?.to || activeEmail.accountEmail}</span>
                  {detail?.cc ? (
                    <>
                      <span className="font-medium text-zinc-950">Cc</span>
                      <span className="break-words">{detail.cc}</span>
                    </>
                  ) : null}
                  <span className="font-medium text-zinc-950">Date</span>
                  <span>{formatEmailDate(activeEmail.date)}</span>
                  <span className="font-medium text-zinc-950">Account</span>
                  <span className="break-words">{activeEmail.accountEmail}</span>
                </div>
              </section>

              <section className="rounded-xl border border-white/70 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-950">
                  <Mail className="h-4 w-4" />
                  Message
                </div>
                <div className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-800">
                  {detail?.bodyText || activeEmail.snippet || "No plain text content was available for this email."}
                </div>
              </section>

              {detail?.attachments?.length ? (
                <section className="rounded-xl border border-white/70 bg-white/55 p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-950">
                    <FileText className="h-4 w-4" />
                    Attachments
                  </div>
                  <div className="space-y-2">
                    {detail.attachments.map((attachment) => (
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white/70 px-3 py-2 text-sm" key={attachment.id || attachment.filename}>
                        <span className="min-w-0 truncate">{attachment.filename || "Attachment"}</span>
                        <span className="shrink-0 text-xs text-zinc-500">{formatAttachmentMeta(attachment.mimeType, attachment.size)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </LiquidGlassCard>
    </div>
  );
}

function formatEmailDate(value: string) {
  if (!value) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatAttachmentMeta(mimeType = "", size?: number) {
  const parts = [mimeType, typeof size === "number" && size > 0 ? `${Math.round(size / 1024)} KB` : ""].filter(Boolean);
  return parts.join(" · ");
}
