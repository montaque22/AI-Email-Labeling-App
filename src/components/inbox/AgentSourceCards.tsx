import { ExternalLink, FileText, Globe2 } from "lucide-react";

export type AgentResearchSource = {
  date?: string;
  domain: string;
  excerpt?: string;
  sourceType?: string;
  title: string;
  url: string;
};

export function isAgentResearchSource(value: unknown): value is AgentResearchSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<AgentResearchSource>;
  return typeof source.url === "string"
    && /^https?:\/\//i.test(source.url)
    && typeof source.title === "string"
    && typeof source.domain === "string";
}

export function AgentSourceCards({ sources }: { sources: AgentResearchSource[] }) {
  if (sources.length === 0) return null;

  return (
    <section aria-label="Research sources" className="mt-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Sources</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {sources.map((source) => {
          const SourceIcon = source.sourceType?.toLowerCase().includes("document") ? FileText : Globe2;
          return (
            <a
              aria-label={`Open source: ${source.title}`}
              className="group min-w-0 rounded-xl border border-white/80 bg-white/75 p-3 text-left shadow-sm transition hover:border-violet-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              href={source.url}
              key={source.url}
              rel="noreferrer noopener"
              target="_blank"
            >
              <div className="flex items-start gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600"><SourceIcon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-xs font-semibold leading-4 text-zinc-900">{source.title}</span>
                  <span className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-zinc-500">
                    <span className="truncate">{source.domain}</span>
                    {source.date ? <><span aria-hidden="true">·</span><span className="shrink-0">{source.date}</span></> : null}
                  </span>
                </span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-400 transition group-hover:text-violet-600" />
              </div>
              {source.excerpt ? <span className="mt-2 line-clamp-2 block text-[11px] leading-4 text-zinc-500">{source.excerpt}</span> : null}
            </a>
          );
        })}
      </div>
    </section>
  );
}
