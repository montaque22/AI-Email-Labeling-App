// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttentionDashboard } from "./AttentionDashboard";
import type { AttentionCategory, AttentionDashboardData, AttentionMessage } from "./attention-dashboard-types";

function makeMessage(id: number, category: "attention" | "interest" = "attention", commitment = false): AttentionMessage {
  return {
    accountEmail: "person@example.com",
    accountId: "account-1",
    attention: { category, explanation: "Review suggested.", reasonCode: "possible_action" },
    commitment: commitment ? { dueAt: "2026-11-03T12:00:00.000Z", setAt: "2026-11-01T12:00:00.000Z", text: "Reply" } : null,
    date: "2026-11-01T12:00:00.000Z",
    followed: category === "interest",
    from: `Sender ${id} <sender${id}@example.com>`,
    hasAttachments: false,
    id: `message-${id}`,
    isRead: true,
    labels: [category === "attention" ? "Action Required" : "Reference"],
    mailbox: "INBOX",
    provider: "gmail",
    sender: `Sender ${id}`,
    snippet: `Preview ${id}`,
    subject: `Subject ${id}`,
    threadId: `thread-${id}`,
  };
}

function makeData(): AttentionDashboardData {
  const attention = Array.from({ length: 5 }, (_, index) => makeMessage(index + 1));
  attention[0].attention.quickWin = { isQuickWin: true, quickWinConfidence: 0.91, suggestedNextAction: "Reply briefly." };
  const interest = [makeMessage(20, "interest")];
  interest[0].interestFreshness = { days: 24, label: "Still interested?", state: "review" };
  const review = [makeMessage(30)];
  review[0].attention = { category: "review", explanation: "Needs review.", reasonCode: "needs_review" };
  return {
    categories: { attention, cleanup: [], interest },
    cleanupCounts: { likelyClutter: 0, needsReview: 1 },
    cleanupReview: review,
    cleanupGroups: [],
    commitments: [],
    counts: { attention: 12, cleanup: 0, interest: 1 },
    pagination: {
      attention: { hasMore: true, nextOffset: 5, total: 12 },
      interest: { hasMore: false, nextOffset: null, total: 1 },
    },
    quickWinCount: 1,
    quickWins: [attention[0]],
  };
}

function renderDashboard(category: AttentionCategory = "attention", overrides: Partial<ComponentProps<typeof AttentionDashboard>> = {}) {
  const props: ComponentProps<typeof AttentionDashboard> = {
    category,
    data: makeData(),
    isLoading: false,
    onArchive: vi.fn(),
    onCommitment: vi.fn(),
    onDelete: vi.fn(),
    onLoadMore: vi.fn().mockResolvedValue(undefined),
    onNotQuickWin: vi.fn(),
    onOpen: vi.fn(),
    onReturnInterest: vi.fn(),
    onSelectAllMatching: vi.fn().mockResolvedValue(Array.from({ length: 12 }, (_, index) => makeMessage(index + 1))),
    onSelectCategory: vi.fn(),
    onSelectionChange: vi.fn(),
    onStillInterested: vi.fn(),
    onToggleFollow: vi.fn(),
    selectedMessages: [],
    ...overrides,
  };
  return { props, ...render(<AttentionDashboard {...props} />) };
}

describe("AttentionDashboard", () => {
  afterEach(cleanup);

  it("selects loaded messages before offering explicit all-results selection", async () => {
    const { props, rerender } = renderDashboard();
    fireEvent.click(screen.getByLabelText("Select loaded emails in Needs Attention"));
    const loaded = makeData().categories.attention;
    rerender(<AttentionDashboard {...props} selectedMessages={loaded} />);
    expect(screen.getAllByText("5 selected").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Select all 12 emails in Needs Attention" }));
    await waitFor(() => expect(screen.getByText("All 12 matching emails selected")).toBeTruthy());
    expect(props.onSelectAllMatching).toHaveBeenCalledWith("attention");
  });

  it("exposes bookmark, commitment, archive, Trash, and open actions in both priority categories", () => {
    const { rerender, props } = renderDashboard();
    expect(screen.getAllByLabelText("Bookmark email").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Set commitment").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Archive email").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Move email to Trash").length).toBeGreaterThan(0);
    rerender(<AttentionDashboard {...props} category="interest" />);
    expect(screen.getAllByLabelText("Remove bookmark").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Set commitment").length).toBeGreaterThan(0);
  });

  it("warns and protects active Commitments from Trash", () => {
    const data = makeData();
    data.categories.attention = [makeMessage(1, "attention", true)];
    renderDashboard("attention", { data });
    fireEvent.click(screen.getAllByLabelText("Move email to Trash")[0]);
    expect(screen.getByRole("alert").textContent).toContain("active Commitment");
    const confirmButton = within(screen.getByRole("dialog")).getByRole("button", { name: "Move to Trash" }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
  });

  it("uses a single-column mobile-first card grid without horizontal overflow", () => {
    const { container } = renderDashboard();
    const cardGrid = container.querySelector(".grid-cols-1");
    expect(cardGrid).toBeTruthy();
    expect(cardGrid?.classList.contains("overflow-x-auto")).toBe(false);
  });

  it("filters Needs Attention to confident Quick Wins and records corrections", () => {
    const { props } = renderDashboard();
    fireEvent.click(screen.getByRole("tab", { name: "Quick Wins 1" }));
    expect(screen.getByText("Quick Win")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Not a Quick Win"));
    expect(props.onNotQuickWin).toHaveBeenCalled();
  });

  it("offers lightweight completion and freshness actions for bookmarked mail", () => {
    const { container, props } = renderDashboard("interest");
    expect(container.querySelector(".overflow-visible")).toBeTruthy();
    expect(container.querySelector(".overflow-hidden")).toBeNull();
    expect(screen.getByText("Still interested?")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Still interested" })[0]);
    expect(props.onStillInterested).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Done"));
    fireEvent.click(screen.getAllByRole("button", { name: "Return" })[0]);
    expect(props.onReturnInterest).toHaveBeenCalled();
  });

  it("separates Likely Clutter from uncategorized Needs Review mail", () => {
    renderDashboard("cleanup");
    fireEvent.click(screen.getByRole("tab", { name: "Needs Review 1" }));
    expect(screen.getByText("Subject 30")).toBeTruthy();
    expect(screen.getAllByLabelText("Bookmark email").length).toBeGreaterThan(0);
  });
});
