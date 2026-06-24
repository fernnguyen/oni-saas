'use client';

import React, { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createInvitationCode, deleteInvitationCode } from './actions';

interface CodeRow {
  code: string;
  max_uses: number | null;
  used_count: number;
  created_at: string;
  expires_at: string | null;
  plan_id: number | null;
  trial_days: number | null;
}

interface UseRow {
  id: string;
  code: string;
  tenant_id: string | null;
  email: string;
  used_at: string;
  tenants?: {
    slug: string;
    name: string;
  } | null;
}

export function InvitationsClient({ 
  initialCodes, 
  initialUses,
  plans = []
}: { 
  initialCodes: CodeRow[]; 
  initialUses: UseRow[]; 
  plans?: any[];
}) {
  const [codes, setCodes] = useState<CodeRow[]>(initialCodes);
  const [uses, setUses] = useState<UseRow[]>(initialUses);
  const [newCode, setNewCode] = useState('');
  const [maxUses, setMaxUses] = useState<number>(0); // 0 means unlimited
  const [expiresAt, setExpiresAt] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [trialDays, setTrialDays] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  // Auto-generate random uppercase invitation code
  const handleGenerateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'ONI-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewCode(code);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim()) {
      toast.error('Vui lòng nhập hoặc tạo mã mời');
      return;
    }

    const codeToCreate = newCode.trim().toUpperCase();

    startTransition(async () => {
      try {
        await createInvitationCode(
          codeToCreate, 
          maxUses === 0 ? null : maxUses, 
          expiresAt || null,
          selectedPlanId,
          trialDays
        );
        
        // Optimistic local state update
        const newlyCreated: CodeRow = {
          code: codeToCreate,
          max_uses: maxUses === 0 ? null : maxUses,
          used_count: 0,
          created_at: new Date().toISOString(),
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          plan_id: selectedPlanId,
          trial_days: trialDays
        };
        
        setCodes([newlyCreated, ...codes]);
        toast.success(`Đã tạo mã mời ${codeToCreate} thành công`);
        
        // Reset form
        setNewCode('');
        setMaxUses(0);
        setExpiresAt('');
        setSelectedPlanId(null);
        setTrialDays(null);
      } catch (err: any) {
        toast.error(err.message || 'Lỗi khi tạo mã mời');
      }
    });
  };

  const handleDelete = (codeToDelete: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa/vô hiệu hóa mã mời ${codeToDelete}?`)) return;

    startTransition(async () => {
      try {
        await deleteInvitationCode(codeToDelete);
        setCodes(codes.filter(c => c.code !== codeToDelete));
        setUses(uses.filter(u => u.code !== codeToDelete));
        if (expandedCode === codeToDelete) setExpandedCode(null);
        toast.success(`Đã xóa mã mời ${codeToDelete}`);
      } catch (err: any) {
        toast.error(err.message || 'Lỗi khi xóa mã mời');
      }
    });
  };

  // Helper stats
  const totalUses = codes.reduce((acc, curr) => acc + curr.used_count, 0);
  const activeCodesCount = codes.filter(c => {
    const isExpired = c.expires_at && new Date(c.expires_at) < new Date();
    const isExhausted = c.max_uses !== null && c.used_count >= c.max_uses;
    return !isExpired && !isExhausted;
  }).length;

  const formatDate = (isoStr: string | null) => {
    if (!isoStr) return 'Vô thời hạn';
    const date = new Date(isoStr);
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getStatusBadge = (c: CodeRow) => {
    const isExpired = c.expires_at && new Date(c.expires_at) < new Date();
    const isExhausted = c.max_uses !== null && c.used_count >= c.max_uses;

    if (isExpired) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
          Đã hết hạn
        </span>
      );
    }
    if (isExhausted) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700 border border-rose-200">
          Hết lượt dùng
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
        Hoạt động
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tổng số mã mời</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{codes.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mã đang hoạt động</div>
          <div className="mt-2 text-2xl font-bold text-green-600">{activeCodesCount}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tổng số lượt đăng ký dùng mã</div>
          <div className="mt-2 text-2xl font-bold text-blue-600">{totalUses}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Create Code Form */}
        <div className="lg:col-span-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Tạo mã mời mới</h2>
            <p className="text-xs text-slate-400 mt-0.5">Cấp phát mã đăng ký giới hạn lượt sử dụng hoặc thời gian.</p>
          </div>
          
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Mã mời</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
                  placeholder="TIENPHONG2026"
                  disabled={isPending}
                  className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 uppercase font-semibold tracking-wider placeholder-slate-400"
                  required
                />
                <button
                  type="button"
                  onClick={handleGenerateCode}
                  disabled={isPending}
                  className="px-3 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 font-medium text-xs shadow-sm transition-colors cursor-pointer shrink-0"
                  title="Tự động tạo mã ngẫu nhiên"
                >
                  ⚡ Ngẫu nhiên
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Lượt dùng tối đa (0 = Không giới hạn)</label>
              <input
                type="number"
                min="0"
                value={maxUses}
                onChange={(e) => setMaxUses(parseInt(e.target.value) || 0)}
                disabled={isPending}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Ngày hết hạn (Không bắt buộc)</label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                disabled={isPending}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium text-slate-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Gói dịch vụ áp dụng</label>
              <select
                value={selectedPlanId ?? ''}
                onChange={(e) => setSelectedPlanId(e.target.value ? parseInt(e.target.value) : null)}
                disabled={isPending}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium bg-white text-slate-700"
              >
                <option value="">Gói mặc định (Mini / Starter)</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Số ngày dùng thử (Để trống = Mặc định hệ thống)</label>
              <input
                type="number"
                min="1"
                placeholder="Ví dụ: 90 ngày (3 tháng), 360 ngày (12 tháng)"
                value={trialDays ?? ''}
                onChange={(e) => setTrialDays(e.target.value ? parseInt(e.target.value) : null)}
                disabled={isPending}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium placeholder-slate-400"
              />
            </div>

            <button
              type="submit"
              disabled={isPending || !newCode.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
            >
              {isPending ? 'Đang tạo...' : 'Tạo mã mời'}
            </button>
          </form>
        </div>

        {/* Invitation Codes List */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Danh sách mã kích hoạt</h2>
            <span className="text-xs text-slate-400">Tổng cộng {codes.length} mã</span>
          </div>

          {codes.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              Chưa có mã mời nào được tạo trên hệ thống.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-3.5">Mã kích hoạt</th>
                    <th className="px-6 py-3.5">Gói & Ưu đãi</th>
                    <th className="px-6 py-3.5">Lượt sử dụng</th>
                    <th className="px-6 py-3.5">Hạn dùng / Ngày tạo</th>
                    <th className="px-6 py-3.5">Trạng thái</th>
                    <th className="px-6 py-3.5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {codes.map((c) => {
                    const isExpanded = expandedCode === c.code;
                    const codeUses = uses.filter(u => u.code === c.code);

                    return (
                      <React.Fragment key={c.code}>
                        <tr className={`hover:bg-slate-50/40 transition-colors ${isExpanded ? 'bg-blue-50/10' : ''}`}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-800 tracking-wider bg-slate-50 border border-slate-100 px-2 py-0.5 rounded text-xs select-all">
                                {c.code}
                              </span>
                              <button
                                onClick={async () => {
                                  await navigator.clipboard.writeText(c.code).catch(() => {});
                                  toast.success(`Đã copy: ${c.code}`);
                                }}
                                className="text-slate-400 hover:text-slate-600 rounded p-0.5 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                                title="Copy mã"
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-700">
                              {c.plan_id ? plans.find(p => p.id === c.plan_id)?.name || `Gói ID: ${c.plan_id}` : 'Mặc định (Starter)'}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {c.trial_days ? `${c.trial_days} ngày (~ ${Math.round(c.trial_days / 30)} tháng)` : 'Mặc định hệ thống'}
                            </div>
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-700">
                            {c.used_count} <span className="text-slate-400 font-normal">/ {c.max_uses === null ? '∞' : c.max_uses}</span>
                          </td>
                          <td className="px-6 py-4 space-y-0.5">
                            <div className="text-xs text-slate-600 font-medium">Hạn: {formatDate(c.expires_at)}</div>
                            <div className="text-[10px] text-slate-400">Tạo: {formatDate(c.created_at)}</div>
                          </td>
                          <td className="px-6 py-4">
                            {getStatusBadge(c)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setExpandedCode(isExpanded ? null : c.code)}
                                className={`px-2 py-1 rounded-md text-xs font-semibold border shadow-sm transition-all duration-200 cursor-pointer ${
                                  isExpanded
                                    ? 'border-primary text-primary bg-blue-50/50'
                                    : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
                                }`}
                              >
                                {isExpanded ? 'Ẩn log ▴' : `Xem log (${codeUses.length}) ▾`}
                              </button>
                              
                              <button
                                onClick={() => handleDelete(c.code)}
                                disabled={isPending}
                                className="p-1 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors cursor-pointer shrink-0"
                                title="Xóa mã"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Accordion Log Details */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} className="bg-slate-50/40 p-0 border-t border-slate-100">
                              <div className="px-6 py-4 space-y-3">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                  <span>Lịch sử sử dụng mã: {c.code}</span>
                                  <span className="rounded bg-blue-100 text-blue-800 px-1.5 py-0.5 text-[9px] lowercase font-medium">{codeUses.length} lượt dùng</span>
                                </div>

                                {codeUses.length === 0 ? (
                                  <div className="text-center py-4 text-xs text-slate-400 leading-normal">
                                    Mã này chưa được sử dụng để kích hoạt tài khoản nào.
                                  </div>
                                ) : (
                                  <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-inner">
                                    <table className="w-full border-collapse text-left text-xs">
                                      <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100 font-semibold text-slate-500 uppercase tracking-wider">
                                          <th className="px-4 py-2">Workspace (Slug)</th>
                                          <th className="px-4 py-2">Email Đăng ký</th>
                                          <th className="px-4 py-2 text-right">Thời gian kích hoạt</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 text-slate-700">
                                        {codeUses.map((use) => {
                                          const slugVal = use.tenants?.slug || 'N/A';
                                          const orgName = use.tenants?.name || '';
                                          return (
                                            <tr key={use.id} className="hover:bg-slate-50/30">
                                              <td className="px-4 py-2.5 space-y-0.5">
                                                <div className="font-bold text-slate-800 select-all font-mono">{slugVal}.oni.vn</div>
                                                {orgName && <div className="text-[10px] text-slate-400 font-medium">{orgName}</div>}
                                              </td>
                                              <td className="px-4 py-2.5 font-medium select-all">
                                                {use.email}
                                              </td>
                                              <td className="px-4 py-2.5 text-right font-mono text-slate-500">
                                                {new Date(use.used_at).toLocaleDateString('vi-VN', {
                                                  day: '2-digit',
                                                  month: '2-digit',
                                                  year: 'numeric'
                                                })} {new Date(use.used_at).toLocaleTimeString('vi-VN', {
                                                  hour: '2-digit',
                                                  minute: '2-digit'
                                                })}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
