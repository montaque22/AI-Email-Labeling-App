import { describe, expect, it } from "vitest";
import { shouldLockInboxPageScroll, type InboxScrollLockState } from "./inbox-scroll-lock";

const idleState: InboxScrollLockState = {
  hasCommitmentConfirmation: false,
  hasOpenMessage: false,
  hasRuleEditor: false,
  isAiHelperOpen: false,
  isCommitmentDraftOpen: false,
  isComposeOpen: false,
  isMobileFilterOpen: false,
  isMobileLabelPickerOpen: false,
  isMobileViewport: false,
};

describe("shouldLockInboxPageScroll", () => {
  it("keeps the desktop page scrollable when the embedded email reader is open", () => {
    expect(shouldLockInboxPageScroll({ ...idleState, hasOpenMessage: true })).toBe(false);
  });

  it("locks the background when the mobile email reader is open", () => {
    expect(shouldLockInboxPageScroll({ ...idleState, hasOpenMessage: true, isMobileViewport: true })).toBe(true);
  });

  it("continues to lock the page for genuine desktop overlays", () => {
    expect(shouldLockInboxPageScroll({ ...idleState, isComposeOpen: true })).toBe(true);
    expect(shouldLockInboxPageScroll({ ...idleState, hasRuleEditor: true })).toBe(true);
  });
});
