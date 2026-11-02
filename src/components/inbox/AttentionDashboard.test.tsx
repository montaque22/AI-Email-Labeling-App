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
  const interest = [makeMessage(20, "interest")];
  return {
    categories: { attention, cleanup: [], interest },
    cleanupGroups: [],
    counts: { attention: 12, cleanup: 0, interest: 1 },
    pagination: {
      attention: { hasMore: true, nextOffset: 5, total: 12 },
      interest: { hasMore: false, nextOffset: null, total: 1 },
    },
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
    onOpen: vi.fn(),
    onSelectAllMatching: vi.fn().mockResolvedValue(Array.from({ length: 12 }, (_, index) => makeMessage(index + 1))),
    onSelectCategory: vi.fn(),
    onSelectionChange: vi.fn(),
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
    expect(screen.getAllByLabelText("Follow email").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Set commitment").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Archive email").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Move email to Trash").length).toBeGreaterThan(0);
    rerender(<AttentionDashboard {...props} category="interest" />);
    expect(screen.getAllByLabelText("Unfollow email").length).toBeGreaterThan(0);
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
    expect(container.querySelector(".grid-cols-1")).toBeTruthy();
    expect(container.querySelector(".overflow-x-auto")).toBeNull();
  });
});
