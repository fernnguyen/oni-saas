'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useDebounce } from 'use-debounce'
import { DataTable, Column } from '@/app/components/ui/DataTable'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { SearchBar } from '@/app/components/ui/SearchBar'
import { SlideOver } from '@/app/components/ui/SlideOver'

interface Props {
  shopId: string
  shopName: string
}

type Row = Record<string, string>

const MOVEMENT_TYPE_OPTIONS = [
  { value: 'purchase_in',  label: 'Nhập hàng',            hint: 'Hàng về từ NCC → tăng tồn kho, cập nhật giá vốn' },
  { value: 'return_in',    label: 'Hàng trả về',           hint: 'Khách hoàn trả → tăng tồn kho' },
  { value: 'adjustment',   label: 'Kiểm kê / điều chỉnh',  hint: 'Số dương (+) thêm, số âm (−) giảm tồn kho' },
  { value: 'transfer_in',  label: 'Chuyển kho vào',        hint: 'Nhận hàng từ chi nhánh khác' },
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

function fmtVND(v: string | number | undefined) {
  return Number(v || 0).toLocaleString('vi-VN') + 'đ'
}

// ── Product autocomplete ──────────────────────────────────────────────────────
function ProductSelect({
  shopId,
  value,
  onChange,
}: {
  shopId: string
  value: { product_id: string; name: string; sku: string } | null
  onChange: (p: { product_id: string; name: string; sku: string; cost_price?: string }) => void
}) {
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
      if (!res.ok) return { data: [] as Row[] }
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
        <button
          onClick={() => onChange({ product_id: '', name: '', sku: '' })}
          className="text-slate-400 hover:text-slate-600"
        >✕</button>
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
        placeholder="Gõ tên hoặc SKU sản phẩm..."
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {(data?.data ?? []).length > 0 ? (
            (data?.data ?? []).map((p) => (
              <button
                key={p.product_id}
                onClick={() => {
                  onChange({ product_id: p.product_id, name: p.name, sku: p.sku, cost_price: p.cost_price })
                  setQ('')
                  setOpen(false)
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <div>
                  <span className="font-medium text-slate-900">{p.name}</span>
                  {p.sku && <span className="ml-2 text-xs text-slate-400">{p.sku}</span>}
                </div>
                <span className="text-xs text-slate-500">{fmtVND(p.cost_price)}/đv</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-slate-400">{q ? 'Không tìm thấy sản phẩm' : 'Gõ để tìm kiếm'}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function InventoryClient({ shopId }: Props) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebounce(search, 300)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [selectedProduct, setSelectedProduct] = useState<{
    product_id: string; name: string; sku: string
  } | null>(null)

  // Inventory rows
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

  // Products — for name + cost_price lookup (cost_price lives on Product, not Inventory)
  const { data: productsData } = useQuery({
    queryKey: ['products-all', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/products?limit=2000`)
      if (!res.ok) return { data: [] as Row[] }
      return res.json() as Promise<{ data: Row[] }>
    },
  })

  const productMap = useMemo(() => {
    const m = new Map<string, Row>()
    productsData?.data?.forEach((p) => m.set(p.product_id, p))
    return m
  }, [productsData])

  // Suppliers
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/suppliers?limit=100`)
      if (!res.ok) return { data: [] as Row[] }
      return res.json() as Promise<{ data: Row[] }>
    },
  })

  // Create movement mutation
  const mutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const res = await fetch(`/api/shops/${shopId}/stock-movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as Record<string, string>).error ?? 'Nhập kho thất bại')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Nhập kho thành công!')
      setShowForm(false)
      setForm(EMPTY_FORM)
      setSelectedProduct(null)
      queryClient.invalidateQueries({ queryKey: ['inventory', shopId] })
      queryClient.invalidateQueries({ queryKey: ['products-all', shopId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function handleSelectProduct(p: { product_id: string; name: string; sku: string; cost_price?: string }) {
    if (!p.product_id) {
      setSelectedProduct(null)
      setForm((f) => ({ ...f, product_id: '', sku: '', unit_cost: '' }))
      return
    }
    setSelectedProduct({ product_id: p.product_id, name: p.name, sku: p.sku })
    setForm((f) => ({ ...f, product_id: p.product_id, sku: p.sku, unit_cost: p.cost_price ?? f.unit_cost }))
  }

  function handleSubmit() {
    if (!form.product_id) { toast.error('Vui lòng chọn sản phẩm'); return }
    if (!form.qty || Number(form.qty) === 0) { toast.error('Số lượng phải khác 0'); return }
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

  function closeForm() {
    setShowForm(false)
    setForm(EMPTY_FORM)
    setSelectedProduct(null)
  }

  const movTypeInfo = MOVEMENT_TYPE_OPTIONS.find((o) => o.value === form.type)

  const columns = useMemo<Column<Row>[]>(() => [
    {
      key: 'product_name',
      label: 'Sản phẩm',
      render: (row) => {
        const p = productMap.get(row.product_id)
        return (
          <div>
            <p className="text-sm font-medium text-slate-900">{p?.name ?? row.product_id}</p>
            {(p?.sku || row.sku) && (
              <p className="text-xs text-slate-400">{p?.sku || row.sku}</p>
            )}
          </div>
        )
      },
    },
    {
      key: 'stock_qty',
      label: 'Tồn kho',
      render: (row) => {
        const qty = Number(row.stock_qty || 0)
        const min = Number(row.min_stock || 0)
        const isLow = min > 0 && qty <= min
        return (
          <span className={['text-sm font-semibold tabular-nums', isLow ? 'text-red-500' : 'text-slate-900'].join(' ')}>
            {qty.toLocaleString('vi-VN')}
            {isLow && <span className="ml-1 text-xs">⚠️</span>}
          </span>
        )
      },
    },
    {
      key: 'min_stock',
      label: 'Tồn min',
      render: (row) => <span className="text-sm text-slate-500">{row.min_stock || '0'}</span>,
    },
    {
      key: 'cost_price',
      label: 'Giá vốn (từ SP)',
      render: (row) => {
        // Cost price lives on the Product record, not Inventory tab
        const p = productMap.get(row.product_id)
        const cost = p?.cost_price ?? row.cost_price
        return (
          <span className="text-sm text-slate-700">
            {cost && Number(cost) > 0 ? fmtVND(cost) : <span className="text-slate-400">—</span>}
          </span>
        )
      },
    },
    {
      key: 'total_value',
      label: 'Giá trị kho',
      render: (row) => {
        const p = productMap.get(row.product_id)
        const cost = Number(p?.cost_price ?? row.cost_price ?? 0)
        const qty = Number(row.stock_qty || 0)
        if (cost === 0 || qty === 0) return <span className="text-slate-400">—</span>
        return <span className="text-sm font-medium text-slate-900">{fmtVND(cost * qty)}</span>
      },
    },
    {
      key: 'branch_id',
      label: 'Kho',
      render: (row) => (
        <span className="text-xs text-slate-400">{row.branch_id || 'Mặc định'}</span>
      ),
    },
  ], [productMap])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Tồn kho</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {data?.total ?? 0} mặt hàng
            {isFetching && !isLoading && (
              <span className="ml-2 text-xs text-slate-400">Đang cập nhật...</span>
            )}
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
        placeholder="Tìm theo mã SP, SKU..."
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
        rowKey={(row) => `${row.inventory_id ?? row.product_id}-${row.branch_id}`}
      />

      {/* Nhập kho slide-over */}
      <SlideOver
        open={showForm}
        onClose={closeForm}
        title="Phiếu nhập kho"
        width={520}
        footer={
          <div className="flex gap-3">
            <button
              onClick={closeForm}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              onClick={handleSubmit}
              disabled={mutation.isPending}
              className="rounded-xl bg-[#0268FF] px-6 py-2 text-sm font-medium text-white hover:bg-[#0256CC] disabled:opacity-50 transition-colors"
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
                    form.type === opt.value
                      ? 'bg-[#0268FF] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {movTypeInfo && (
              <p className="mt-1.5 text-xs text-slate-400">{movTypeInfo.hint}</p>
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
                Số lượng {form.type === 'adjustment' && <span className="text-orange-500">(có thể âm)</span>}
                <span className="ml-1 text-red-500">*</span>
              </label>
              <input
                type="number"
                value={form.qty}
                onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                placeholder={form.type === 'adjustment' ? '±10' : '0'}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Giá nhập (đ/đv)
                {form.type === 'purchase_in' && (
                  <span className="ml-1 text-blue-500">→ cập nhật giá vốn SP</span>
                )}
              </label>
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

          {/* Reference + Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Số phiếu</label>
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

          {/* Summary preview */}
          {form.product_id && form.qty && Number(form.qty) !== 0 && (
            <div className="rounded-xl border border-green-100 bg-green-50 p-4 text-sm">
              <p className="font-medium text-green-800 mb-1">Xem trước phiếu</p>
              <div className="space-y-0.5 text-green-700">
                <p>· Loại: <span className="font-medium">{movTypeInfo?.label}</span></p>
                <p>· Sản phẩm: <span className="font-medium">{selectedProduct?.name}</span></p>
                <p>· Số lượng: <span className="font-medium">{Number(form.qty) > 0 ? '+' : ''}{form.qty}</span></p>
                {form.unit_cost && Number(form.unit_cost) > 0 && (
                  <p>
                    · Giá nhập: <span className="font-medium">{fmtVND(form.unit_cost)}/đv</span>
                    {form.type === 'purchase_in' && (
                      <span className="ml-1 text-xs text-green-600">(sẽ cập nhật giá vốn sản phẩm)</span>
                    )}
                  </p>
                )}
                {form.unit_cost && form.qty && (
                  <p>· Tổng giá trị: <span className="font-semibold">{fmtVND(Number(form.unit_cost) * Math.abs(Number(form.qty)))}</span></p>
                )}
              </div>
            </div>
          )}
        </div>
      </SlideOver>
    </div>
  )
}
