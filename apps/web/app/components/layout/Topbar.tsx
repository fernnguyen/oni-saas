export function Topbar({ tenantName }: { tenantName: string }) {
  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 sticky top-0 z-20">
      <div className="flex items-center gap-3 min-w-0">
        <button className="md:hidden rounded border border-slate-300 px-3 py-2 text-sm">☰</button>
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-700">{tenantName}</div>
          <div className="text-xs text-slate-500">oni.vn</div>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        <button className="hidden sm:inline-flex rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">Import</button>
        <button className="hidden sm:inline-flex rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">Export</button>
        <button className="rounded bg-[#0F766E] px-3 md:px-4 py-2 text-sm text-white hover:bg-[#115E59]">+ Thêm mới</button>
      </div>
    </header>
  );
}
