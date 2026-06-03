'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useDebounce } from 'use-debounce';
import { DataTable, Column } from '@/app/components/ui/DataTable';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { TagBadge } from '@/app/components/ui/TagBadge';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { SearchBar } from '@/app/components/ui/SearchBar';
import { useConfirm } from '@/app/components/ui/ConfirmProvider';
import { createPortal } from 'react-dom';
import { MoreVertical, Move, Coins, Pencil, Barcode, Trash2, Zap, FileText, X, Building2, ClipboardList, Loader2, History, Landmark } from 'lucide-react';

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

function formatDateTime(val: string | Date | undefined | null): string {
  if (!val) return '---';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  
  return `${date}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

function formatDate(val: string | Date | undefined | null): string {
  if (!val) return '---';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  
  return `${date}/${month}/${year}`;
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

function AssetRowActions({
  row,
  canManage,
  isDepreciated,
  depreciatePending,
  onDepreciate,
  onOpenAllocations,
  onOpenEdit,
  onDelete,
}: {
  row: Record<string, string>;
  canManage: boolean;
  isDepreciated: boolean;
  depreciatePending: boolean;
  onDepreciate: () => void;
  onOpenAllocations: () => void;
  onOpenEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  const updatePosition = useCallback(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    }
  }, [open]);

  useEffect(() => {
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [updatePosition]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node) &&
        !(e.target as Element).closest('.row-actions-dropdown')
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const dropdownWidth = 208; // w-52 is 208px

  return (
    <div className="flex items-center justify-end">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-all cursor-pointer shadow-sm active:scale-95 flex items-center justify-center"
        title="Thao tác"
      >
        <MoreVertical size={16} strokeWidth={1.75} />
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div 
          className="row-actions-dropdown fixed z-[9999] w-52 rounded-xl border border-slate-200 bg-white shadow-xl py-1.5 divide-y divide-slate-100 animate-in fade-in slide-in-from-top-2 duration-150"
          style={{ 
            top: coords.top, 
            left: Math.max(10, coords.left + coords.width - dropdownWidth) 
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Thao tác tài sản
          </div>
          
          <div className="py-1">
            <button
              onClick={() => {
                setOpen(false);
                onOpenAllocations();
              }}
              className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer text-slate-800"
            >
              <Move size={14} strokeWidth={1.75} className="text-primary" />
              Di chuyển (Điều động)
            </button>

            {canManage && (
              <button
                onClick={() => {
                  setOpen(false);
                  onDepreciate();
                }}
                disabled={isDepreciated || depreciatePending}
                className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer text-slate-800"
              >
                {depreciatePending ? (
                  <Loader2 size={14} className="animate-spin text-amber-500 shrink-0" />
                ) : (
                  <Coins size={14} strokeWidth={1.75} className="text-amber-500 shrink-0" />
                )}
                <span>{depreciatePending ? 'Đang trích...' : 'Trích khấu hao'}</span>
              </button>
            )}
          </div>

          {canManage && (
            <div className="py-1">
              <button
                onClick={() => {
                  setOpen(false);
                  onOpenEdit();
                }}
                className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer text-slate-800"
              >
                <Pencil size={14} strokeWidth={1.75} className="text-slate-500" />
                Sửa thông tin
              </button>

              <button
                onClick={() => {
                  setOpen(false);
                  toast.info('Tính năng In barcode / nhãn dán sẽ được cập nhật ở phiên bản tiếp theo!');
                }}
                className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Barcode size={14} strokeWidth={1.75} className="text-slate-400" />
                In barcode / nhãn dán
              </button>
            </div>
          )}

          {canManage && (
            <div className="py-1">
              <button
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                className="w-full text-left px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Trash2 size={14} strokeWidth={1.75} className="text-rose-500" />
                Xóa tài sản
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

export function AssetsClient({ shopId, shopName, canManage }: Props) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const txNameRef = useRef('');
  const [activeTab, setActiveTab] = useState<'all' | 'ccdc' | 'tscd'>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const [formData, setFormData] = useState<Record<string, string>>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [slideOpen, setSlideOpen] = useState(false);
  const [detailAsset, setDetailAsset] = useState<Record<string, string> | null>(null);

  // Asset Allocations state (Di chuyển tài sản)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedAssetName, setSelectedAssetName] = useState<string | null>(null);
  const [allocationsOpen, setAllocationsOpen] = useState(false);
  const [allocDeptId, setAllocDeptId] = useState('');
  const [allocQty, setAllocQty] = useState('1');
  const [allocDate, setAllocDate] = useState(new Date().toISOString().split('T')[0]);
  const [allocNote, setAllocNote] = useState('');
  const [allocRecipient, setAllocRecipient] = useState('');

  // Commissioning state (2-Step Asset Commissioning)
  const [commissionOpen, setCommissionOpen] = useState(false);
  const [commissionForm, setCommissionForm] = useState({
    product_id: '',
    qty: '1',
    department_id: '',
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
    return whData?.data?.find((w) => w.type === 'asset')?.id || '';
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

  // 4.5. Fetch asset depreciations history
  const { data: depreciationsData, isLoading: deprecLoading } = useQuery({
    queryKey: ['asset-depreciations-history', shopId, selectedAssetId],
    enabled: !!selectedAssetId,
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/assets/${selectedAssetId}/depreciations`);
      if (!res.ok) throw new Error('Không tải được lịch sử khấu hao tài sản');
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
      deptData.data.forEach((d) => map.set(d.id, d.name));
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
      queryClient.invalidateQueries({ queryKey: ['asset-depreciations-history', shopId, selectedAssetId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Batch depreciate mutation
  const batchDepreciateMutation = useMutation({
    mutationFn: async (payload: { transaction_name: string }) => {
      const res = await fetch(`/api/shops/${shopId}/assets/batch-depreciate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Trích khấu hao hàng loạt thất bại');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(
        `⚡️ Trích khấu hao hàng loạt thành công! Đã trích ${data.count} tài sản hoạt động, tổng chi phí: ${formatCurrency(data.totalAmount)}!`
      );
      queryClient.invalidateQueries({ queryKey: ['assets', shopId] });
      queryClient.invalidateQueries({ queryKey: ['asset-depreciations-history', shopId, selectedAssetId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Create allocation mutation (Di chuyển tài sản)
  const addAllocMutation = useMutation({
    mutationFn: async (payload: { asset_id: string; department_id: string; qty: string; allocated_at: string; note?: string; recipient_name?: string }) => {
      const res = await fetch(`/api/shops/${shopId}/assets/allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Điều chuyển tài sản thất bại');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Điều chuyển tài sản thành công!');
      setAllocQty('1');
      setAllocDeptId('');
      setAllocNote('');
      setAllocRecipient('');
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
    setAllocDeptId('');
    setAllocQty('1');
    setAllocDate(new Date().toISOString().split('T')[0]);
    setAllocNote('');
    setAllocRecipient('');
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
          <div className="font-semibold text-slate-800">
            {row.name} <span className="text-slate-400 font-normal text-xs">({row.unit})</span>
          </div>
          {row.serial_no && (
            <div className="text-[11px] text-slate-500 font-mono">
              S/N: {row.serial_no}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      label: 'Bộ phận & Phân loại',
      render: (row) => (
        <div className="space-y-1 py-0.5">
          <div className="font-semibold text-slate-800 text-xs flex items-center gap-1.5">
            <Building2 size={13} strokeWidth={1.75} className="text-slate-400 shrink-0" />
            <span>{row.current_department || "Chưa di chuyển"}</span>
          </div>
          <div className="text-[10px]">
            <span className={`px-1.5 py-0.5 rounded-md font-medium border ${row.type === 'tscd' ? 'bg-purple-50 text-purple-600 border-purple-100/60' : 'bg-green-50 text-green-600 border-green-100/60'}`}>
              {row.type === 'tscd' ? 'Tài sản cố định' : 'Công cụ dụng cụ'}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'purchase_date',
      label: 'Ngày mua',
      render: (row) => <span className="text-sm text-slate-600">{formatDate(row.purchase_date)}</span>,
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
      className: 'relative',
      render: (row) => {
        const orig = parseFloat(row.original_value || '0');
        const accum = parseFloat(row.depreciated_value || '0');
        const isDepreciated = accum >= orig || row.status === 'depreciated' || row.status === 'disposed';

        return (
          <AssetRowActions
            row={row}
            canManage={canManage}
            isDepreciated={isDepreciated}
            depreciatePending={depreciateMutation.isPending}
            onDepreciate={async () => {
              await confirm({
                title: 'Trích khấu hao tài sản',
                description: `Bạn có chắc chắn muốn thực hiện trích khấu hao tháng này cho tài sản "${row.name}"? Hệ thống sẽ tự động tăng giá trị hao mòn lũy kế của tài sản và lập phiếu ghi nhận chi phí khấu hao gán riêng cho từng bộ phận Cost Center thụ hưởng trong Sổ quỹ (Cashbook).`,
                confirmLabel: 'Trích khấu hao',
                cancelLabel: 'Hủy',
                variant: 'default',
                onConfirm: async () => {
                  await depreciateMutation.mutateAsync(row.id);
                },
              });
            }}
            onOpenAllocations={() => openAllocations(row)}
            onOpenEdit={() => openEdit(row)}
            onDelete={async () => {
              await confirm({
                title: 'Xóa thẻ tài sản',
                description: `Bạn có chắc chắn muốn xóa tài sản "${row.name}"? Sau khi xóa, thẻ tài sản này sẽ được chuyển sang trạng thái lưu trữ ẩn (soft-delete), nhưng lịch sử trích khấu hao và dòng tiền đã hạch toán trong Sổ quỹ (Cashbook) vẫn sẽ được lưu trữ toàn vẹn để đối chiếu tài chính.`,
                confirmLabel: 'Xóa tài sản',
                cancelLabel: 'Hủy',
                variant: 'danger',
                onConfirm: async () => {
                  await deleteAssetMutation.mutateAsync(row.id);
                },
              });
            }}
          />
        );
      },
    },
  ], [canManage, departmentMap, depreciateMutation, deleteAssetMutation, confirm]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{shopName}</div>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">Quản lý Tài sản</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Có {filteredAssets.length} tài sản
            {assetsFetching && <span className="ml-2 text-xs text-slate-400 animate-pulse">Đang cập nhật...</span>}
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={async () => {
                const activeCount = filteredAssets.filter(a => a.status === 'active').length;
                const now = new Date();
                const currentMonthStr = String(now.getMonth() + 1).padStart(2, '0');
                const currentYearStr = String(now.getFullYear());
                const periodStr = `${currentMonthStr}/${currentYearStr}`;
                const defaultTxName = `Hao mòn Kỳ ${periodStr}`;
                txNameRef.current = defaultTxName;

                await confirm({
                  title: 'Trích khấu hao định kỳ hàng tháng',
                  description: `Hệ thống sẽ thực hiện quét và tự động trích khấu hao tháng này cho toàn bộ ${activeCount} tài sản đang ở trạng thái Hoạt động. \n\nChi phí khấu hao sẽ được tự động tính toán, phân bổ riêng biệt theo tỷ lệ bàn giao cho từng phòng ban (Cost Center) thụ hưởng và lập các phiếu chi chi phí tương ứng ghi nhận vào Sổ quỹ (Cashbook) để phục vụ báo cáo P&L nội bộ.`,
                  confirmLabel: '⚡️ Bắt đầu trích hàng loạt',
                  cancelLabel: 'Hủy',
                  variant: 'default',
                  onConfirm: async () => {
                    await batchDepreciateMutation.mutateAsync({
                      transaction_name: txNameRef.current || defaultTxName,
                    });
                  },
                  children: (
                    <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Tên giao dịch Sổ quỹ
                      </label>
                      <input
                        type="text"
                        defaultValue={defaultTxName}
                        onChange={(e) => { txNameRef.current = e.target.value; }}
                        placeholder="Ví dụ: Hao mòn Kỳ 05/2026"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-primary focus:outline-none shadow-sm focus:ring-1 focus:ring-primary/20 transition-all font-medium"
                      />
                      <p className="text-[11px] text-slate-400 leading-normal">
                        Tên giao dịch này sẽ được gán làm tên phiếu chi của từng bộ phận trong Sổ quỹ (ví dụ: <span className="font-semibold text-slate-500 font-mono">Hao mòn Kỳ 05/2026 - BP Hành chính</span>).
                      </p>
                    </div>
                  )
                });
              }}
              disabled={batchDepreciateMutation.isPending}
              className="rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 px-4 py-2 text-sm font-bold text-primary transition-all cursor-pointer active:scale-95 shadow-sm flex items-center gap-1.5 disabled:opacity-40"
            >
              {batchDepreciateMutation.isPending ? (
                <Loader2 size={15} className="animate-spin text-primary shrink-0" />
              ) : (
                <Coins size={15} strokeWidth={1.75} className="text-primary shrink-0" />
              )}
              <span>{batchDepreciateMutation.isPending ? 'Đang trích...' : 'Trích khấu hao hàng loạt'}</span>
            </button>
            <button
              onClick={() => {
                setCommissionForm({
                  product_id: '',
                  qty: '1',
                  department_id: '',
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
              <Zap size={15} strokeWidth={1.75} />
              Bàn giao từ Kho
            </button>
            <button
              onClick={openCreate}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition-all cursor-pointer active:scale-95 shadow-sm"
            >
              + Thêm mới
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
          onRowClick={(row) => {
            setSelectedAssetId(row.id);
            setDetailAsset(row);
          }}
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

      <SlideOver
        open={!!detailAsset}
        onClose={() => setDetailAsset(null)}
        title="Chi tiết Thẻ tài sản & Phiếu nhập"
        footer={
          <div className="flex items-center gap-3 w-full justify-between">
            {canManage && detailAsset && (
              <button
                onClick={async () => {
                  await confirm({
                    title: 'Xóa thẻ tài sản',
                    description: `Bạn có chắc chắn muốn xóa tài sản "${detailAsset.name}"? Sau khi xóa, thẻ tài sản này sẽ được chuyển sang trạng thái lưu trữ ẩn (soft-delete), nhưng lịch sử trích khấu hao và dòng tiền đã hạch toán trong Sổ quỹ (Cashbook) vẫn sẽ được lưu trữ toàn vẹn để đối chiếu tài chính.`,
                    confirmLabel: 'Xóa tài sản',
                    cancelLabel: 'Hủy',
                    variant: 'danger',
                    onConfirm: async () => {
                      await deleteAssetMutation.mutateAsync(detailAsset.id);
                      setDetailAsset(null);
                    },
                  });
                }}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-100 transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 animate-all duration-150"
              >
                <Trash2 size={16} strokeWidth={1.75} />
                Xóa thẻ
              </button>
            )}
            <div className="flex items-center gap-3 ml-auto">
              <button
                onClick={() => setDetailAsset(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer font-semibold shadow-sm transition-all active:scale-95"
              >
                Đóng
              </button>
              {canManage && detailAsset && (
                <button
                  onClick={() => {
                    openEdit(detailAsset);
                    setDetailAsset(null);
                  }}
                  className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition-all cursor-pointer active:scale-95 shadow-sm flex items-center gap-1.5"
                >
                  <Pencil size={16} strokeWidth={1.75} />
                  Sửa thông tin
                </button>
              )}
            </div>
          </div>
        }
      >
        {detailAsset && (() => {
          const orig = parseFloat(detailAsset.original_value || '0');
          const accum = parseFloat(detailAsset.depreciated_value || '0');
          const rem = Math.max(0, orig - accum);
          const percentDepreciated = orig > 0 ? Math.min(100, Math.round((accum / orig) * 100)) : 0;
          
          let statusLabel = 'Hoạt động';
          let statusColor: 'green' | 'yellow' | 'red' = 'green';
          if (detailAsset.status === 'depreciated') {
            statusLabel = 'Khấu hao hết';
            statusColor = 'yellow';
          } else if (detailAsset.status === 'disposed') {
            statusLabel = 'Đã thanh lý';
            statusColor = 'red';
          }

          return (
            <div className="space-y-6">
              {/* Asset Header Info */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex items-start gap-3.5">
                <div className="p-3 bg-primary/10 rounded-xl text-primary mt-0.5">
                  <FileText size={24} strokeWidth={1.5} />
                </div>
                <div className="space-y-1 w-full">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-slate-800 leading-tight">
                      {detailAsset.name}
                    </h3>
                    <TagBadge label={statusLabel} color={statusColor} />
                  </div>
                  <p className="text-xs text-slate-500 font-medium">
                    Mã thẻ: <span className="font-mono text-slate-600 bg-slate-200/60 px-1.5 py-0.5 rounded text-[11px]">{detailAsset.id}</span>
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <TagBadge
                      label={detailAsset.type === 'tscd' ? 'Tài sản cố định' : 'Công cụ dụng cụ'}
                      color={detailAsset.type === 'tscd' ? 'purple' : 'green'}
                    />
                    <span className="text-xs text-slate-400 font-semibold">• Đơn vị tính: {detailAsset.unit}</span>
                  </div>
                </div>
              </div>

              {/* Value & Depreciation Metrics */}
              <div className="border border-slate-100 bg-white rounded-2xl p-4 space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hạch toán giá trị & Khấu hao</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Nguyên giá mua</span>
                    <p className="text-base font-bold text-slate-800">{formatCurrency(orig)}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Khấu hao lũy kế</span>
                    <p className="text-base font-bold text-amber-600">{formatCurrency(accum)}</p>
                  </div>
                </div>

                <div className="p-3.5 bg-primary/5 rounded-xl border border-primary/10 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-primary/80 uppercase">Giá trị còn lại</span>
                    <p className="text-lg font-extrabold text-primary">{formatCurrency(rem)}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Hạn khấu hao</span>
                    <p className="text-sm font-semibold text-slate-700">{detailAsset.depreciation_months} tháng</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Tiến độ trích khấu hao</span>
                    <span className="font-bold text-slate-700">{percentDepreciated}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-amber-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${percentDepreciated}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Purchase & System Details */}
              <div className="border border-slate-100 bg-white rounded-2xl p-4 space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Thông tin chứng từ & Mua sắm</h4>
                
                <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-xs">
                  <div>
                    <span className="text-slate-400 block mb-0.5">Nhà cung cấp</span>
                    <span className="font-semibold text-slate-700">
                      {supplierMap.get(detailAsset.supplier_id) || "Chưa liên kết"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Ngày mua (Chứng từ)</span>
                    <span className="font-semibold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">{formatDate(detailAsset.purchase_date)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Hạn bảo hành</span>
                    <span className="font-semibold text-slate-700">{formatDate(detailAsset.warranty_expiry) || "Không bảo hành"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Hãng sản xuất</span>
                    <span className="font-semibold text-slate-700">{detailAsset.manufacturer || "Chưa rõ"}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400 block mb-0.5">Số sê-ri / Model</span>
                    <span className="font-mono text-[11px] font-bold text-slate-600 bg-slate-50 px-2.5 py-1 rounded border border-slate-200/60 inline-block">
                      {detailAsset.serial_no || "Không có số sê-ri"}
                    </span>
                  </div>
                  
                  <div className="border-t border-slate-100 pt-3">
                    <span className="text-slate-400 block mb-0.5">Ngày tạo thẻ (Nhập kho)</span>
                    <span className="font-semibold text-slate-700">{formatDateTime(detailAsset.created_at)}</span>
                  </div>
                  <div className="border-t border-slate-100 pt-3">
                    <span className="text-slate-400 block mb-0.5">Người tạo</span>
                    <span className="font-semibold text-primary bg-primary/5 px-2 py-0.5 rounded border border-primary/10 inline-block">{detailAsset.created_by || "Hệ thống"}</span>
                  </div>
                  <div className="border-t border-slate-100 pt-3">
                    <span className="text-slate-400 block mb-0.5">Cập nhật lần cuối</span>
                    <span className="font-semibold text-slate-700">{formatDateTime(detailAsset.updated_at)}</span>
                  </div>
                  <div className="border-t border-slate-100 pt-3">
                    <span className="text-slate-400 block mb-0.5">Người cập nhật</span>
                    <span className="font-semibold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 inline-block">{detailAsset.updated_by || "Hệ thống"}</span>
                  </div>
                </div>
              </div>

              {/* Allocations (Di chuyển / Bàn giao bộ phận) */}
              <div className="border border-slate-100 bg-white rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lịch sử di chuyển & Phân bổ</h4>
                  {canManage && (
                    <button
                      onClick={() => {
                        openAllocations(detailAsset);
                        setDetailAsset(null);
                      }}
                      className="text-xs text-primary font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      + Điều chuyển
                    </button>
                  )}
                </div>

                {allocsLoading ? (
                  <div className="space-y-2 animate-pulse">
                    <div className="h-10 bg-slate-100 rounded-xl"></div>
                    <div className="h-10 bg-slate-100 rounded-xl"></div>
                  </div>
                ) : !allocationsData?.data || allocationsData.data.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 italic text-xs border border-dashed border-slate-200 rounded-xl bg-slate-50">
                    Tài sản này chưa được điều động đến phòng ban nào.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-xl overflow-hidden bg-white">
                    {allocationsData.data.map((alloc) => {
                      const deptName = departmentMap.get(alloc.department_id) || alloc.department_id;
                      return (
                        <div key={alloc.id} className="p-3 hover:bg-slate-50 transition-colors text-xs space-y-1.5">
                          <div className="flex items-center justify-between font-bold text-slate-800">
                            <span className="text-sm font-semibold">{deptName}</span>
                            <span className="text-slate-500 font-semibold">Số lượng: {alloc.qty} {detailAsset.unit}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span>Ngày bàn giao: <strong className="text-slate-600">{formatDate(alloc.allocated_at)}</strong></span>
                            {alloc.recipient_name && (
                              <span className="font-semibold text-primary font-medium bg-primary/5 px-2 py-0.5 rounded">Người nhận: {alloc.recipient_name}</span>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap items-center justify-between gap-1 text-[9.5px] text-slate-400 bg-slate-50/60 px-2.5 py-1.5 rounded-lg border border-slate-100 font-mono">
                            <div>Ghi nhận bởi: <span className="font-semibold text-slate-600">{alloc.created_by || "Hệ thống"}</span> lúc {formatDateTime(alloc.created_at)}</div>
                            {alloc.updated_by && alloc.updated_by !== alloc.created_by && (
                              <div className="mt-0.5 border-t border-slate-100/60 pt-0.5 w-full font-semibold">Cập nhật bởi: <span className="text-slate-600">{alloc.updated_by || "Hệ thống"}</span> lúc {formatDateTime(alloc.updated_at)}</div>
                            )}
                          </div>
                          
                          {alloc.note && (
                            <p className="text-[11px] text-slate-500 italic bg-slate-50 p-1.5 rounded border border-slate-100 mt-1 flex items-start gap-1">
                              <ClipboardList size={13} strokeWidth={1.75} className="text-slate-400 mt-0.5 shrink-0" />
                              <span>{alloc.note}</span>
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Lịch sử Khấu hao Tài sản */}
              <div className="border border-slate-100 bg-white rounded-2xl p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <History size={16} className="text-slate-500" />
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lịch sử trích khấu hao hàng tháng</h4>
                </div>

                {deprecLoading ? (
                  <div className="space-y-2 animate-pulse">
                    <div className="h-12 bg-slate-100 rounded-xl"></div>
                    <div className="h-12 bg-slate-100 rounded-xl"></div>
                  </div>
                ) : !depreciationsData?.data || depreciationsData.data.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 italic text-xs border border-dashed border-slate-200 rounded-xl bg-slate-50">
                    Tài sản này chưa thực hiện kỳ trích khấu hao nào.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-xl overflow-hidden bg-white">
                    {depreciationsData.data.map((deprec, index, arr) => {
                      const deptName = deprec.department_id === 'general_management' 
                        ? 'Chi phí quản lý chung' 
                        : (departmentMap.get(deprec.department_id) || deprec.department_id);
                      const periodIndex = arr.length - index;
                      return (
                        <div key={deprec.id} className="p-3 hover:bg-slate-50 transition-colors text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 font-bold text-slate-800">
                              <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md border border-indigo-100 font-mono">
                                Kỳ {periodIndex}
                              </span>
                              <span className="text-sm font-semibold">{deptName}</span>
                            </div>
                            <span className="text-emerald-600 font-bold font-mono text-sm">
                              -{formatCurrency(deprec.amount)}
                            </span>
                          </div>
                          
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
                            <div>
                              Ngày trích: <strong className="text-slate-600">{formatDate(deprec.depreciation_date)}</strong>
                            </div>
                            <div className="bg-slate-50 px-2 py-0.5 rounded border border-slate-100 text-slate-500 font-mono text-[9px]">
                              Lũy kế: {formatCurrency(deprec.depreciated_value_before)} ➔ {formatCurrency(deprec.depreciated_value_after)}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-1 text-[9.5px] text-slate-400 bg-slate-50/50 px-2.5 py-1.5 rounded-lg border border-slate-100 font-mono">
                            <div>
                              Ghi nhận bởi: <span className="font-semibold text-slate-600">{deprec.created_by || "Hệ thống"}</span> lúc {formatDateTime(deprec.created_at)}
                            </div>
                            {deprec.cashbook_id && (
                              <div className="mt-0.5 border-t border-slate-100/60 pt-0.5 w-full flex items-center gap-1 text-slate-500">
                                <Landmark size={11} className="text-slate-400 shrink-0" />
                                <span>Liên kết Sổ quỹ: <strong className="text-slate-600 font-semibold">{deprec.cashbook_id}</strong></span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </SlideOver>

      {/* Asset Allocations Drawer (Di chuyển tài sản) */}
      <SlideOver
        open={allocationsOpen}
        onClose={() => setAllocationsOpen(false)}
        title={`Di chuyển & Điều chuyển tài sản: ${selectedAssetName || ''}`}
      >
        <div className="space-y-6">
          {/* Allocation Creation Form */}
          {canManage && (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60 space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Di chuyển thiết bị mới (Cost Center)</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Phòng ban nhận thiết bị *</label>
                  <select
                    value={allocDeptId}
                    onChange={(e) => setAllocDeptId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                  >
                    <option value="">-- Chọn phòng ban nhận --</option>
                    {deptData?.data?.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Số lượng di chuyển *</label>
                    <input
                      type="number"
                      min="1"
                      value={allocQty}
                      onChange={(e) => setAllocQty(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Ngày di chuyển *</label>
                    <input
                      type="date"
                      value={allocDate}
                      onChange={(e) => setAllocDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Họ tên người nhận thiết bị</label>
                  <input
                    type="text"
                    value={allocRecipient}
                    onChange={(e) => setAllocRecipient(e.target.value)}
                    placeholder="Ví dụ: Nguyễn Văn A..."
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Ghi chú di chuyển</label>
                  <textarea
                    rows={2}
                    value={allocNote}
                    onChange={(e) => setAllocNote(e.target.value)}
                    placeholder="Lý do điều chuyển, tình trạng bàn giao..."
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none bg-white resize-none"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => {
                      if (!allocDeptId) {
                        toast.error('Vui lòng chọn phòng ban nhận');
                        return;
                      }
                      if (!allocQty || parseFloat(allocQty) <= 0) {
                        toast.error('Vui lòng điền số lượng di chuyển hợp lệ');
                        return;
                      }
                      addAllocMutation.mutate({
                        asset_id: selectedAssetId!,
                        department_id: allocDeptId,
                        qty: allocQty,
                        allocated_at: allocDate,
                        note: allocNote,
                        recipient_name: allocRecipient,
                      });
                    }}
                    disabled={addAllocMutation.isPending || !allocDeptId}
                    className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-dark transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    {addAllocMutation.isPending ? 'Đang di chuyển...' : 'Di chuyển'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Allocation list */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lịch sử di chuyển & Phân bổ Cost Center</h3>
            {allocsLoading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-12 bg-slate-100 rounded-xl"></div>
                <div className="h-12 bg-slate-100 rounded-xl"></div>
              </div>
            ) : !allocationsData?.data || allocationsData.data.length === 0 ? (
              <div className="text-center py-8 text-slate-400 italic text-sm border-2 border-dashed border-slate-100 rounded-xl">
                Tài sản này chưa được di chuyển hoặc bàn giao phòng ban nào.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
                {allocationsData.data.map((alloc) => {
                  const deptName = departmentMap.get(alloc.department_id) || alloc.department_id;
                  return (
                    <div key={alloc.id} className="flex items-start justify-between p-3.5 hover:bg-slate-50 transition-colors">
                      <div className="space-y-1.5">
                        <div className="text-sm font-bold text-slate-800">
                          {deptName}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-400">
                          <span className="font-semibold text-slate-500">Số lượng: {alloc.qty}</span>
                          <span>•</span>
                          <span>Di chuyển: {formatDate(alloc.allocated_at)}</span>
                          {alloc.recipient_name && (
                            <>
                              <span>•</span>
                              <span className="bg-primary/5 px-1.5 py-0.5 rounded text-primary font-semibold">Người nhận: {alloc.recipient_name}</span>
                            </>
                          )}
                        </div>
                        <div className="text-[9.5px] text-slate-400 font-mono flex flex-wrap gap-x-2 gap-y-0.5">
                          <span>Ghi nhận bởi: <strong className="text-slate-600 font-semibold">{alloc.created_by || "Hệ thống"}</strong> lúc {formatDateTime(alloc.created_at)}</span>
                          {alloc.updated_by && alloc.updated_by !== alloc.created_by && (
                            <span>• Cập nhật bởi: <strong className="text-slate-600 font-semibold">{alloc.updated_by || "Hệ thống"}</strong> lúc {formatDateTime(alloc.updated_at)}</span>
                          )}
                        </div>
                        {alloc.note && (
                          <p className="text-xs text-slate-500 italic bg-slate-50 px-2 py-1 rounded border border-slate-100 mt-1 max-w-sm flex items-start gap-1">
                            <ClipboardList size={13} strokeWidth={1.75} className="text-slate-400 mt-0.5 shrink-0" />
                            <span>{alloc.note}</span>
                          </p>
                        )}
                      </div>

                      {canManage && (
                        <button
                          onClick={async () => {
                            await confirm({
                              title: 'Thu hồi điều chuyển',
                              description: `Bạn có chắc chắn muốn thu hồi tài sản điều chuyển khỏi bộ phận "${deptName}"? Thao tác này sẽ xóa bản ghi điều chuyển hiện tại.`,
                              confirmLabel: 'Thu hồi',
                              cancelLabel: 'Hủy',
                              variant: 'danger',
                              onConfirm: async () => {
                                await removeAllocMutation.mutateAsync(alloc.id);
                              },
                            });
                          }}
                          className="p-1.5 rounded-lg border border-slate-200 text-rose-500 hover:bg-rose-50 hover:border-rose-100 transition-all cursor-pointer mt-0.5 flex items-center justify-center animate-all duration-150 active:scale-95"
                          title="Thu hồi di chuyển"
                        >
                          <X size={15} strokeWidth={1.75} />
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
        title="Bàn giao tài sản từ kho"
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
                if (!commissionForm.department_id) {
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
                value={commissionForm.department_id}
                onChange={(e) => setCommissionForm((prev) => ({ ...prev, department_id: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">-- Chọn phòng ban nhận --</option>
                {deptData?.data?.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
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
