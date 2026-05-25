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

interface Props {
  shopId: string;
  shopName: string;
  userId: string;
}

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Tất cả đơn hàng' },
  { value: 'APPROVED', label: 'Chờ giao hàng' },
  { value: 'RECEIVED', label: 'Đã hoàn tất' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

export function POClient({ shopId, userId }: Props) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Detail SlideOpen state
  const [detailPo, setDetailPo] = useState<Record<string, string> | null>(null);
  const [detailItems, setDetailItems] = useState<Record<string, string>[]>([]);
  const [detailSlideOpen, setDetailSlideOpen] = useState(false);

  // Fetch POs
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['purchase-orders', shopId, page, debouncedSearch, statusFilter],
    queryFn: async () => {
      const sp = new URLSearchParams({
        entity: 'purchase-orders',
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
      if (!res.ok) throw new Error('Không tải được danh sách đơn hàng PO');
      return res.json() as Promise<{ data: Record<string, string>[]; total: number }>;
    },
  });

  // Action Mutation to generate GRN
  const createGRNMutation = useMutation({
    mutationFn: async (po: Record<string, string>) => {
      // 1. Create Goods Receipt Note Draft Header
      const headerRes = await fetch(`/api/shops/${shopId}/p2p`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE',
          entity: 'goods-receipt-notes',
          data: {
            purchase_order_id: po.id,
            received_by: userId,
            warehouse_id: 'DEFAULT',
            status: 'DRAFT',
            branch_id: shopId,
            note: `Tự động tạo đối chiếu theo đơn đặt hàng PO #${po.id}`,
          },
        }),
      });
      if (!headerRes.ok) throw new Error('Tạo phiếu đối chiếu GRN thất bại');
      const grn = await headerRes.json();

      // 2. Fetch PO Items
      const sp = new URLSearchParams({
        entity: 'purchase-order-items',
        limit: '100',
        filters: JSON.stringify({ purchase_order_id: po.id }),
      });
      const itemsRes = await fetch(`/api/shops/${shopId}/p2p?${sp}`);
      if (!itemsRes.ok) throw new Error('Không tải được chi tiết đơn PO');
      const itemsData = await itemsRes.json();

      // 3. Copy items into GRN Items
      for (const poItem of itemsData.data) {
        const lineTotal = parseFloat(poItem.qty || '0') * parseFloat(poItem.actual_unit_price || '0');
        await fetch(`/api/shops/${shopId}/p2p`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'CREATE',
            entity: 'goods-receipt-note-items',
            data: {
              grn_id: grn.id,
              product_id: poItem.product_id || '',
              product_name: poItem.product_name || '',
              qty_ordered: poItem.qty || '0',
              qty_received: poItem.qty || '0', // Default to ordered quantity, to be checked on receipt
              unit_cost: poItem.actual_unit_price || '0',
              line_total: String(lineTotal),
            },
          }),
        });
      }
      return grn;
    },
    onSuccess: () => {
      toast.success('Đã tạo bản nháp Phiếu nhập đối chiếu (GRN). Hãy chuyển sang mục Nhập kho đối chiếu để xác nhận.');
      setDetailSlideOpen(false);
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', shopId] });
    },
    onError: (err) => toast.error(err.message),
  });

  async function openDetail(po: Record<string, string>) {
    setDetailPo(po);
    const sp = new URLSearchParams({
      entity: 'purchase-order-items',
      limit: '100',
      filters: JSON.stringify({ purchase_order_id: po.id }),
    });
    const res = await fetch(`/api/shops/${shopId}/p2p?${sp}`);
    if (res.ok) {
      const json = await res.json();
      setDetailItems(json.data);
    }
    setDetailSlideOpen(true);
  }

  const columns = useMemo<Column<Record<string, string>>[]>(() => [
    { key: 'id', label: 'Mã PO', render: (row) => <span className="font-mono text-xs">{row.id}</span> },
    { key: 'supplier_name', label: 'Nhà cung cấp', render: (row) => <span className="font-semibold text-slate-800">{row.supplier_name}</span> },
    {
      key: 'total_amount',
      label: 'Tổng tiền',
      render: (row) => (
        <span className="font-semibold text-slate-900">
          {row.total_amount ? parseFloat(row.total_amount).toLocaleString('vi-VN') + ' đ' : '0 đ'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Trạng thái giao hàng',
      render: (row) => {
        const s = row.status || 'APPROVED';
        let color: 'gray' | 'yellow' | 'green' | 'red' = 'gray';
        let text = s;
        if (s === 'APPROVED') {
          color = 'yellow';
          text = 'Chờ giao hàng';
        } else if (s === 'RECEIVED') {
          color = 'green';
          text = 'Đã hoàn tất';
        } else if (s === 'CANCELLED') {
          color = 'red';
          text = 'Đã hủy';
        }
        return <TagBadge label={text} color={color} />;
      },
    },
    {
      key: 'created_at',
      label: 'Ngày lập',
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Đơn đặt hàng (PO)</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Hợp đồng đặt hàng chính thức với Nhà cung cấp sau khi đã duyệt PR.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex-1">
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Tìm kiếm đơn PO..." />
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

      {/* Table */}
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
            title="Chưa có đơn đặt hàng PO nào"
            description="Các đơn đặt hàng PO sẽ tự động sinh ra khi bạn duyệt một đề xuất PR hoàn tất và chọn nhà cung cấp."
          />
        }
        rowKey={(row) => row.id}
      />

      {/* Details SlideOver */}
      <SlideOver
        open={detailSlideOpen}
        onClose={() => setDetailSlideOpen(false)}
        title={`Chi tiết Đơn PO #${detailPo?.id}`}
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button
              onClick={() => setDetailSlideOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Đóng
            </button>

            {detailPo?.status === 'APPROVED' && (
              <button
                onClick={() => {
                  if (detailPo) {
                    createGRNMutation.mutate(detailPo);
                  }
                }}
                disabled={createGRNMutation.isPending}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark shadow-sm transition-colors disabled:opacity-50"
              >
                {createGRNMutation.isPending ? 'Đang khởi tạo...' : 'Lập phiếu Nhập kho đối chiếu (GRN)'}
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-slate-500">Nhà cung cấp:</span>
              <span className="font-semibold text-slate-800">{detailPo?.supplier_name}</span>

              <span className="text-slate-500">Nhân viên mua sắm:</span>
              <span className="font-semibold text-slate-800">{detailPo?.purchaser_id}</span>

              <span className="text-slate-500">Tổng giá trị:</span>
              <span className="font-semibold text-primary">
                {detailPo?.total_amount ? parseFloat(detailPo?.total_amount).toLocaleString('vi-VN') + ' đ' : '0 đ'}
              </span>

              <span className="text-slate-500">Mô tả:</span>
              <span className="font-semibold text-slate-800">{detailPo?.note || '---'}</span>

              <span className="text-slate-500">Trạng thái:</span>
              <span>
                <TagBadge label={detailPo?.status || ''} color="yellow" />
              </span>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Danh sách hàng hóa đặt mua</h3>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
              {detailItems.map((item) => (
                <div key={item.id} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{item.product_name}</div>
                    <div className="text-xs text-slate-500">Số lượng đặt: <span className="font-bold text-slate-700">{item.qty}</span></div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-800">
                      {item.actual_unit_price ? parseFloat(item.actual_unit_price).toLocaleString('vi-VN') + ' đ' : '0 đ'}
                    </div>
                    <div className="text-xs text-slate-500">
                      Tổng: { (parseFloat(item.actual_unit_price || '0') * parseFloat(item.qty || '0')).toLocaleString('vi-VN') } đ
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
