'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useDebounce } from 'use-debounce'
import { DataTable, Column } from '@/app/components/ui/DataTable'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { SearchBar } from '@/app/components/ui/SearchBar'
import { SlideOver } from '@/app/components/ui/SlideOver'
import { TagBadge, TagColor } from '@/app/components/ui/TagBadge'

interface Props {
  shopId: string
  shopName: string
}

type Row = Record<string, string>
type Tab = 'stock' | 'history'

// ── Movement type metadata ────────────────────────────────────────────────────

const MOVEMENT_TYPES = [
  { value: 'purchase_in',  label: 'Nhập hàng',      color: 'blue'   as TagColor, sign: '+', hint: 'Hàng về từ NCC → tăng tồn kho, cập nhật giá vốn' },
  { value: 'sale_out',     label: 'Bán hàng',        color: 'green'  as TagColor, sign: '-', hint: 'Xuất kho khi bán hàng' },
  { value: 'return_in',    label: 'Hàng trả về',     color: 'red'    as TagColor, sign: '+', hint: 'Khách hoàn trả → tăng tồn kho' },
  { value: 'transfer_out', label: 'Xuất chuyển kho', color: 'orange' as TagColor, sign: '-', hint: 'Chuyển hàng sang chi nhánh khác' },
  { value: 'transfer_in',  label: 'Nhập chuyển kho', color: 'purple' as TagColor, sign: '+', hint: 'Nhận hàng từ chi nhánh khác' },
  { value: 'adjustment',   label: 'Điều chỉnh',      color: 'yellow' as TagColor, sign: '±', hint: 'Kiểm kê / điều chỉnh tồn kho' },
]

const MOVEMENT_TYPE_MAP = Object.fromEntries(MOVEMENT_TYPES.map((t) => [t.value, t]))

const INPUT_TYPES = MOVEMENT_TYPES.filter((t) => ['purchase_in', 'return_in', 'adjustment', 'transfer_in'].includes(t.value))

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

