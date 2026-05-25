'use client';

import { TagBadge } from '@/app/components/ui/TagBadge';
import { CopyableId } from '@/app/components/ui/CopyableId';

export interface FlowNode {
  id: string;
  status: string;
  createdAt?: string;
  creatorName?: string;
  amount?: string;
  supplierName?: string;
}

interface Props {
  currentType: 'PR' | 'PO' | 'GRN';
  pr?: FlowNode | null;
  po?: FlowNode | null;
  grn?: FlowNode | null;
  onNavigate: (type: 'PR' | 'PO' | 'GRN', id: string) => void;
}

export function DocumentFlowMap({ currentType, pr, po, grn, onNavigate }: Props) {
  // Translate status for PR
  const getPrLabelAndColor = (status: string) => {
    const s = status || 'DRAFT';
    let color: 'gray' | 'yellow' | 'orange' | 'green' | 'blue' | 'red' = 'gray';
    let label = 'Bản nháp';
    if (s === 'PENDING_PRICING') {
      color = 'yellow';
      label = 'Chờ báo giá';
    } else if (s === 'PENDING_KTT') {
      color = 'orange';
      label = 'Chờ KTT duyệt';
    } else if (s === 'PENDING_GD') {
      color = 'yellow';
      label = 'Chờ GĐ duyệt';
    } else if (s === 'APPROVED') {
      color = 'green';
      label = 'Đã duyệt';
    } else if (s === 'CONVERTED_TO_PO') {
      color = 'blue';
      label = 'Đã lập PO';
    } else if (s === 'REJECTED') {
      color = 'red';
      label = 'Từ chối';
    }
    return { label, color };
  };

  // Translate status for PO
  const getPoLabelAndColor = (status: string) => {
    const s = status || 'APPROVED';
    let color: 'gray' | 'yellow' | 'green' | 'red' = 'gray';
    let label = s;
    if (s === 'APPROVED') {
      color = 'yellow';
      label = 'Chờ giao hàng';
    } else if (s === 'RECEIVED') {
      color = 'green';
      label = 'Đã hoàn tất';
    } else if (s === 'CANCELLED') {
      color = 'red';
      label = 'Đã hủy';
    }
    return { label, color };
  };

  // Translate status for GRN
  const getGrnLabelAndColor = (status: string) => {
    const s = status || 'DRAFT';
    let color: 'gray' | 'green' = 'gray';
    let label = s;
    if (s === 'DRAFT') {
      color = 'gray';
      label = 'Chờ kiểm kho';
    } else if (s === 'COMPLETED') {
      color = 'green';
      label = 'Đã nhập kho';
    }
    return { label, color };
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      const pad = (n: number) => String(n).padStart(2, '0');
      const hours = pad(d.getHours());
      const minutes = pad(d.getMinutes());
      const seconds = pad(d.getSeconds());
      const day = pad(d.getDate());
      const month = pad(d.getMonth() + 1);
      const year = d.getFullYear();
      return `${hours}:${minutes}:${seconds} ${day}/${month}/${year}`;
    } catch {
      return '';
    }
  };

  // Render timeline node circles with icons (check for completed, spinner for pending, X for rejected)
  const renderNodeDot = (type: 'PR' | 'PO' | 'GRN') => {
    const isCurrent = currentType === type;
    
    let state: 'completed' | 'pending' | 'rejected' | 'none' = 'none';

    if (type === 'PR') {
      if (pr) {
        if (pr.status === 'REJECTED') state = 'rejected';
        else if (pr.status === 'CONVERTED_TO_PO' || pr.status === 'APPROVED') state = 'completed';
        else state = 'pending';
      }
    } else if (type === 'PO') {
      if (po) {
        if (po.status === 'CANCELLED') state = 'rejected';
        else if (po.status === 'RECEIVED' || grn?.status === 'COMPLETED') state = 'completed';
        else state = 'pending'; // APPROVED status is "Chờ giao hàng" -> pending
      }
    } else {
      if (grn) {
        if (grn.status === 'COMPLETED') state = 'completed';
        else state = 'pending'; // DRAFT status is "Chờ kiểm kho" -> pending
      }
    }

    // Outer ring class
    let ringClass = '';
    if (isCurrent) {
      if (state === 'completed') ringClass = 'border-emerald-500 ring-4 ring-emerald-500/10 shadow-sm bg-emerald-50';
      else if (state === 'pending') ringClass = 'border-amber-500 ring-4 ring-amber-500/10 shadow-sm bg-amber-50';
      else if (state === 'rejected') ringClass = 'border-red-500 ring-4 ring-red-500/10 shadow-sm bg-red-50';
      else ringClass = 'border-slate-400 ring-4 ring-slate-100 bg-slate-50';
    } else {
      if (state === 'completed') ringClass = 'border-emerald-500 bg-emerald-50';
      else if (state === 'pending') ringClass = 'border-amber-400 bg-amber-50';
      else if (state === 'rejected') ringClass = 'border-red-500 bg-red-50';
      else ringClass = 'border-slate-300 bg-slate-50';
    }

    return (
      <div className="flex w-8 shrink-0 justify-center items-center h-full pt-1.5 z-10">
        <div className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-300 ${ringClass}`}>
          {state === 'completed' && (
            <svg className="h-3.5 w-3.5 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          {state === 'pending' && (
            <svg className="animate-spin h-3.5 w-3.5 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {state === 'rejected' && (
            <svg className="h-3 w-3 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {state === 'none' && (
            <div className="h-1.5 w-1.5 rounded-full bg-slate-300"></div>
          )}
        </div>
      </div>
    );
  };


  const getSegment1Class = () => {
    if (pr && po) {
      return 'border-emerald-500';
    }
    if (pr && pr.status !== 'REJECTED') {
      return 'border-amber-400 animate-pulse';
    }
    return 'border-slate-200';
  };

  const getSegment2Class = () => {
    if (po && grn) {
      if (grn.status === 'COMPLETED') return 'border-emerald-500';
      return 'border-amber-400 animate-pulse';
    }
    if (po && po.status === 'APPROVED') {
      return 'border-amber-400 animate-pulse';
    }
    if (po && po.status === 'RECEIVED') {
      return 'border-emerald-500';
    }
    return 'border-slate-200';
  };

  // Get active card styling based on selected document status
  const getPrCardClass = () => {
    const isCurrent = currentType === 'PR';
    if (!isCurrent) return 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm';
    if (!pr) return 'bg-slate-50 border-slate-300 ring-2 ring-slate-100 shadow-sm';
    if (pr.status === 'REJECTED') {
      return 'bg-red-50/10 border-red-500 ring-2 ring-red-500/10 shadow-sm';
    }
    if (pr.status === 'CONVERTED_TO_PO' || pr.status === 'APPROVED') {
      return 'bg-slate-50 border-emerald-500 ring-2 ring-emerald-500/10 shadow-sm';
    }
    return 'bg-amber-50/10 border-amber-400 ring-2 ring-amber-400/10 shadow-sm';
  };

  const getPoCardClass = () => {
    const isCurrent = currentType === 'PO';
    if (!isCurrent) return 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm';
    if (!po) return 'bg-slate-50 border-slate-300 ring-2 ring-slate-100 shadow-sm';
    if (po.status === 'CANCELLED') {
      return 'bg-red-50/10 border-red-500 ring-2 ring-red-500/10 shadow-sm';
    }
    if (po.status === 'RECEIVED' || grn?.status === 'COMPLETED') {
      return 'bg-slate-50 border-emerald-500 ring-2 ring-emerald-500/10 shadow-sm';
    }
    return 'bg-amber-50/10 border-amber-400 ring-2 ring-amber-400/10 shadow-sm'; // "Chờ giao hàng"
  };

  const getGrnCardClass = () => {
    const isCurrent = currentType === 'GRN';
    if (!isCurrent) return 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm';
    if (!grn) return 'bg-slate-50 border-slate-300 ring-2 ring-slate-100 shadow-sm';
    if (grn.status === 'COMPLETED') {
      return 'bg-slate-50 border-emerald-500 ring-2 ring-emerald-500/10 shadow-sm';
    }
    return 'bg-amber-50/10 border-amber-400 ring-2 ring-amber-400/10 shadow-sm'; // "Chờ kiểm kho"
  };

  // Get active "Đang xem" badge styling based on document status
  const getPrBadge = () => {
    if (!pr || currentType !== 'PR') return null;
    if (pr.status === 'REJECTED') {
      return <span className="text-[9px] bg-red-500/10 text-red-600 font-bold px-1.5 py-0.5 rounded-full border border-red-500/20 animate-pulse">Đang xem</span>;
    }
    if (pr.status === 'CONVERTED_TO_PO' || pr.status === 'APPROVED') {
      return <span className="text-[9px] bg-emerald-500/10 text-emerald-600 font-bold px-1.5 py-0.5 rounded-full border border-emerald-500/20 animate-pulse">Đang xem</span>;
    }
    return <span className="text-[9px] bg-amber-400/10 text-amber-600 font-bold px-1.5 py-0.5 rounded-full border border-amber-400/20 animate-pulse">Đang xem</span>;
  };

  const getPoBadge = () => {
    if (!po || currentType !== 'PO') return null;
    if (po.status === 'CANCELLED') {
      return <span className="text-[9px] bg-red-500/10 text-red-600 font-bold px-1.5 py-0.5 rounded-full border border-red-500/20 animate-pulse">Đang xem</span>;
    }
    if (po.status === 'RECEIVED' || grn?.status === 'COMPLETED') {
      return <span className="text-[9px] bg-emerald-500/10 text-emerald-600 font-bold px-1.5 py-0.5 rounded-full border border-emerald-500/20 animate-pulse">Đang xem</span>;
    }
    return <span className="text-[9px] bg-amber-400/10 text-amber-600 font-bold px-1.5 py-0.5 rounded-full border border-amber-400/20 animate-pulse">Đang xem</span>;
  };

  const getGrnBadge = () => {
    if (!grn || currentType !== 'GRN') return null;
    if (grn.status === 'COMPLETED') {
      return <span className="text-[9px] bg-emerald-500/10 text-emerald-600 font-bold px-1.5 py-0.5 rounded-full border border-emerald-500/20 animate-pulse">Đang xem</span>;
    }
    return <span className="text-[9px] bg-amber-400/10 text-amber-600 font-bold px-1.5 py-0.5 rounded-full border border-amber-400/20 animate-pulse">Đang xem</span>;
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-4">
      <div className="flex flex-col gap-0.5 border-b border-slate-50 pb-2">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Lịch sử chứng từ
        </span>
        <span className="text-[10px] text-slate-400 italic">
          Click vào phiếu để chuyển hướng xem nhanh
        </span>
      </div>

      <div className="flex flex-col relative space-y-6 mt-2">
        {/* Step 1: PR */}
        <div className="flex gap-4 items-start relative">
          {/* Segment line from Node 1 (PR) to Node 2 (PO) - dynamically colored */}
          <div className={`absolute left-[15px] top-6 bottom-[-30px] w-[2px] border-l-2 border-dashed transition-all duration-300 z-0 ${getSegment1Class()}`}></div>

          {/* Node dot with dynamic status icon (check, loading spinner, X, or dot) */}
          {renderNodeDot('PR')}

          <div className="flex-1 -mt-1.5">
            {pr ? (
              <div
                onClick={() => onNavigate('PR', pr.id)}
                className={`group flex flex-col p-3 rounded-xl border transition-all cursor-pointer ${getPrCardClass()}`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500 group-hover:text-emerald-600 transition-colors"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                    Đề xuất PR
                  </span>
                  {getPrBadge() || (
                    <span className="text-[9px] text-slate-400 group-hover:text-emerald-600 transition-colors">Xem chi tiết →</span>
                  )}
                </div>
                <div className="flex justify-between items-center gap-2 flex-wrap mt-0.5">
                  <CopyableId id={pr.id} className="text-xs font-bold text-slate-700" />
                  <span className="text-[10px] text-slate-400 font-medium">{formatTime(pr.createdAt)}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  {(() => {
                    const { label, color } = getPrLabelAndColor(pr.status);
                    return <TagBadge label={label} color={color} size="sm" />;
                  })()}
                </div>
              </div>
            ) : (
              <div className="flex flex-col p-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-slate-400 select-none">
                <span className="text-xs font-bold flex items-center gap-1">🚫 Đề xuất PR</span>
                <span className="text-[10px] italic mt-1">Không tìm thấy PR gốc</span>
              </div>
            )}
          </div>
        </div>

        {/* Step 2: PO */}
        <div className="flex gap-4 items-start relative">
          {/* Segment line from Node 2 (PO) to Node 3 (GRN) - dynamically colored */}
          <div className={`absolute left-[15px] top-6 bottom-[-30px] w-[2px] border-l-2 border-dashed transition-all duration-300 z-0 ${getSegment2Class()}`}></div>

          {/* Node dot with dynamic status icon (check, loading spinner, X, or dot) */}
          {renderNodeDot('PO')}

          <div className="flex-1 -mt-1.5">
            {po ? (
              <div
                onClick={() => onNavigate('PO', po.id)}
                className={`group flex flex-col p-3 rounded-xl border transition-all cursor-pointer ${getPoCardClass()}`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500 group-hover:text-emerald-600 transition-colors"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                    Đơn đặt hàng PO
                  </span>
                  {getPoBadge() || (
                    <span className="text-[9px] text-slate-400 group-hover:text-emerald-600 transition-colors">Xem chi tiết →</span>
                  )}
                </div>
                <div className="flex justify-between items-center gap-2 flex-wrap mt-0.5">
                  <CopyableId id={po.id} className="text-xs font-bold text-slate-700" />
                  <span className="text-[10px] text-slate-400 font-medium">{formatTime(po.createdAt)}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  {(() => {
                    const { label, color } = getPoLabelAndColor(po.status);
                    return <TagBadge label={label} color={color} size="sm" />;
                  })()}
                </div>
              </div>
            ) : (
              <div className="flex flex-col p-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-slate-400 select-none">
                <span className="text-xs font-bold flex items-center gap-1">🛒 Đơn PO</span>
                <span className="text-[10px] italic mt-1">Chưa khởi tạo đơn PO</span>
              </div>
            )}
          </div>
        </div>

        {/* Step 3: GRN */}
        <div className="flex gap-4 items-start relative">
          {/* Node dot with dynamic status icon (check, loading spinner, X, or dot) */}
          {renderNodeDot('GRN')}

          <div className="flex-1 -mt-1.5">
            {grn ? (
              <div
                onClick={() => onNavigate('GRN', grn.id)}
                className={`group flex flex-col p-3 rounded-xl border transition-all cursor-pointer ${getGrnCardClass()}`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500 group-hover:text-emerald-600 transition-colors"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                    Nhập kho GRN
                  </span>
                  {getGrnBadge() || (
                    <span className="text-[9px] text-slate-400 group-hover:text-emerald-600 transition-colors">Xem chi tiết →</span>
                  )}
                </div>
                <div className="flex justify-between items-center gap-2 flex-wrap mt-0.5">
                  <CopyableId id={grn.id} className="text-xs font-bold text-slate-700" />
                  <span className="text-[10px] text-slate-400 font-medium">{formatTime(grn.createdAt)}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  {(() => {
                    const { label, color } = getGrnLabelAndColor(grn.status);
                    return <TagBadge label={label} color={color} size="sm" />;
                  })()}
                </div>
              </div>
            ) : (
              <div className="flex flex-col p-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-slate-400 select-none">
                <span className="text-xs font-bold flex items-center gap-1">📦 Nhập kho GRN</span>
                <span className="text-[10px] italic mt-1">Chưa khởi tạo GRN</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
