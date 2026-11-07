export type InboxScrollLockState = {
  hasCommitmentConfirmation: boolean;
  hasOpenMessage: boolean;
  hasRuleEditor: boolean;
  isAiHelperOpen: boolean;
  isCommitmentDraftOpen: boolean;
  isComposeOpen: boolean;
  isMobileFilterOpen: boolean;
  isMobileLabelPickerOpen: boolean;
  isMobileViewport: boolean;
};

export function shouldLockInboxPageScroll(state: InboxScrollLockState) {
  return Boolean(
    (state.hasOpenMessage && state.isMobileViewport) ||
      state.hasRuleEditor ||
      state.isComposeOpen ||
      state.isCommitmentDraftOpen ||
      state.hasCommitmentConfirmation ||
      state.isMobileFilterOpen ||
      state.isMobileLabelPickerOpen ||
      (state.isAiHelperOpen && state.isMobileViewport),
  );
}
