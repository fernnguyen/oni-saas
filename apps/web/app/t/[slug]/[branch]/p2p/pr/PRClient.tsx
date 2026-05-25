'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useDebounce } from 'use-debounce';
import { DataTable, type Column } from '@/app/components/ui/DataTable';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog';
import { SearchBar } from '@/app/components/ui/SearchBar';
import { TagBadge } from '@/app/components/ui/TagBadge';
import { CopyableId } from '@/app/components/ui/CopyableId';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DocumentFlowMap } from '@/app/components/p2p/DocumentFlowMap';

interface Props {
  shopId: string;
  shopName: string;
  userId: string;
}

function ProductSelect({
  shopId,
  value,
  onChange,
}: {
  shopId: string;
  value: { product_id: string; name: string; sku: string } | null;
  onChange: (p: { product_id: string; name: string; sku: string }) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [debouncedQ] = useDebounce(q, 250);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['products-search', shopId, debouncedQ],
    queryFn: async () => {
      const sp = new URLSearchParams({ limit: '20' });
      sp.set('exclude_product_type', 'variant_parent');
      if (debouncedQ) sp.set('search', debouncedQ);
      const res = await fetch(`/api/shops/${shopId}/products?${sp}`);
      if (!res.ok) return { data: [] };
      const json = await res.json();
      return {
        data: json.data.map((p: any) => {
          let displayName = p.name;
          if (p.product_type === 'variant_child' && p.variant_options) {
            try {
              const opts = JSON.parse(p.variant_options);
              const vals = Object.values(opts).join(' / ');
              if (vals) displayName = `${p.name} (${vals})`;
            } catch {}
          }
          return { ...p, displayName };
        }),
      };
    },
    enabled: open,
  });

  useEffect(() => {
    function out(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, []);

  if (value) {
    return (
      <div className="flex-1 min-w-0 flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-1.5 min-h-[38px]">
        <div className="truncate flex-1 min-w-0 pr-1.5">
          <div className="flex items-center gap-1 truncate">
            <p className="text-xs font-semibold text-slate-900 truncate leading-normal">{value.name}</p>
          </div>
          {value.sku && <p className="text-[9px] text-slate-500 truncate font-mono leading-none mt-0.5">SKU: {value.sku}</p>}
        </div>
        <button
          type="button"
          onClick={() => onChange({ product_id: '', name: '', sku: '' })}
          className="text-slate-400 hover:text-red-500 px-0.5 text-[10px] shrink-0 font-bold ml-1.5"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative flex-1">
      <input
        type="text"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Gõ tên hoặc SKU sản phẩm để tìm kiếm..."
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg max-h-60 overflow-y-auto">
          {data?.data && data.data.length > 0 ? (
            data.data.map((p: any) => (
              <button
                key={p.product_id}
                onClick={() => {
                  onChange({ product_id: p.product_id, name: p.displayName || p.name, sku: p.sku || '' });
                  setQ('');
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 border-b border-slate-50 last:border-b-0"
              >
                <div className="truncate flex-1 pr-2">
                  <span className="font-medium text-slate-900 truncate block sm:inline">{p.displayName || p.name}</span>
                  {p.sku && <span className="ml-2 text-xs text-slate-400 font-mono">({p.sku})</span>}
                </div>
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-xs text-slate-400 text-center">Gõ để tìm kiếm...</p>
          )}
        </div>
      )}
    </div>
  );
}

interface PRItem {
  id?: string;
  product_id: string;
  product_name: string;
  qty: string;
  estimated_unit_price: string;
  line_total: string;
}

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: 'DRAFT', label: 'Bản nháp' },
  { value: 'PENDING_PRICING', label: 'Chờ báo giá & NCC' },
  { value: 'PENDING_KTT', label: 'Chờ KTT duyệt' },
  { value: 'PENDING_GD', label: 'Chờ Giám đốc duyệt' },
  { value: 'APPROVED', label: 'Đã duyệt (Chờ tạo PO)' },
  { value: 'CONVERTED_TO_PO', label: 'Đã chuyển thành PO' },
  { value: 'REJECTED', label: 'Đã từ chối' },
];

export function PRClient({ shopId, userId }: Props) {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearchId = searchParams.get('search');

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Form State for raising new PR
  const [slideOpen, setSlideOpen] = useState(false);
  const [note, setNote] = useState('');
  const [selectedItems, setSelectedItems] = useState<PRItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<{ product_id: string; name: string; sku: string } | null>(null);
  const [newItemQty, setNewItemQty] = useState('1');

  // Detail View State
  const [detailPr, setDetailPr] = useState<Record<string, string> | null>(null);
  const [detailItems, setDetailItems] = useState<Record<string, string>[]>([]);
  const [detailSlideOpen, setDetailSlideOpen] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);

  // Automatically fetch and open detail if a search ID is provided in URL query string without filtering the main table
  useEffect(() => {
    if (initialSearchId && initialSearchId.startsWith('PR-')) {
      const fetchPrAndOpenDetail = async () => {
        try {
          const res = await fetch(`/api/shops/${shopId}/p2p?entity=purchase-requisitions&search=${initialSearchId}`);
          if (res.ok) {
            const json = await res.json();
            const foundPr = json?.data?.find((r: any) => r.id === initialSearchId);
            if (foundPr) {
              openDetail(foundPr);
            }
          }
        } catch (e) {
          console.error('Error fetching initial PR from URL:', e);
        }
      };
      fetchPrAndOpenDetail();
    }
  }, [initialSearchId, shopId]);

  // Fetch related PO for this PR
  const { data: relatedPoData } = useQuery({
    queryKey: ['related-po', shopId, detailPr?.id],
    queryFn: async () => {
      if (!detailPr?.id) return null;
      const sp = new URLSearchParams({
        entity: 'purchase-orders',
        limit: '1',
        filters: JSON.stringify({ requisition_id: detailPr.id }),
      });
      const res = await fetch(`/api/shops/${shopId}/p2p?${sp}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data?.[0] || null;
    },
    enabled: !!detailPr?.id && detailSlideOpen,
  });

  // Fetch related GRN for the related PO
  const { data: relatedGrnData } = useQuery({
    queryKey: ['related-grn-for-po', shopId, relatedPoData?.id],
    queryFn: async () => {
      if (!relatedPoData?.id) return null;
      const sp = new URLSearchParams({
        entity: 'goods-receipt-notes',
        limit: '1',
        filters: JSON.stringify({ purchase_order_id: relatedPoData.id }),
      });
      const res = await fetch(`/api/shops/${shopId}/p2p?${sp}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data?.[0] || null;
    },
    enabled: !!relatedPoData?.id && detailSlideOpen,
  });

  const handleFlowNavigate = (type: 'PR' | 'PO' | 'GRN', id: string) => {
    if (type === 'PR') {
      const found = data?.data?.find(r => r.id === id);
      if (found) openDetail(found);
    } else {
      const targetPath = pathname.replace('/pr', `/${type.toLowerCase()}`) + `?search=${id}`;
      router.push(targetPath);
      setDetailSlideOpen(false);
    }
  };

  // Price assignment form
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({}); // itemId -> estimated_unit_price
  const [selectedSupplierId, setSelectedSupplierId] = useState('');

  // Confirm dialog state
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void | Promise<void>;
    variant?: 'danger' | 'default';
  }>({
    open: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  // Quick Add Supplier Form State
  const [quickAddSupplierOpen, setQuickAddSupplierOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierAddress, setNewSupplierAddress] = useState('');

  // Rejection Dialog State
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Fetch PRs
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['purchase-requisitions', shopId, page, debouncedSearch, statusFilter],
    queryFn: async () => {
      const sp = new URLSearchParams({
        entity: 'purchase-requisitions',
        page: String(page),
        limit: '50',
      });
      if (debouncedSearch) sp.set('search', debouncedSearch);
      
      const filters: Record<string, string> = {};
      if (statusFilter !== 'ALL') {
        filters.status = statusFilter;
      }
      if (Object.keys(filters).length > 0) {
        sp.set('filters', JSON.stringify(filters));
      }

      const res = await fetch(`/api/shops/${shopId}/p2p?${sp}`);
      if (!res.ok) throw new Error('Không tải được danh sách PR');
      return res.json() as Promise<{ data: Record<string, string>[]; total: number }>;
    },
  });

  // Fetch Products for dropdown
  const { data: productsData } = useQuery({
    queryKey: ['products', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/products?limit=200`);
      if (!res.ok) throw new Error('Không tải được danh sách sản phẩm');
      return res.json() as Promise<{ data: Record<string, string>[] }>;
    },
  });

  // Fetch Suppliers for dropdown
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/suppliers?limit=200`);
      if (!res.ok) throw new Error('Không tải được danh sách nhà cung cấp');
      return res.json() as Promise<{ data: Record<string, string>[] }>;
    },
  });

  // Fetch user details / role inside tenant
  const { data: permissionsData } = useQuery({
    queryKey: ['user-permissions', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/settings`); // Contains current shop metadata
      return res.json();
    },
  });

  const hasPricingPermission = useMemo(() => {
    return permissionsData?.permissions?.some((p: string) =>
      ['admin', 'owner', 'purchaser', 'purchasing.manage'].includes(p)
    ) || false;
  }, [permissionsData]);

  const hasKttPermission = useMemo(() => {
    return permissionsData?.permissions?.some((p: string) =>
      ['admin', 'owner', 'chief_accountant'].includes(p)
    ) || false;
  }, [permissionsData]);

  const hasGdPermission = useMemo(() => {
    return permissionsData?.permissions?.some((p: string) =>
      ['admin', 'owner'].includes(p)
    ) || false;
  }, [permissionsData]);

  const canViewPricing = useMemo(() => {
    return permissionsData?.permissions?.some((p: string) =>
      ['admin', 'owner', 'purchaser', 'purchasing.manage', 'chief_accountant', 'settings.manage'].includes(p)
    ) || false;
  }, [permissionsData]);

  // Actions Mutations
  const createPRMutation = useMutation({
    mutationFn: async (payload: { note: string; items: PRItem[]; status?: string }) => {
      const headerRes = await fetch(`/api/shops/${shopId}/p2p`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_PR',
          data: {
            note: payload.note,
            status: payload.status || 'DRAFT',
            items: payload.items.map(item => ({
              product_id: item.product_id,
              product_name: item.product_name,
              qty: item.qty,
            })),
          },
        }),
      });
      if (!headerRes.ok) {
        const errJson = await headerRes.json().catch(() => ({}));
        throw new Error(errJson.error ?? 'Tạo phiếu đề xuất PR thất bại');
      }
      return headerRes.json();
    },
    onSuccess: (data) => {
      toast.success(
        data.status === 'PENDING_PRICING'
          ? 'Đã tạo và gửi phê duyệt đề xuất PR thành công'
          : 'Đã tạo đề xuất PR bản nháp thành công'
      );
      setSlideOpen(false);
      setNote('');
      setSelectedItems([]);
      setConfirmState(prev => ({ ...prev, open: false }));
      queryClient.invalidateQueries({ queryKey: ['purchase-requisitions', shopId] });
    },
    onError: (err) => {
      toast.error(err.message);
      setConfirmState(prev => ({ ...prev, open: false }));
    },
  });

  const transitionPRMutation = useMutation({
    mutationFn: async (payload: { prId: string; prAction: string; data?: any }) => {
      const res = await fetch(`/api/shops/${shopId}/p2p`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'TRANSITION_PR',
          prId: payload.prId,
          prAction: payload.prAction,
          payload: payload.data,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error ?? 'Duyệt chuyển trạng thái thất bại');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success('Đã chuyển tiếp trạng thái thành công');
      setDetailSlideOpen(false);
      setConfirmState(prev => ({ ...prev, open: false }));
      setRejectDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['purchase-requisitions', shopId] });
    },
    onError: (err) => {
      toast.error(err.message);
      setConfirmState(prev => ({ ...prev, open: false }));
      setRejectDialogOpen(false);
    },
  });

  const convertToPOMutation = useMutation({
    mutationFn: async (payload: { prId: string; supplierId: string; supplierName: string }) => {
      const res = await fetch(`/api/shops/${shopId}/p2p`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_PO_FROM_PR',
          prId: payload.prId,
          supplierId: payload.supplierId,
          supplierName: payload.supplierName,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error ?? 'Chuyển đổi thành đơn PO thất bại');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Đã tạo đơn đặt hàng PO thành công');
      setDetailSlideOpen(false);
      setConfirmState(prev => ({ ...prev, open: false }));
      queryClient.invalidateQueries({ queryKey: ['purchase-requisitions', shopId] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', shopId] });
    },
    onError: (err) => {
      toast.error(err.message);
      setConfirmState(prev => ({ ...prev, open: false }));
    },
  });

  const deletePRMutation = useMutation({
    mutationFn: async (prId: string) => {
      const res = await fetch(`/api/shops/${shopId}/p2p`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'DELETE',
          entity: 'purchase-requisitions',
          id: prId,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error ?? 'Xóa phiếu đề xuất thất bại');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Đã xóa phiếu đề xuất PR thành công');
      setDetailSlideOpen(false);
      setConfirmState(prev => ({ ...prev, open: false }));
      queryClient.invalidateQueries({ queryKey: ['purchase-requisitions', shopId] });
    },
    onError: (err) => {
      toast.error(err.message);
      setConfirmState(prev => ({ ...prev, open: false }));
    },
  });

  const createSupplierMutation = useMutation({
    mutationFn: async (payload: { name: string; phone?: string; address?: string }) => {
      const res = await fetch(`/api/shops/${shopId}/p2p`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE',
          entity: 'suppliers',
          data: {
            name: payload.name,
            phone: payload.phone || '',
            address: payload.address || '',
            debt_amount: '0',
          },
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error ?? 'Thêm nhà cung cấp mới thất bại');
      }
      return res.json();
    },
    onSuccess: (newSupplier) => {
      toast.success('Đã thêm nhà cung cấp mới thành công');
      queryClient.invalidateQueries({ queryKey: ['suppliers', shopId] });
      setSelectedSupplierId(newSupplier.id);
      setQuickAddSupplierOpen(false);
      setNewSupplierName('');
      setNewSupplierPhone('');
      setNewSupplierAddress('');
      setConfirmState(prev => ({ ...prev, open: false }));
    },
    onError: (err) => {
      toast.error(err.message);
      setConfirmState(prev => ({ ...prev, open: false }));
    },
  });

  // Handle viewing PR details
  async function openDetail(pr: Record<string, string>) {
    setDetailPr(pr);
    setDetailSlideOpen(true);
    setLoadingItems(true);
    try {
      // Fetch items
      const sp = new URLSearchParams({
        entity: 'purchase-requisition-items',
        limit: '100',
        filters: JSON.stringify({ requisition_id: pr.id }),
      });
      const res = await fetch(`/api/shops/${shopId}/p2p?${sp}`);
      if (res.ok) {
        const json = await res.json();
        setDetailItems(json.data);
        // Initialize price assignment form inputs with existing values if any
        const edits: Record<string, string> = {};
        json.data.forEach((item: any) => {
          edits[item.id] = item.estimated_unit_price || '0';
        });
        setPriceEdits(edits);
      }
    } catch (err) {
      console.error(err);
      toast.error('Lỗi tải chi tiết mặt hàng');
    } finally {
      setLoadingItems(false);
    }
  }

  // Handle adding item in creation form
  function handleAddItem() {
    if (!selectedProduct) return;

    // Check if already added
    if (selectedItems.some((item) => item.product_id === selectedProduct.product_id)) {
      toast.error('Sản phẩm này đã có trong danh sách');
      return;
    }

    const item: PRItem = {
      product_id: selectedProduct.product_id,
      product_name: selectedProduct.name,
      qty: newItemQty,
      estimated_unit_price: '0',
      line_total: '0',
    };

    setSelectedItems((prev) => [...prev, item]);
    setSelectedProduct(null);
    setNewItemQty('1');
  }

  function handleRemoveItem(productId: string) {
    setSelectedItems((prev) => prev.filter((i) => i.product_id !== productId));
  }

  // Table Columns config
  const columns = useMemo<Column<Record<string, string>>[]>(() => [
    { key: 'id', label: 'Mã PR', render: (row) => <CopyableId id={row.id} className="text-sm font-semibold text-slate-800" /> },
    {
      key: 'creator_name',
      label: 'Người đề xuất',
      render: (row) => (
        <span className="text-sm font-semibold text-slate-700">
          {row.creator_name || row.created_by || '---'}
        </span>
      ),
    },
    { key: 'note', label: 'Lý do / Mô tả', render: (row) => <span className="text-slate-700">{row.note || '---'}</span> },
    {
      key: 'estimated_total',
      label: 'Tổng tiền (Dự kiến)',
      render: (row) => {
        const hasEstimated = row.estimated_total && parseFloat(row.estimated_total) > 0;
        if (!hasEstimated) return <span className="text-slate-500 italic">Chưa báo giá</span>;
        
        return (
          <span className="font-semibold text-slate-900">
            {canViewPricing ? (
              parseFloat(row.estimated_total).toLocaleString('vi-VN') + ' đ'
            ) : (
              <span className="text-slate-400 italic inline-flex items-center gap-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline text-slate-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> ***.***
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (row) => {
        const s = row.status || 'DRAFT';
        let color: 'gray' | 'yellow' | 'orange' | 'green' | 'blue' | 'red' = 'gray';
        let text = s;
        if (s === 'DRAFT') {
          color = 'gray';
          text = 'Bản nháp';
        } else if (s === 'PENDING_PRICING') {
          color = 'yellow';
          text = 'Chờ báo giá';
        } else if (s === 'PENDING_KTT') {
          color = 'orange';
          text = 'Chờ KTT duyệt';
        } else if (s === 'PENDING_GD') {
          color = 'yellow';
          text = 'Chờ GĐ duyệt';
        } else if (s === 'APPROVED') {
          color = 'green';
          text = 'Đã duyệt';
        } else if (s === 'CONVERTED_TO_PO') {
          color = 'blue';
          text = 'Đã lập PO';
        } else if (s === 'REJECTED') {
          color = 'red';
          text = 'Từ chối';
        }
        return <TagBadge label={text} color={color} />;
      },
    },
    {
      key: 'created_at',
      label: 'Ngày tạo',
      render: (row) => <span className="text-xs text-slate-500">{new Date(row.created_at).toLocaleDateString('vi-VN')}</span>,
    },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <button
          onClick={() => openDetail(row)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-primary shadow-sm hover:bg-slate-50 transition-colors"
        >
          Chi tiết
        </button>
      ),
    },
  ], [canViewPricing, openDetail]);

  // Extract rejection reason from the note field if present
  const parsedNote = useMemo(() => {
    if (!detailPr?.note) return { mainReason: '---', rejectReason: null };
    const parts = detailPr.note.split(' | Lý do từ chối: ');
    return {
      mainReason: parts[0] || '---',
      rejectReason: parts[1] || null,
    };
  }, [detailPr]);

  // Compute estimated total for assignment
  const computedAssignmentTotal = useMemo(() => {
    let sum = 0;
    detailItems.forEach((item) => {
      const pr = parseFloat(priceEdits[item.id] || '0');
      const q = parseFloat(item.qty || '0');
      sum += pr * q;
    });
    return sum;
  }, [detailItems, priceEdits]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Yêu cầu mua sắm (PR)</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Quản lý quy trình đề xuất mua nguyên vật liệu và duyệt hạn mức mua hàng.
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedItems([]);
            setNote('');
            setSlideOpen(true);
          }}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark shadow-sm transition-colors"
        >
          + Tạo đề xuất
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex-1">
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Tìm kiếm đề xuất..." />
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value); setPage(1); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                statusFilter === opt.value
                  ? 'bg-primary border-primary text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        onRowClick={(row) => openDetail(row)}
        pagination={{
          page,
          total: data?.total ?? 0,
          pageSize: 50,
          onChange: setPage,
        }}
        emptyState={
          <EmptyState
            title="Chưa có yêu cầu mua sắm nào"
            description="Hãy nhấn '+ Tạo đề xuất' để tạo phiếu PR đầu tiên của bạn."
          />
        }
        rowKey={(row) => row.id}
      />

      {/* Create PR SlideOver */}
      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title="Lập yêu cầu mua sắm (PR)"
        width={640}
        footer={
          <div className="flex justify-end gap-2 w-full flex-wrap">
            <button
              onClick={() => setSlideOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={() => {
                if (selectedItems.length === 0) {
                  toast.error('Vui lòng chọn ít nhất một sản phẩm cần mua.');
                  return;
                }
                createPRMutation.mutate({ note, items: selectedItems, status: 'DRAFT' });
              }}
              disabled={createPRMutation.isPending}
              className="rounded-xl bg-slate-100 border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 shadow-sm transition-colors disabled:opacity-50"
            >
              Lưu bản nháp
            </button>
            <button
              onClick={() => {
                if (selectedItems.length === 0) {
                  toast.error('Vui lòng chọn ít nhất một sản phẩm cần mua.');
                  return;
                }
                setConfirmState({
                  open: true,
                  title: 'Gửi phê duyệt Đề xuất?',
                  description: 'Bạn có chắc chắn muốn lập phiếu và gửi đề xuất mua hàng PR này tới phòng mua sắm để báo giá?',
                  onConfirm: () => {
                    createPRMutation.mutate({ note, items: selectedItems, status: 'PENDING_PRICING' });
                  }
                });
              }}
              disabled={createPRMutation.isPending}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark shadow-sm transition-colors disabled:opacity-50"
            >
              {createPRMutation.isPending ? 'Đang gửi...' : 'Gửi phê duyệt'}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Lý do mua hàng / Mô tả chi tiết *</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none shadow-inner"
              placeholder="Ví dụ: Nhập bổ sung hạt cà phê Robusta phục vụ mùa cao điểm du lịch hè..."
            />
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-sm font-bold text-slate-800 mb-2">Chọn sản phẩm cần mua</h3>
            <div className="flex gap-2 mb-3">
              <ProductSelect
                shopId={shopId}
                value={selectedProduct}
                onChange={setSelectedProduct}
              />
              <input
                type="number"
                value={newItemQty}
                onChange={(e) => setNewItemQty(e.target.value)}
                className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none shadow-inner text-center"
                min="1"
              />
              <button
                type="button"
                onClick={handleAddItem}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
              >
                Thêm
              </button>
            </div>

            {/* List selected items */}
            {selectedItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                Danh sách hàng hóa trống. Hãy chọn sản phẩm ở trên.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                {selectedItems.map((item) => (
                  <div key={item.product_id} className="flex items-center justify-between p-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{item.product_name}</div>
                      <div className="text-xs text-slate-500">Số lượng đề xuất: <span className="font-bold text-slate-700">{item.qty}</span></div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.product_id)}
                      className="text-xs text-red-500 font-semibold hover:underline"
                    >
                      Xóa
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SlideOver>

      {/* Details & Actions SlideOver */}
      <SlideOver
        open={detailSlideOpen}
        onClose={() => setDetailSlideOpen(false)}
        title={`Chi tiết Đề xuất PR #${detailPr?.id}`}
        width={640}
        footer={
          <div className="flex justify-end gap-2 w-full flex-wrap">
            <button
              onClick={() => setDetailSlideOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Đóng
            </button>

            {/* Delete draft PR (only if in DRAFT status) */}
            {detailPr?.status === 'DRAFT' && (
              <button
                onClick={() => {
                  if (detailPr?.id) {
                    setConfirmState({
                      open: true,
                      title: 'Xóa đề xuất mua sắm?',
                      description: 'Bạn có chắc chắn muốn xóa vĩnh viễn phiếu đề xuất PR (bản nháp) này? Hành động này không thể hoàn tác.',
                      variant: 'danger',
                      onConfirm: () => {
                        deletePRMutation.mutate(detailPr.id);
                      }
                    });
                  }
                }}
                disabled={deletePRMutation.isPending}
                className="rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
              >
                Xóa phiếu
              </button>
            )}

            {/* State actions based on roles */}
            {detailPr?.status === 'DRAFT' && (
              <button
                onClick={() => {
                  if (detailPr?.id) {
                    setConfirmState({
                      open: true,
                      title: 'Gửi phê duyệt Đề xuất?',
                      description: 'Bạn có chắc chắn muốn gửi đề xuất PR này tới phòng mua sắm để báo giá và tìm kiếm nhà cung cấp?',
                      onConfirm: () => {
                        transitionPRMutation.mutate({ prId: detailPr.id, prAction: 'SUBMIT' });
                      }
                    });
                  }
                }}
                disabled={transitionPRMutation.isPending}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 shadow-sm transition-colors disabled:opacity-50"
              >
                Gửi phê duyệt
              </button>
            )}

            {/* Recall PR button when in PENDING_PRICING and user is the creator or store owner/admin */}
            {detailPr?.status === 'PENDING_PRICING' && (detailPr?.created_by === userId || permissionsData?.permissions?.includes('admin') || permissionsData?.permissions?.includes('owner')) && (
              <button
                onClick={() => {
                  if (detailPr?.id) {
                    setConfirmState({
                      open: true,
                      title: 'Thu hồi Đề xuất PR?',
                      description: 'Bạn có chắc chắn muốn thu hồi phiếu đề xuất PR này về trạng thái (bản nháp) để chỉnh sửa? Bộ phận thu mua sẽ không thể xem hoặc báo giá cho phiếu này cho đến khi bạn gửi lại.',
                      onConfirm: () => {
                        transitionPRMutation.mutate({ prId: detailPr.id, prAction: 'RECALL' });
                      }
                    });
                  }
                }}
                disabled={transitionPRMutation.isPending}
                className="rounded-xl bg-slate-100 border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                Thu hồi phiếu
              </button>
            )}

            {detailPr?.status === 'PENDING_PRICING' && hasPricingPermission && (
              <>
                <button
                  onClick={() => {
                    if (!selectedSupplierId) {
                      toast.error('Vui lòng chọn một Nhà cung cấp để báo giá.');
                      return;
                    }
                    const payloadItems = detailItems.map((item) => {
                      const price = priceEdits[item.id] || '0';
                      const q = parseFloat(item.qty || '0');
                      return {
                        id: item.id,
                        estimated_unit_price: price,
                        line_total: String(parseFloat(price) * q),
                      };
                    });

                    setConfirmState({
                      open: true,
                      title: 'Báo giá & Trình duyệt?',
                      description: 'Bạn có chắc chắn muốn báo giá và chuyển tiếp đề xuất PR này cho Kế toán trưởng duyệt cấp 1?',
                      onConfirm: () => {
                        transitionPRMutation.mutate({
                          prId: detailPr.id,
                          prAction: 'ASSIGN_PRICE',
                          data: {
                            estimated_total: String(computedAssignmentTotal),
                            items: payloadItems,
                          },
                        });
                      }
                    });
                  }}
                  disabled={transitionPRMutation.isPending}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark shadow-sm transition-colors"
                >
                  Báo giá & Chuyển KTT Duyệt
                </button>
              </>
            )}

            {detailPr?.status === 'PENDING_KTT' && hasKttPermission && (
              <>
                <button
                  onClick={() => {
                    if (detailPr?.id) {
                      setRejectReason('');
                      setRejectDialogOpen(true);
                    }
                  }}
                  disabled={transitionPRMutation.isPending}
                  className="rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
                >
                  Từ chối
                </button>
                <button
                  onClick={() => {
                    if (detailPr?.id) {
                      setConfirmState({
                        open: true,
                        title: 'Duyệt đề xuất (Cấp 1)?',
                        description: 'Bạn có chắc chắn muốn phê duyệt đề xuất PR này ở cấp Kế toán trưởng và chuyển tiếp lên Giám đốc duyệt?',
                        onConfirm: () => {
                          transitionPRMutation.mutate({ prId: detailPr.id, prAction: 'APPROVE_KTT' });
                        }
                      });
                    }
                  }}
                  disabled={transitionPRMutation.isPending}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark shadow-sm transition-colors"
                >
                  Duyệt cấp 1 (KTT)
                </button>
              </>
            )}

            {detailPr?.status === 'PENDING_GD' && hasGdPermission && (
              <>
                <button
                  onClick={() => {
                    if (detailPr?.id) {
                      setRejectReason('');
                      setRejectDialogOpen(true);
                    }
                  }}
                  disabled={transitionPRMutation.isPending}
                  className="rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
                >
                  Từ chối
                </button>
                <button
                  onClick={() => {
                    if (detailPr?.id) {
                      setConfirmState({
                        open: true,
                        title: 'Phê duyệt chính thức?',
                        description: 'Bạn có chắc chắn muốn phê duyệt chính thức đề xuất PR này để chuẩn bị lập đơn đặt hàng PO?',
                        onConfirm: () => {
                          transitionPRMutation.mutate({ prId: detailPr.id, prAction: 'APPROVE_GD' });
                        }
                      });
                    }
                  }}
                  disabled={transitionPRMutation.isPending}
                  className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 shadow-sm transition-colors"
                >
                  Phê duyệt chính thức (GD)
                </button>
              </>
            )}

          </div>
        }
      >
        <div className="space-y-4">

          <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-slate-500">Mã đề xuất PR:</span>
              <span className="font-semibold text-slate-800">
                {detailPr?.id ? (
                  <CopyableId id={detailPr.id} className="text-sm font-semibold text-slate-800" />
                ) : '---'}
              </span>

              <span className="text-slate-500">Ngày lập:</span>
              <span className="font-semibold text-slate-800">
                {detailPr?.created_at ? (
                  new Date(detailPr.created_at).toLocaleString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                  })
                ) : '---'}
              </span>

              <span className="text-slate-500">Cập nhật cuối:</span>
              <span className="font-semibold text-slate-800">
                {detailPr?.updated_at ? (
                  new Date(detailPr.updated_at).toLocaleString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                  })
                ) : '---'}
              </span>

              <span className="text-slate-500">Người tạo:</span>
              <span className="font-semibold text-slate-800">{detailPr?.creator_name || detailPr?.created_by || 'N/A'}</span>
              
              <span className="text-slate-500">Mô tả lý do:</span>
              <span className="font-semibold text-slate-800">{parsedNote.mainReason}</span>
              
              <span className="text-slate-500">Hạn mức dự kiến:</span>
              <span className="font-semibold text-slate-800 text-primary">
                {detailPr?.estimated_total && parseFloat(detailPr?.estimated_total) > 0 ? (
                  canViewPricing ? (
                    parseFloat(detailPr?.estimated_total).toLocaleString('vi-VN') + ' đ'
                  ) : (
                    <span className="text-slate-400 italic inline-flex items-center gap-0.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline text-slate-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> ***.*** đ
                    </span>
                  )
                ) : (
                  'Chưa có báo giá'
                )}
              </span>

              <span className="text-slate-500">Trạng thái:</span>
              <span>
                {(() => {
                  const s = detailPr?.status || 'DRAFT';
                  let color: 'gray' | 'yellow' | 'orange' | 'green' | 'blue' | 'red' = 'gray';
                  let text = s;
                  if (s === 'DRAFT') {
                    color = 'gray';
                    text = 'Bản nháp';
                  } else if (s === 'PENDING_PRICING') {
                    color = 'yellow';
                    text = 'Chờ báo giá';
                  } else if (s === 'PENDING_KTT') {
                    color = 'orange';
                    text = 'Chờ KTT duyệt';
                  } else if (s === 'PENDING_GD') {
                    color = 'yellow';
                    text = 'Chờ GĐ duyệt';
                  } else if (s === 'APPROVED') {
                    color = 'green';
                    text = 'Đã duyệt';
                  } else if (s === 'CONVERTED_TO_PO') {
                    color = 'blue';
                    text = 'Đã lập PO';
                  } else if (s === 'REJECTED') {
                    color = 'red';
                    text = 'Từ chối';
                  }
                  return <TagBadge label={text} color={color} />;
                })()}
              </span>
            </div>

            {parsedNote.rejectReason && (
              <div className="mt-3 rounded-xl bg-red-50 p-3 border border-red-200 text-xs text-red-800 flex flex-col gap-1 shadow-sm animate-pulse">
                <span className="font-bold flex items-center gap-1 text-red-900">
                  🚫 Đề xuất bị Từ chối
                </span>
                <span>
                  Lý do từ chối: <span className="font-semibold italic text-red-950">"{parsedNote.rejectReason}"</span>
                </span>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Danh sách hàng hóa chi tiết</h3>
            
            {loadingItems ? (
              <div className="animate-pulse space-y-4 py-4">
                <div className="h-4 bg-slate-200 rounded w-1/3 animate-bounce"></div>
                <div className="space-y-3">
                  <div className="h-12 bg-slate-200 rounded-xl"></div>
                  <div className="h-12 bg-slate-200 rounded-xl"></div>
                  <div className="h-12 bg-slate-200 rounded-xl"></div>
                </div>
              </div>
            ) : (
              <>
                {/* If state is PENDING_PRICING, we allow writing prices & choosing a Supplier */}
                {detailPr?.status === 'PENDING_PRICING' && hasPricingPermission ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 p-3 bg-slate-50 space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="block text-xs font-bold text-slate-700">1. Sourcing Báo giá & Nhà Cung Cấp</label>
                        <button
                          type="button"
                          onClick={() => setQuickAddSupplierOpen(true)}
                          className="text-xs text-primary font-bold hover:underline"
                        >
                          + Thêm nhanh NCC
                        </button>
                      </div>
                      <select
                        value={selectedSupplierId}
                        onChange={(e) => setSelectedSupplierId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white shadow-sm"
                      >
                        <option value="">-- Chọn Nhà cung cấp --</option>
                        {suppliersData?.data.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-3">
                      <label className="block text-xs font-bold text-slate-700">2. Điền đơn giá của Nhà Cung Cấp cấp cho từng mặt hàng</label>
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                        {detailItems.map((item) => (
                          <div key={item.id} className="p-3 flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <span className="text-sm font-semibold text-slate-800">{item.product_name}</span>
                              <div className="text-xs text-slate-500">Số lượng: <span className="font-bold">{item.qty}</span></div>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={
                                  priceEdits[item.id] && priceEdits[item.id] !== '0'
                                    ? parseInt(priceEdits[item.id], 10).toLocaleString('vi-VN')
                                    : priceEdits[item.id] === '0' ? '0' : ''
                                }
                                onChange={(e) => {
                                  const rawVal = e.target.value.replace(/\D/g, '');
                                  setPriceEdits((prev) => ({ ...prev, [item.id]: rawVal || '0' }));
                                }}
                                className="w-32 rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none text-right"
                                placeholder="0"
                              />
                              <span className="text-xs text-slate-400">đ</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-150">
                        <span className="text-sm font-semibold text-slate-600">Tổng cộng (Dự toán):</span>
                        <span className="text-lg font-bold text-primary">{computedAssignmentTotal.toLocaleString('vi-VN')} đ</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {detailItems.map((item) => (
                      <div key={item.id} className="p-3 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{item.product_name}</div>
                          <div className="text-xs text-slate-500">Số lượng đặt: <span className="font-bold text-slate-700">{item.qty}</span></div>
                        </div>
                        {item.estimated_unit_price && parseFloat(item.estimated_unit_price) > 0 ? (
                          <div className="text-right">
                            <div className="text-sm font-semibold text-slate-800">
                              {canViewPricing ? (
                                <>{parseFloat(item.estimated_unit_price).toLocaleString('vi-VN')} đ</>
                              ) : (
                                <span className="text-slate-400 italic inline-flex items-center gap-0.5">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline text-slate-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> ***.***
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {canViewPricing ? (
                                <>Tổng: { (parseFloat(item.estimated_unit_price) * parseFloat(item.qty || '0')).toLocaleString('vi-VN') } đ</>
                              ) : (
                                <span className="text-slate-400 italic inline-flex items-center gap-0.5">
                                  Tổng: <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline text-slate-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> ***.*** đ
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs italic text-slate-400">Chưa báo giá</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {detailPr?.status === 'APPROVED' && hasPricingPermission && (
            <div className="rounded-xl bg-primary-50/20 p-4 border border-primary/30 mt-4 space-y-3 shadow-sm">
              <label className="block text-sm font-bold text-slate-800">
                Chọn Nhà Cung Cấp chính thức để lập Đơn đặt hàng (PO) *
              </label>
              <div className="flex flex-col gap-3">
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full rounded-xl border border-primary/30 px-3 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-white shadow-sm transition-all"
                >
                  <option value="">-- Chọn Nhà cung cấp --</option>
                  {suppliersData?.data.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (!selectedSupplierId) {
                      toast.error('Vui lòng chọn một nhà cung cấp.');
                      return;
                    }
                    const sup = suppliersData?.data.find((s) => s.id === selectedSupplierId);
                    if (detailPr?.id && sup) {
                      setConfirmState({
                        open: true,
                        title: 'Lập Đơn đặt hàng PO?',
                        description: `Bạn có chắc chắn muốn lập đơn đặt hàng PO chính thức gửi tới nhà cung cấp "${sup.name}"?`,
                        onConfirm: () => {
                          convertToPOMutation.mutate({
                            prId: detailPr.id,
                            supplierId: sup.id,
                            supplierName: sup.name,
                          });
                        }
                      });
                    }
                  }}
                  disabled={convertToPOMutation.isPending}
                  className="w-full rounded-xl bg-primary py-2.5 px-4 text-sm font-semibold text-white hover:bg-primary-dark shadow-md hover:shadow transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline text-white"><path d="M12 5v14M5 12h14" /></svg>
                  Lập Đơn đặt hàng (PO)
                </button>
              </div>
            </div>
          )}

          <div className="border-t border-slate-100 pt-4">
            <DocumentFlowMap
              currentType="PR"
              pr={detailPr ? {
                id: detailPr.id,
                status: detailPr.status,
                createdAt: detailPr.created_at,
                creatorName: detailPr.creator_name,
                amount: detailPr.estimated_total
              } : null}
              po={relatedPoData ? {
                id: relatedPoData.id,
                status: relatedPoData.status,
                createdAt: relatedPoData.created_at,
                supplierName: relatedPoData.supplier_name,
                amount: relatedPoData.total_amount
              } : null}
              grn={relatedGrnData ? {
                id: relatedGrnData.id,
                status: relatedGrnData.status,
                createdAt: relatedGrnData.created_at
              } : null}
              onNavigate={handleFlowNavigate}
            />
          </div>
        </div>
      </SlideOver>

      {/* Quick Add Supplier Dialog */}
      <ConfirmDialog
        open={quickAddSupplierOpen}
        onClose={() => setQuickAddSupplierOpen(false)}
        onConfirm={() => {
          if (!newSupplierName.trim()) {
            toast.error('Vui lòng điền tên Nhà cung cấp');
            return;
          }
          setConfirmState({
            open: true,
            title: 'Thêm nhà cung cấp mới?',
            description: `Bạn có chắc chắn muốn thêm nhà cung cấp "${newSupplierName}" vào danh mục hệ thống?`,
            onConfirm: () => {
              createSupplierMutation.mutate({
                name: newSupplierName,
                phone: newSupplierPhone,
                address: newSupplierAddress,
              });
            }
          });
        }}
        title="Thêm nhanh Nhà cung cấp"
        confirmLabel="Lưu lại"
        cancelLabel="Hủy"
        loading={createSupplierMutation.isPending}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Tên nhà cung cấp *</label>
            <input
              type="text"
              value={newSupplierName}
              onChange={(e) => setNewSupplierName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Ví dụ: Công ty TNHH Cà phê Việt"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Số điện thoại</label>
            <input
              type="text"
              value={newSupplierPhone}
              onChange={(e) => setNewSupplierPhone(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Ví dụ: 0987654321"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Địa chỉ</label>
            <textarea
              value={newSupplierAddress}
              onChange={(e) => setNewSupplierAddress(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none"
              placeholder="Ví dụ: 123 Đường Lê Lợi, Quận 1, TP. HCM"
            />
          </div>
        </div>
      </ConfirmDialog>

      {/* Global Action Confirm Dialog */}
      <ConfirmDialog
        open={confirmState.open}
        onClose={() => setConfirmState(prev => ({ ...prev, open: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        description={confirmState.description}
        variant={confirmState.variant}
        confirmLabel="Xác nhận"
        cancelLabel="Hủy"
        loading={transitionPRMutation.isPending || convertToPOMutation.isPending || deletePRMutation.isPending}
      />

      {/* Rejection Dialog with Textarea for entering note */}
      <ConfirmDialog
        open={rejectDialogOpen}
        onClose={() => setRejectDialogOpen(false)}
        onConfirm={() => {
          if (!rejectReason.trim()) {
            toast.error('Vui lòng điền lý do từ chối để bộ phận đề xuất nắm bắt thông tin.');
            return;
          }
          transitionPRMutation.mutate({
            prId: detailPr?.id || '',
            prAction: 'REJECT',
            data: { note: (detailPr?.note || '') + ` | Lý do từ chối: ${rejectReason}` },
          });
        }}
        title="Từ chối Đề xuất mua sắm"
        confirmLabel="Xác nhận từ chối"
        cancelLabel="Hủy"
        variant="danger"
        loading={transitionPRMutation.isPending}
      >
        <div className="mt-2 space-y-2">
          <label className="block text-xs font-bold text-slate-700">Lý do từ chối *</label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none resize-none shadow-sm"
            placeholder="Nhập lý do từ chối chi tiết..."
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
