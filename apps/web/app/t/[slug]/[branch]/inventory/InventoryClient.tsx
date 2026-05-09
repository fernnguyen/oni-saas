'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useDebounce } from 'use-debounce'
import { DataTable, Column } from '@/app/components/ui/DataTable'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { SearchBar } from '@/app/components/ui/SearchBar'
import { SlideOver } from '@/app/components/ui/SlideOver'
import { TagBadge } from '@/app/components/ui/TagBadge'

interface Props {
  shopId: string
  shopName: string
}

type Row = Record<string, string>

const MOVEMENT_TYPE_OPTIONS = [
  { value: 'purchase_in',  label: 'Nhập hàng',       color: 'green'  as const },
  { value: 'return_in',    label: 'Hàng trả về',      color: 'blue'   as const },
  { value: 'adjustment',   label: 'Kiểm kê/điều chỉnh', color: 'orange' as const },
  { value: 'transfer_in',  label: 'Chuyển kho vào',   color: 'purple' as const },
]

const EMPTY_FORM = {
  type: 'purchase_in',
  product_id: '',
  product_name: '',
  sku: '',
  qty: '',
  unit_cost: '',
  supplier_id: '',
  reference_no: '',
  reason: '',
}

function fmtVND(v: string | number) {
  return Number(v || 0).toLocaleString('vi-VN') + 'đ'
}

// Product search dropdown
function ProductSelect({
  shopId, value, onChange
}: { shopId: string; value: { product_id: string; name: string; sku: string } | null; onChange: (p: { product_id: string; name: string; sku: string; cost_price?: string }) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [debouncedQ] = useDebounce(q, 250)
  const ref = useRef<HTMLDivElement>(null)

  const { data } = useQuery({
    queryKey: ['products-search', shopId, debouncedQ],
    queryFn: async () => {
      const sp = new URLSearchParams({ limit: '20' })
      if (debouncedQ) sp.set('search', debouncedQ)
      const res = await fetch(`/api/shops/${shopId}/products?${sp}`)
      if (!res.ok) return { data: [] }
      return res.json() as Promise<{ data: Row[] }>
    },
    enabled: open,
  })

  useEffect(() => {
    function out(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', out)
    return () => document.removeEventListener('mousedown', out)
  }, [])

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
        <div>
          <p className="text-sm font-medium text-slate-900">{value.name}</p>
          {value.sku && <p className="text-xs text-slate-500">SKU: {value.sku}</p>}
        </div>
        <button onClick={() => onChange({ product_id: '', name: '', sku: '' })} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Tìm sản phẩm theo tên hoặc SKU..."
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
      />
      {open && (data?.data ?? []).length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          {(data?.data ?? []).map((p) => (
            <button
              key={p.product_id}
              onClick={() => { onChange({ product_id: p.product_id, name: p.name, sku: p.sku, cost_price: p.cost_price }); setQ(''); setOpen(false) }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-medium text-slate-900">{p.name}</span>
              <span className="text-xs text-slate-400">{p.sku}</span>
            </button>
          ))}
        </div>
      )}
      {open && q && (data?.data ?? []).length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <p className="text-sm text-slate-400">Không tìm thấy sản phẩm</p>
        </div>
      )}
    </div>
  )
}

