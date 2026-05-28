'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useDebounce } from 'use-debounce';
import { DataTable, Column } from '@/app/components/ui/DataTable';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { TagBadge } from '@/app/components/ui/TagBadge';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { SearchBar } from '@/app/components/ui/SearchBar';

interface Props {
  shopId: string;
  shopName: string;
  canManage: boolean;
}

const EMPTY_FORM = {
  name: '',
  unit: 'chiếc',
  type: 'ccdc',
  original_value: '',
  salvage_value: '0',
  purchase_date: new Date().toISOString().split('T')[0],
  depreciation_months: '12',
  serial_no: '',
  manufacturer: '',
  warranty_expiry: '',
  supplier_id: '',
  status: 'active',
};

function formatCurrency(val: string | number) {
  if (val === undefined || val === null || val === '') return '0 đ';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '0 đ';
  return num.toLocaleString('vi-VN') + ' đ';
}

function toRawNumber(val: string): string {
  return val.replace(/[^0-9]/g, '');
}

function formatNumberString(val: string | number): string {
  if (val === undefined || val === null || val === '') return '';
  const clean = String(val).replace(/[^0-9]/g, '');
  if (!clean) return '';
  return parseFloat(clean).toLocaleString('vi-VN');
}

export function AssetsClient({ shopId, shopName, canManage }: Props) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'all' | 'ccdc' | 'tscd'>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const [formData, setFormData] = useState<Record<string, string>>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [slideOpen, setSlideOpen] = useState(false);

  // Asset Allocations state
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedAssetName, setSelectedAssetName] = useState<string | null>(null);
  const [allocationsOpen, setAllocationsOpen] = useState(false);
  const [allocDeptCode, setAllocDeptCode] = useState('');
  const [allocQty, setAllocQty] = useState('1');
  const [allocDate, setAllocDate] = useState(new Date().toISOString().split('T')[0]);

  // Commissioning state (2-Step Asset Commissioning)
  const [commissionOpen, setCommissionOpen] = useState(false);
  const [commissionForm, setCommissionForm] = useState({
    product_id: '',
    qty: '1',
    department_code: '',
    type: 'ccdc' as 'ccdc' | 'tscd',
    depreciation_months: '12',
    serial_no: '',
    manufacturer: '',
    warranty_expiry: '',
    supplier_id: '',
    purchase_date: new Date().toISOString().split('T')[0],
  });

  // Fetch warehouses to resolve WH-ASSET ID
  const { data: whData } = useQuery({
    queryKey: ['warehouses', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/warehouses`);
      if (!res.ok) throw new Error('Không tải được danh sách kho');
      return res.json() as Promise<{ data: Record<string, string>[]; total: number }>;
    },
  });

  const assetWhId = useMemo(() => {
    return whData?.data?.find((w) => w.code === 'asset')?.id || '';
  }, [whData]);

  // Fetch inventory stock in WH-ASSET for commissioning
  const { data: assetInventoryData, refetch: refetchAssetInventory } = useQuery({
    queryKey: ['asset-inventory', shopId, assetWhId],
    enabled: !!assetWhId,
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/inventory?warehouse_id=${assetWhId}&limit=1000`);
      if (!res.ok) throw new Error('Không tải được tồn kho tài sản');
      return res.json() as Promise<{ data: any[]; total: number }>;
    },
  });

  // Filter products in WH-ASSET that have stock > 0
  const availableAssetProducts = useMemo(() => {
    if (!assetInventoryData?.data) return [];
    return assetInventoryData.data.filter((item) => parseFloat(item.stock_qty || '0') > 0);
  }, [assetInventoryData]);

  // Resolve currently selected product stock in form
  const selectedProductStock = useMemo(() => {
    if (!commissionForm.product_id || !availableAssetProducts) return 0;
    const found = availableAssetProducts.find((p) => p.product_id === commissionForm.product_id);
    return found ? parseFloat(found.stock_qty || '0') : 0;
  }, [commissionForm.product_id, availableAssetProducts]);

  // 1. Fetch assets
  const { data: assetData, isLoading: assetsLoading, isFetching: assetsFetching } = useQuery({
    queryKey: ['assets', shopId, activeTab],
    queryFn: async () => {
      const sp = new URLSearchParams({ page: '1', limit: '200' });
      if (activeTab !== 'all') sp.set('type', activeTab);
      const res = await fetch(`/api/shops/${shopId}/assets?${sp}`);
      if (!res.ok) throw new Error('Không tải được dữ liệu tài sản');
      return res.json() as Promise<{ data: Record<string, string>[]; total: number }>;
    },
  });

  // 2. Fetch departments (for allocations)
  const { data: deptData } = useQuery({
    queryKey: ['departments', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/departments?limit=100`);
      if (!res.ok) throw new Error('Không tải được dữ liệu phòng ban');
      return res.json() as Promise<{ data: Record<string, string>[]; total: number }>;
    },
  });

  // 3. Fetch suppliers (optional links)
  const { data: supplierData } = useQuery({
    queryKey: ['suppliers', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/suppliers?limit=100`);
      if (!res.ok) return { data: [], total: 0 };
      return res.json() as Promise<{ data: Record<string, string>[]; total: number }>;
    },
  });

  // 4. Fetch asset allocations
  const { data: allocationsData, isLoading: allocsLoading } = useQuery({
    queryKey: ['asset-allocations', shopId, selectedAssetId],
    enabled: !!selectedAssetId,
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/assets/allocations?asset_id=${selectedAssetId}`);
      if (!res.ok) throw new Error('Không tải được bàn giao tài sản');
      return res.json() as Promise<{ data: Record<string, string>[]; total: number }>;
    },
  });

  const supplierMap = useMemo(() => {
    const map = new Map<string, string>();
    if (supplierData?.data) {
      supplierData.data.forEach((s) => map.set(s.id || s.supplier_id, s.name));
    }
    return map;
  }, [supplierData]);

  const departmentMap = useMemo(() => {
    const map = new Map<string, string>();
    if (deptData?.data) {
      deptData.data.forEach((d) => map.set(d.code, d.name));
    }
    return map;
  }, [deptData]);

  // Save asset mutation
  const saveAssetMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const url = editingId
        ? `/api/shops/${shopId}/assets/${editingId}`
        : `/api/shops/${shopId}/assets`;
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Lưu tài sản thất bại');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(editingId ? 'Cập nhật tài sản thành công!' : 'Đã đăng ký tài sản mới!');
      setSlideOpen(false);
      queryClient.invalidateQueries({ queryKey: ['assets', shopId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Delete asset mutation
  const deleteAssetMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/shops/${shopId}/assets/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Xóa tài sản thất bại');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Đã xóa tài sản');
      queryClient.invalidateQueries({ queryKey: ['assets', shopId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Depreciate asset mutation
  const depreciateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/shops/${shopId}/assets/${id}/depreciate`, {
        method: 'POST',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Trích khấu hao thất bại');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(
        `Trích khấu hao thành công: +${formatCurrency(data.depreciationAmount)} vào Sổ quỹ!`
      );
      queryClient.invalidateQueries({ queryKey: ['assets', shopId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Create allocation mutation
  const addAllocMutation = useMutation({
    mutationFn: async (payload: { asset_id: string; department_code: string; qty: string; allocated_at: string }) => {
      const res = await fetch(`/api/shops/${shopId}/assets/allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Bàn giao tài sản thất bại');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Bàn giao tài sản thành công!');
      setAllocQty('1');
      setAllocDeptCode('');
      queryClient.invalidateQueries({ queryKey: ['asset-allocations', shopId, selectedAssetId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Delete allocation mutation
  const removeAllocMutation = useMutation({
    mutationFn: async (allocId: string) => {
      const res = await fetch(`/api/shops/${shopId}/assets/allocations/${allocId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Thu hồi bàn giao thất bại');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Đã thu hồi bàn giao tài sản');
      queryClient.invalidateQueries({ queryKey: ['asset-allocations', shopId, selectedAssetId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Commission mutation
  const commissionMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`/api/shops/${shopId}/assets/commission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Bàn giao tài sản từ kho thất bại');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('⚡️ Bàn giao & kích hoạt thẻ tài sản thành công!');
      setCommissionOpen(false);
      queryClient.invalidateQueries({ queryKey: ['assets', shopId] });
      refetchAssetInventory();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function openEdit(row: Record<string, string>) {
    setFormData({
      name: row.name,
      unit: row.unit,
      type: row.type,
      original_value: row.original_value,
      salvage_value: row.salvage_value || '0',
      purchase_date: row.purchase_date,
      depreciation_months: row.depreciation_months,
      serial_no: row.serial_no || '',
      manufacturer: row.manufacturer || '',
      warranty_expiry: row.warranty_expiry || '',
      supplier_id: row.supplier_id || '',
      status: row.status || 'active',
    });
    setEditingId(row.id);
    setSlideOpen(true);
  }

  function openCreate() {
    setFormData(EMPTY_FORM);
    setEditingId(null);
    setSlideOpen(true);
  }

  function openAllocations(row: Record<string, string>) {
    setSelectedAssetId(row.id);
    setSelectedAssetName(row.name);
    setAllocDeptCode('');
    setAllocQty('1');
    setAllocDate(new Date().toISOString().split('T')[0]);
    setAllocationsOpen(true);
  }

  const filteredAssets = useMemo(() => {
    if (!assetData?.data) return [];
    if (!debouncedSearch) return assetData.data;
    const s = debouncedSearch.toLowerCase();
    return assetData.data.filter(
      (a) =>
        a.name.toLowerCase().includes(s) ||
        (a.serial_no && a.serial_no.toLowerCase().includes(s)) ||
        (a.manufacturer && a.manufacturer.toLowerCase().includes(s))
    );
  }, [assetData, debouncedSearch]);

  const columns = useMemo<Column<Record<string, string>>[]>(() => [
    {
      key: 'name',
      label: 'Tài sản',
      render: (row) => (
        <div className="space-y-0.5">
          <div className="font-semibold text-slate-800">{row.name}</div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span>ĐVT: {row.unit}</span>
            {row.serial_no && (
              <>
                <span>•</span>
                <span className="font-mono bg-slate-50 px-1 border rounded text-slate-500">S/N: {row.serial_no}</span>
              </>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      label: 'Phân loại',
      render: (row) => (
        <TagBadge
          label={row.type === 'tscd' ? 'Tài sản cố định' : 'Công cụ dụng cụ'}
          color={row.type === 'tscd' ? 'purple' : 'green'}
        />
      ),
    },
    {
      key: 'purchase_date',
      label: 'Ngày mua',
      render: (row) => <span className="text-sm text-slate-600">{row.purchase_date}</span>,
    },
    {
      key: 'original_value',
      label: 'Nguyên giá',
      render: (row) => <span className="text-sm font-semibold text-slate-700">{formatCurrency(row.original_value)}</span>,
    },
    {
      key: 'depreciation',
      label: 'Khấu hao lũy kế / Tháng',
      render: (row) => {
        const accum = parseFloat(row.depreciated_value || '0');
        const months = parseFloat(row.depreciation_months || '1');
        return (
          <div className="space-y-0.5">
            <span className="text-xs font-medium text-slate-600">
              {formatCurrency(accum)}
            </span>
            <div className="text-[10px] text-slate-400">Thời hạn: {months} tháng</div>
          </div>
        );
      },
    },
    {
      key: 'remaining_value',
      label: 'Giá trị còn lại',
      render: (row) => {
        const orig = parseFloat(row.original_value || '0');
        const accum = parseFloat(row.depreciated_value || '0');
        const rem = Math.max(0, orig - accum);
        return <span className="text-sm font-bold text-primary">{formatCurrency(rem)}</span>;
      },
    },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (row) => {
        let label = 'Hoạt động';
        let color: 'green' | 'yellow' | 'red' = 'green';
        if (row.status === 'depreciated') {
          label = 'Khấu hao hết';
          color = 'yellow';
        } else if (row.status === 'disposed') {
          label = 'Đã thanh lý';
          color = 'red';
        }
        return <TagBadge label={label} color={color} />;
      },
    },
    {
      key: 'actions',
      label: '',
      render: (row) => {
        const orig = parseFloat(row.original_value || '0');
        const accum = parseFloat(row.depreciated_value || '0');
        const isDepreciated = accum >= orig || row.status === 'depreciated' || row.status === 'disposed';

        return (
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => openAllocations(row)}
              className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-all cursor-pointer"
            >
              Bàn giao ({departmentMap ? 'Gán' : 0})
            </button>
            {canManage && (
              <>
                <button
                  onClick={() => depreciateMutation.mutate(row.id)}
                  disabled={isDepreciated || depreciateMutation.isPending}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-40 disabled:hover:bg-amber-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                  title="Tính khấu hao tháng này"
                >
                  {depreciateMutation.isPending ? 'Đang trích...' : 'Trích khấu hao'}
                </button>
                <button
                  onClick={() => openEdit(row)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Sửa
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Bạn có muốn xóa tài sản "${row.name}"?`)) {
                      deleteAssetMutation.mutate(row.id);
                    }
                  }}
                  className="rounded-lg border border-rose-100 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 cursor-pointer"
                >
                  Xóa
                </button>
              </>
            )}
          </div>
        );
      },
    },
  ], [canManage, departmentMap, depreciateMutation, deleteAssetMutation]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{shopName}</div>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">Quản lý Tài sản & CCDC</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {filteredAssets.length} tài sản đăng ký
            {assetsFetching && <span className="ml-2 text-xs text-slate-400 animate-pulse">Đang cập nhật...</span>}
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                setCommissionForm({
                  product_id: '',
                  qty: '1',
                  department_code: '',
                  type: 'ccdc',
                  depreciation_months: '12',
                  serial_no: '',
                  manufacturer: '',
                  warranty_expiry: '',
                  supplier_id: '',
                  purchase_date: new Date().toISOString().split('T')[0],
                });
                setCommissionOpen(true);
              }}
              className="rounded-xl bg-amber-600 hover:bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition-all cursor-pointer active:scale-95 shadow-sm flex items-center gap-1.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
              ⚡️ Bàn giao từ WH-ASSET
            </button>
            <button
              onClick={openCreate}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition-all cursor-pointer active:scale-95 shadow-sm"
            >
              + Đăng ký thẻ tài sản
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'all'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          Tất cả tài sản
        </button>
        <button
          onClick={() => setActiveTab('ccdc')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'ccdc'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          Công cụ dụng cụ (CCDC)
        </button>
        <button
          onClick={() => setActiveTab('tscd')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'tscd'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          Tài sản cố định (TSCĐ)
        </button>
      </div>

      {/* Search & List */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Tìm tài sản theo tên, mã serial, hãng sản xuất..."
        />

        <DataTable
          columns={columns}
          data={filteredAssets}
          loading={assetsLoading}
          emptyState={
            <EmptyState
              title="Chưa đăng ký tài sản nào"
              description="Bắt đầu đăng ký trang thiết bị, công cụ dụng cụ và thiết lập khấu hao hàng tháng tự động."
            />
          }
          rowKey={(row) => row.id}
        />
      </div>

      {/* Asset Form SlideOver */}
      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title={editingId ? 'Cập nhật tài sản' : 'Đăng ký tài sản mới'}
        footer={
          <div className="flex items-center gap-3 w-full justify-end">
            <button
              onClick={() => setSlideOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              onClick={() => {
                if (!formData.name.trim()) {
                  toast.error('Vui lòng điền tên tài sản');
                  return;
                }
                if (!formData.original_value.trim()) {
                  toast.error('Vui lòng điền nguyên giá');
                  return;
                }
                if (!formData.depreciation_months.trim()) {
                  toast.error('Vui lòng điền số tháng khấu hao');
                  return;
                }
                saveAssetMutation.mutate(formData);
              }}
              disabled={saveAssetMutation.isPending}
              className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-all cursor-pointer active:scale-95 shadow-sm"
            >
              {saveAssetMutation.isPending ? 'Đang lưu...' : 'Lưu tài sản'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tên tài sản / CCDC *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
              placeholder="Ví dụ: Máy siêu âm, Ga trải giường khách sạn, Bàn lễ tân..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Loại tài sản *</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData((prev) => ({ ...prev, type: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none bg-white"
              >
                <option value="ccdc">Công cụ dụng cụ (CCDC)</option>
                <option value="tscd">Tài sản cố định (TSCĐ)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Đơn vị tính *</label>
              <input
                type="text"
                value={formData.unit}
                onChange={(e) => setFormData((prev) => ({ ...prev, unit: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
                placeholder="chiếc, cái, bộ,..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nguyên giá *</label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={formatNumberString(formData.original_value)}
                  onChange={(e) => setFormData((prev) => ({ ...prev, original_value: toRawNumber(e.target.value) }))}
                  className="w-full rounded-xl border border-slate-200 pl-3.5 pr-10 py-2.5 text-sm focus:border-primary focus:outline-none"
                  placeholder="5.000.000"
                />
                <span className="absolute right-3.5 text-xs font-semibold text-slate-400">đ</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Giá trị thanh lý dự kiến</label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={formatNumberString(formData.salvage_value)}
                  onChange={(e) => setFormData((prev) => ({ ...prev, salvage_value: toRawNumber(e.target.value) }))}
                  className="w-full rounded-xl border border-slate-200 pl-3.5 pr-10 py-2.5 text-sm focus:border-primary focus:outline-none"
                  placeholder="0"
                />
                <span className="absolute right-3.5 text-xs font-semibold text-slate-400">đ</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ngày mua *</label>
              <input
                type="date"
                value={formData.purchase_date}
                onChange={(e) => setFormData((prev) => ({ ...prev, purchase_date: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Thời gian khấu hao (tháng) *</label>
              <input
                type="number"
                min="1"
                value={formData.depreciation_months}
                onChange={(e) => setFormData((prev) => ({ ...prev, depreciation_months: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
                placeholder="12"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 mt-2 space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Thông tin mở rộng & Đa ngành</h4>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Số sê-ri / Model</label>
                <input
                  type="text"
                  value={formData.serial_no}
                  onChange={(e) => setFormData((prev) => ({ ...prev, serial_no: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
                  placeholder="S/N: 9283-A"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Hãng sản xuất</label>
                <input
                  type="text"
                  value={formData.manufacturer}
                  onChange={(e) => setFormData((prev) => ({ ...prev, manufacturer: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
                  placeholder="Ví dụ: Philips, Sony..."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Hạn bảo hành</label>
                <input
                  type="date"
                  value={formData.warranty_expiry}
                  onChange={(e) => setFormData((prev) => ({ ...prev, warranty_expiry: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nhà cung cấp</label>
                <select
                  value={formData.supplier_id}
                  onChange={(e) => setFormData((prev) => ({ ...prev, supplier_id: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none bg-white"
                >
                  <option value="">-- Chọn nhà cung cấp --</option>
                  {supplierData?.data?.map((sup) => (
                    <option key={sup.id || sup.supplier_id} value={sup.id || sup.supplier_id}>
                      {sup.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </SlideOver>

      {/* Asset Allocations Drawer */}
      <SlideOver
        open={allocationsOpen}
        onClose={() => setAllocationsOpen(false)}
        title={`Bàn giao tài sản: ${selectedAssetName || ''}`}
      >
        <div className="space-y-6">
          {/* Allocation Creation Form */}
          {canManage && (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60 space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Bàn giao mới (Cost Center)</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Phòng ban nhận bàn giao</label>
                  <select
                    value={allocDeptCode}
                    onChange={(e) => setAllocDeptCode(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                  >
                    <option value="">-- Chọn phòng ban --</option>
                    {deptData?.data?.map((dept) => (
                      <option key={dept.id} value={dept.code}>
                        {dept.name} ({dept.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Số lượng bàn giao</label>
                    <input
                      type="number"
                      min="1"
                      value={allocQty}
                      onChange={(e) => setAllocQty(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Ngày bàn giao</label>
                    <input
                      type="date"
                      value={allocDate}
                      onChange={(e) => setAllocDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => {
                      if (!allocDeptCode) {
                        toast.error('Vui lòng chọn phòng ban');
                        return;
                      }
                      if (!allocQty || parseFloat(allocQty) <= 0) {
                        toast.error('Vui lòng điền số lượng bàn giao hợp lệ');
                        return;
                      }
                      addAllocMutation.mutate({
                        asset_id: selectedAssetId!,
                        department_code: allocDeptCode,
                        qty: allocQty,
                        allocated_at: allocDate,
                      });
                    }}
                    disabled={addAllocMutation.isPending || !allocDeptCode}
                    className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-dark transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    {addAllocMutation.isPending ? 'Đang bàn giao...' : 'Bàn giao'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Allocation list */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lịch sử bàn giao & Phân bổ chi phí</h3>
            {allocsLoading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-12 bg-slate-100 rounded-xl"></div>
                <div className="h-12 bg-slate-100 rounded-xl"></div>
              </div>
            ) : !allocationsData?.data || allocationsData.data.length === 0 ? (
              <div className="text-center py-8 text-slate-400 italic text-sm border-2 border-dashed border-slate-100 rounded-xl">
                Tài sản này chưa được bàn giao cho phòng ban nào.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
                {allocationsData.data.map((alloc) => {
                  const deptName = departmentMap.get(alloc.department_code) || alloc.department_code;
                  return (
                    <div key={alloc.id} className="flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">
                          {deptName}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                          <span>Số lượng: {alloc.qty}</span>
                          <span>•</span>
                          <span>Bàn giao: {alloc.allocated_at}</span>
                        </div>
                      </div>

                      {canManage && (
                        <button
                          onClick={() => {
                            if (confirm(`Bạn có muốn thu hồi bàn giao tài sản khỏi bộ phận ${deptName}?`)) {
                              removeAllocMutation.mutate(alloc.id);
                            }
                          }}
                          className="p-1.5 rounded-lg border border-slate-200 text-rose-500 hover:bg-rose-50 hover:border-rose-100 transition-all cursor-pointer"
                          title="Thu hồi bàn giao"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </SlideOver>

      {/* 2-Step Asset Commissioning SlideOver */}
      <SlideOver
        open={commissionOpen}
        onClose={() => setCommissionOpen(false)}
        title="Bàn giao tài sản từ kho WH-ASSET"
        footer={
          <div className="flex items-center gap-3 w-full justify-end">
            <button
              onClick={() => setCommissionOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              onClick={() => {
                if (!commissionForm.product_id) {
                  toast.error('Vui lòng chọn sản phẩm trong kho');
                  return;
                }
                if (!commissionForm.department_code) {
                  toast.error('Vui lòng chọn phòng ban Cost Center nhận bàn giao');
                  return;
                }
                const reqQty = parseFloat(commissionForm.qty);
                if (isNaN(reqQty) || reqQty <= 0) {
                  toast.error('Vui lòng điền số lượng bàn giao hợp lệ');
                  return;
                }
                if (reqQty > selectedProductStock) {
                  toast.error(`Số lượng bàn giao vượt quá tồn kho khả dụng (${selectedProductStock})`);
                  return;
                }
                if (!commissionForm.depreciation_months) {
                  toast.error('Vui lòng điền số tháng khấu hao');
                  return;
                }
                commissionMutation.mutate(commissionForm);
              }}
              disabled={commissionMutation.isPending || !commissionForm.product_id}
              className="rounded-xl bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-all cursor-pointer active:scale-95 shadow-sm"
            >
              {commissionMutation.isPending ? 'Đang thực hiện...' : '⚡️ Kích hoạt & Bàn giao'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-amber-50 border border-amber-200/50 p-3.5 space-y-1.5">
            <div className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
              <span>💡 Quy trình bàn giao 2 bước</span>
            </div>
            <p className="text-xs text-amber-700 leading-relaxed">
              Tài sản vật lý sau khi nhập kho mua sắm (GRN) sẽ được lưu trữ tạm thời tại kho <strong className="font-semibold">WH-ASSET</strong>. Khi thực hiện bàn giao dưới đây, hệ thống sẽ tự động trừ kho WH-ASSET, kích hoạt thẻ tài sản khấu hao, và gán sử dụng cho Cost Center phòng ban tương ứng.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Chọn sản phẩm trong kho WH-ASSET *</label>
            <select
              value={commissionForm.product_id}
              onChange={(e) => {
                const pId = e.target.value;
                const found = availableAssetProducts.find((p) => p.product_id === pId);
                setCommissionForm((prev) => ({
                  ...prev,
                  product_id: pId,
                  manufacturer: found?.manufacturer || prev.manufacturer || '',
                  supplier_id: found?.supplier_id || prev.supplier_id || '',
                }));
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
            >
              <option value="">-- Chọn sản phẩm có sẵn trong kho --</option>
              {availableAssetProducts.map((item) => (
                <option key={item.product_id} value={item.product_id}>
                  {item.product_name} ({item.sku || 'Không có SKU'}) - Tồn kho: {item.stock_qty} {item.unit}
                </option>
              ))}
            </select>
            {commissionForm.product_id && (
              <div className="mt-1.5 text-xs text-slate-500 font-semibold flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 border rounded-lg w-fit">
                <span>Tồn kho WH-ASSET khả dụng:</span>
                <span className="text-primary font-bold">{selectedProductStock} sản phẩm</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Số lượng bàn giao *</label>
              <input
                type="number"
                min="1"
                max={selectedProductStock}
                value={commissionForm.qty}
                onChange={(e) => setCommissionForm((prev) => ({ ...prev, qty: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
                placeholder="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phòng ban (Cost Center) *</label>
              <select
                value={commissionForm.department_code}
                onChange={(e) => setCommissionForm((prev) => ({ ...prev, department_code: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">-- Chọn phòng ban nhận --</option>
                {deptData?.data?.map((dept) => (
                  <option key={dept.id} value={dept.code}>
                    {dept.name} ({dept.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phân loại thẻ tài sản *</label>
              <select
                value={commissionForm.type}
                onChange={(e) => setCommissionForm((prev) => ({ ...prev, type: e.target.value as 'ccdc' | 'tscd' }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
              >
                <option value="ccdc">Công cụ dụng cụ (CCDC)</option>
                <option value="tscd">Tài sản cố định (TSCĐ)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Thời gian khấu hao (tháng) *</label>
              <input
                type="number"
                min="1"
                value={commissionForm.depreciation_months}
                onChange={(e) => setCommissionForm((prev) => ({ ...prev, depreciation_months: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
                placeholder="12"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ngày bàn giao *</label>
              <input
                type="date"
                value={commissionForm.purchase_date}
                onChange={(e) => setCommissionForm((prev) => ({ ...prev, purchase_date: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Số sê-ri / Model</label>
              <input
                type="text"
                value={commissionForm.serial_no}
                onChange={(e) => setCommissionForm((prev) => ({ ...prev, serial_no: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
                placeholder="S/N: Philip-928A"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Hãng sản xuất</label>
              <input
                type="text"
                value={commissionForm.manufacturer}
                onChange={(e) => setCommissionForm((prev) => ({ ...prev, manufacturer: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
                placeholder="Philips, Dell, Sony..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Hạn bảo hành</label>
              <input
                type="date"
                value={commissionForm.warranty_expiry}
                onChange={(e) => setCommissionForm((prev) => ({ ...prev, warranty_expiry: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nhà cung cấp (Gán liên kết)</label>
            <select
              value={commissionForm.supplier_id}
              onChange={(e) => setCommissionForm((prev) => ({ ...prev, supplier_id: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
            >
              <option value="">-- Chọn nhà cung cấp --</option>
              {supplierData?.data?.map((sup) => (
                <option key={sup.id || sup.supplier_id} value={sup.id || sup.supplier_id}>
                  {sup.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
