// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AgentSourceCards } from "./AgentSourceCards";

afterEach(cleanup);

describe("AgentSourceCards", () => {
  it("renders normalized source metadata as an accessible external link", () => {
    render(<AgentSourceCards sources={[{ domain: "example.com", title: "Public report", url: "https://example.com/report" }]} />);
    const source = screen.getByRole("link", { name: "Open source: Public report" });
    expect(source.getAttribute("href")).toBe("https://example.com/report");
    expect(source.getAttribute("rel")).toContain("noreferrer");
  });
});
