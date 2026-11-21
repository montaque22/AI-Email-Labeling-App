import { useEffect, useRef, type ClipboardEvent } from "react";
import { Bold, Italic, List, ListOrdered, RemoveFormatting, Underline } from "lucide-react";
import { cn } from "../../lib/utils";
import { htmlToEmailText, isEffectivelyEmptyHtml } from "../../lib/email-content";

type RichTextEmailEditorProps = {
  className?: string;
  html: string;
  onChange: (value: { html: string; text: string }) => void;
  placeholder?: string;
};

type FormattingCommand = "bold" | "italic" | "underline" | "insertUnorderedList" | "insertOrderedList" | "removeFormat";

const toolbarActions: Array<{
  command: FormattingCommand;
  icon: typeof Bold;
  label: string;
}> = [
  { command: "bold", icon: Bold, label: "Bold" },
  { command: "italic", icon: Italic, label: "Italic" },
  { command: "underline", icon: Underline, label: "Underline" },
  { command: "insertUnorderedList", icon: List, label: "Bulleted list" },
  { command: "insertOrderedList", icon: ListOrdered, label: "Numbered list" },
  { command: "removeFormat", icon: RemoveFormatting, label: "Clear formatting" },
];

export function RichTextEmailEditor({ className, html, onChange, placeholder = "Write your message..." }: RichTextEmailEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor === document.activeElement || editor.innerHTML === html) {
      return;
    }
    editor.innerHTML = html;
  }, [html]);

  function emitChange() {
    const editor = editorRef.current;
    if (!editor) return;
    const nextHtml = isEffectivelyEmptyHtml(editor.innerHTML) ? "" : editor.innerHTML;
    onChange({ html: nextHtml, text: htmlToEmailText(nextHtml) });
  }

  function applyFormatting(command: FormattingCommand) {
    editorRef.current?.focus();
    document.execCommand(command, false);
    emitChange();
  }

  function pastePlainText(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
    emitChange();
  }

  return (
    <div className={cn("overflow-hidden rounded-lg border border-zinc-200 bg-white/35", className)}>
      <div aria-label="Message formatting" className="flex flex-wrap items-center gap-1 border-b border-zinc-200 bg-white/55 p-1" role="toolbar">
        {toolbarActions.map(({ command, icon: Icon, label }) => (
          <button
            aria-label={label}
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 transition hover:bg-white hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            key={command}
            onClick={() => applyFormatting(command)}
            onMouseDown={(event) => event.preventDefault()}
            title={label}
            type="button"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      <div
        aria-label="Body"
        className="rich-text-email-editor min-h-56 w-full overflow-y-auto px-3 py-3 text-sm leading-6 text-zinc-800 outline-none empty:before:pointer-events-none empty:before:text-zinc-400 empty:before:content-[attr(data-placeholder)]"
        contentEditable
        data-placeholder={placeholder}
        onBlur={emitChange}
        onInput={emitChange}
        onPaste={pastePlainText}
        ref={editorRef}
        role="textbox"
        suppressContentEditableWarning
      />
    </div>
  );
}
