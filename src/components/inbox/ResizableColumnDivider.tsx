import { useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { cn } from "../../lib/utils";

type ResizableColumnDividerProps = {
  className?: string;
  containerRef: RefObject<HTMLElement | null>;
  maxRatio?: number;
  minPixels?: number;
  onRatioChange: (ratio: number) => void;
  ratio: number;
};

const KEYBOARD_STEP = 0.02;

export function ResizableColumnDivider({
  className,
  containerRef,
  maxRatio = 0.5,
  minPixels = 300,
  onRatioChange,
  ratio,
}: ResizableColumnDividerProps) {
  const [activePointerId, setActivePointerId] = useState<number | null>(null);

  function clampRatio(nextRatio: number) {
    const width = containerRef.current?.getBoundingClientRect().width ?? 0;
    const minimumRatio = width > 0 ? Math.min(maxRatio, minPixels / width) : 0;
    return Math.min(maxRatio, Math.max(minimumRatio, nextRatio));
  }

  function resizeFromPointer(clientX: number) {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    onRatioChange(clampRatio((clientX - bounds.left) / bounds.width));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActivePointerId(event.pointerId);
    resizeFromPointer(event.clientX);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (activePointerId !== event.pointerId) return;
    resizeFromPointer(event.clientX);
  }

  function stopResize(event: PointerEvent<HTMLDivElement>) {
    if (activePointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setActivePointerId(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!(["ArrowLeft", "ArrowRight"] as string[]).includes(event.key)) return;
    event.preventDefault();
    onRatioChange(clampRatio(ratio + (event.key === "ArrowRight" ? KEYBOARD_STEP : -KEYBOARD_STEP)));
  }

  return (
    <div
      aria-label="Resize email list"
      aria-orientation="vertical"
      aria-valuemax={Math.round(maxRatio * 100)}
      aria-valuemin={Math.round(clampRatio(0) * 100)}
      aria-valuenow={Math.round(ratio * 100)}
      className={cn(
        "group hidden h-full cursor-col-resize touch-none select-none items-stretch justify-center md:flex",
        activePointerId !== null && "is-resizing",
        className,
      )}
      onKeyDown={handleKeyDown}
      onPointerCancel={stopResize}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopResize}
      role="separator"
      tabIndex={0}
    >
      <span className="my-2 w-px rounded-full bg-zinc-300 transition-all group-hover:w-1 group-hover:bg-violet-400 group-focus:w-1 group-focus:bg-violet-500 group-[.is-resizing]:w-1 group-[.is-resizing]:bg-violet-500" />
    </div>
  );
}
