type InboxSelectAllBannerProps = {
  isBusy: boolean;
  isEntireListSelected: boolean;
  loadedCount: number;
  onClear: () => void;
  onSelectEntireList: () => void;
  totalCount: number;
};

export function InboxSelectAllBanner({ isBusy, isEntireListSelected, loadedCount, onClear, onSelectEntireList, totalCount }: InboxSelectAllBannerProps) {
  if (totalCount <= loadedCount) return null;
  return (
    <div className="mx-3 mb-2 flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50/90 px-4 py-2 text-center text-sm text-blue-900 shadow-sm md:mx-0">
      {isEntireListSelected ? <>
        <span>All {totalCount.toLocaleString()} emails in this list are selected.</span>
        <button className="font-semibold text-blue-700 underline underline-offset-2" onClick={onClear} type="button">Deselect all</button>
      </> : <>
        <span>All {loadedCount.toLocaleString()} loaded emails are selected.</span>
        <button className="font-semibold text-blue-700 underline underline-offset-2 disabled:cursor-wait disabled:opacity-60" disabled={isBusy} onClick={onSelectEntireList} type="button">
          {isBusy ? "Selecting…" : `Select all ${totalCount.toLocaleString()} emails`}
        </button>
      </>}
    </div>
  );
}
