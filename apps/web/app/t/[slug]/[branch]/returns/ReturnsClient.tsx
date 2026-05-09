'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useDebounce } from 'use-debounce'
import { DataTable, Column } from '@/app/components/ui/DataTable'
import { SlideOver } from '@/app/components/ui/SlideOver'
import { TagBadge, TagColor } from '@/app/components/ui/TagBadge'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog'
import { SearchBar } from '@/app/components/ui/SearchBar'
import { PageHeader } from '@/app/components/ui/PageHeader'

interface Props { shopId: string }
type Row = Record<string, string>

const STATUS_OPTIONS = [
  { value: '',          label: 'Tất cả'       },
  { value: 'pending',   label: 'Chờ duyệt'    },
  { value: 'approved',  label: 'Đã duyệt'     },
  { value: 'processed', label: 'Đã xử lý'     },
  { value: 'rejected',  label: 'Từ chối'      },
]

const REASON_LABEL: Record<string, string> = {
  defective:    'Hàng lỗi',
  damaged:      'Hàng hỏng',
  wrong_item:   'Sai hàng',
  changed_mind: 'Đổi ý',
  other:        'Khác',
}

const REFUND_METHOD_LABEL: Record<string, string> = {
  cash:          'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  store_credit:  'Ghi nợ',
  none:          'Không hoàn',
}

