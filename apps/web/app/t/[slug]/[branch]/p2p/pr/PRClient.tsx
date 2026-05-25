'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useDebounce } from 'use-debounce';
import { DataTable, type Column } from '@/app/components/ui/DataTable';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog';
import { SearchBar } from '@/app/components/ui/SearchBar';
import { TagBadge } from '@/app/components/ui/TagBadge';

interface Props {
  shopId: string;
  shopName: string;
  userId: string;
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
  { value: 'PENDING_PRICING', label: 'Chờ gán giá & NCC' },
  { value: 'PENDING_KTT', label: 'Chờ KTT duyệt' },
  { value: 'PENDING_GD', label: 'Chờ Giám đốc duyệt' },
  { value: 'APPROVED', label: 'Đã duyệt (Chờ tạo PO)' },
  { value: 'CONVERTED_TO_PO', label: 'Đã chuyển thành PO' },
  { value: 'REJECTED', label: 'Đã từ chối' },
];

export function PRClient({ shopId, userId }: Props) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Form State for raising new PR
  const [slideOpen, setSlideOpen] = useState(false);
  const [note, setNote] = useState('');
  const [selectedItems, setSelectedItems] = useState<PRItem[]>([]);
  const [newItemProductId, setNewItemProductId] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');

  // Detail View State
  const [detailPr, setDetailPr] = useState<Record<string, string> | null>(null);
  const [detailItems, setDetailItems] = useState<Record<string, string>[]>([]);
  const [detailSlideOpen, setDetailSlideOpen] = useState(false);

  // Price assignment form
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({}); // itemId -> estimated_unit_price
  const [selectedSupplierId, setSelectedSupplierId] = useState('');

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

  // Actions Mutations
  const createPRMutation = useMutation({
    mutationFn: async (payload: { note: string; items: PRItem[] }) => {
      // 1. Create PR Header
      const headerRes = await fetch(`/api/shops/${shopId}/p2p`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE',
          entity: 'purchase-requisitions',
          data: {
            status: 'DRAFT',
            created_by: userId,
            estimated_total: '0',
            note: payload.note,
          },
        }),
      });
      if (!headerRes.ok) throw new Error('Tạo phiếu đề xuất PR thất bại');
      const header = await headerRes.json();

      // 2. Create Items
      for (const item of payload.items) {
        await fetch(`/api/shops/${shopId}/p2p`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'CREATE',
            entity: 'purchase-requisition-items',
            data: {
              requisition_id: header.id,
              product_id: item.product_id,
              product_name: item.product_name,
              qty: item.qty,
              estimated_unit_price: '0', // Will be sourced by purchaser in the next step
              line_total: '0',
            },
          }),
        });
      }
      return header;
    },
    onSuccess: () => {
      toast.success('Đã tạo đề xuất PR bản nháp thành công');
      setSlideOpen(false);
      setNote('');
      setSelectedItems([]);
      queryClient.invalidateQueries({ queryKey: ['purchase-requisitions', shopId] });
    },
    onError: (err) => toast.error(err.message),
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
      queryClient.invalidateQueries({ queryKey: ['purchase-requisitions', shopId] });
    },
    onError: (err) => toast.error(err.message),
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
      queryClient.invalidateQueries({ queryKey: ['purchase-requisitions', shopId] });
    },
    onError: (err) => toast.error(err.message),
  });

  // Handle viewing PR details
  async function openDetail(pr: Record<string, string>) {
    setDetailPr(pr);
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
    setDetailSlideOpen(true);
  }

  // Handle adding item in creation form
  function handleAddItem() {
    if (!newItemProductId) return;
    const prod = productsData?.data.find((p) => p.id === newItemProductId);
    if (!prod) return;

    // Check if already added
    if (selectedItems.some((item) => item.product_id === newItemProductId)) {
      toast.error('Sản phẩm này đã có trong danh sách');
      return;
    }

    const item: PRItem = {
      product_id: prod.id,
      product_name: prod.name,
      qty: newItemQty,
      estimated_unit_price: '0',
      line_total: '0',
    };

    setSelectedItems((prev) => [...prev, item]);
    setNewItemProductId('');
    setNewItemQty('1');
  }

  function handleRemoveItem(productId: string) {
    setSelectedItems((prev) => prev.filter((i) => i.product_id !== productId));
  }

  // Table Columns config
  const columns = useMemo<Column<Record<string, string>>[]>(() => [
    { key: 'id', label: 'Mã PR', render: (row) => <span className="font-mono text-xs">{row.id}</span> },
    { key: 'note', label: 'Lý do / Mô tả', render: (row) => <span className="text-slate-700">{row.note || '---'}</span> },
    {
      key: 'estimated_total',
      label: 'Tổng tiền (Dự kiến)',
      render: (row) => (
        <span className="font-semibold text-slate-900">
          {row.estimated_total && parseFloat(row.estimated_total) > 0
            ? parseFloat(row.estimated_total).toLocaleString('vi-VN') + ' đ'
            : 'Chưa gán giá'}
        </span>
      ),
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
  ], []);

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
        title="Lập Yêu Cầu Mua Sắm (PR)"
        footer={
          <div className="flex justify-end gap-2 w-full">
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
                createPRMutation.mutate({ note, items: selectedItems });
              }}
              disabled={createPRMutation.isPending}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark shadow-sm transition-colors disabled:opacity-50"
            >
              {createPRMutation.isPending ? 'Đang tạo...' : 'Lưu bản nháp'}
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
              <select
                value={newItemProductId}
                onChange={(e) => setNewItemProductId(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white shadow-sm"
              >
                <option value="">-- Chọn sản phẩm/nguyên liệu --</option>
                {productsData?.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
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
        footer={
          <div className="flex justify-end gap-2 w-full flex-wrap">
            <button
              onClick={() => setDetailSlideOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Đóng
            </button>

            {/* State actions based on roles */}
            {detailPr?.status === 'DRAFT' && (
              <button
                onClick={() => {
                  if (detailPr?.id) {
                    transitionPRMutation.mutate({ prId: detailPr.id, prAction: 'SUBMIT' });
                  }
                }}
                disabled={transitionPRMutation.isPending}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 shadow-sm transition-colors disabled:opacity-50"
              >
                Gửi phê duyệt
              </button>
            )}

            {detailPr?.status === 'PENDING_PRICING' && (
              <>
                <button
                  onClick={() => {
                    if (!selectedSupplierId) {
                      toast.error('Vui lòng chọn một Nhà cung cấp để gán giá.');
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

                    transitionPRMutation.mutate({
                      prId: detailPr.id,
                      prAction: 'ASSIGN_PRICE',
                      data: {
                        estimated_total: String(computedAssignmentTotal),
                        items: payloadItems,
                      },
                    });
                  }}
                  disabled={transitionPRMutation.isPending}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark shadow-sm transition-colors"
                >
                  Gán giá & Chuyển KTT Duyệt
                </button>
              </>
            )}

            {detailPr?.status === 'PENDING_KTT' && (
              <>
                <button
                  onClick={() => {
                    if (detailPr?.id) {
                      transitionPRMutation.mutate({
                        prId: detailPr.id,
                        prAction: 'REJECT',
                        data: { note: detailPr.note + ' | KTT Từ chối' },
                      });
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
                      transitionPRMutation.mutate({ prId: detailPr.id, prAction: 'APPROVE_KTT' });
                    }
                  }}
                  disabled={transitionPRMutation.isPending}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark shadow-sm transition-colors"
                >
                  Duyệt cấp 1 (KTT)
                </button>
              </>
            )}

            {detailPr?.status === 'PENDING_GD' && (
              <>
                <button
                  onClick={() => {
                    if (detailPr?.id) {
                      transitionPRMutation.mutate({
                        prId: detailPr.id,
                        prAction: 'REJECT',
                        data: { note: detailPr.note + ' | GĐ Từ chối' },
                      });
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
                      transitionPRMutation.mutate({ prId: detailPr.id, prAction: 'APPROVE_GD' });
                    }
                  }}
                  disabled={transitionPRMutation.isPending}
                  className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 shadow-sm transition-colors"
                >
                  Phê duyệt chính thức (GD)
                </button>
              </>
            )}

            {detailPr?.status === 'APPROVED' && (
              <div className="w-full flex flex-col gap-2 border-t border-slate-100 pt-4 mt-2">
                <label className="block text-sm font-semibold text-slate-700">Chọn Nhà Cung Cấp chính thức để đặt hàng *</label>
                <div className="flex gap-2">
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white shadow-sm"
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
                        convertToPOMutation.mutate({
                          prId: detailPr.id,
                          supplierId: sup.id,
                          supplierName: sup.name,
                        });
                      }
                    }}
                    disabled={convertToPOMutation.isPending}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark shadow-sm transition-colors disabled:opacity-50"
                  >
                    Lập Đơn Đặt Hàng (PO)
                  </button>
                </div>
              </div>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-slate-500">Người tạo:</span>
              <span className="font-semibold text-slate-800">{detailPr?.created_by}</span>
              
              <span className="text-slate-500">Mô tả lý do:</span>
              <span className="font-semibold text-slate-800">{detailPr?.note || '---'}</span>
              
              <span className="text-slate-500">Hạn mức dự kiến:</span>
              <span className="font-semibold text-slate-800 text-primary">
                {detailPr?.estimated_total && parseFloat(detailPr?.estimated_total) > 0
                  ? parseFloat(detailPr?.estimated_total).toLocaleString('vi-VN') + ' đ'
                  : 'Chưa có báo giá'}
              </span>

              <span className="text-slate-500">Trạng thái:</span>
              <span>
                <TagBadge label={detailPr?.status || ''} color="orange" />
              </span>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Danh sách hàng hóa chi tiết</h3>
            
            {/* If state is PENDING_PRICING, we allow writing prices & choosing a Supplier */}
            {detailPr?.status === 'PENDING_PRICING' ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 p-3 bg-slate-50 space-y-2">
                  <label className="block text-xs font-bold text-slate-700">1. Sourcing Báo giá & Nhà Cung Cấp</label>
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
                            type="number"
                            value={priceEdits[item.id] || ''}
                            onChange={(e) => setPriceEdits((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            className="w-32 rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none text-right"
                            placeholder="Đơn giá"
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
                          {parseFloat(item.estimated_unit_price).toLocaleString('vi-VN')} đ
                        </div>
                        <div className="text-xs text-slate-500">
                          Tổng: { (parseFloat(item.estimated_unit_price) * parseFloat(item.qty || '0')).toLocaleString('vi-VN') } đ
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs italic text-slate-400">Chưa gán giá</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
