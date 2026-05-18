'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useDebounce } from 'use-debounce'
import { useSearchParams } from 'next/navigation'
import { DataTable, Column } from '@/app/components/ui/DataTable'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { SearchBar } from '@/app/components/ui/SearchBar'
import { SlideOver } from '@/app/components/ui/SlideOver'
import { TagBadge, TagColor } from '@/app/components/ui/TagBadge'
import { PaymentStatusLabel, PaymentStatus } from '@/app/components/ui/PaymentStatusLabel'
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog'
import { CopyableId } from '@/app/components/ui/CopyableId'

const Eye = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
const ArrowRight = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>

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
  batch_no: '',
  shipment_no: '',
  workflow_status: 'completed' as 'draft' | 'completed',
  payment_status: 'paid' as PaymentStatus,
  discount: '',
  payments: [{ amount: '', method: 'cash' }] as { amount: string, method: string }[],
}

function fmtVND(v: string | number | undefined) {
  return Number(v || 0).toLocaleString('vi-VN') + 'đ'
}

function FormattedNumberInput({
  value,
  onChange,
  disabled,
  placeholder,
  className
}: {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const rawValue = value.replace(/\D/g, '')
  const displayValue = rawValue ? parseInt(rawValue, 10).toLocaleString('vi-VN') : ''

  return (
    <input
      type="text"
      value={displayValue}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
      onChange={(e) => {
        const val = e.target.value.replace(/\D/g, '')
        onChange(val)
      }}
    />
  )
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
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
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
  const params = useParams()
  const pathname = usePathname()
  const [activeTab, setActiveTab] = useState<Tab>('history')

  // Stock tab state
  const [stockPage, setStockPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebounce(search, 300)
  const [showForm, setShowForm] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', email: '', address: '', note: '' })
  const [form, setForm] = useState(EMPTY_FORM)
  const [viewMovement, setViewMovement] = useState<Row | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<{
    product_id: string; name: string; sku: string
  } | null>(null)

  // History tab state
  const searchParams = useSearchParams()
  const initialSearch = searchParams?.get('search') || searchParams?.get('movementId') || ''
  
  const [historyPage, setHistoryPage] = useState(1)
  const [historySearch, setHistorySearch] = useState(initialSearch)
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
      setShowConfirm(false)
      setForm(EMPTY_FORM)
      setSelectedProduct(null)
      queryClient.invalidateQueries({ queryKey: ['inventory', shopId] })
      queryClient.invalidateQueries({ queryKey: ['products-all', shopId] })
      queryClient.invalidateQueries({ queryKey: ['stock-movements', shopId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const createSupplierMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const res = await fetch(`/api/shops/${shopId}/suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Không thể tạo nhà cung cấp')
      return res.json()
    },
    onSuccess: (data) => {
      toast.success('Đã thêm nhà cung cấp!')
      setShowSupplierModal(false)
      setForm(f => ({ ...f, supplier_id: data.id }))
      setSupplierForm({ name: '', phone: '', email: '', address: '', note: '' })
      queryClient.invalidateQueries({ queryKey: ['suppliers', shopId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function handleCreateSupplier(e: React.FormEvent) {
    e.preventDefault()
    if (!supplierForm.name) { toast.error('Vui lòng nhập tên nhà cung cấp'); return }
    createSupplierMutation.mutate(supplierForm)
  }

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
    
    let finalPayments = form.payments
    if (form.type === 'purchase_in') {
      const totalCost = Number(form.unit_cost || 0) * Math.abs(Number(form.qty || 0))
      const discount = Number(form.discount || 0)
      const afterDiscount = Math.max(0, totalCost - discount)
      
      if (form.payment_status === 'paid') {
        finalPayments = [{ amount: String(afterDiscount), method: form.payments[0]?.method || 'cash' }]
      } else if (form.payment_status === 'unpaid') {
        finalPayments = []
      } else {
        // filter out zero amount payments
        finalPayments = form.payments.filter(p => Number(p.amount) > 0)
      }
    }

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
      batch_no: form.batch_no,
      shipment_no: form.shipment_no,
      workflow_status: form.workflow_status,
      payment_status: form.payment_status,
      discount: form.discount,
      payments: finalPayments,
    } as unknown as Record<string, string>)
  }

  function handleOpenConfirm() {
    let finalPayments = form.payments.filter(p => Number(p.amount) > 0)
    let finalStatus = form.payment_status

    if (finalStatus === 'partial' && form.type === 'purchase_in') {
      const totalCost = Number(form.unit_cost || 0) * Math.abs(Number(form.qty || 0))
      const discount = Number(form.discount || 0)
      const afterDiscount = Math.max(0, totalCost - discount)
      const paid = finalPayments.reduce((sum, p) => sum + Number(p.amount), 0)
      const remain = Math.max(0, afterDiscount - paid)

      if (remain === 0 && afterDiscount > 0) {
        finalStatus = 'paid'
      }
    }

    if (finalPayments.length === 0 && finalStatus !== 'unpaid') {
      finalPayments = [{ amount: '', method: form.payments[0]?.method || 'cash' }]
    }

    setForm(f => ({ ...f, payments: finalPayments, payment_status: finalStatus }))
    setShowConfirm(true)
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
      label: 'Mã phiếu',
      render: (row) => (
        <div className="min-w-[90px]">
          {row.movement_id ? (
            <CopyableId id={row.movement_id} className="text-sm font-semibold text-slate-800" />
          ) : (
            <span className="block text-sm font-semibold text-slate-800">—</span>
          )}
          <span className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            {fmtDate(row.created_at)}
          </span>
        </div>
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
          <div className="flex flex-col items-end">
            <span className={`font-semibold tabular-nums ${color}`}>
              {prefix}{Math.abs(qty).toLocaleString('vi-VN')}
            </span>
            {row.type === 'purchase_in' && row.unit_cost && Number(row.unit_cost) > 0 && (
              <span className="text-[11px] text-slate-500 mt-0.5">
                x {fmtVND(row.unit_cost)}
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'payment_status',
      label: 'Thanh toán',
      render: (row) => {
        if (row.type !== 'purchase_in') return <span className="text-slate-300 text-xs">—</span>
        let parsedPayments: any[] = []
        try {
          if (typeof row.payments === 'string' && row.payments.trim()) {
            parsedPayments = JSON.parse(row.payments)
          } else if (Array.isArray(row.payments)) {
            parsedPayments = row.payments
          }
        } catch(e) {}
        
        const methodMap: Record<string, string> = {
          'cash': 'Tiền mặt',
          'transfer': 'CK',
          'card': 'Thẻ'
        }
        
        const methods = Array.from(new Set(parsedPayments.map(p => methodMap[p.method] || p.method)))

        return (
          <div className="flex flex-col gap-1">
            <PaymentStatusLabel 
              status={(row.payment_status as PaymentStatus) || 'paid'} 
              amount={Number(row.paid_amount || (Number(row.unit_cost || 0) * Math.abs(Number(row.qty || 0))))} 
            />
            {methods.length > 0 && (
              <span className="text-[10px] text-slate-500 font-medium">
                {methods.join(' + ')}
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'reference_no',
      label: 'Từ phiếu',
      render: (row) => (
        <div>
          {row.reference_no ? (
            <CopyableId id={row.reference_no} className="text-sm font-semibold text-primary" />
          ) : (
            <span className="block text-sm text-primary">—</span>
          )}
          {row.movement_no && (
            <span className="block text-xs text-slate-400 mt-0.5" title="Mã phiếu kho">{row.movement_no}</span>
          )}
        </div>
      ),
    },
    {
      key: 'workflow_status',
      label: 'Trạng thái',
      render: (row) => {
        if (row.workflow_status === 'draft') {
          return <span className="inline-flex items-center rounded-md bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700 ring-1 ring-inset ring-orange-600/20">Lưu nháp</span>
        }
        return <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/10">Đã xác nhận</span>
      },
    },
    {
      key: 'action',
      label: 'Thao tác',
      render: (row) => (
        <button
          onClick={() => setViewMovement(row)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors"
        >
          <Eye className="h-3.5 w-3.5" /> Xem
        </button>
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
        <button
          onClick={() => setShowForm(true)}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
        >
          + Nhập / xuất kho
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 w-fit">
        {([
          { key: 'history', label: 'Lịch sử phiếu kho' },
          { key: 'stock',   label: 'Tồn kho hiện tại' },
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
                typeFilter === '' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
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
                  typeFilter === t.value ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
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
              onClick={handleOpenConfirm}
              disabled={mutation.isPending || !form.product_id || !form.qty}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? 'Đang lưu...' : 'Lưu phiếu'}
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
                      ? 'bg-primary text-white'
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
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Giá nhập (đ/đv)
                {form.type === 'purchase_in' && (
                  <span className="ml-1 text-blue-500">→ cập nhật giá vốn SP</span>
                )}
              </label>
              <FormattedNumberInput
                value={form.unit_cost}
                onChange={(val) => setForm((f) => ({ ...f, unit_cost: val }))}
                placeholder="0"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          {/* Supplier */}
          {['purchase_in', 'return_in'].includes(form.type) && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-slate-600">Nhà cung cấp</label>
                <button
                  onClick={() => setShowSupplierModal(true)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  + Tạo mới
                </button>
              </div>
              <select
                value={form.supplier_id}
                onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">— Không chọn —</option>
                {(suppliersData?.data ?? []).map((s) => (
                  <option key={s.supplier_id} value={s.id || s.supplier_id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Reference No - only show for certain types or keep it optional, we can hide it for purchase_in if generated, but maybe keep it for others. Let's hide it completely and use reason at the bottom. But what if we still want it? The plan says hide it. We will not render Reference No. */}
          {form.type !== 'purchase_in' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Số phiếu (Tùy chọn)</label>
              <input
                type="text"
                value={form.reference_no}
                onChange={(e) => setForm((f) => ({ ...f, reference_no: e.target.value }))}
                placeholder="Ví dụ: PN-001"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          )}

          {['purchase_in'].includes(form.type) && (
            <>
              {/* Batch + Shipment */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Lô nhập</label>
                  <input
                    type="text"
                    value={form.batch_no}
                    onChange={(e) => setForm((f) => ({ ...f, batch_no: e.target.value }))}
                    placeholder="VD: L01-2024"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Đợt nhập</label>
                  <input
                    type="text"
                    value={form.shipment_no}
                    onChange={(e) => setForm((f) => ({ ...f, shipment_no: e.target.value }))}
                    placeholder="Tùy chọn"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              {/* Discount & Payment Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Giảm giá (VNĐ)</label>
                  <FormattedNumberInput
                    value={form.discount}
                    onChange={(val) => setForm((f) => ({ ...f, discount: val }))}
                    placeholder="0"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Trạng thái thanh toán</label>
                  <select
                    value={form.payment_status}
                    onChange={(e) => setForm((f) => ({ ...f, payment_status: e.target.value as PaymentStatus }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  >
                    <option value="paid">Đã thanh toán đủ</option>
                    <option value="partial">Thanh toán một phần</option>
                    <option value="unpaid">Còn nợ / Chưa thanh toán</option>
                  </select>
                </div>
              </div>

              {/* Payments Array */}
              {form.payment_status !== 'unpaid' && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-700">Chi tiết thanh toán</label>
                    <span className="text-[10px] text-slate-500">
                      Tổng tiền: {fmtVND(Number(form.unit_cost || 0) * Math.abs(Number(form.qty || 0)))}
                    </span>
                  </div>
                  
                  {form.payment_status === 'partial' && (
                    <div className="flex flex-wrap gap-1.5 pb-1">
                      {[10, 30, 50, 80, 100].map(pct => (
                        <button
                          key={pct}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            const totalCost = Number(form.unit_cost || 0) * Math.abs(Number(form.qty || 0))
                            const discount = Number(form.discount || 0)
                            const afterDiscount = Math.max(0, totalCost - discount)
                            const amount = Math.floor(afterDiscount * (pct / 100))
                            setForm(f => ({ 
                              ...f, 
                              payments: [{ amount: String(amount), method: f.payments[0]?.method || 'cash' }] 
                            }))
                          }}
                          className="rounded text-[10px] font-medium bg-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-300 transition-colors"
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  )}

                  {form.payments.map((p, idx) => (
                    <div key={idx} className="flex gap-2">
                      <div className="flex-1">
                        <FormattedNumberInput
                          value={form.payment_status === 'paid' ? String(Math.max(0, (Number(form.unit_cost || 0) * Math.abs(Number(form.qty || 0))) - Number(form.discount || 0))) : p.amount}
                          disabled={form.payment_status === 'paid'}
                          onChange={(val) => {
                            const newP = [...form.payments]
                            newP[idx].amount = val
                            setForm(f => ({ ...f, payments: newP }))
                          }}
                          placeholder="Số tiền"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </div>
                      <div className="w-1/2">
                        <select
                          value={p.method}
                          onChange={(e) => {
                            const newP = [...form.payments]
                            newP[idx].method = e.target.value
                            setForm(f => ({ ...f, payments: newP }))
                          }}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                        >
                          <option value="cash" disabled={form.payments.some((x, i) => i !== idx && x.method === 'cash')}>Tiền mặt</option>
                          <option value="transfer" disabled={form.payments.some((x, i) => i !== idx && x.method === 'transfer')}>Chuyển khoản</option>
                          <option value="card" disabled={form.payments.some((x, i) => i !== idx && x.method === 'card')}>Quẹt thẻ</option>
                        </select>
                      </div>
                      {form.payments.length > 1 && form.payment_status === 'partial' && (
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            const newP = form.payments.filter((_, i) => i !== idx)
                            setForm(f => ({ ...f, payments: newP }))
                          }}
                          className="text-slate-400 hover:text-red-500 px-1"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  
                  {form.payment_status === 'partial' && form.payments.length < 3 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        const totalCost = Number(form.unit_cost || 0) * Math.abs(Number(form.qty || 0))
                        const discount = Number(form.discount || 0)
                        const paid = form.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
                        const remain = Math.max(0, totalCost - discount - paid)
                        const used = form.payments.map(p => p.method)
                        const avail = ['cash', 'transfer', 'card'].find(m => !used.includes(m)) || 'transfer'
                        setForm(f => ({ ...f, payments: [...f.payments, { amount: String(remain), method: avail }] }))
                      }}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      + Thêm thanh toán (Còn lại: {fmtVND(Math.max(0, (Number(form.unit_cost || 0) * Math.abs(Number(form.qty || 0))) - Number(form.discount || 0) - form.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)))})
                    </button>
                  )}
                </div>
              )}

              {/* Workflow Status */}
              <div className="rounded-xl border border-slate-200 p-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.workflow_status === 'draft'}
                    onChange={(e) => setForm((f) => ({ ...f, workflow_status: e.target.checked ? 'draft' : 'completed' }))}
                    className="mt-1 shrink-0 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">Lưu phiếu tạm (Chưa nhập kho)</p>
                    <p className="text-xs text-slate-500">Chỉ tạo phiếu trên hệ thống để theo dõi. Tồn kho và giá vốn chưa cập nhật.</p>
                  </div>
                </label>
              </div>
            </>
          )}

          {/* Ghi chú full-width */}
          <div className="col-span-full pt-2">
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Ghi chú</label>
            <textarea
              rows={2}
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Ghi chú thêm về phiếu nhập/xuất này..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none"
            />
          </div>
        </div>
      </SlideOver>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleSubmit}
        title="Xác nhận lưu phiếu kho"
        confirmLabel="Xác nhận"
        cancelLabel="Hủy bỏ"
        loading={mutation.isPending}
      >
        <div className="space-y-4 text-sm text-slate-600">
          <p>Vui lòng kiểm tra lại thông tin trước khi tạo phiếu kho.</p>
          
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Loại phiếu:</span>
                <span className="font-medium text-slate-900">{movTypeInfo?.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Sản phẩm:</span>
                <span className="font-medium text-slate-900">{selectedProduct?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Số lượng:</span>
                <span className="font-medium text-slate-900">{Number(form.qty) > 0 ? '+' : ''}{form.qty}</span>
              </div>
              
              {form.type === 'purchase_in' && form.unit_cost && Number(form.unit_cost) > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Đơn giá:</span>
                    <span className="font-medium text-slate-900">{fmtVND(form.unit_cost)}</span>
                  </div>
                  <div className="my-2 border-t border-dashed border-slate-300"></div>
                  
                  {(() => {
                    const totalCost = Number(form.unit_cost) * Math.abs(Number(form.qty))
                    const discount = Number(form.discount || 0)
                    const afterDiscount = Math.max(0, totalCost - discount)
                    let paid = 0
                    if (form.payment_status === 'paid') paid = afterDiscount
                    else if (form.payment_status === 'partial') {
                      paid = form.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
                    }
                    const debt = Math.max(0, afterDiscount - paid)
                    
                    return (
                      <>
                        <div className="flex justify-between text-base">
                          <span className="font-medium text-slate-700">Tổng tiền hàng:</span>
                          <span className="font-bold text-slate-900">{fmtVND(totalCost)}</span>
                        </div>
                        {discount > 0 && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Giảm giá:</span>
                            <span className="font-medium text-orange-600">-{fmtVND(discount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-slate-500">Đã thanh toán:</span>
                          <span className="font-medium text-green-600">{fmtVND(paid)}</span>
                        </div>
                        {debt > 0 && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Còn nợ:</span>
                            <span className="font-medium text-orange-600">{fmtVND(debt)}</span>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </>
              )}
              
              {form.workflow_status === 'draft' && (
                <div className="mt-3 rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
                  <span className="font-medium">Lưu ý:</span> Phiếu sẽ được lưu nháp, chưa cập nhật tồn kho và giá vốn.
                </div>
              )}
            </div>
          </div>
        </div>
      </ConfirmDialog>

      {/* View Movement Detail SlideOver */}
      <SlideOver
        open={!!viewMovement}
        onClose={() => setViewMovement(null)}
        title="Chi tiết phiếu kho"
        footer={
          viewMovement?.workflow_status === 'draft' ? (
            <div className="flex w-full items-center justify-between border-t border-slate-100 p-4 bg-slate-50 mt-auto">
              <p className="text-sm text-slate-500">Phiếu này đang lưu nháp</p>
              <button
                type="button"
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
                onClick={() => {
                  toast.error('Chức năng nhập kho từ phiếu nháp đang được phát triển')
                }}
              >
                Nhập kho ngay
              </button>
            </div>
          ) : undefined
        }
      >
        {viewMovement && (
          <div className="space-y-6 px-1">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500 mb-1">Mã phiếu</p>
                <p className="font-medium text-slate-900">{viewMovement.movement_id}</p>
                {viewMovement.movement_no && <p className="text-slate-500 font-mono text-xs">{viewMovement.movement_no}</p>}
              </div>
              <div>
                <p className="text-slate-500 mb-1">Thời gian</p>
                <p className="font-medium text-slate-900">{fmtDate(viewMovement.created_at)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-slate-500 mb-1">Loại phiếu</p>
                <div className="inline-block">
                  <TagBadge 
                    label={MOVEMENT_TYPE_MAP[viewMovement.type]?.label || viewMovement.type} 
                    color={MOVEMENT_TYPE_MAP[viewMovement.type]?.color || 'gray'} 
                  />
                </div>
              </div>
              <div className="col-span-2">
                <p className="text-slate-500 mb-1">Sản phẩm</p>
                <p className="font-medium text-slate-900">{productMap.get(viewMovement.product_id)?.name || viewMovement.product_id}</p>
              </div>
              <div>
                <p className="text-slate-500 mb-1">Số lượng</p>
                <p className="font-medium text-slate-900">{Math.abs(Number(viewMovement.qty)).toLocaleString('vi-VN')}</p>
              </div>
              <div>
                <p className="text-slate-500 mb-1">Đơn giá</p>
                <p className="font-medium text-slate-900">{fmtVND(viewMovement.unit_cost)}</p>
              </div>
              
              {['purchase_in'].includes(viewMovement.type) && (viewMovement.batch_no || viewMovement.shipment_no) && (
                <>
                  {viewMovement.batch_no && (
                    <div>
                      <p className="text-slate-500 mb-1">Lô nhập</p>
                      <p className="font-medium text-slate-900">{viewMovement.batch_no}</p>
                    </div>
                  )}
                  {viewMovement.shipment_no && (
                    <div>
                      <p className="text-slate-500 mb-1">Đợt nhập</p>
                      <p className="font-medium text-slate-900">{viewMovement.shipment_no}</p>
                    </div>
                  )}
                </>
              )}
              
              {viewMovement.type === 'purchase_in' && (() => {
                const totalCost = Number(viewMovement.unit_cost || 0) * Math.abs(Number(viewMovement.qty || 0));
                let paid = Number(viewMovement.paid_amount || 0);
                if (!viewMovement.paid_amount && viewMovement.payment_status === 'paid') paid = totalCost;
                
                const debt = Math.max(0, totalCost - paid);

                const methodMap: Record<string, string> = {
                  'cash': 'Tiền mặt',
                  'transfer': 'Chuyển khoản',
                  'card': 'Quẹt thẻ'
                };

                return (
                  <div className="col-span-2 mt-2 pt-2 border-t border-slate-100">
                    <p className="text-slate-500 mb-2">Thông tin thanh toán</p>
                    <div className="flex items-center justify-between mb-3">
                      <PaymentStatusLabel 
                        status={(viewMovement.payment_status as PaymentStatus) || 'paid'} 
                        amount={paid} 
                      />
                    </div>
                    
                    {(() => {
                      let parsedPayments: any[] = []
                      try {
                        if (typeof viewMovement.payments === 'string' && viewMovement.payments.trim()) {
                          parsedPayments = JSON.parse(viewMovement.payments)
                        } else if (Array.isArray(viewMovement.payments)) {
                          parsedPayments = viewMovement.payments
                        }
                      } catch(e) {}

                      if (parsedPayments.length > 0) {
                        return (
                          <div className="space-y-1.5 mb-3">
                            {parsedPayments.map((p, idx) => (
                              <div key={idx} className="flex gap-4 text-sm">
                                <span className="text-slate-500 w-24">{methodMap[p.method] || p.method}</span>
                                <span className="font-medium text-slate-900">{fmtVND(p.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )
                      }
                      
                      if (viewMovement.payment_method) {
                        return (
                          <div className="mb-3">
                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                              {methodMap[viewMovement.payment_method] || viewMovement.payment_method}
                            </span>
                          </div>
                        )
                      }
                      return null
                    })()}
                    
                    <div className="space-y-1.5 text-sm bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Tổng tiền:</span>
                        <span className="font-medium text-slate-900">{fmtVND(totalCost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Đã thanh toán:</span>
                        <span className="font-medium text-green-600">{fmtVND(paid)}</span>
                      </div>
                      {debt > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Còn nợ:</span>
                          <span className="font-medium text-orange-600">{fmtVND(debt)}</span>
                        </div>
                      )}
                    </div>

                    {debt > 0 && viewMovement.supplier_id && (
                      <div className="mt-4 p-3 bg-blue-50/50 rounded-xl text-sm border border-blue-100">
                        <p className="text-slate-600 mb-2">Công nợ đã được ghi nhận vào hệ thống.</p>
                        <Link 
                          href={`${pathname.replace('/inventory', '/debt')}?supplier=${viewMovement.supplier_id}`}
                          className="text-primary font-medium hover:underline flex items-center gap-1"
                        >
                          Thanh toán công nợ 
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </div>
                    )}
                  </div>
                )
              })()}
              
              {(viewMovement.reason || viewMovement.reference_no) && (
                <div className="col-span-2 mt-2 pt-2 border-t border-slate-100">
                  {viewMovement.reference_no && (
                    <div className="mb-2">
                      <p className="text-slate-500 mb-1">Từ phiếu tham chiếu</p>
                      <p className="font-mono text-primary text-sm">{viewMovement.reference_no}</p>
                    </div>
                  )}
                  {viewMovement.reason && (
                    <div>
                      <p className="text-slate-500 mb-1">Ghi chú</p>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <p className="text-slate-800 italic">{viewMovement.reason}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </SlideOver>

      {/* Quick Add Supplier Modal */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Thêm nhà cung cấp mới</h3>
            <form onSubmit={handleCreateSupplier} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Tên nhà cung cấp <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Số điện thoại</label>
                  <input
                    type="tel"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Mã số thuế</label>
                  <input
                    type="text"
                    value={supplierForm.note} // Reuse note for tax ID or extra details
                    onChange={(e) => setSupplierForm(f => ({ ...f, note: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Địa chỉ</label>
                <input
                  type="text"
                  value={supplierForm.address}
                  onChange={(e) => setSupplierForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={createSupplierMutation.isPending}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                >
                  {createSupplierMutation.isPending ? 'Đang lưu...' : 'Lưu thông tin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
