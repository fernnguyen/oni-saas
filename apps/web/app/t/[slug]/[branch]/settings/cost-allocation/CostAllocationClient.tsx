'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable, Column } from '@/app/components/ui/DataTable';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { SearchBar } from '@/app/components/ui/SearchBar';

interface Props {
  shopId: string;
  shopName: string;
  canManage: boolean;
}

interface AllocationRule {
  department_code: string;
  percentage: number;
}

interface CostAllocationTemplate {
  id: string;
  name: string;
  rules: string | AllocationRule[];
  created_at: string;
}

export function CostAllocationClient({ shopId, shopName, canManage }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [slideOpen, setSlideOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  
  // Track percentages for each department: Record<deptCode, percentageValue>
  const [rulePercentages, setRulePercentages] = useState<Record<string, number>>({});

  // 1. Fetch templates
  const { data: templatesRes, isLoading: templatesLoading } = useQuery({
    queryKey: ['cost-allocation-templates', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/cost-allocations?limit=100`);
      if (!res.ok) throw new Error('Không tải được danh sách mẫu phân bổ');
      return res.json() as Promise<{ data: CostAllocationTemplate[]; total: number }>;
    },
  });

  // 2. Fetch departments
  const { data: deptRes, isLoading: deptsLoading } = useQuery({
    queryKey: ['departments', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/departments?limit=100`);
      if (!res.ok) throw new Error('Không tải được danh sách phòng ban');
      return res.json() as Promise<{ data: Record<string, string>[]; total: number }>;
    },
  });

  const departments = deptRes?.data ?? [];

  // Parse rules list safely
  const parsedTemplates = useMemo(() => {
    if (!templatesRes?.data) return [];
    return templatesRes.data.map(t => {
      let rulesArray: AllocationRule[] = [];
      if (typeof t.rules === 'string') {
        try { rulesArray = JSON.parse(t.rules); } catch { rulesArray = []; }
      } else if (Array.isArray(t.rules)) {
        rulesArray = t.rules;
      }
      return { ...t, parsedRules: rulesArray };
    });
  }, [templatesRes]);

  const filteredTemplates = useMemo(() => {
    if (!search) return parsedTemplates;
    const s = search.toLowerCase();
    return parsedTemplates.filter(t => t.name.toLowerCase().includes(s));
  }, [parsedTemplates, search]);

  const departmentMap = useMemo(() => {
    const map = new Map<string, string>();
    departments.forEach(d => map.set(d.code, d.name));
    return map;
  }, [departments]);

  // Compute total percentage currently set
  const totalPercentage = useMemo(() => {
    return Object.values(rulePercentages).reduce((sum, p) => sum + (p || 0), 0);
  }, [rulePercentages]);

  // Save template mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: { name: string; rules: AllocationRule[] }) => {
      const url = editingId
        ? `/api/shops/${shopId}/cost-allocations/${editingId}`
        : `/api/shops/${shopId}/cost-allocations`;
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Lưu mẫu phân bổ thất bại');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(editingId ? 'Cập nhật mẫu phân bổ thành công!' : 'Đã tạo mẫu phân bổ mới!');
      setSlideOpen(false);
      queryClient.invalidateQueries({ queryKey: ['cost-allocation-templates', shopId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Delete template mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/shops/${shopId}/cost-allocations/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Xóa mẫu phân bổ thất bại');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Đã xóa mẫu phân bổ');
      queryClient.invalidateQueries({ queryKey: ['cost-allocation-templates', shopId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Form handlers
  function openCreate() {
    if (departments.length === 0) {
      toast.error('Vui lòng tạo ít nhất một phòng ban trước khi cấu hình mẫu phân bổ.');
      return;
    }
    setTemplateName('');
    setEditingId(null);
    const initialPct: Record<string, number> = {};
    departments.forEach(d => { initialPct[d.code] = 0; });
    setRulePercentages(initialPct);
    setSlideOpen(true);
  }

  function openEdit(row: typeof parsedTemplates[0]) {
    setTemplateName(row.name);
    setEditingId(row.id);
    const initialPct: Record<string, number> = {};
    departments.forEach(d => {
      const rule = row.parsedRules.find(r => r.department_code === d.code);
      initialPct[d.code] = rule ? rule.percentage : 0;
    });
    setRulePercentages(initialPct);
    setSlideOpen(true);
  }

  // Auto distribute equally
  function distributeEqually() {
    if (departments.length === 0) return;
    const share = Math.floor(100 / departments.length);
    const remainder = 100 - share * departments.length;
    const newPct: Record<string, number> = {};
    departments.forEach((d, idx) => {
      // Add remainder to the first department to ensure total = 100
      newPct[d.code] = idx === 0 ? share + remainder : share;
    });
    setRulePercentages(newPct);
    toast.info('Đã tự động phân bổ đều 100% cho các bộ phận!');
  }

  function handleSave() {
    if (!templateName.trim()) {
      toast.error('Vui lòng nhập tên mẫu phân bổ');
      return;
    }
    if (totalPercentage !== 100) {
      toast.error(`Tổng tỷ lệ phải đạt đúng 100% (Hiện tại đang là ${totalPercentage}%)`);
      return;
    }

    const rules = Object.entries(rulePercentages)
      .map(([deptCode, pct]) => ({ department_code: deptCode, percentage: pct }))
      .filter(r => r.percentage > 0);

    saveMutation.mutate({ name: templateName, rules });
  }

  const columns = useMemo<Column<typeof parsedTemplates[0]>[]>(() => [
    {
      key: 'name',
      label: 'Mẫu phân bổ chi phí',
      render: (row) => (
        <div className="space-y-0.5">
          <div className="font-bold text-slate-800 text-sm">{row.name}</div>
          <div className="text-[11px] text-slate-400">Ngày tạo: {row.created_at ? new Date(row.created_at).toLocaleDateString('vi-VN') : 'Mới'}</div>
        </div>
      ),
    },
    {
      key: 'rules',
      label: 'Tỷ lệ phân chia giữa các bộ phận',
      render: (row) => (
        <div className="flex flex-wrap gap-1.5 py-1">
          {row.parsedRules.map((rule) => {
            const deptName = departmentMap.get(rule.department_code) || rule.department_code;
            return (
              <span key={rule.department_code} className="inline-flex items-center gap-1 text-xs bg-slate-100 border border-slate-200 text-slate-700 font-medium px-2 py-0.5 rounded-md">
                <span>{deptName}:</span>
                <span className="font-bold text-primary">{rule.percentage}%</span>
              </span>
            );
          })}
        </div>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          {canManage && (
            <>
              <button
                onClick={() => openEdit(row)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Sửa
              </button>
              <button
                onClick={() => {
                  if (confirm(`Bạn có chắc chắn muốn xóa mẫu phân bổ "${row.name}"?`)) {
                    deleteMutation.mutate(row.id);
                  }
                }}
                className="rounded-lg border border-rose-100 text-rose-600 px-2.5 py-1.5 text-xs font-medium hover:bg-rose-50 cursor-pointer"
              >
                Xóa
              </button>
            </>
          )}
        </div>
      ),
    },
  ], [canManage, departmentMap]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{shopName}</div>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">Cấu hình phân bổ chi phí dùng chung</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {filteredTemplates.length} mẫu tỷ lệ phân bổ hoạt động
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            + Tạo mẫu phân bổ
          </button>
        )}
      </div>

      {/* Main Panel */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Tìm mẫu phân bổ theo tên..."
        />

        <DataTable
          columns={columns}
          data={filteredTemplates}
          loading={templatesLoading || deptsLoading}
          emptyState={
            <EmptyState
              title="Chưa thiết lập mẫu phân bổ nào"
              description="Hãy cấu hình mẫu phân bổ chi phí dùng chung (như điện, nước, internet) để tự động hạch toán cho các bộ phận khi chi tiền quỹ."
            />
          }
          rowKey={(row) => row.id}
        />
      </div>

      {/* SlideOver Form */}
      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title={editingId ? 'Chỉnh sửa mẫu phân bổ' : 'Thiết lập mẫu phân bổ mới'}
        footer={
          <div className="flex items-center gap-3 w-full justify-end">
            <button
              onClick={() => setSlideOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className={`rounded-xl px-5 py-2 text-sm font-semibold text-white transition-all cursor-pointer active:scale-95 shadow-sm ${
                totalPercentage === 100
                  ? 'bg-primary hover:bg-primary-dark'
                  : 'bg-slate-300 cursor-not-allowed opacity-70'
              }`}
            >
              {saveMutation.isPending ? 'Đang lưu...' : 'Lưu cấu hình'}
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Name input */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tên mẫu phân bổ chi phí *</label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
              placeholder="Ví dụ: Phân bổ Tiền Điện, Phân bổ Internet dùng chung..."
            />
          </div>

          {/* Allocation sliders/inputs */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Tỷ lệ phân chia theo bộ phận</h3>
                <p className="text-xs text-slate-400 mt-0.5">Phần trăm phân chia trực tiếp cho Cost Center của từng bộ phận</p>
              </div>
              <button
                type="button"
                onClick={distributeEqually}
                className="text-xs font-semibold text-primary hover:underline cursor-pointer border border-primary/20 bg-primary/5 px-2.5 py-1.5 rounded-lg"
              >
                Chia đều %
              </button>
            </div>

            {/* List of departments to slide/input */}
            <div className="space-y-3 pt-2">
              {departments.map((d) => {
                const currentVal = rulePercentages[d.code] || 0;
                return (
                  <div key={d.id} className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">{d.name} ({d.code})</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={currentVal}
                          onChange={(e) => {
                            const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                            setRulePercentages(prev => ({ ...prev, [d.code]: val }));
                          }}
                          className="w-16 text-center text-xs font-bold text-slate-800 border border-slate-200 rounded-lg px-1.5 py-1 bg-white focus:outline-none focus:border-primary"
                        />
                        <span className="text-xs font-bold text-slate-500">%</span>
                      </div>
                    </div>
                    
                    {/* Custom Premium Range Input */}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={currentVal}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setRulePercentages(prev => ({ ...prev, [d.code]: val }));
                      }}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>
                );
              })}
            </div>

            {/* Percentage Summary Card */}
            <div className={`p-4 rounded-xl flex items-center justify-between transition-all ${
              totalPercentage === 100
                ? 'bg-emerald-50 border border-emerald-100 text-emerald-800'
                : 'bg-amber-50 border border-amber-100 text-amber-800'
            }`}>
              <div className="text-xs space-y-0.5">
                <span className="font-semibold block">Tổng tỷ lệ hạch toán:</span>
                <span className="text-[10px] opacity-80">Phải đạt đúng 100% để lưu cấu hình.</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-extrabold tracking-tight">{totalPercentage}%</span>
                {totalPercentage === 100 ? (
                  <span className="text-xs bg-emerald-500 text-white font-bold h-5 w-5 flex items-center justify-center rounded-full">✓</span>
                ) : (
                  <span className="text-xs bg-amber-500 text-white font-bold h-5 w-5 flex items-center justify-center rounded-full font-mono">!</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
