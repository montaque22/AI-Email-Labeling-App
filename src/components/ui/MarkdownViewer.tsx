import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

type MarkdownViewerProps = {
  className?: string;
  markdown: string;
};

export function MarkdownViewer({ className, markdown }: MarkdownViewerProps) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (!listItems.length) {
      return;
    }
    nodes.push(
      <ul className="my-2 list-disc space-y-1 pl-5" key={`list-${nodes.length}`}>
        {listItems.map((item, index) => (
          <li key={`${item}-${index}`}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }

    const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      listItems.push(listMatch[1]);
      return;
    }

    flushList();
    if (trimmed.startsWith("### ")) {
      nodes.push(<h4 className="mt-3 font-semibold text-zinc-950" key={index}>{renderInline(trimmed.slice(4))}</h4>);
    } else if (trimmed.startsWith("## ")) {
      nodes.push(<h3 className="mt-3 text-base font-semibold text-zinc-950" key={index}>{renderInline(trimmed.slice(3))}</h3>);
    } else if (trimmed.startsWith("# ")) {
      nodes.push(<h2 className="mt-3 text-lg font-semibold text-zinc-950" key={index}>{renderInline(trimmed.slice(2))}</h2>);
    } else {
      nodes.push(<p className="my-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]" key={index}>{renderInline(trimmed)}</p>);
    }
  });
  flushList();

  return <div className={cn("text-sm leading-6 text-zinc-700", className)}>{nodes}</div>;
}

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={`${token}-${match.index}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      parts.push(<code className="rounded bg-zinc-100 px-1 py-0.5 text-[0.92em]" key={`${token}-${match.index}`}>{token.slice(1, -1)}</code>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = link?.[2] ?? "";
      parts.push(
        <a className="text-blue-600 underline" href={href} key={`${token}-${match.index}`} rel="noreferrer" target="_blank">
          {link?.[1] ?? href}
        </a>,
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}
