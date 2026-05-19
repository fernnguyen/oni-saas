'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';

export interface GlobalSearchResult {
  id: string;
  type: 'customer' | 'order' | 'inventory' | 'cashbook' | 'product';
  title: string;
  subtitle: string;
  status?: string;
  amount?: number;
  url: string;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  
  const shopId = params?.slug as string;
  const branchId = params?.branch as string;

  // Debounce API calls
  useEffect(() => {
    if (!query || query.length < 2 || !branchId) {
      setResults([]);
      return;
    }
    
    const controller = new AbortController();
    setLoading(true);
    
    const handler = setTimeout(async () => {
      try {
        const res = await fetch(`/api/shops/${branchId}/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal
        });
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Failed to search', err);
        }
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      clearTimeout(handler);
      controller.abort();
    };
  }, [query, branchId]);

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
        className="flex h-9 w-9 sm:w-full sm:max-w-md items-center justify-center sm:justify-start gap-2 rounded-lg sm:border sm:border-slate-200 sm:bg-slate-50/50 p-0 sm:px-3 text-sm text-slate-500 sm:text-slate-400 hover:bg-slate-100 sm:hover:border-slate-300 sm:hover:bg-slate-50 transition-colors cursor-pointer shrink-0"
        aria-label="Tìm kiếm"
      >
        <svg className="h-5 w-5 sm:h-4 sm:w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="flex-1 text-left truncate hidden sm:inline-block">Tìm kiếm mã phiếu, khách hàng...</span>
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
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">ORD-001</span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">0987654321</span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">Anh Minh</span>
                  </div>
                </div>
              ) : loading ? (
                <div className="py-14 text-center text-sm text-slate-500 flex flex-col items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-primary mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Đang tìm kiếm...
                </div>
              ) : results.length === 0 ? (
                <div className="py-14 text-center text-sm text-slate-500">
                  <p>Không tìm thấy kết quả nào cho "{query}"</p>
                </div>
              ) : (
                <div className="px-2 py-2">
                  <h3 className="mb-3 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Kết quả tìm kiếm ({results.length})
                  </h3>
                  
                  <div className="space-y-2">
                    {results.map((result) => (
                      <div 
                        key={`${result.type}-${result.id}`}
                        onClick={() => {
                          setOpen(false);
                          const isSubdomain = !window.location.pathname.startsWith('/t/');
                          const basePath = isSubdomain 
                            ? (branchId ? `/${branchId}` : ``)
                            : (branchId ? `/t/${shopId}/${branchId}` : `/t/${shopId}`);
                          router.push(`${basePath}/${result.url}`);
                        }}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 hover:border-primary hover:shadow-sm cursor-pointer transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                            result.type === 'order' ? 'bg-blue-100 text-blue-600' :
                            result.type === 'inventory' ? 'bg-indigo-100 text-indigo-600' :
                            result.type === 'cashbook' ? 'bg-emerald-100 text-emerald-600' :
                            result.type === 'customer' ? 'bg-orange-100 text-orange-600' :
                            'bg-primary/10 text-primary'
                          }`}>
                            {result.type === 'order' && (
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                            )}
                            {result.type === 'inventory' && (
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                            )}
                            {result.type === 'cashbook' && (
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            )}
                            {result.type === 'customer' && (
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            )}
                            {result.type === 'product' && (
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900 group-hover:text-primary transition-colors">{result.title}</p>
                              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium border ${
                                result.type === 'order' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                result.type === 'inventory' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' :
                                result.type === 'cashbook' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                result.type === 'customer' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                'bg-slate-100 text-slate-700 border-slate-200'
                              }`}>
                                {result.type === 'order' ? 'Đơn hàng' :
                                 result.type === 'inventory' ? 'Phiếu kho' :
                                 result.type === 'cashbook' ? 'Sổ quỹ' :
                                 result.type === 'customer' ? 'Khách hàng' :
                                 'Sản phẩm'}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              {result.subtitle} 
                              {result.status && <> • Trạng thái: <span className="font-medium text-slate-700">{result.status}</span></>}
                              {result.amount !== undefined && <> • <span className="font-medium text-slate-700">{result.amount.toLocaleString('vi-VN')} đ</span></>}
                            </p>
                          </div>
                        </div>
                        <svg className="h-4 w-4 text-slate-300 group-hover:text-primary transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    ))}
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
