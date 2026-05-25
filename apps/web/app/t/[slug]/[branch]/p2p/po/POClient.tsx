'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useDebounce } from 'use-debounce';
import { DataTable, type Column } from '@/app/components/ui/DataTable';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { SearchBar } from '@/app/components/ui/SearchBar';
import { TagBadge } from '@/app/components/ui/TagBadge';
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CopyableId } from '@/app/components/ui/CopyableId';
import { DocumentFlowMap } from '@/app/components/p2p/DocumentFlowMap';
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
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearchId = searchParams.get('search');

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [detailPo, setDetailPo] = useState<Record<string, string> | null>(null);
  const [detailItems, setDetailItems] = useState<Record<string, string>[]>([]);
  const [detailSlideOpen, setDetailSlideOpen] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);

  // Automatically fetch and open detail if a search ID is provided in URL query string without filtering the main table
  useEffect(() => {
    if (initialSearchId && initialSearchId.startsWith('PO-')) {
      const fetchPoAndOpenDetail = async () => {
        try {
          const res = await fetch(`/api/shops/${shopId}/p2p?entity=purchase-orders&search=${initialSearchId}`);
          if (res.ok) {
            const json = await res.json();
            const foundPo = json?.data?.find((r: any) => r.id === initialSearchId);
            if (foundPo) {
              openDetail(foundPo);
            }
          }
        } catch (e) {
          console.error('Error fetching initial PO from URL:', e);
        }
      };
      fetchPoAndOpenDetail();
    }
  }, [initialSearchId, shopId]);

  // Fetch related PR for this PO
  const { data: relatedPrData } = useQuery({
    queryKey: ['related-pr', shopId, detailPo?.requisition_id],
    queryFn: async () => {
      if (!detailPo?.requisition_id) return null;
      const sp = new URLSearchParams({
        entity: 'purchase-requisitions',
        limit: '1',
        filters: JSON.stringify({ id: detailPo.requisition_id }),
      });
      const res = await fetch(`/api/shops/${shopId}/p2p?${sp}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data?.[0] || null;
    },
    enabled: !!detailPo?.requisition_id && detailSlideOpen,
  });

  const handleFlowNavigate = (type: 'PR' | 'PO' | 'GRN', id: string) => {
    if (type === 'PO') {
      const found = data?.data?.find(r => r.id === id);
      if (found) openDetail(found);
    } else {
      const targetPath = pathname.replace('/po', `/${type.toLowerCase()}`) + `?search=${id}`;
      router.push(targetPath);
      setDetailSlideOpen(false);
    }
  };

  // Fetch user details / role inside tenant
  const { data: permissionsData } = useQuery({
    queryKey: ['user-permissions', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/settings`); // Contains current shop metadata
      return res.json();
    },
  });

  const canViewPricing = useMemo(() => {
    return permissionsData?.permissions?.some((p: string) =>
      ['admin', 'owner', 'purchaser', 'purchasing.manage', 'chief_accountant', 'settings.manage'].includes(p)
    ) || false;
  }, [permissionsData]);

  const canCreateGrn = useMemo(() => {
    return permissionsData?.permissions?.some((p: string) =>
      ['admin', 'owner', 'purchaser', 'purchasing.manage', 'chief_accountant', 'settings.manage', 'warehouse.manage'].includes(p)
    ) || false;
  }, [permissionsData]);

  // Fetch existing GRNs for this PO to prevent duplicates
  const { data: existingGrnsData, isLoading: isLoadingGrns } = useQuery({
    queryKey: ['existing-grns', shopId, detailPo?.id],
    queryFn: async () => {
      if (!detailPo?.id) return { data: [] };
      const sp = new URLSearchParams({
        entity: 'goods-receipt-notes',
        limit: '10',
        filters: JSON.stringify({ purchase_order_id: detailPo.id }),
      });
      const res = await fetch(`/api/shops/${shopId}/p2p?${sp}`);
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: Record<string, string>[] }>;
    },
    enabled: !!detailPo?.id && detailSlideOpen,
  });

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
      const res = await fetch(`/api/shops/${shopId}/p2p`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_GRN_FROM_PO',
          purchase_order_id: po.id,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error ?? 'Tạo phiếu đối chiếu GRN thất bại');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Đã tạo bản nháp Phiếu nhập đối chiếu (GRN). Hãy chuyển sang mục Nhập kho đối chiếu để xác nhận.');
      setDetailSlideOpen(false);
      setConfirmState(prev => ({ ...prev, open: false }));
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', shopId] });
      queryClient.invalidateQueries({ queryKey: ['existing-grns', shopId] });
    },
    onError: (err) => {
      toast.error(err.message);
      setConfirmState(prev => ({ ...prev, open: false }));
    },
  });

  async function openDetail(po: Record<string, string>) {
    setDetailPo(po);
    setDetailSlideOpen(true);
    setLoadingItems(true);
    try {
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
    } catch (err) {
      console.error(err);
      toast.error('Lỗi tải chi tiết đơn hàng PO');
    } finally {
      setLoadingItems(false);
    }
  }

  const columns = useMemo<Column<Record<string, string>>[]>(() => [
    { key: 'id', label: 'Mã PO', render: (row) => <CopyableId id={row.id} className="text-sm font-semibold text-slate-800" /> },
    { key: 'supplier_name', label: 'Nhà cung cấp', render: (row) => <span className="font-semibold text-slate-800">{row.supplier_name}</span> },
    {
      key: 'total_amount',
      label: 'Tổng tiền',
      render: (row) => (
        <span className="font-semibold text-slate-900">
          {canViewPricing ? (
            row.total_amount ? parseFloat(row.total_amount).toLocaleString('vi-VN') + ' đ' : '0 đ'
          ) : (
            <span className="text-slate-400 italic inline-flex items-center gap-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline text-slate-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> ***.***
            </span>
          )}
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
  ], [canViewPricing, openDetail]);

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
        onRowClick={(row) => openDetail(row)}
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
        width={640}
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button
              onClick={() => setDetailSlideOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Đóng
            </button>

            {detailPo?.status === 'APPROVED' && canCreateGrn && (
              <button
                onClick={() => {
                  if (detailPo) {
                    setConfirmState({
                      open: true,
                      title: 'Lập phiếu đối chiếu GRN?',
                      description: 'Bạn có chắc chắn muốn lập phiếu đối chiếu nhập kho GRN dựa trên đơn đặt hàng PO này?',
                      onConfirm: () => {
                        createGRNMutation.mutate(detailPo);
                      }
                    });
                  }
                }}
                disabled={createGRNMutation.isPending || isLoadingGrns || (existingGrnsData?.data && existingGrnsData.data.length > 0)}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark shadow-sm transition-colors disabled:opacity-50"
              >
                {existingGrnsData?.data && existingGrnsData.data.length > 0 
                  ? 'Đã lập phiếu đối chiếu GRN'
                  : createGRNMutation.isPending 
                    ? 'Đang lập phiếu...' 
                    : 'Lập phiếu Nhập kho đối chiếu (GRN)'
                }
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          {existingGrnsData?.data && existingGrnsData.data.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-4 border border-amber-200 text-sm text-amber-800 flex flex-col gap-1.5 shadow-sm">
              <span className="font-bold flex items-center gap-1">
                ⚠️ Đơn đặt hàng đã lập phiếu đối chiếu GRN
              </span>
              <span className="flex items-center gap-1.5 flex-wrap">
                Đơn đặt hàng PO này đã được khởi tạo Phiếu nhập kho đối chiếu (GRN) từ trước:{' '}
                <CopyableId id={existingGrnsData.data[0].id} className="text-xs font-semibold text-amber-950 bg-amber-100 px-1.5 py-0.5 rounded" />
                {' '}({
                  existingGrnsData.data[0].status === 'COMPLETED' ? 'Đã hoàn tất nhập kho' : 'Bản nháp chờ đối chiếu'
                }).
              </span>
              <button
                onClick={() => {
                  const grnRedirectPath = pathname.replace('/po', '/grn') + `?search=${existingGrnsData.data[0].id}`;
                  router.push(grnRedirectPath);
                  setDetailSlideOpen(false);
                }}
                className="mt-1 self-start text-xs text-primary font-bold hover:underline flex items-center gap-1"
              >
                Xem chi tiết phiếu GRN này →
              </button>
            </div>
          )}

          <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-slate-500">Mã đơn PO:</span>
              <span className="font-semibold text-slate-800">
                {detailPo?.id ? (
                  <CopyableId id={detailPo.id} className="text-sm font-semibold text-slate-800" />
                ) : '---'}
              </span>

              <span className="text-slate-500">Ngày lập:</span>
              <span className="font-semibold text-slate-800">
                {detailPo?.created_at ? (
                  new Date(detailPo.created_at).toLocaleString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                  })
                ) : '---'}
              </span>

              <span className="text-slate-500">Nhà cung cấp:</span>
              <span className="font-semibold text-slate-800">{detailPo?.supplier_name}</span>

              <span className="text-slate-500">Nhân viên mua sắm:</span>
              <span className="font-semibold text-slate-800">{detailPo?.purchaser_name || detailPo?.purchaser_id || 'N/A'}</span>

              <span className="text-slate-500">Tổng giá trị:</span>
              <span className="font-semibold text-primary">
                {canViewPricing ? (
                  detailPo?.total_amount ? parseFloat(detailPo?.total_amount).toLocaleString('vi-VN') + ' đ' : '0 đ'
                ) : (
                  <span className="text-slate-400 italic inline-flex items-center gap-0.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline text-slate-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> ***.*** đ
                  </span>
                )}
              </span>

              <span className="text-slate-500">Mô tả:</span>
              <span className="font-semibold text-slate-800">{detailPo?.note || '---'}</span>

              <span className="text-slate-500">Trạng thái:</span>
              <span>
                <TagBadge
                  label={
                    detailPo?.status === 'APPROVED' 
                      ? 'Chờ giao hàng' 
                      : detailPo?.status === 'RECEIVED' 
                        ? 'Đã hoàn tất' 
                        : detailPo?.status === 'CANCELLED' 
                          ? 'Đã hủy' 
                          : detailPo?.status || ''
                  }
                  color={
                    detailPo?.status === 'APPROVED' 
                      ? 'yellow' 
                      : detailPo?.status === 'RECEIVED' 
                        ? 'green' 
                        : detailPo?.status === 'CANCELLED' 
                          ? 'red' 
                          : 'gray'
                  }
                />
              </span>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Danh sách hàng hóa đặt mua</h3>
            
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
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                {detailItems.map((item) => (
                  <div key={item.id} className="p-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{item.product_name}</div>
                      <div className="text-xs text-slate-500">Số lượng đặt: <span className="font-bold text-slate-700">{item.qty}</span></div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-slate-800">
                        {canViewPricing ? (
                          item.actual_unit_price ? parseFloat(item.actual_unit_price).toLocaleString('vi-VN') + ' đ' : '0 đ'
                        ) : (
                          <span className="text-slate-400 italic inline-flex items-center gap-0.5">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline text-slate-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> ***.***
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {canViewPricing ? (
                          <>Tổng: { (parseFloat(item.actual_unit_price || '0') * parseFloat(item.qty || '0')).toLocaleString('vi-VN') } đ</>
                        ) : (
                          <span className="text-slate-400 italic inline-flex items-center gap-0.5">
                            Tổng: <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline text-slate-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> ***.*** đ
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4">
            <DocumentFlowMap
              currentType="PO"
              pr={relatedPrData ? {
                id: relatedPrData.id,
                status: relatedPrData.status,
                createdAt: relatedPrData.created_at,
                creatorName: relatedPrData.creator_name,
                amount: relatedPrData.estimated_total
              } : null}
              po={detailPo ? {
                id: detailPo.id,
                status: detailPo.status,
                createdAt: detailPo.created_at,
                supplierName: detailPo.supplier_name,
                amount: detailPo.total_amount
              } : null}
              grn={existingGrnsData?.data && existingGrnsData.data.length > 0 ? {
                id: existingGrnsData.data[0].id,
                status: existingGrnsData.data[0].status,
                createdAt: existingGrnsData.data[0].created_at
              } : null}
              onNavigate={handleFlowNavigate}
            />
          </div>
        </div>
      </SlideOver>

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
        loading={createGRNMutation.isPending}
      />
    </div>
  );
}
