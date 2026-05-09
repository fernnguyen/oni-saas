'use client'
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useDebounce } from 'use-debounce'
import { DataTable, Column } from '@/app/components/ui/DataTable'
import { SlideOver } from '@/app/components/ui/SlideOver'
import { TagBadge, TagColor } from '@/app/components/ui/TagBadge'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog'
import { SearchBar } from '@/app/components/ui/SearchBar'

interface Props {
  shopId: string
}

interface StatPeriod {
  count: number
  revenue: number
}

interface OrderStats {
  today: StatPeriod
  week: StatPeriod
  month: StatPeriod
  returns: StatPeriod
}

type Row = Record<string, string>

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'draft', label: 'Nháp' },
  { value: 'confirmed', label: 'Đã xác nhận' },
  { value: 'processing', label: 'Đang xử lý' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Đã hủy' },
  { value: 'refunded', label: 'Hoàn tiền' },
]

const CHANNEL_LABEL: Record<string, string> = {
  pos: 'Tại quầy',
  online: 'Online',
  phone: 'Điện thoại',
  zalo: 'Zalo',
}

const METHOD_LABEL: Record<string, string> = {
  cash: 'Tiền mặt',
  card: 'Thẻ',
  bank_transfer: 'Chuyển khoản',
  momo: 'MoMo',
  vnpay: 'VNPay',
  zalopay: 'ZaloPay',
  debt: 'Nợ',
}

function statusColor(s: string): TagColor {
  if (s === 'completed') return 'green'
  if (s === 'cancelled') return 'red'
  if (s === 'draft') return 'yellow'
  if (s === 'confirmed') return 'blue'
  if (s === 'processing') return 'orange'
  if (s === 'refunded') return 'purple'
  return 'gray'
}

function statusLabel(s: string) {
  return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s
}

function fmtVND(v: string | undefined) {
  return Number(v || 0).toLocaleString('vi-VN') + 'đ'
}

function fmtDate(v: string | undefined) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('vi-VN')
}

const EMPTY_PAYMENT = { method: 'cash', amount: '', note: '', reference_no: '' }

const STAT_CARDS: { key: keyof OrderStats; label: string }[] = [
  { key: 'today',   label: 'Hôm nay' },
  { key: 'week',    label: '7 ngày qua' },
  { key: 'month',   label: 'Tháng này' },
  { key: 'returns', label: 'Trả hàng' },
]

