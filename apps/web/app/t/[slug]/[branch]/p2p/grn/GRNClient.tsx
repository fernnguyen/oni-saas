'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useDebounce } from 'use-debounce';
import { DataTable, type Column } from '@/app/components/ui/DataTable';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { SearchBar } from '@/app/components/ui/SearchBar';
import { TagBadge } from '@/app/components/ui/TagBadge';
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog';
import { CopyableId } from '@/app/components/ui/CopyableId';

interface Props {
  shopId: string;
  shopName: string;
  userId: string;
}

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Tất cả phiếu nhập' },
  { value: 'DRAFT', label: 'Phiếu nháp (Chờ kiểm)' },
  { value: 'COMPLETED', label: 'Đã nhập kho' },
];

export function GRNClient({ shopId }: Props) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Detail / Verification state
  const [detailGrn, setDetailGrn] = useState<Record<string, string> | null>(null);
  const [detailItems, setDetailItems] = useState<Record<string, string>[]>([]);
  const [receivedEdits, setReceivedEdits] = useState<Record<string, string>>({}); // itemId -> qty_received
  const [slideOpen, setSlideOpen] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);

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

  // Fetch GRNs
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['goods-receipt-notes', shopId, page, debouncedSearch, statusFilter],
    queryFn: async () => {
      const sp = new URLSearchParams({
        entity: 'goods-receipt-notes',
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
      if (!res.ok) throw new Error('Không tải được danh sách phiếu GRN');
      return res.json() as Promise<{ data: Record<string, string>[]; total: number }>;
    },
  });

  // Action Mutation to complete GRN
  const approveGRNMutation = useMutation({
    mutationFn: async (grnId: string) => {
      // 1. Update received quantities in the database first
      for (const item of detailItems) {
        const qtyRec = receivedEdits[item.id] ?? item.qty_received;
        await fetch(`/api/shops/${shopId}/p2p`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'UPDATE',
            entity: 'goods-receipt-note-items',
            id: item.id,
            data: {
              qty_received: qtyRec,
              line_total: String(parseFloat(qtyRec) * parseFloat(item.unit_cost || '0')),
            },
          }),
        });
      }

      // 2. Approve the GRN (trigger stock, average cost and debt engine)
      const res = await fetch(`/api/shops/${shopId}/p2p`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'APPROVE_GRN',
          grnId,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error ?? 'Phê duyệt nhập kho đối chiếu thất bại');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Đã đối chiếu và nhập kho thành công! Giá vốn BOM & Công nợ NCC đã tự động cập nhật.');
      setSlideOpen(false);
      setConfirmState(prev => ({ ...prev, open: false }));
      queryClient.invalidateQueries({ queryKey: ['goods-receipt-notes', shopId] });
    },
    onError: (err) => {
      toast.error(err.message);
      setConfirmState(prev => ({ ...prev, open: false }));
    },
  });

  async function openDetail(grn: Record<string, string>) {
    setDetailGrn(grn);
    setSlideOpen(true);
    setLoadingItems(true);
    try {
      const sp = new URLSearchParams({
        entity: 'goods-receipt-note-items',
        limit: '100',
        filters: JSON.stringify({ grn_id: grn.id }),
      });
      const res = await fetch(`/api/shops/${shopId}/p2p?${sp}`);
      if (res.ok) {
        const json = await res.json();
        setDetailItems(json.data);
        const edits: Record<string, string> = {};
        json.data.forEach((item: any) => {
          edits[item.id] = item.qty_received || '0';
        });
        setReceivedEdits(edits);
      }
    } catch (err) {
      console.error(err);
      toast.error('Lỗi tải chi tiết mặt hàng đối chiếu');
    } finally {
      setLoadingItems(false);
    }
  }

  const columns = useMemo<Column<Record<string, string>>[]>(() => [
    { key: 'id', label: 'Mã Phiếu', render: (row) => <CopyableId id={row.id} className="text-sm font-semibold text-slate-800" /> },
    { key: 'purchase_order_id', label: 'Đơn PO', render: (row) => <CopyableId id={row.purchase_order_id} className="text-sm font-semibold text-slate-650" /> },
    { key: 'received_by', label: 'Kế toán nhận', render: (row) => <span className="text-slate-700 font-semibold">{row.receiver_name || row.received_by || '---'}</span> },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (row) => {
        const s = row.status || 'DRAFT';
        let color: 'gray' | 'green' = 'gray';
        let text = s;
        if (s === 'DRAFT') {
          color = 'gray';
          text = 'Chờ kiểm kho';
        } else if (s === 'COMPLETED') {
          color = 'green';
          text = 'Đã nhập kho';
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
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors ${
            row.status === 'DRAFT'
              ? 'bg-slate-900 border-slate-900 text-white hover:bg-slate-800'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          {row.status === 'DRAFT' ? 'Kiểm hàng' : 'Xem'}
        </button>
      ),
    },
  ], []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Nhập kho đối chiếu (GRN)</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Xác nhận số lượng thực tế nhận được so với PO để tránh thất thoát và tự động cập nhật giá vốn.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex-1">
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Tìm kiếm phiếu GRN..." />
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
            title="Chưa có phiếu nhập kho đối chiếu nào"
            description="Hãy chọn 'Lập phiếu Nhập kho đối chiếu' từ một Đơn PO đang chờ giao hàng."
          />
        }
        rowKey={(row) => row.id}
      />

      {/* Verification SlideOver */}
      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title={detailGrn?.status === 'DRAFT' ? 'Đối chiếu số lượng Nhập kho (3-Way Match)' : `Chi tiết Phiếu GRN #${detailGrn?.id}`}
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button
              onClick={() => setSlideOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Hủy / Đóng
            </button>

            {detailGrn?.status === 'DRAFT' && (
              <button
                onClick={() => {
                  if (detailGrn?.id) {
                    setConfirmState({
                      open: true,
                      title: 'Hoàn tất Nhập kho đối chiếu?',
                      description: 'Hệ thống sẽ thực hiện tăng tồn kho vật lý chi nhánh, tự động tính toán lại Giá vốn trung bình di động và hạch toán công nợ phải trả. Bạn có chắc chắn muốn hoàn tất?',
                      onConfirm: () => {
                        approveGRNMutation.mutate(detailGrn.id);
                      }
                    });
                  }
                }}
                disabled={approveGRNMutation.isPending}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark shadow-sm transition-colors disabled:opacity-50"
              >
                Duyệt Hoàn Tất Nhập Kho
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-5">
          <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 text-sm">
            <div className="grid grid-cols-2 gap-y-2">
              <span className="text-slate-500">Mã phiếu GRN:</span>
              <span className="font-semibold text-slate-800">
                {detailGrn?.id ? (
                  <CopyableId id={detailGrn.id} className="text-sm font-semibold text-slate-800" />
                ) : '---'}
              </span>

              <span className="text-slate-500">Kế toán nhận:</span>
              <span className="font-semibold text-slate-800">{detailGrn?.receiver_name || detailGrn?.received_by || 'N/A'}</span>

              <span className="text-slate-500">Đơn đặt hàng PO:</span>
              <span className="font-semibold text-slate-800">
                {detailGrn?.purchase_order_id ? (
                  <CopyableId id={detailGrn.purchase_order_id} className="text-sm font-semibold text-slate-800" />
                ) : '---'}
              </span>

              <span className="text-slate-500">Mô tả ghi chú:</span>
              <span className="font-semibold text-slate-800">{detailGrn?.note || '---'}</span>

              <span className="text-slate-500">Trạng thái:</span>
              <span>
                <TagBadge
                  label={detailGrn?.status === 'COMPLETED' ? 'Đã nhập kho' : 'Chờ kiểm kho'}
                  color={detailGrn?.status === 'COMPLETED' ? 'green' : 'gray'}
                />
              </span>
            </div>
          </div>

          {detailGrn?.status === 'DRAFT' && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-xs text-amber-700 leading-relaxed">
              <strong>💡 Hướng dẫn đối chiếu 3 chiều (3-Way Matching):</strong>
              <p className="mt-1">
                Hãy kiểm đếm số lượng thực tế nhận được từ nhà cung cấp và điền vào cột <strong>Thực nhận</strong>. Nếu số lượng thực nhận lệch so với số lượng đặt trên PO, hệ thống sẽ cảnh báo màu đỏ. Khi bạn phê duyệt, hệ thống sẽ tự động tăng số lượng tồn kho theo đúng số thực nhận và ghi nhận giá vốn di động mới.
              </p>
            </div>
          )}

          {loadingItems ? (
            <div className="animate-pulse space-y-4 py-4">
              <div className="h-4 bg-slate-200 rounded w-1/3 animate-bounce"></div>
              <div className="space-y-3">
                <div className="h-14 bg-slate-200 rounded-xl"></div>
                <div className="h-14 bg-slate-200 rounded-xl"></div>
                <div className="h-14 bg-slate-200 rounded-xl"></div>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
              {detailItems.map((item) => {
                const qtyOrdered = parseFloat(item.qty_ordered || '0');
                const qtyReceived = parseFloat(receivedEdits[item.id] ?? item.qty_received ?? '0');
                const hasDiscrepancy = qtyReceived !== qtyOrdered;

                return (
                  <div key={item.id} className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-800">{item.product_name}</span>
                      {hasDiscrepancy && (
                        <span className="rounded-full bg-red-50 border border-red-100 px-2.5 py-0.5 text-[10px] font-bold text-red-600 animate-pulse">
                          ⚠️ Lệch số lượng
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <div className="text-xs text-slate-500">
                        Số lượng đặt trên PO: <span className="font-bold text-slate-700">{item.qty_ordered}</span>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-slate-500">Thực nhận:</span>
                        {detailGrn?.status === 'DRAFT' ? (
                          <input
                            type="number"
                            value={receivedEdits[item.id] ?? ''}
                            onChange={(e) => setReceivedEdits((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs text-center focus:border-primary focus:outline-none bg-white shadow-inner font-bold"
                            min="0"
                          />
                        ) : (
                          <span className="text-sm font-bold text-green-600">{item.qty_received}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SlideOver>

      {/* Action Confirm Dialog */}
      <ConfirmDialog
        open={confirmState.open}
        onClose={() => setConfirmState(prev => ({ ...prev, open: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        description={confirmState.description}
        variant={confirmState.variant}
        confirmLabel="Xác nhận"
        cancelLabel="Hủy"
        loading={approveGRNMutation.isPending}
      />
    </div>
  );
}
