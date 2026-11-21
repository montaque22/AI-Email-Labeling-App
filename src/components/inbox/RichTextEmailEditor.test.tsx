// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RichTextEmailEditor } from "./RichTextEmailEditor";

describe("RichTextEmailEditor", () => {
  it("exposes basic formatting controls and reports rich and plain content", () => {
    const onChange = vi.fn();
    render(<RichTextEmailEditor html="<p>Hello</p>" onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Bold" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Italic" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Underline" })).toBeTruthy();

    const editor = screen.getByRole("textbox", { name: "Body" });
    editor.innerHTML = "<p><strong>Hello</strong> there</p>";
    fireEvent.input(editor);

    expect(onChange).toHaveBeenLastCalledWith({ html: "<p><strong>Hello</strong> there</p>", text: "Hello there" });
  });
});