function fmtDate(v: string | undefined) {
  if (!v) return '—'
  return new Date(v).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
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
  const [activeTab, setActiveTab] = useState<Tab>('stock')

  // Stock tab state
  const [stockPage, setStockPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebounce(search, 300)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [selectedProduct, setSelectedProduct] = useState<{
    product_id: string; name: string; sku: string
  } | null>(null)

  // History tab state
  const [historyPage, setHistoryPage] = useState(1)
  const [historySearch, setHistorySearch] = useState('')
  const [debouncedHistorySearch] = useDebounce(historySearch, 300)
  const [typeFilter, setTypeFilter] = useState('')

  // Inventory rows
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['inventory', shopId, stockPage, debouncedSearch],
    queryFn: async () => {
      const sp = new URLSearchParams({ page: String(stockPage), limit: '50' })
      if (debouncedSearch) sp.set('search', debouncedSearch)
      const res = await fetch(`/api/shops/${shopId}/inventory?${sp}`)
      if (!res.ok) throw new Error('Không tải được dữ liệu')
      return res.json() as Promise<{ data: Row[]; total: number }>
    },
    staleTime: 0,
  })

  // Products — for name + cost_price lookup
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

  // Stock movements (history tab — lazy)
  const { data: movementsData, isLoading: movementsLoading, isFetching: movementsFetching } = useQuery({
    queryKey: ['stock-movements', shopId, historyPage, debouncedHistorySearch, typeFilter],
    queryFn: async () => {
      const sp = new URLSearchParams({ page: String(historyPage), limit: '50' })
      if (debouncedHistorySearch) sp.set('search', debouncedHistorySearch)
      if (typeFilter) sp.set('type', typeFilter)
      const res = await fetch(`/api/shops/${shopId}/stock-movements?${sp}`)
      if (!res.ok) throw new Error('Không tải được lịch sử')
      return res.json() as Promise<{ data: Row[]; total: number }>
    },
    enabled: activeTab === 'history',
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
      queryClient.invalidateQueries({ queryKey: ['stock-movements', shopId] })
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

  const movTypeInfo = INPUT_TYPES.find((o) => o.value === form.type)

  // ── Stock columns ──────────────────────────────────────────────────────────

  const stockColumns = useMemo<Column<Row>[]>(() => [
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
      label: 'Giá vốn',
      render: (row) => {
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

  // ── History columns ────────────────────────────────────────────────────────

  const historyColumns = useMemo<Column<Row>[]>(() => [
    {
      key: 'movement_id',
      label: 'Mã phiếu kho',
      render: (row) => (
        <div className="min-w-[90px]">
          <span className="block font-mono text-xs font-semibold text-slate-800">
            {row.movement_id || '—'}
          </span>
          {row.movement_no && (
            <span className="block font-mono text-xs text-slate-400">{row.movement_no}</span>
          )}
        </div>
      ),
    },
    {
      key: 'created_at',
      label: 'Thời gian',
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-slate-500">{fmtDate(row.created_at)}</span>
      ),
    },
    {
      key: 'type',
      label: 'Loại phiếu',
      render: (row) => {
        const t = MOVEMENT_TYPE_MAP[row.type]
        if (!t) return <span className="text-xs text-slate-400">{row.type}</span>
        return <TagBadge label={t.label} color={t.color} />
      },
    },
    {
      key: 'product',
      label: 'Sản phẩm',
      render: (row) => {
        const p = productMap.get(row.product_id)
        return (
          <div>
            <p className="text-sm font-medium text-slate-900">{p?.name ?? row.product_id}</p>
            {(p?.sku || row.sku) && <p className="text-xs text-slate-400">{p?.sku || row.sku}</p>}
          </div>
        )
      },
    },
    {
      key: 'qty',
      label: 'Số lượng',
      render: (row) => {
        const t = MOVEMENT_TYPE_MAP[row.type]
        const qty = Number(row.qty || 0)
        const isIn = t?.sign === '+'
        const isAdj = t?.sign === '±'
        const color = isAdj
          ? qty >= 0 ? 'text-green-600' : 'text-red-500'
          : isIn ? 'text-green-600' : 'text-red-500'
        const prefix = isAdj ? (qty >= 0 ? '+' : '') : (isIn ? '+' : '-')
        return (
          <span className={`font-semibold tabular-nums ${color}`}>
            {prefix}{Math.abs(qty).toLocaleString('vi-VN')}
          </span>
        )
      },
    },
    {
      key: 'unit_cost',
      label: 'Đơn giá',
      render: (row) => (
        <span className="text-sm text-slate-600">
          {row.unit_cost && Number(row.unit_cost) > 0 ? fmtVND(row.unit_cost) : <span className="text-slate-300">—</span>}
        </span>
      ),
    },
    {
      key: 'movement_no',
      label: 'Mã phiếu kho',
      render: (row) => (
        <span className="font-mono text-sm font-semibold text-slate-800">
          {row.movement_no || <span className="font-normal text-slate-400 text-xs">—</span>}
        </span>
      ),
    },
    {
      key: 'reference_no',
      label: 'Từ phiếu',
      render: (row) => (
        <span className="font-mono text-xs text-[#0268FF]">{row.reference_no || '—'}</span>
      ),
    },
    {
      key: 'reason',
      label: 'Ghi chú',
      render: (row) => (
        <span className="text-xs text-slate-500">{row.reason || '—'}</span>
      ),
    },
  ], [productMap])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Kho hàng</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {activeTab === 'stock'
              ? `${data?.total ?? 0} mặt hàng${isFetching && !isLoading ? ' · Đang cập nhật...' : ''}`
              : `${movementsData?.total ?? 0} phiếu${movementsFetching && !movementsLoading ? ' · Đang cập nhật...' : ''}`}
          </p>
        </div>
        {activeTab === 'stock' && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-xl bg-[#0268FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#0256CC] transition-colors"
          >
            + Nhập / xuất kho
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 w-fit">
        {([
          { key: 'stock',   label: 'Tồn kho hiện tại' },
          { key: 'history', label: 'Lịch sử phiếu kho' },
        ] as { key: Tab; label: string }[]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={[
              'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Stock tab ── */}
      {activeTab === 'stock' && (
        <>
          <SearchBar
            value={search}
            onChange={(v) => { setSearch(v); setStockPage(1) }}
            placeholder="Tìm theo mã SP, SKU..."
          />
          <DataTable
            columns={stockColumns}
            data={data?.data ?? []}
            loading={isLoading}
            pagination={{ page: stockPage, total: data?.total ?? 0, pageSize: 50, onChange: setStockPage }}
            emptyState={
              <EmptyState
                title="Chưa có dữ liệu tồn kho"
                description='Nhấn "+ Nhập / xuất kho" để tạo phiếu đầu tiên.'
              />
            }
            rowKey={(row) => `${row.inventory_id ?? row.product_id}-${row.branch_id}`}
          />
        </>
      )}

      {/* ── History tab ── */}
      {activeTab === 'history' && (
        <>
          {/* Type filter */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setTypeFilter(''); setHistoryPage(1) }}
              className={[
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                typeFilter === '' ? 'bg-[#0268FF] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              Tất cả
            </button>
            {MOVEMENT_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => { setTypeFilter(t.value); setHistoryPage(1) }}
                className={[
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  typeFilter === t.value ? 'bg-[#0268FF] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>

          <SearchBar
            value={historySearch}
            onChange={(v) => { setHistorySearch(v); setHistoryPage(1) }}
            placeholder="Tìm theo mã phiếu, sản phẩm..."
          />

          <DataTable
            columns={historyColumns}
            data={movementsData?.data ?? []}
            loading={movementsLoading}
            pagination={{ page: historyPage, total: movementsData?.total ?? 0, pageSize: 50, onChange: setHistoryPage }}
            emptyState={
              <EmptyState
                title="Chưa có phiếu kho nào"
                description="Các phiếu nhập hàng, bán hàng, trả hàng, điều chỉnh sẽ hiển thị ở đây."
              />
            }
            rowKey={(row, idx) => `${row.movement_id ?? idx}`}
          />
        </>
      )}

      {/* ── Nhập kho slide-over ── */}
      <SlideOver
        open={showForm}
        onClose={closeForm}
        title="Phiếu nhập / xuất kho"
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
              {mutation.isPending ? 'Đang lưu...' : 'Xác nhận'}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Movement type */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Loại phiếu</label>
            <div className="flex flex-wrap gap-2">
              {INPUT_TYPES.map((opt) => (
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
