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

const Eye = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
const ArrowRight = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>

interface Props {
  shopId: string
  shopName: string
}

type Row = Record<string, string>
type Tab = 'stock' | 'history'

// ── Movement type metadata ────────────────────────────────────────────────────

const MOVEMENT_TYPES = [
  { value: 'purchase_in', label: 'Nhập hàng', color: 'blue' as TagColor, sign: '+', hint: 'Hàng về từ NCC → tăng tồn kho, cập nhật giá vốn' },
  { value: 'sale_out', label: 'Bán hàng', color: 'green' as TagColor, sign: '-', hint: 'Xuất kho khi bán hàng' },
  { value: 'return_in', label: 'Hàng trả về', color: 'red' as TagColor, sign: '+', hint: 'Khách hoàn trả → tăng tồn kho' },
  { value: 'transfer_out', label: 'Xuất chuyển kho', color: 'orange' as TagColor, sign: '-', hint: 'Chuyển hàng sang chi nhánh khác' },
  { value: 'transfer_in', label: 'Nhập chuyển kho', color: 'purple' as TagColor, sign: '+', hint: 'Nhận hàng từ chi nhánh khác' },
  { value: 'adjustment', label: 'Điều chỉnh', color: 'yellow' as TagColor, sign: '±', hint: 'Kiểm kê / điều chỉnh tồn kho' },
]

const MOVEMENT_TYPE_MAP = Object.fromEntries(MOVEMENT_TYPES.map((t) => [t.value, t]))

const INPUT_TYPES = MOVEMENT_TYPES.filter((t) => ['purchase_in', 'return_in', 'adjustment', 'transfer_in'].includes(t.value))

interface FormItem {
  product_id: string
  product_name: string
  sku: string
  qty: string
  unit_cost: string
  is_new?: boolean
  category_name?: string
  sell_price?: string
  min_price?: string
  unit?: string
}

