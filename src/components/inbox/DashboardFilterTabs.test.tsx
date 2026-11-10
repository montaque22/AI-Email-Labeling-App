// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Gem, Inbox, Sparkles } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardFilterTabs, formatDashboardFilterCount } from "./DashboardFilterTabs";

afterEach(cleanup);

const options = [
  { count: 4_321, icon: Inbox, label: "All", value: "all" },
  { count: 12, icon: Sparkles, label: "Quick Wins", value: "quick-wins" },
  { count: 3, icon: Gem, label: "Commitments", value: "commitments" },
];

describe("DashboardFilterTabs", () => {
  it("shows icons, names, and counts in the expanded list", () => {
    render(<DashboardFilterTabs ariaLabel="Filters" onChange={vi.fn()} options={options} value="all" />);
    const quickWins = screen.getByRole("tab", { name: "Quick Wins 12" });
    expect(within(quickWins).getByText("Quick Wins").className).not.toContain("sr-only");
    expect(quickWins.querySelector("svg")).toBeTruthy();
  });

  it("shows only icons and abbreviated counts in the split-view list", () => {
    const onChange = vi.fn();
    render(<DashboardFilterTabs ariaLabel="Filters" compact onChange={onChange} options={options} value="all" />);
    const all = screen.getByRole("tab", { name: "All 4321" });
    expect(within(all).getByText("All").className).toContain("sr-only");
    expect(within(all).getByText("4.3k")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Quick Wins 12" }));
    expect(onChange).toHaveBeenCalledWith("quick-wins");
  });

  it("abbreviates counts only after three digits", () => {
    expect(formatDashboardFilterCount(999)).toBe("999");
    expect(formatDashboardFilterCount(1_000)).toBe("1k");
    expect(formatDashboardFilterCount(4_321)).toBe("4.3k");
    expect(formatDashboardFilterCount(1_250_000)).toBe("1.3m");
  });
});