function statusColor(s: string): TagColor {
  if (s === 'processed') return 'green'
  if (s === 'approved')  return 'blue'
  if (s === 'pending')   return 'yellow'
  if (s === 'rejected')  return 'red'
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

const EMPTY_FORM = {
  order_id: '', order_no: '', customer_id: '', customer_name: '',
  reason: 'other', status: 'pending', total_refund: '0',
  refund_method: 'cash', note: '',
}

const EMPTY_ITEM = {
  product_id: '', product_name: '', sku: '', qty_returned: '1',
  unit_price: '0', line_total: '0',
}

export function ReturnsClient({ shopId }: Props) {
  const queryClient = useQueryClient()
  const [page, setPage]       = useState(1)
  const [search, setSearch]   = useState('')
  const [debouncedSearch]     = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('')

  const [selected, setSelected]         = useState<Row | null>(null)
  const [showCreate, setShowCreate]     = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null)
  const [form, setForm]                 = useState<Record<string, string>>(EMPTY_FORM)
  const [itemForm, setItemForm]         = useState<Record<string, string>>(EMPTY_ITEM)
  const [addingItem, setAddingItem]     = useState(false)

  // ── List ──────────────────────────────────────────────────────────────────
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['returns', shopId, page, debouncedSearch, statusFilter],
    queryFn: async () => {
      const sp = new URLSearchParams({ page: String(page), limit: '50' })
      if (debouncedSearch) sp.set('search', debouncedSearch)
      if (statusFilter)    sp.set('status', statusFilter)
      const res = await fetch(`/api/shops/${shopId}/returns?${sp}`)
      if (!res.ok) throw new Error('Không tải được dữ liệu')
      return res.json() as Promise<{ data: Row[]; total: number }>
    },
  })

  // ── Items for selected return ────────────────────────────────────────────
  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['return-items', shopId, selected?.return_id],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/return-items?return_id=${selected!.return_id}&limit=100`)
      if (!res.ok) throw new Error('Không tải được chi tiết')
      return res.json() as Promise<{ data: Row[]; total: number }>
    },
    enabled: !!selected,
  })

  // ── Create return ─────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const res = await fetch(`/api/shops/${shopId}/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Lỗi tạo phiếu')
      return res.json()
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['returns', shopId] })
      toast.success('Đã tạo phiếu trả hàng')
      setShowCreate(false)
      setForm(EMPTY_FORM)
      setSelected(created)
    },
    onError: (e) => toast.error((e as Error).message),
  })

  // ── Add item ──────────────────────────────────────────────────────────────
  const addItemMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const res = await fetch(`/api/shops/${shopId}/return-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Lỗi thêm sản phẩm')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['return-items', shopId, selected?.return_id] })
      queryClient.invalidateQueries({ queryKey: ['returns', shopId] })
      toast.success('Đã thêm sản phẩm')
      setAddingItem(false)
      setItemForm(EMPTY_ITEM)
    },
    onError: (e) => toast.error((e as Error).message),
  })

  // ── Update status ─────────────────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/shops/${shopId}/returns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Lỗi cập nhật')
      return res.json()
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['returns', shopId] })
      toast.success('Đã cập nhật trạng thái')
      setSelected(updated)
    },
    onError: (e) => toast.error((e as Error).message),
  })

  // ── Process (approve + create stock-movements) ────────────────────────────
  const processMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/shops/${shopId}/returns/${id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Lỗi xử lý')
      return res.json()
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['returns', shopId] })
      queryClient.invalidateQueries({ queryKey: ['inventory', shopId] })
      queryClient.invalidateQueries({ queryKey: ['stock-movements', shopId] })
      toast.success('Phiếu trả hàng đã được xử lý — kho đã được cập nhật')
      setSelected(updated)
    },
    onError: (e) => toast.error((e as Error).message),
  })

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/shops/${shopId}/returns/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Lỗi xóa')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['returns', shopId] })
      toast.success('Đã xóa phiếu trả hàng')
      setSelected(null)
      setDeleteTarget(null)
    },
    onError: (e) => toast.error((e as Error).message),
  })

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns: Column<Row>[] = [
    {
      key: 'return_no',
      label: 'Mã phiếu',
      render: (row) => (
        <button
          className="font-mono text-sm font-semibold text-blue-600 hover:underline"
          onClick={() => setSelected(row)}
        >
          {row.return_no || row.return_id?.slice(0, 8)}
        </button>
      ),
    },
    { key: 'order_no',       label: 'Đơn hàng',   render: (row) => row.order_no || '—' },
    { key: 'customer_name',  label: 'Khách hàng',  render: (row) => row.customer_name || '—' },
    {
      key: 'reason',
      label: 'Lý do',
      render: (row) => REASON_LABEL[row.reason] ?? row.reason,
    },
    {
      key: 'total_refund',
      label: 'Hoàn tiền',
      align: 'right',
      render: (row) => <span className="font-medium">{fmtVND(row.total_refund)}</span>,
    },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (row) => <TagBadge color={statusColor(row.status)} label={statusLabel(row.status)} />,
    },
    { key: 'created_at', label: 'Ngày tạo', render: (row) => fmtDate(row.created_at) },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <div className="flex gap-2">
          <button
            className="text-xs text-blue-600 hover:underline"
            onClick={() => setSelected(row)}
          >
            Xem
          </button>
          {row.status !== 'processed' && (
            <button
              className="text-xs text-red-500 hover:underline"
              onClick={() => setDeleteTarget(row)}
            >
              Xóa
            </button>
          )}
        </div>
      ),
    },
  ]

  // ── Item form: auto-compute line_total ────────────────────────────────────
  function handleItemChange(field: string, value: string) {
    setItemForm((prev) => {
      const next = { ...prev, [field]: value }
      const qty   = parseFloat(next.qty_returned  || '0')
      const price = parseFloat(next.unit_price || '0')
      next.line_total = String(qty * price)
      return next
    })
  }

  const rows   = data?.data ?? []
  const total  = data?.total ?? 0
  const items  = itemsData?.data ?? []

  return (
    <div className="space-y-4">
      <PageHeader
        title="Đơn trả hàng"
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Tạo phiếu trả
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchBar
          value={search}
          onChange={(v) => { setSearch(v); setPage(1) }}
          placeholder="Tìm mã phiếu, đơn hàng, khách hàng..."
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={rows}
        loading={isLoading}
        pagination={{ page, total, pageSize: 50, onChange: setPage }}
        emptyState={
          <EmptyState
            title="Chưa có phiếu trả hàng"
            description="Tạo phiếu trả hàng đầu tiên để bắt đầu."
          />
        }
        rowKey={(row) => row.return_id ?? row.return_no ?? ''}
      />

      {/* ── Create SlideOver ── */}
      <SlideOver
        open={showCreate}
        onClose={() => { setShowCreate(false); setForm(EMPTY_FORM) }}
        title="Tạo phiếu trả hàng"
        width={500}
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setShowCreate(false); setForm(EMPTY_FORM) }}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
            >
              Hủy
            </button>
            <button
              disabled={createMutation.isPending || !form.order_id}
              onClick={() => createMutation.mutate(form)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Đang tạo...' : 'Tạo phiếu'}
            </button>
          </div>
        }
      >
        <div className="space-y-4 p-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Mã đơn hàng gốc *</label>
            <input
              value={form.order_id}
              onChange={(e) => setForm((p) => ({ ...p, order_id: e.target.value }))}
              placeholder="ORD-001"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Số đơn hàng</label>
            <input
              value={form.order_no}
              onChange={(e) => setForm((p) => ({ ...p, order_no: e.target.value }))}
              placeholder="ORD-001"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Tên khách hàng</label>
            <input
              value={form.customer_name}
              onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Lý do trả</label>
            <select
              value={form.reason}
              onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {Object.entries(REASON_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Số tiền hoàn</label>
            <input
              type="number"
              value={form.total_refund}
              onChange={(e) => setForm((p) => ({ ...p, total_refund: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Hình thức hoàn</label>
            <select
              value={form.refund_method}
              onChange={(e) => setForm((p) => ({ ...p, refund_method: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {Object.entries(REFUND_METHOD_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Ghi chú</label>
            <textarea
              value={form.note}
              onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </SlideOver>

      {/* ── Detail SlideOver ── */}
      <SlideOver
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Phiếu trả: ${selected?.return_no || ''}`}
        width={560}
      >
        {selected && (
          <div className="space-y-5 p-4">
            {/* Status badges + actions */}
            <div className="flex items-center justify-between">
              <TagBadge color={statusColor(selected.status)} label={statusLabel(selected.status)} />
              <div className="flex gap-2">
                {selected.status === 'pending' && (
                  <>
                    <button
                      disabled={statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ id: selected.return_id, status: 'approved' })}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                    >
                      Duyệt
                    </button>
                    <button
                      disabled={statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ id: selected.return_id, status: 'rejected' })}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      Từ chối
                    </button>
                  </>
                )}
                {(selected.status === 'pending' || selected.status === 'approved') && (
                  <button
                    disabled={processMutation.isPending}
                    onClick={() => processMutation.mutate(selected.return_id)}
                    className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {processMutation.isPending ? 'Đang xử lý...' : 'Xử lý & nhập kho'}
                  </button>
                )}
              </div>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
              <div>
                <span className="text-slate-500">Đơn hàng gốc</span>
                <p className="font-medium">{selected.order_no || selected.order_id || '—'}</p>
              </div>
              <div>
                <span className="text-slate-500">Khách hàng</span>
                <p className="font-medium">{selected.customer_name || '—'}</p>
              </div>
              <div>
                <span className="text-slate-500">Lý do</span>
                <p className="font-medium">{REASON_LABEL[selected.reason] ?? selected.reason}</p>
              </div>
              <div>
                <span className="text-slate-500">Hình thức hoàn</span>
                <p className="font-medium">{REFUND_METHOD_LABEL[selected.refund_method] ?? selected.refund_method}</p>
              </div>
              <div>
                <span className="text-slate-500">Số tiền hoàn</span>
                <p className="font-semibold text-blue-700">{fmtVND(selected.total_refund)}</p>
              </div>
              <div>
                <span className="text-slate-500">Ngày tạo</span>
                <p className="font-medium">{fmtDate(selected.created_at)}</p>
              </div>
              {selected.processed_at && (
                <div>
                  <span className="text-slate-500">Ngày xử lý</span>
                  <p className="font-medium">{fmtDate(selected.processed_at)}</p>
                </div>
              )}
              {selected.note && (
                <div className="col-span-2">
                  <span className="text-slate-500">Ghi chú</span>
                  <p className="font-medium">{selected.note}</p>
                </div>
              )}
            </div>

            {/* Items */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Sản phẩm trả</h3>
                {selected.status !== 'processed' && (
                  <button
                    onClick={() => setAddingItem(true)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    + Thêm sản phẩm
                  </button>
                )}
              </div>

              {itemsLoading ? (
                <div className="py-4 text-center text-sm text-slate-400">Đang tải...</div>
              ) : items.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">Chưa có sản phẩm nào</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                      <th className="py-1.5">Sản phẩm</th>
                      <th className="py-1.5 text-right">SL trả</th>
                      <th className="py-1.5 text-right">Đơn giá</th>
                      <th className="py-1.5 text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.item_id} className="border-b border-slate-50">
                        <td className="py-2">
                          <p className="font-medium">{item.product_name || item.product_id}</p>
                          {item.sku && <p className="text-xs text-slate-400">{item.sku}</p>}
                        </td>
                        <td className="py-2 text-right">{item.qty_returned}</td>
                        <td className="py-2 text-right">{fmtVND(item.unit_price)}</td>
                        <td className="py-2 text-right font-medium">{fmtVND(item.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Add item inline form */}
              {addingItem && (
                <div className="mt-3 rounded-lg border border-slate-200 p-3">
                  <p className="mb-2 text-xs font-semibold text-slate-600">Thêm sản phẩm trả</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className="mb-0.5 block text-xs text-slate-500">Mã sản phẩm *</label>
                      <input
                        value={itemForm.product_id}
                        onChange={(e) => handleItemChange('product_id', e.target.value)}
                        placeholder="P-001"
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="mb-0.5 block text-xs text-slate-500">Tên sản phẩm</label>
                      <input
                        value={itemForm.product_name}
                        onChange={(e) => handleItemChange('product_name', e.target.value)}
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-xs text-slate-500">SL trả *</label>
                      <input
                        type="number"
                        min="1"
                        value={itemForm.qty_returned}
                        onChange={(e) => handleItemChange('qty_returned', e.target.value)}
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-xs text-slate-500">Đơn giá</label>
                      <input
                        type="number"
                        min="0"
                        value={itemForm.unit_price}
                        onChange={(e) => handleItemChange('unit_price', e.target.value)}
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      onClick={() => { setAddingItem(false); setItemForm(EMPTY_ITEM) }}
                      className="rounded border border-slate-200 px-3 py-1 text-xs"
                    >
                      Hủy
                    </button>
                    <button
                      disabled={addItemMutation.isPending || !itemForm.product_id}
                      onClick={() =>
                        addItemMutation.mutate({
                          ...itemForm,
                          return_id:  selected.return_id,
                          return_no:  selected.return_no ?? '',
                        })
                      }
                      className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {addItemMutation.isPending ? 'Đang thêm...' : 'Thêm'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SlideOver>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Xóa phiếu trả hàng"
        description={`Xóa phiếu ${deleteTarget?.return_no || deleteTarget?.return_id?.slice(0, 8) || ''}? Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa"
        variant="danger"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.return_id) }}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