const EMPTY_FORM = {
  type: 'purchase_in',
  items: [
    {
      product_id: '',
      product_name: '',
      sku: '',
      qty: '',
      unit_cost: '',
      is_new: false,
      category_name: '',
      sell_price: '',
      min_price: '',
      unit: '',
    }
  ] as FormItem[],
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
  onChange: (p: { product_id: string; name: string; sku: string; cost_price?: string; is_new?: boolean }) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [debouncedQ] = useDebounce(q, 250)
  const ref = useRef<HTMLDivElement>(null)

  const { data } = useQuery({
    queryKey: ['products-search', shopId, debouncedQ],
    queryFn: async () => {
      const sp = new URLSearchParams({ limit: '20' })
      sp.set('exclude_product_type', 'variant_parent')
      if (debouncedQ) sp.set('search', debouncedQ)
      const res = await fetch(`/api/shops/${shopId}/products?${sp}`)
      if (!res.ok) return { data: [] as Row[] }
      const json = await res.json() as { data: Row[] }
      return {
        data: json.data.map(p => {
          let displayName = p.name
          if (p.product_type === 'variant_child' && p.variant_options) {
            try {
              const opts = JSON.parse(p.variant_options)
              const vals = Object.values(opts).join(' / ')
              if (vals) displayName = `${p.name} (${vals})`
            } catch { }
          }
          return { ...p, displayName }
        })
      }
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
      <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/70 px-2 py-0.5 min-h-[38px]">
        <div className="truncate flex-1 min-w-0 pr-1.5">
          <div className="flex items-center gap-1 truncate">
            <p className="text-xs font-semibold text-slate-900 truncate leading-normal">{value.name}</p>
            {value.product_id === 'new' && (
              <span className="shrink-0 inline-flex items-center rounded bg-emerald-50 px-1 py-0.2 text-[8px] font-bold text-emerald-700 border border-emerald-200">
                Mới
              </span>
            )}
          </div>
          {value.sku && <p className="text-[9px] text-slate-500 truncate font-mono leading-none mt-0.5">SKU: {value.sku}</p>}
        </div>
        <button
          type="button"
          onClick={() => onChange({ product_id: '', name: '', sku: '' })}
          className="text-slate-400 hover:text-red-500 px-0.5 text-[10px] shrink-0"
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
        onKeyDown={(e) => {
          if (e.key === 'Enter' && q.trim()) {
            e.preventDefault()
            onChange({ product_id: 'new', name: q, sku: '', is_new: true })
            setQ('')
            setOpen(false)
          }
        }}
        placeholder="Gõ tên hoặc SKU sản phẩm..."
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg max-h-60 overflow-y-auto">
          {q && (
            <button
              type="button"
              onClick={() => {
                onChange({ product_id: 'new', name: q, sku: '', is_new: true })
                setQ('')
                setOpen(false)
              }}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-semibold text-primary hover:bg-primary/5 hover:text-primary-dark border-b border-slate-100 transition-colors"
            >
              <span className="truncate flex-1 min-w-0 pr-2">+ Tạo mới sản phẩm: <span className="text-slate-900 font-bold">"{q}"</span></span>
              <kbd className="inline-flex items-center gap-0.5 font-sans font-semibold text-slate-700 bg-white border border-slate-300 rounded px-1.5 py-0.5 shadow-[0_1.5px_0_0_rgba(0,0,0,0.15)] text-[10px] leading-none">
                <span className="text-[12px] leading-none">↵</span> Enter
              </kbd>
            </button>
          )}
          {(data?.data as any[] ?? []).length > 0 ? (
            (data?.data as any[] ?? []).map((p) => (
              <button
                key={p.product_id}
                onClick={() => {
                  onChange({ product_id: p.product_id, name: p.displayName || p.name, sku: p.sku, cost_price: p.cost_price })
                  setQ('')
                  setOpen(false)
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <div className="truncate flex-1 pr-2">
                  <span className="font-medium text-slate-900 truncate block sm:inline">{p.displayName || p.name}</span>
                  {p.sku && <span className="ml-2 text-xs text-slate-400">{p.sku}</span>}
                </div>
                <span className="text-xs text-slate-500 shrink-0">{fmtVND(p.cost_price)}/đv</span>
              </button>
            ))
          ) : (
            !q && <p className="px-3 py-2 text-sm text-slate-400">Gõ để tìm kiếm</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Category autocomplete ─────────────────────────────────────────────────────

function CategorySelect({
  categories,
  value,
  onChange,
}: {
  categories: { name: string }[]
  value: string
  onChange: (val: string) => void
}) {
  const [q, setQ] = useState(value)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQ(value)
  }, [value])

  useEffect(() => {
    function out(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', out)
    return () => document.removeEventListener('mousedown', out)
  }, [])

  const filtered = categories.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase().trim())
  )

  const exactMatch = categories.some(c =>
    c.name.toLowerCase().trim() === q.toLowerCase().trim()
  )

  return (
    <div ref={ref} className="relative flex-1">
      <input
        type="text"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Chọn hoặc nhập nhóm..."
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto">
          {q.trim() && !exactMatch && (
            <button
              type="button"
              onClick={() => {
                onChange(q.trim())
                setOpen(false)
              }}
              className="flex w-full items-center px-3 py-2 text-left text-sm font-semibold text-primary hover:bg-primary/5 hover:text-primary-dark border-b border-slate-100 transition-colors"
            >
              + Tạo mới nhóm: "{q.trim()}"
            </button>
          )}
          {filtered.length > 0 ? (
            filtered.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setQ(c.name)
                  onChange(c.name)
                  setOpen(false)
                }}
                className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-slate-50 text-slate-800"
              >
                {c.name}
              </button>
            ))
          ) : (
            !q.trim() && (
              <p className="px-3 py-2 text-xs text-slate-400 text-center">Gõ để tìm hoặc thêm nhóm mới</p>
            )
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

  // Quick product create states
  const [quickCreateModal, setQuickCreateModal] = useState(false)
  const [quickCreateIdx, setQuickCreateIdx] = useState<number | null>(null)
  const [quickProductForm, setQuickProductForm] = useState({
    name: '',
    category_name: '',
    sell_price: '',
    min_price: '',
    unit: 'Cái',
  })

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

  // Categories — for quick product creation
  const { data: categoriesData } = useQuery({
    queryKey: ['categories', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/categories?limit=500`)
      if (!res.ok) return { data: [] as Row[] }
      return res.json() as Promise<{ data: Row[] }>
    },
  })

  const productMap = useMemo(() => {
    const m = new Map<string, Row>()
    productsData?.data?.forEach((p) => {
      let displayName = p.name
      if (p.product_type === 'variant_child' && p.variant_options) {
        try {
          const opts = JSON.parse(p.variant_options)
          const vals = Object.values(opts).join(' / ')
          if (vals) displayName = `${p.name} (${vals})`
        } catch { }
      }
      m.set(p.product_id, { ...p, displayName })
    })
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
    mutationFn: async (payload: any) => {
      const endpoint = payload.type === 'adjustment'
        ? `/api/shops/${shopId}/inventory/adjust-batch`
        : `/api/shops/${shopId}/stock-movements/batch`

      const res = await fetch(endpoint, {
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
      toast.success('Lưu phiếu kho thành công!')
      setShowForm(false)
      setShowConfirm(false)
      setForm(EMPTY_FORM)
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

  // Row handlers
  const handleAddItemRow = () => {
    setForm(f => ({
      ...f,
      items: [
        ...f.items,
        {
          product_id: '',
          product_name: '',
          sku: '',
          qty: '',
          unit_cost: '',
          is_new: false,
          category_name: '',
          sell_price: '',
          min_price: '',
        }
      ]
    }))
  }

  const handleRemoveItemRow = (idx: number) => {
    if (form.items.length <= 1) return
    setForm(f => ({
      ...f,
      items: f.items.filter((_, i) => i !== idx)
    }))
  }

  const handleSelectItemProduct = (
    idx: number,
    p: { product_id: string; name: string; sku: string; cost_price?: string; is_new?: boolean }
  ) => {
    if (p.is_new) {
      setQuickCreateIdx(idx)
      setQuickProductForm({
        name: p.name,
        category_name: '',
        sell_price: '',
        min_price: '',
        unit: 'Cái',
      })
      setQuickCreateModal(true)
      return
    }

    const newItems = [...form.items]
    newItems[idx] = {
      product_id: p.product_id,
      product_name: p.name,
      sku: p.sku,
      qty: newItems[idx]?.qty || '',
      unit_cost: p.cost_price || newItems[idx]?.unit_cost || '',
      is_new: false,
      category_name: '',
      sell_price: '',
      min_price: '',
    }
    setForm(f => ({ ...f, items: newItems }))
  }

  const handleConfirmQuickCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (quickCreateIdx === null) return

    const newItems = [...form.items]
    newItems[quickCreateIdx] = {
      product_id: '',
      product_name: quickProductForm.name,
      sku: `SP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      qty: newItems[quickCreateIdx]?.qty || '',
      unit_cost: newItems[quickCreateIdx]?.unit_cost || '',
      is_new: true,
      category_name: quickProductForm.category_name,
      sell_price: quickProductForm.sell_price || '0',
      min_price: quickProductForm.min_price || '0',
      unit: quickProductForm.unit || 'Cái',
    }

    setForm(f => ({ ...f, items: newItems }))
    setQuickCreateModal(false)
    setQuickCreateIdx(null)
  }

  function handleSubmit() {
    const invalidItem = form.items.find(item => !item.product_id && !item.is_new)
    if (invalidItem) { toast.error('Vui lòng chọn đầy đủ sản phẩm'); return }

    const invalidQty = form.items.find(item => !item.qty || Number(item.qty) === 0)
    if (invalidQty) { toast.error('Số lượng của tất cả sản phẩm phải khác 0'); return }

    let finalPayments = form.payments
    if (form.type === 'purchase_in') {
      const totalCost = form.items.reduce((sum, item) => sum + (Number(item.unit_cost || 0) * Math.abs(Number(item.qty || 0))), 0)
      const discount = Number(form.discount || 0)
      const afterDiscount = Math.max(0, totalCost - discount)

      if (form.payment_status === 'paid') {
        finalPayments = [{ amount: String(afterDiscount), method: form.payments[0]?.method || 'cash' }]
      } else if (form.payment_status === 'unpaid') {
        finalPayments = []
      } else {
        finalPayments = form.payments.filter(p => Number(p.amount) > 0)
      }
    }

    const payload = form.type === 'adjustment' ? {
      branch_id: '',
      reason: form.reason,
      reference_no: form.reference_no,
      items: form.items.map(item => ({
        product_id: item.product_id || undefined,
        qty: item.qty,
        unit_cost: item.unit_cost || undefined,
        is_new: item.is_new,
        product_name: item.product_name,
        category_name: item.category_name,
        sell_price: item.sell_price,
        min_price: item.min_price,
        sku: item.sku,
        unit: item.unit,
      }))
    } : {
      type: form.type,
      branch_id: '',
      supplier_id: form.supplier_id,
      reference_no: form.reference_no,
      reason: form.reason,
      discount: form.discount || '0',
      payments: finalPayments,
      workflow_status: form.workflow_status,
      payment_status: form.payment_status,
      items: form.items.map(item => ({
        product_id: item.product_id || undefined,
        qty: item.qty,
        unit_cost: item.unit_cost || '0',
        sku: item.sku,
        is_new: item.is_new,
        product_name: item.product_name,
        category_name: item.category_name,
        sell_price: item.sell_price,
        min_price: item.min_price,
        unit: item.unit,
      }))
    }

    mutation.mutate({ ...payload, type: form.type })
  }

  function handleOpenConfirm() {
    let finalPayments = form.payments.filter(p => Number(p.amount) > 0)
    let finalStatus = form.payment_status

    if (finalStatus === 'partial' && form.type === 'purchase_in') {
      const totalCost = form.items.reduce((sum, item) => sum + (Number(item.unit_cost || 0) * Math.abs(Number(item.qty || 0))), 0)
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
            <p className="text-sm font-medium text-slate-900">{p?.displayName ?? p?.name ?? row.product_id}</p>
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
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
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
            <p className="text-sm font-medium text-slate-900">{p?.displayName ?? p?.name ?? row.product_id}</p>
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
        } catch (e) { }

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
          { key: 'stock', label: 'Tồn kho hiện tại' },
        ] as { key: Tab; label: string }[]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={[
              'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'bg-primary text-white shadow-sm'
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
        width={780}
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
              disabled={mutation.isPending || form.items.some(item => !item.qty)}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? 'Đang lưu...' : 'Lưu phiếu'}
            </button>
          </div>
        }
      >
        <div className="space-y-5 overflow-visible">
          {/* Movement type */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Loại phiếu</label>
            <div className="flex flex-wrap gap-2">
              {INPUT_TYPES.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm((f) => ({
                    ...f,
                    type: opt.value,
                    workflow_status: opt.value === 'adjustment' ? 'completed' : f.workflow_status
                  }))}
                  className={[
                    'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    form.type === opt.value
                      ? 'bg-primary text-white font-semibold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {movTypeInfo && (
              <p className="mt-1.5 text-[11px] text-slate-400">{movTypeInfo.hint}</p>
            )}
            {form.type === 'adjustment' && (
              <div className="mt-3 flex gap-2 rounded-xl bg-amber-50/80 border border-amber-100 p-3 text-xs text-amber-800 leading-relaxed shadow-sm">
                <svg className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                <span>Phiếu điều chỉnh chỉ dùng để kiểm kê và cân đối số lượng tồn kho thực tế, <strong>không</strong> phát sinh phiếu chi, công nợ nhà cung cấp hay doanh thu.</span>
              </div>
            )}
          </div>

          {/* Danh sách sản phẩm (Table / Data Grid) */}
          <div className="space-y-2 overflow-visible">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Danh sách sản phẩm</span>
            </div>

            <div className="overflow-visible">
              <table className="w-full text-left text-sm text-slate-500 overflow-visible table-fixed">
                <thead className="bg-slate-50 text-[10px] uppercase text-slate-700 font-semibold">
                  <tr>
                    <th scope="col" className="px-2 py-2 rounded-l-lg">Sản phẩm *</th>
                    <th scope="col" className="px-2 py-2 w-20 text-center">SL *</th>
                    <th scope="col" className="px-2 py-2 w-32">
                      {form.type === 'purchase_in' ? 'Giá nhập (đ)' : form.type === 'adjustment' ? 'Giá vốn (đ)' : 'Đơn giá (đ)'}
                    </th>
                    <th scope="col" className="px-2 py-2 w-8 text-center rounded-r-lg"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 overflow-visible">
                  {form.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 overflow-visible relative" style={{ zIndex: 100 - idx }}>
                      <td className="px-2 py-1.5 align-top overflow-visible relative" style={{ zIndex: 100 - idx }}>
                        <ProductSelect
                          shopId={shopId}
                          value={item.product_id || item.is_new ? { product_id: item.product_id || 'new', name: item.product_name, sku: item.sku } : null}
                          onChange={(p) => handleSelectItemProduct(idx, p)}
                        />
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <input
                          type="number"
                          value={item.qty}
                          onChange={(e) => {
                            const newItems = [...form.items]
                            newItems[idx].qty = e.target.value
                            setForm(f => ({ ...f, items: newItems }))
                          }}
                          placeholder={form.type === 'adjustment' ? '±10' : '0'}
                          className="w-full text-center rounded-xl border border-slate-200 px-2 py-2 text-sm focus:border-primary focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <FormattedNumberInput
                          value={item.unit_cost}
                          onChange={(val) => {
                            const newItems = [...form.items]
                            newItems[idx].unit_cost = val
                            setForm(f => ({ ...f, items: newItems }))
                          }}
                          placeholder="0"
                          className="w-full rounded-xl border border-slate-200 px-2 py-2 text-sm focus:border-primary focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1.5 align-top text-center">
                        {form.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(idx)}
                            className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 transition-colors mt-1"
                            title="Xóa dòng"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {/* Button tạo mới sản phẩm ở dòng cuối cùng */}
                  <tr>
                    <td colSpan={4} className="px-2 py-2">
                      <button
                        type="button"
                        onClick={handleAddItemRow}
                        className="w-full py-2 border border-dashed border-slate-200 rounded-xl text-xs font-semibold text-primary hover:bg-primary/5 hover:border-primary/30 transition-all flex items-center justify-center gap-1"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        Thêm sản phẩm
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {form.type === 'purchase_in' && (
              <div className="mt-2 flex gap-2 rounded-xl bg-blue-50/80 border border-blue-100 p-3 text-xs text-blue-700 leading-relaxed shadow-sm">
                <svg className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                <span>Thay đổi đơn giá ở đây đồng thời sẽ cập nhật lại giá vốn trên hệ thống.</span>
              </div>
            )}
          </div>

          {/* Supplier */}
          {['purchase_in', 'return_in'].includes(form.type) && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-600">Nhà cung cấp</label>
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(true)}
                  className="text-xs font-medium text-primary hover:underline hover:text-primary-dark"
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

          {/* Reference No - Hide for purchase_in */}
          {form.type !== 'purchase_in' && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Số phiếu (Tùy chọn)</label>
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
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Lô nhập</label>
                  <input
                    type="text"
                    value={form.batch_no}
                    onChange={(e) => setForm((f) => ({ ...f, batch_no: e.target.value }))}
                    placeholder="VD: L01-2024"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Đợt nhập</label>
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
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Giảm giá (VNĐ)</label>
                  <FormattedNumberInput
                    value={form.discount}
                    onChange={(val) => setForm((f) => ({ ...f, discount: val }))}
                    placeholder="0"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Trạng thái thanh toán</label>
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
                    <label className="text-xs font-semibold text-slate-700">Chi tiết thanh toán</label>
                    <span className="text-[10px] text-slate-500 font-bold">
                      Tổng tiền: {fmtVND(form.items.reduce((sum, item) => sum + (Number(item.unit_cost || 0) * Math.abs(Number(item.qty || 0))), 0))}
                    </span>
                  </div>

                  {form.payment_status === 'partial' && (
                    <div className="flex flex-wrap gap-1 pb-1">
                      {[10, 30, 50, 80, 100].map(pct => (
                        <button
                          key={pct}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            const totalCost = form.items.reduce((sum, item) => sum + (Number(item.unit_cost || 0) * Math.abs(Number(item.qty || 0))), 0)
                            const discount = Number(form.discount || 0)
                            const afterDiscount = Math.max(0, totalCost - discount)
                            const amount = Math.floor(afterDiscount * (pct / 100))
                            setForm(f => ({
                              ...f,
                              payments: [{ amount: String(amount), method: f.payments[0]?.method || 'cash' }]
                            }))
                          }}
                          className="rounded text-[10px] font-medium bg-slate-200 px-1.5 py-0.5 text-slate-700 hover:bg-slate-300 transition-colors"
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
                          value={form.payment_status === 'paid' ? String(Math.max(0, form.items.reduce((sum, item) => sum + (Number(item.unit_cost || 0) * Math.abs(Number(item.qty || 0))), 0) - Number(form.discount || 0))) : p.amount}
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
                        </select>
                      </div>
                      {form.payments.length > 1 && form.payment_status === 'partial' && (
                        <button
                          type="button"
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
                        const totalCost = form.items.reduce((sum, item) => sum + (Number(item.unit_cost || 0) * Math.abs(Number(item.qty || 0))), 0)
                        const discount = Number(form.discount || 0)
                        const paid = form.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
                        const remain = Math.max(0, totalCost - discount - paid)
                        const used = form.payments.map(p => p.method)
                        const avail = ['cash', 'transfer', 'card'].find(m => !used.includes(m)) || 'transfer'
                        setForm(f => ({ ...f, payments: [...f.payments, { amount: String(remain), method: avail }] }))
                      }}
                      className="text-xs font-medium text-primary hover:underline hover:text-primary-dark"
                    >
                      + Thêm thanh toán (Còn lại: {fmtVND(Math.max(0, form.items.reduce((sum, item) => sum + (Number(item.unit_cost || 0) * Math.abs(Number(item.qty || 0))), 0) - Number(form.discount || 0) - form.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)))})
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Workflow Status */}
          {form.type !== 'adjustment' && (
            <div className="rounded-xl border border-slate-200 p-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.workflow_status === 'draft'}
                  onChange={(e) => setForm((f) => ({ ...f, workflow_status: e.target.checked ? 'draft' : 'completed' }))}
                  className="mt-1 shrink-0 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Lưu phiếu tạm (Chưa nhập kho)</p>
                  <p className="text-xs text-slate-500">Chỉ tạo phiếu trên hệ thống để theo dõi. Tồn kho và các hạch toán tài chính chưa cập nhật.</p>
                </div>
              </label>
            </div>
          )}

          {/* Ghi chú */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Ghi chú</label>
            <textarea
              rows={2}
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Ghi chú thêm về phiếu này..."
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
                <span className="text-slate-500">Danh sách sản phẩm:</span>
                <span className="font-medium text-slate-900">{form.items.length} mặt hàng</span>
              </div>

              <div className="mt-2 max-h-40 overflow-y-auto space-y-1 rounded-lg border border-slate-100 bg-white p-2">
                {form.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-xs gap-4">
                    <span className="text-slate-600 truncate max-w-[240px]">
                      {item.product_name || 'Chưa chọn sản phẩm'}
                    </span>
                    <span className="font-mono text-slate-900 shrink-0">
                      x{item.qty} {item.unit_cost && Number(item.unit_cost) > 0 ? `(${fmtVND(item.unit_cost)})` : ''}
                    </span>
                  </div>
                ))}
              </div>

              {form.type === 'purchase_in' && (
                <>
                  <div className="my-2 border-t border-dashed border-slate-300"></div>

                  {(() => {
                    const totalCost = form.items.reduce((sum, item) => sum + (Number(item.unit_cost || 0) * Math.abs(Number(item.qty || 0))), 0)
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
                <p className="font-medium text-slate-900">{productMap.get(viewMovement.product_id)?.displayName || productMap.get(viewMovement.product_id)?.name || viewMovement.product_id}</p>
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
                      } catch (e) { }

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

      {/* Quick Add Product Modal */}
      {quickCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Thêm sản phẩm nhanh</h3>
            <form onSubmit={handleConfirmQuickCreate} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Tên sản phẩm <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={quickProductForm.name}
                  onChange={(e) => setQuickProductForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Đơn vị tính <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={quickProductForm.unit}
                    onChange={(e) => setQuickProductForm(f => ({ ...f, unit: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Phân loại</label>
                  <CategorySelect
                    categories={(categoriesData?.data as any[] ?? []).map(c => ({ name: String(c.name || '') }))}
                    value={quickProductForm.category_name}
                    onChange={(val) => setQuickProductForm(f => ({ ...f, category_name: val }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Giá bán lẻ (đ)</label>
                  <FormattedNumberInput
                    value={quickProductForm.sell_price}
                    onChange={(val) => setQuickProductForm(f => {
                      const syncMin = !f.min_price || f.min_price === f.sell_price;
                      return {
                        ...f,
                        sell_price: val,
                        min_price: syncMin ? val : f.min_price
                      };
                    })}
                    placeholder="0"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Giá tối thiểu (giá sàn) (đ)</label>
                  <FormattedNumberInput
                    value={quickProductForm.min_price}
                    onChange={(val) => setQuickProductForm(f => ({ ...f, min_price: val }))}
                    placeholder="0"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setQuickCreateModal(false)
                    setQuickCreateIdx(null)
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
                >
                  Thêm vào phiếu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
