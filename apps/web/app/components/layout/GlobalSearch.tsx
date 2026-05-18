'use client';

import { useState, useEffect, useRef } from 'react';

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
    }
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-sm text-slate-400 hover:border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer shrink-0"
      >
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="flex-1 text-left truncate hidden sm:inline-block">Tìm kiếm mã phiếu, khách hàng...</span>
        <span className="flex-1 text-left truncate sm:hidden">Tìm kiếm...</span>
        <kbd className="hidden md:inline-flex h-5 items-center justify-center rounded border border-slate-200 bg-white px-1.5 font-mono text-[10px] font-medium text-slate-500 shrink-0">
          <span className="text-xs mr-0.5">⌘</span>K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 px-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white shadow-2xl transition-all flex flex-col max-h-[80vh]">
            <div className="flex items-center border-b border-slate-200 px-4 py-3 shrink-0">
              <svg className="h-5 w-5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                className="flex-1 bg-transparent px-4 text-base text-slate-900 placeholder-slate-400 focus:outline-none"
                placeholder="Nhập mã phiếu, tên hoặc số điện thoại..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd className="hidden sm:inline-flex h-6 items-center justify-center rounded border border-slate-200 bg-slate-50 px-2 font-mono text-[11px] font-medium text-slate-500 shrink-0">
                ESC
              </kbd>
            </div>

            <div className="flex-1 overflow-y-auto p-2 bg-slate-50/50">
              {!query ? (
                <div className="py-14 text-center text-sm text-slate-500">
                  <p>Nhập từ khóa để bắt đầu tìm kiếm</p>
                  <div className="mt-4 flex flex-wrap gap-2 justify-center max-w-sm mx-auto">
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">SM-1234</span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">0987654321</span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">Anh Minh</span>
                  </div>
                </div>
              ) : (
                <div className="px-2 py-2">
                  <h3 className="mb-3 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Kết quả tìm kiếm
                  </h3>
                  
                  {/* Fake result placeholder */}
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 hover:border-primary hover:shadow-sm cursor-pointer transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900 group-hover:text-primary transition-colors">{query.toUpperCase()}</p>
                          <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 border border-blue-200">Phiếu kho</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Loại: <span className="font-medium text-slate-700">Nhập kho</span> • 
                          Trạng thái: <span className="font-medium text-emerald-600">Đã xác nhận</span> • 
                          Giá trị: <span className="font-medium text-slate-700">12,500,000 đ</span>
                        </p>
                      </div>
                    </div>
                    <svg className="h-4 w-4 text-slate-300 group-hover:text-primary transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-500 shrink-0">
              <div className="flex items-center gap-2">
                <span>Dùng</span>
                <kbd className="inline-flex h-5 items-center justify-center rounded border border-slate-200 bg-slate-50 px-1.5 font-mono text-[10px]">&uarr;</kbd>
                <kbd className="inline-flex h-5 items-center justify-center rounded border border-slate-200 bg-slate-50 px-1.5 font-mono text-[10px]">&darr;</kbd>
                <span>để điều hướng</span>
              </div>
              <div className="flex items-center gap-2">
                <span>Dùng</span>
                <kbd className="inline-flex h-5 items-center justify-center rounded border border-slate-200 bg-slate-50 px-1.5 font-mono text-[10px] font-bold">↵</kbd>
                <span>để chọn</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