export function InventoryClient({ shopId }: Props) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebounce(search, 300)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [selectedProduct, setSelectedProduct] = useState<{ product_id: string; name: string; sku: string } | null>(null)

  // Inventory list
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['inventory', shopId, page, debouncedSearch],
    queryFn: async () => {
      const sp = new URLSearchParams({ page: String(page), limit: '50' })
      if (debouncedSearch) sp.set('search', debouncedSearch)
      const res = await fetch(`/api/shops/${shopId}/inventory?${sp}`)
      if (!res.ok) throw new Error('Không tải được dữ liệu')
      return res.json() as Promise<{ data: Row[]; total: number }>
    },
  })

  // Suppliers for dropdown
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/suppliers?limit=100`)
      if (!res.ok) return { data: [] }
      return res.json() as Promise<{ data: Row[] }>
    },
  })

  // Create stock movement mutation
  const mutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const res = await fetch(`/api/shops/${shopId}/stock-movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Nhập kho thất bại')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Nhập kho thành công!')
      setShowForm(false)
      setForm(EMPTY_FORM)
      setSelectedProduct(null)
      queryClient.invalidateQueries({ queryKey: ['inventory', shopId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function handleSelectProduct(p: { product_id: string; name: string; sku: string; cost_price?: string }) {
    if (!p.product_id) { setSelectedProduct(null); setForm((f) => ({ ...f, product_id: '', sku: '', unit_cost: '' })); return }
    setSelectedProduct(p)
    setForm((f) => ({ ...f, product_id: p.product_id, sku: p.sku, unit_cost: p.cost_price ?? f.unit_cost }))
  }

  function handleSubmit() {
    if (!form.product_id) { toast.error('Chọn sản phẩm'); return }
    if (!form.qty || Number(form.qty) <= 0) { toast.error('Nhập số lượng hợp lệ'); return }
    mutation.mutate({
      type: form.type,
      product_id: form.product_id,
      sku: form.sku,
      qty: form.qty,
      unit_cost: form.unit_cost,
      branch_id: '',
      supplier_id: form.supplier_id,
      reference_no: form.reference_no,
      reason: form.reason,
    })
  }

  const movementType = MOVEMENT_TYPE_OPTIONS.find((o) => o.value === form.type)

  const columns = useMemo<Column<Row>[]>(() => [
    { key: 'product_id', label: 'Mã SP', render: (row) => <span className="font-mono text-xs text-slate-600">{row.product_id}</span> },
    { key: 'sku', label: 'SKU', render: (row) => <span className="text-sm text-slate-700">{row.sku || '—'}</span> },
    {
      key: 'stock_qty',
      label: 'Tồn kho',
      render: (row) => {
        const qty = Number(row.stock_qty || 0)
        const min = Number(row.min_stock || 0)
        const isLow = min > 0 && qty <= min
        return (
          <span className={['font-semibold tabular-nums', isLow ? 'text-red-500' : 'text-slate-900'].join(' ')}>
            {qty.toLocaleString('vi-VN')}
            {isLow && <span className="ml-1 text-xs font-normal">⚠️</span>}
          </span>
        )
      },
    },
    { key: 'min_stock', label: 'Tồn min', render: (row) => <span className="text-slate-500">{row.min_stock || '0'}</span> },
    { key: 'cost_price', label: 'Giá vốn', render: (row) => <span>{fmtVND(row.cost_price)}</span> },
    { key: 'branch_id', label: 'Chi nhánh', render: (row) => <span className="text-xs text-slate-400">{row.branch_id || 'Mặc định'}</span> },
  ], [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Tồn kho</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {data?.total ?? 0} mặt hàng
            {isFetching && !isLoading && <span className="ml-2 text-xs text-slate-400">Đang cập nhật...</span>}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-xl bg-[#0268FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#0256CC] transition-colors"
        >
          + Nhập kho
        </button>
      </div>

      <SearchBar
        value={search}
        onChange={(v) => { setSearch(v); setPage(1) }}
        placeholder="Tìm sản phẩm, SKU..."
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        pagination={{ page, total: data?.total ?? 0, pageSize: 50, onChange: setPage }}
        emptyState={
          <EmptyState
            title="Chưa có dữ liệu tồn kho"
            description='Nhấn "+ Nhập kho" để tạo phiếu nhập hàng đầu tiên.'
          />
        }
        rowKey={(row) => `${row.product_id}-${row.branch_id}-${row.inventory_id}`}
      />

      {/* Nhập kho slide-over */}
      <SlideOver
        open={showForm}
        onClose={() => { setShowForm(false); setForm(EMPTY_FORM); setSelectedProduct(null) }}
        title="Nhập kho"
        width={520}
        footer={
          <div className="flex gap-3">
            <button
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setSelectedProduct(null) }}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              onClick={handleSubmit}
              disabled={mutation.isPending}
              className="rounded-xl bg-[#0268FF] px-6 py-2 text-sm font-medium text-white hover:bg-[#0256CC] disabled:opacity-50"
            >
              {mutation.isPending ? 'Đang lưu...' : 'Xác nhận nhập kho'}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Movement type */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Loại phiếu</label>
            <div className="flex flex-wrap gap-2">
              {MOVEMENT_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setForm((f) => ({ ...f, type: opt.value }))}
                  className={[
                    'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    form.type === opt.value ? 'bg-[#0268FF] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {movementType && (
              <p className="mt-1.5 text-xs text-slate-400">
                {form.type === 'purchase_in' && 'Nhập hàng từ nhà cung cấp → tăng tồn kho'}
                {form.type === 'return_in' && 'Khách trả hàng → tăng tồn kho'}
                {form.type === 'adjustment' && 'Điều chỉnh sau kiểm kê (qty dương = thêm, âm = giảm)'}
                {form.type === 'transfer_in' && 'Chuyển hàng từ kho khác vào'}
              </p>
            )}
          </div>

          {/* Product */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">
              Sản phẩm <span className="text-red-500">*</span>
            </label>
            <ProductSelect shopId={shopId} value={selectedProduct} onChange={handleSelectProduct} />
          </div>

          {/* Qty + Unit cost */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Số lượng {form.type === 'adjustment' ? '(±)' : ''} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={form.qty}
                onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                placeholder={form.type === 'adjustment' ? 'ví dụ: -5 hoặc +10' : '0'}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Giá nhập (đ)</label>
              <input
                type="number"
                value={form.unit_cost}
                onChange={(e) => setForm((f) => ({ ...f, unit_cost: e.target.value }))}
                placeholder="0"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
              />
            </div>
          </div>

          {/* Supplier */}
          {['purchase_in', 'return_in'].includes(form.type) && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Nhà cung cấp</label>
              <select
                value={form.supplier_id}
                onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
              >
                <option value="">— Không chọn —</option>
                {(suppliersData?.data ?? []).map((s) => (
                  <option key={s.supplier_id} value={s.supplier_id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Reference + Reason */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Số phiếu / ref</label>
              <input
                type="text"
                value={form.reference_no}
                onChange={(e) => setForm((f) => ({ ...f, reference_no: e.target.value }))}
                placeholder="PN-001"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Ghi chú</label>
              <input
                type="text"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Tùy chọn"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
              />
            </div>
          </div>

          {/* Summary */}
          {form.product_id && form.qty && Number(form.qty) !== 0 && (
            <div className="rounded-xl border border-green-100 bg-green-50 p-3">
              <p className="text-sm font-medium text-green-800">Tóm tắt phiếu</p>
              <p className="mt-1 text-sm text-green-700">
                {movementType?.label} · <span className="font-semibold">{selectedProduct?.name}</span>
                {' · '}
                <span className="font-semibold">
                  {Number(form.qty) > 0 ? '+' : ''}{form.qty} đơn vị
                </span>
                {form.unit_cost && ` · Giá nhập: ${fmtVND(form.unit_cost)}/đv`}
              </p>
            </div>
          )}
        </div>
      </SlideOver>
    </div>
  )
}
