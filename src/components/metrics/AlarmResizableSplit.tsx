import { useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";

export function AlarmResizableSplit({
  left,
  right,
  defaultLeftWidth = 64,
}: {
  left: ReactNode;
  right: ReactNode;
  defaultLeftWidth?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);

  function startResize(clientX: number) {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    const applyWidth = (nextClientX: number) => {
      const next = ((nextClientX - bounds.left) / bounds.width) * 100;
      setLeftWidth(Math.min(Math.max(next, 25), 75));
    };
    const handlePointerMove = (event: PointerEvent) => applyWidth(event.clientX);
    const stopResize = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
    };

    applyWidth(clientX);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
  }

  return (
    <>
      <div className="flex flex-col gap-5 md:hidden">
        {left}
        {right}
      </div>
      <div ref={containerRef} className="hidden items-stretch gap-4 md:flex">
        <div className="min-w-0" style={{ width: `${leftWidth}%` }}>
          {left}
        </div>
        <ResizeHandle onResizeStart={startResize} />
        <div className="min-w-0 flex-1">{right}</div>
      </div>
    </>
  );
}

function ResizeHandle({ onResizeStart }: { onResizeStart: (clientX: number) => void }) {
  return (
    <button
      aria-label="Resize alarm sections"
      className={cn(
        "group relative flex w-5 shrink-0 cursor-col-resize items-stretch justify-center rounded-full",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400",
      )}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onResizeStart(event.clientX);
      }}
      type="button"
    >
      <span className="my-2 w-px rounded-full bg-white/80 shadow-sm transition-colors group-hover:bg-zinc-300" />
      <span className="absolute top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/55 text-zinc-500 shadow-md shadow-slate-900/10 backdrop-blur-sm transition-colors group-hover:text-zinc-950">
        <ChevronLeft className="h-3.5 w-3.5" />
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
