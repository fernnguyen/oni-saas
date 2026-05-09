'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

interface Branch {
  id: string;
  name: string;
  slug: string;
  address: string | null;
}

interface BranchSelectorProps {
  tenantId: string;
  currentSlug: string;
  currentName: string;
  currentAddress?: string | null;
  collapsed?: boolean;
}

export function BranchSelector({
  tenantId,
  currentSlug,
  currentName,
  currentAddress,
  collapsed,
}: BranchSelectorProps) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/branches?tenant_id=${tenantId}`)
      .then((r) => r.json())
      .then((d) => setBranches(d.branches ?? []));
  }, [tenantId]);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  function switchBranch(slug: string) {
    setOpen(false);
    if (slug === currentSlug) return;
    const newPath = pathname.replace(/^\/[^/]+/, '/' + slug);
    router.push(newPath);
  }

  const initial = currentName.charAt(0).toUpperCase();
  const canSwitch = branches.length > 1;

  if (collapsed) {
    return (
      <div className="flex justify-center py-2 border-b border-slate-200">
        <div className="h-8 w-8 rounded-full bg-[#0268FF]/10 flex items-center justify-center text-[#0268FF] font-bold text-sm">
          {initial}
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative px-2 py-2 border-b border-slate-200">
      <button
        onClick={() => canSwitch && setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
          canSwitch ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'
        }`}
      >
        <div className="h-8 w-8 rounded-full bg-[#0268FF]/10 flex items-center justify-center text-[#0268FF] font-bold text-sm shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate leading-tight">{currentName}</p>
          {currentAddress && (
            <p className="text-[11px] text-slate-400 truncate leading-snug mt-0.5">{currentAddress}</p>
          )}
        </div>
        {canSwitch && (
          <svg
            className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && canSwitch && (
        <div className="absolute left-2 right-2 top-full mt-1 rounded-lg border border-slate-200 bg-white shadow-lg z-50 py-1 overflow-hidden">
          {branches.map((b) => {
            const isCurrent = b.slug === currentSlug;
            return (
              <button
                key={b.id}
                onClick={() => switchBranch(b.slug)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  isCurrent ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
              >
                <div
                  className={`h-7 w-7 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${
                    isCurrent ? 'bg-[#0268FF] text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {b.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate leading-tight">{b.name}</p>
                  {b.address && (
                    <p className="text-[11px] text-slate-400 truncate leading-snug">{b.address}</p>
                  )}
                </div>
                {isCurrent && (
                  <svg
                    className="h-3.5 w-3.5 text-[#0268FF] shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