export function OrdersClient({ shopId }: Props) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<Row | null>(null)
  const [editStatus, setEditStatus] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null)
  const [paymentForm, setPaymentForm] = useState<Record<string, string>>(EMPTY_PAYMENT)
  const [showPaymentForm, setShowPaymentForm] = useState(false)

  // Stats summary
  const { data: stats } = useQuery<OrderStats>({
    queryKey: ['orders-stats', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/orders/stats`)
      if (!res.ok) throw new Error('Không tải được thống kê')
      return res.json()
    },
    staleTime: 60_000,
  })

  // Orders list
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['orders', shopId, page, debouncedSearch, statusFilter],
    queryFn: async () => {
      const sp = new URLSearchParams({ page: String(page), limit: '50' })
      if (debouncedSearch) sp.set('search', debouncedSearch)
      if (statusFilter) sp.set('status', statusFilter)
      const res = await fetch(`/api/shops/${shopId}/orders?${sp}`)
      if (!res.ok) throw new Error('Không tải được dữ liệu')
      return res.json() as Promise<{ data: Row[]; total: number }>
    },
  })

  // Order items (lazy — only when detail open)
  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['order-items', shopId, selectedOrder?.order_id],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/order-items?order_id=${selectedOrder!.order_id}&limit=100`)
      if (!res.ok) throw new Error('Không tải được chi tiết')
      return res.json() as Promise<{ data: Row[]; total: number }>
    },
    enabled: !!selectedOrder,
  })

  // Payments (lazy — only when detail open)
  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments', shopId, selectedOrder?.order_id],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/payments?order_id=${selectedOrder!.order_id}&limit=50`)
      if (!res.ok) throw new Error('Không tải được thanh toán')
      return res.json() as Promise<{ data: Row[]; total: number }>
    },
    enabled: !!selectedOrder,
  })

  // Update status
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/shops/${shopId}/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Cập nhật thất bại')
      }
      return res.json()
    },
    onSuccess: (updated) => {
      toast.success('Đã cập nhật trạng thái')
      setSelectedOrder(updated)
      queryClient.invalidateQueries({ queryKey: ['orders', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Add payment
  const paymentMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const res = await fetch(`/api/shops/${shopId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Thêm thanh toán thất bại')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Đã thêm thanh toán')
      setPaymentForm(EMPTY_PAYMENT)
      setShowPaymentForm(false)
      queryClient.invalidateQueries({ queryKey: ['payments', shopId, selectedOrder?.order_id] })
      queryClient.invalidateQueries({ queryKey: ['orders', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Delete order
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/shops/${shopId}/orders/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Xóa thất bại')
    },
    onSuccess: () => {
      toast.success('Đã xóa đơn hàng')
      setDeleteTarget(null)
      setSelectedOrder(null)
      queryClient.invalidateQueries({ queryKey: ['orders', shopId] })
    },
    onError: () => toast.error('Xóa thất bại'),
  })

  function openDetail(row: Row) {
    setSelectedOrder(row)
    setEditStatus(row.status)
    setPaymentForm(EMPTY_PAYMENT)
    setShowPaymentForm(false)
  }

  function closeDetail() {
    setSelectedOrder(null)
  }

  const columns = useMemo<Column<Row>[]>(() => [
    { key: 'order_id', label: 'Mã đơn' },
    {
      key: 'customer_name',
      label: 'Khách hàng',
      render: (row) => <span>{row.customer_name || 'Khách lẻ'}</span>,
    },
    {
      key: 'channel',
      label: 'Kênh',
      render: (row) => <TagBadge label={CHANNEL_LABEL[row.channel] ?? row.channel} color="blue" />,
    },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (row) => <TagBadge label={statusLabel(row.status)} color={statusColor(row.status)} />,
    },
    {
      key: 'total_amount',
      label: 'Tổng tiền',
      render: (row) => <span>{fmtVND(row.total_amount)}</span>,
    },
    {
      key: 'debt_amount',
      label: 'Còn nợ',
      render: (row) => (
        <span className={Number(row.debt_amount || 0) > 0 ? 'font-medium text-orange-600' : 'text-slate-400'}>
          {fmtVND(row.debt_amount)}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Ngày tạo',
      render: (row) => <span className="text-slate-500">{fmtDate(row.created_at)}</span>,
    },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => openDetail(row)}
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Xem
          </button>
          <button
            onClick={() => setDeleteTarget(row)}
            className="rounded-lg border border-red-100 px-3 py-1 text-xs text-red-500 hover:bg-red-50"
          >
            Xóa
          </button>
        </div>
      ),
    },
  ], [])

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STAT_CARDS.map(({ key, label }) => {
          const s = stats?.[key]
          return (
            <div key={key} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {s ? fmtVND(String(s.revenue)) : <span className="animate-pulse text-slate-300">—</span>}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {s != null ? `${s.count} đơn` : ''}
              </p>
            </div>
          )
        })}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Đơn hàng</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {data?.total ?? 0} đơn hàng
            {isFetching && !isLoading && <span className="ml-2 text-xs text-slate-400">Đang cập nhật...</span>}
          </p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => { setStatusFilter(opt.value); setPage(1) }}
            className={[
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              statusFilter === opt.value
                ? 'bg-[#0268FF] text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <SearchBar
        value={search}
        onChange={(v) => { setSearch(v); setPage(1) }}
        placeholder="Tìm kiếm đơn hàng..."
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        pagination={{ page, total: data?.total ?? 0, pageSize: 50, onChange: setPage }}
        emptyState={<EmptyState title="Chưa có đơn hàng nào" description="Đơn hàng sẽ xuất hiện ở đây sau khi được tạo từ POS." />}
        rowKey={(row, idx) => `${row.order_id}__${idx}`}
      />

      {/* Detail slide-over */}
      <SlideOver
        open={!!selectedOrder}
        onClose={closeDetail}
        title={selectedOrder ? `Chi tiết: ${selectedOrder.order_id}` : 'Chi tiết đơn hàng'}
        width={640}
        footer={
          <button
            onClick={closeDetail}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Đóng
          </button>
        }
      >
        {selectedOrder && (
          <div className="space-y-6">
            {/* Order info */}
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-slate-500">Khách hàng</dt>
                  <dd className="font-medium text-slate-900">{selectedOrder.customer_name || 'Khách lẻ'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Kênh</dt>
                  <dd><TagBadge label={CHANNEL_LABEL[selectedOrder.channel] ?? selectedOrder.channel} color="blue" /></dd>
                </div>
                <div>
                  <dt className="text-slate-500">Ngày tạo</dt>
                  <dd className="text-slate-900">{fmtDate(selectedOrder.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Nhân viên</dt>
                  <dd className="text-slate-900">{selectedOrder.employee_id || '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Tổng tiền</dt>
                  <dd className="font-semibold text-slate-900">{fmtVND(selectedOrder.total_amount)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Đã trả</dt>
                  <dd className="font-medium text-green-700">{fmtVND(selectedOrder.paid_amount)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Còn nợ</dt>
                  <dd className={Number(selectedOrder.debt_amount || 0) > 0 ? 'font-medium text-orange-600' : 'text-slate-400'}>
                    {fmtVND(selectedOrder.debt_amount)}
                  </dd>
                </div>
                {selectedOrder.note && (
                  <div className="col-span-2">
                    <dt className="text-slate-500">Ghi chú</dt>
                    <dd className="text-slate-900">{selectedOrder.note}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Status update */}
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-700">Cập nhật trạng thái</h3>
              <div className="flex gap-2">
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
                >
                  {STATUS_OPTIONS.filter((o) => o.value).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => statusMutation.mutate({ id: selectedOrder.order_id, status: editStatus })}
                  disabled={statusMutation.isPending || editStatus === selectedOrder.status}
                  className="rounded-xl bg-[#0268FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#0256CC] disabled:opacity-50"
                >
                  {statusMutation.isPending ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </div>

            {/* Order items */}
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-700">Sản phẩm</h3>
              {itemsLoading ? (
                <p className="text-sm text-slate-400">Đang tải...</p>
              ) : (itemsData?.data ?? []).length === 0 ? (
                <p className="text-sm text-slate-400">Chưa có sản phẩm</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Sản phẩm</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-600">SL</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-600">Đơn giá</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-600">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(itemsData?.data ?? []).map((item) => (
                        <tr key={item.item_id} className="border-b border-slate-50 last:border-0">
                          <td className="px-3 py-2 text-slate-900">{item.product_name}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{item.qty}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{fmtVND(item.unit_price)}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-900">{fmtVND(item.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Payments */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-700">Thanh toán</h3>
                <button
                  onClick={() => setShowPaymentForm((v) => !v)}
                  className="text-xs text-[#0268FF] hover:underline"
                >
                  {showPaymentForm ? 'Ẩn' : '+ Thêm thanh toán'}
                </button>
              </div>

              {paymentsLoading ? (
                <p className="text-sm text-slate-400">Đang tải...</p>
              ) : (paymentsData?.data ?? []).length === 0 && !showPaymentForm ? (
                <p className="text-sm text-slate-400">Chưa có thanh toán</p>
              ) : (
                <div className="space-y-2">
                  {(paymentsData?.data ?? []).map((p) => (
                    <div key={p.payment_id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                      <div>
                        <span className="font-medium text-slate-900">{METHOD_LABEL[p.method] ?? p.method}</span>
                        {p.reference_no && <span className="ml-2 text-slate-500">#{p.reference_no}</span>}
                        {p.note && <span className="ml-2 text-slate-400">— {p.note}</span>}
                      </div>
                      <span className="font-semibold text-green-700">{fmtVND(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Add payment form */}
              {showPaymentForm && (
                <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Phương thức</label>
                      <select
                        value={paymentForm.method}
                        onChange={(e) => setPaymentForm((p) => ({ ...p, method: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-[#0268FF] focus:outline-none"
                      >
                        {Object.entries(METHOD_LABEL).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Số tiền</label>
                      <input
                        type="number"
                        value={paymentForm.amount}
                        onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-[#0268FF] focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Mã giao dịch</label>
                    <input
                      type="text"
                      value={paymentForm.reference_no}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, reference_no: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-[#0268FF] focus:outline-none"
                      placeholder="Tùy chọn"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Ghi chú</label>
                    <input
                      type="text"
                      value={paymentForm.note}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, note: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-[#0268FF] focus:outline-none"
                      placeholder="Tùy chọn"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setShowPaymentForm(false); setPaymentForm(EMPTY_PAYMENT) }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={() => paymentMutation.mutate({
                        ...paymentForm,
                        order_id: selectedOrder.order_id,
                        order_no: selectedOrder.order_no ?? selectedOrder.order_id,
                      })}
                      disabled={paymentMutation.isPending || !paymentForm.amount}
                      className="rounded-lg bg-[#0268FF] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0256CC] disabled:opacity-50"
                    >
                      {paymentMutation.isPending ? 'Đang lưu...' : 'Xác nhận'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SlideOver>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.order_id) }}
        title="Xác nhận xóa"
        description={`Bạn có chắc muốn xóa đơn hàng "${deleteTarget?.order_id}"?`}
        confirmLabel="Xóa"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
