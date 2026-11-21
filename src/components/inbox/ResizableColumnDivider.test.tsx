// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { ResizableColumnDivider } from "./ResizableColumnDivider";

describe("ResizableColumnDivider", () => {
  it("supports keyboard resizing and respects the maximum ratio", () => {
    const containerRef = createRef<HTMLDivElement>();
    const onRatioChange = vi.fn();
    render(
      <div ref={containerRef}>
        <ResizableColumnDivider containerRef={containerRef} onRatioChange={onRatioChange} ratio={0.49} />
      </div>,
    );
    vi.spyOn(containerRef.current!, "getBoundingClientRect").mockReturnValue({ width: 1000 } as DOMRect);

    fireEvent.keyDown(screen.getByRole("separator", { name: "Resize email list" }), { key: "ArrowRight" });

    expect(onRatioChange).toHaveBeenCalledWith(0.5);
  });
});
