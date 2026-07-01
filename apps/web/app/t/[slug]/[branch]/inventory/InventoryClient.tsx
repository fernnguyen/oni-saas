'use client'
import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
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
import { usePermissions } from '@/app/components/ui/PermissionGate'
import { localDb } from '@/lib/localDb/schema'
import { hydrateAll } from '@/lib/localDb/hydration'

const Eye = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
const ArrowRight = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
const ChevronDown = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m6 9 6 6 6-6" /></svg>
const ChevronUp = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m18 15-6-6-6 6" /></svg>
const Minus = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="5" y1="12" x2="19" y2="12" /></svg>
const Plus = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>

interface Props {
  shopId: string
  shopName: string
  planCode?: string
}

type Row = Record<string, string>
type Tab = 'stock' | 'history'

// ── Movement type metadata ────────────────────────────────────────────────────

const MOVEMENT_TYPES = [
  { value: 'purchase_in', label: 'Nhập hàng', color: 'blue' as TagColor, sign: '+', hint: 'Hàng về từ NCC → tăng tồn kho, cập nhật giá vốn' },
  { value: 'p2p_purchase_in', label: 'Nhập hàng P2P', color: 'indigo' as TagColor, sign: '+', hint: 'Hàng về từ NCC qua đối chiếu mua sắm P2P' },
  { value: 'sale_out', label: 'Bán hàng', color: 'green' as TagColor, sign: '-', hint: 'Xuất kho khi bán hàng' },
  { value: 'return_in', label: 'Hàng trả về', color: 'red' as TagColor, sign: '+', hint: 'Khách hoàn trả → tăng tồn kho' },
  { value: 'transfer_out', label: 'Xuất chuyển kho', color: 'orange' as TagColor, sign: '-', hint: 'Chuyển hàng sang chi nhánh khác' },
  { value: 'transfer_in', label: 'Nhập chuyển kho', color: 'purple' as TagColor, sign: '+', hint: 'Nhận hàng từ chi nhánh khác' },
  { value: 'adjustment', label: 'Điều chỉnh', color: 'yellow' as TagColor, sign: '±', hint: 'Kiểm kê / điều chỉnh tồn kho' },
]

const MOVEMENT_TYPE_MAP = Object.fromEntries(MOVEMENT_TYPES.map((t) => [t.value, t]))

const INPUT_TYPES = MOVEMENT_TYPES.filter((t) => ['purchase_in', 'transfer_out', 'transfer_in', 'return_in', 'adjustment'].includes(t.value))

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
  batch_no?: string
  expiry_date?: string
  batches?: {
    batch_no: string
    expiry_date: string
    qty: string
    current_qty?: number
    is_deleted?: boolean
  }[]
  has_existing_batches?: boolean
  existing_batches?: {
    batch_no: string
    expiry_date?: string
    stock_qty?: number
  }[]
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
      batch_no: '',
      expiry_date: '',
    }
  ] as FormItem[],
  supplier_id: '',
  reference_no: '',
  reason: '',
  batch_no: '',
  shipment_no: '',
  warehouse_id: '',
  to_warehouse_id: '',
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
  
  // Format: YYYY-MM-DD
  const isDateOnly = v.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(v)
  if (isDateOnly) {
    const [year, month, day] = v.split('-')
    return `${day}/${month}/${year}`
  }

  // Parse datetime. If the string lacks a timezone offset, and doesn't end with Z,
  // but we know it's stored as local time (e.g. from getGMT7Time() without Z),
  // we append '+07:00' to force the browser to parse it as GMT+7!
  let normalized = v
  if ((v.includes('T') || v.includes(' ')) && !v.endsWith('Z') && !v.match(/[\+\-]\d{2}:?\d{2}$/)) {
    normalized = v.replace(' ', 'T') + '+07:00'
  }

  const d = new Date(normalized)
  if (isNaN(d.getTime())) return v
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = pad(d.getDate())
  const month = pad(d.getMonth() + 1)
  const year = d.getFullYear()
  
  const hours = pad(d.getHours())
  const minutes = pad(d.getMinutes())
  return `${hours}:${minutes} ${day}/${month}/${year}`
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

export function InventoryClient({ shopId, shopName, planCode }: Props) {
  const queryClient = useQueryClient()
  const { hasPermission } = usePermissions()
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')

  // Warehouses query
  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/warehouses?limit=100`)
      if (!res.ok) return { data: [] as Row[] }
      return res.json() as Promise<{ data: Row[] }>
    },
  })

  // Reset selectedWarehouseId when shop changes to avoid mismatched warehouse IDs
  useEffect(() => {
    setSelectedWarehouseId('')
  }, [shopId])

  // Automatically select the primary sales warehouse by default
  useEffect(() => {
    if (warehousesData?.data && warehousesData.data.length > 0 && !selectedWarehouseId) {
      const saleWh = warehousesData.data.find((w: any) => w.code === 'sale') || warehousesData.data[0]
      if (saleWh) {
        setSelectedWarehouseId(saleWh.id || saleWh.warehouse_id)
      }
    }
  }, [warehousesData, selectedWarehouseId])

  // Fetch user details / role inside tenant
  const { data: permissionsData } = useQuery({
    queryKey: ['user-permissions', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/settings`)
      return res.json()
    },
  })

  const hasPricingPermission = useMemo(() => {
    return hasPermission(['admin', 'owner', 'purchaser', 'purchasing.manage', 'chief_accountant', 'settings.manage'])
  }, [hasPermission])
  const params = useParams()
  const pathname = usePathname()
  const [activeTab, setActiveTab] = useState<Tab>('history')

  // Stock tab state
  const [stockPage, setStockPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebounce(search, 300)
  const [showForm, setShowForm] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Selected stock product for batch details modal
  const [selectedStockProduct, setSelectedStockProduct] = useState<any | null>(null)
  const [selectedProductBatches, setSelectedProductBatches] = useState<any[]>([])
  const [loadingBatches, setLoadingBatches] = useState(false)

  // Batch adjustment states
  const [adjustingBatch, setAdjustingBatch] = useState<any | null>(null)
  const [adjustQtyInput, setAdjustQtyInput] = useState<string>('0')
  const [adjustReason, setAdjustReason] = useState<string>('Hủy hàng hết hạn / hư hỏng')
  const [adjustingLoading, setAdjustingLoading] = useState<boolean>(false)

  // Quick batch creation states
  const [addingBatch, setAddingBatch] = useState(false)
  const [newBatchForm, setNewBatchForm] = useState({
    batch_no: '',
    expiry_date: '',
    stock_qty: '0'
  })
  const [addingBatchLoading, setAddingBatchLoading] = useState(false)

  const [batchExpiryMap, setBatchExpiryMap] = useState<Map<string, string>>(new Map())

  const refreshBatchExpiries = useMemo(() => {
    return async () => {
      if (typeof window !== 'undefined' && localDb) {
        try {
          const list = await localDb.inventoryBatches.toArray()
          const m = new Map<string, string>()
          list.forEach(b => {
            if (b.branch_id === shopId && b.batch_no && b.expiry_date) {
              const key = `${b.product_id}_${b.batch_no.trim().toLowerCase()}`
              m.set(key, b.expiry_date)
            }
          })
          setBatchExpiryMap(m)
        } catch (err) {
          console.error('Failed to load batch expiries:', err)
        }
      }
    }
  }, [shopId])

  useEffect(() => {
    refreshBatchExpiries()
  }, [refreshBatchExpiries])

  // Reusable helper to calculate and load warehouse-specific batch stocks
  const loadWarehouseSpecificBatches = async (productId: string, totalStockQty: number, targetWhId: string) => {
    if (typeof window === 'undefined' || !localDb) {
      setSelectedProductBatches([])
      return
    }

    // 1. Get branch batches
    const list = await localDb.inventoryBatches
      .where('[product_id+branch_id]')
      .equals([productId, shopId])
      .toArray()

    // 2. Fetch completed movements of this product to compute warehouse-specific deltas
    let movements: any[] = []
    try {
      const movementsRes = await fetch(`/api/shops/${shopId}/stock-movements?product_id=${productId}&limit=1000`)
      if (movementsRes.ok) {
        const json = await movementsRes.json()
        movements = json.data || []
      }
    } catch (err) {
      console.error('Failed to fetch movements for warehouse-specific batch calculation:', err)
    }

    const calcMovementDelta = (type: string, qty: number): number => {
      const INBOUND_TYPES = ['purchase_in', 'p2p_purchase_in', 'return_in', 'transfer_in']
      const OUTBOUND_TYPES = ['sale_out', 'transfer_out']
      if (INBOUND_TYPES.includes(type)) return Math.abs(qty)
      if (OUTBOUND_TYPES.includes(type)) return -Math.abs(qty)
      return qty
    }

    // 3. Map batches and calculate their stock quantities in the target warehouse
    const calculatedList = list.map(b => {
      let batchQty = 0
      movements.forEach(m => {
        if (m.workflow_status !== 'completed') return
        
        const mBatch = (m.batch_no || '').trim().toLowerCase()
        const bBatch = (b.batch_no || '').trim().toLowerCase()
        if (mBatch !== bBatch) return

        const qty = Math.abs(Number(m.qty || 0))
        
        if (m.warehouse_id === targetWhId) {
          batchQty += calcMovementDelta(m.type, qty)
        }
        
        if (m.to_warehouse_id === targetWhId && m.type === 'transfer_out') {
          batchQty += qty
        }
      })

      return {
        ...b,
        stock_qty: Math.max(0, batchQty)
      }
    })

    // Filter out batches with 0 stock quantity
    let activeBatches = calculatedList.filter(b => b.stock_qty > 0)

    // Fallback: If no movements exist to calculate warehouse-specific stock,
    // use the branch-level batch stocks from Dexie.
    const sumOfCalculatedInitial = activeBatches.reduce((acc, b) => acc + b.stock_qty, 0)
    if (sumOfCalculatedInitial === 0 && list.length > 0) {
      const branchTotal = list.reduce((acc, b) => acc + (b.stock_qty || 0), 0)
      const scaledBatches = list.map(b => {
        let batchStock = b.stock_qty || 0
        if (branchTotal > 0 && totalStockQty !== branchTotal) {
          // Scale proportional to warehouse stock
          batchStock = Math.round((b.stock_qty || 0) * (totalStockQty / branchTotal))
        } else if (branchTotal === 0 && list.length === 1) {
          batchStock = totalStockQty
        }
        return {
          ...b,
          stock_qty: batchStock
        }
      }).filter(b => b.stock_qty > 0)

      if (scaledBatches.length > 0) {
        activeBatches = scaledBatches
      }
    }

    // 4. Healing check: If overall warehouse stock exceeds the sum of batches, allocate to DEFAULT
    const sumOfCalculated = activeBatches.reduce((acc, b) => acc + b.stock_qty, 0)
    if (totalStockQty > sumOfCalculated) {
      const defaultBatch = activeBatches.find(b => b.batch_no.toLowerCase().trim() === 'default')
      if (defaultBatch) {
        defaultBatch.stock_qty += (totalStockQty - sumOfCalculated)
      } else {
        activeBatches.push({
          id: `default-${productId}`,
          product_id: productId,
          branch_id: shopId,
          batch_no: 'DEFAULT',
          expiry_date: '',
          stock_qty: totalStockQty - sumOfCalculated
        })
      }
    }

    // 5. Sort FEFO (earliest expiry first, empty/null expiry dates last)
    activeBatches.sort((a, b) => {
      if (!a.expiry_date) return 1
      if (!b.expiry_date) return -1
      return a.expiry_date.localeCompare(b.expiry_date)
    })

    setSelectedProductBatches(activeBatches)
  }

  const handleConfirmAddBatch = async () => {
    if (!selectedStockProduct) return
    if (!newBatchForm.batch_no.trim()) {
      toast.error('Vui lòng nhập số lô')
      return
    }
    const qty = parseFloat(newBatchForm.stock_qty)
    if (isNaN(qty) || qty <= 0) {
      toast.error('Số lượng tồn thực tế ban đầu phải lớn hơn 0')
      return
    }

    setAddingBatchLoading(true)
    try {
      const product = productMap.get(selectedStockProduct.product_id)
      const targetWhId = selectedStockProduct.warehouse_id || selectedWarehouseId || undefined
      const res = await fetch(`/api/shops/${shopId}/inventory/adjust-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id: shopId,
          warehouse_id: targetWhId,
          reason: `Khởi tạo số dư tồn kho ban đầu - Lô: ${newBatchForm.batch_no.trim()}`,
          items: [
            {
              product_id: selectedStockProduct.product_id,
              qty: String(qty),
              unit_cost: String(product?.cost_price || selectedStockProduct.cost_price || 0),
              batch_no: newBatchForm.batch_no.trim(),
              expiry_date: newBatchForm.expiry_date || new Date().toISOString().split('T')[0]
            }
          ]
        })
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Thêm lô mới thất bại')

      toast.success('Thêm lô và tạo phiếu điều chỉnh thành công!')

      // Sync offline IndexedDB
      try {
        await hydrateAll(shopId, shopId)
        await refreshBatchExpiries()
      } catch (err) {
        console.error('Offline database sync failed:', err)
      }

      // Close modals
      setAddingBatch(false)

      // Reload batches list filtered by warehouse
      setLoadingBatches(true)
      const nextTotalStock = Math.max(0, Number(selectedStockProduct.stock_qty || 0) + qty)
      await loadWarehouseSpecificBatches(selectedStockProduct.product_id, nextTotalStock, targetWhId || 'sale')

      // Update selectedStockProduct total stock
      const updatedStockProduct = {
        ...selectedStockProduct,
        stock_qty: nextTotalStock
      }
      setSelectedStockProduct(updatedStockProduct)

      // Invalidate queries to update background UI
      queryClient.invalidateQueries({ queryKey: ['inventory', shopId] })
      queryClient.invalidateQueries({ queryKey: ['products-all', shopId] })
      queryClient.invalidateQueries({ queryKey: ['stock-movements', shopId] })
    } catch (err: any) {
      toast.error(err.message || 'Có lỗi xảy ra khi thêm lô nhanh')
    } finally {
      setAddingBatchLoading(false)
      setLoadingBatches(false)
    }
  }

  const handleStockRowClick = async (row: any) => {
    setSelectedStockProduct(row)
    setLoadingBatches(true)
    try {
      const targetWhId = row.warehouse_id || selectedWarehouseId
      await loadWarehouseSpecificBatches(row.product_id, Number(row.stock_qty || 0), targetWhId)
    } catch (err) {
      console.error('Failed to load batches:', err)
      setSelectedProductBatches([])
    } finally {
      setLoadingBatches(false)
    }
  }

  const handleInitiateAdjustBatch = (batch: any) => {
    setAdjustingBatch(batch)
    setAdjustQtyInput('0')
    setAdjustReason(`Hủy hàng hết hạn / hư hỏng - Lô: ${batch.batch_no}`)
  }

  const handleConfirmAdjustBatch = async () => {
    if (!adjustingBatch || !selectedStockProduct) return
    setAdjustingLoading(true)
    try {
      const product = productMap.get(selectedStockProduct.product_id)
      const currentQty = Number(adjustingBatch.stock_qty || 0)
      const targetQty = Number(adjustQtyInput)
      const delta = targetQty - currentQty

      if (delta === 0) {
        toast.error('Số lượng tồn không thay đổi')
        setAdjustingLoading(false)
        return
      }

      const targetWhId = selectedStockProduct.warehouse_id || selectedWarehouseId || undefined
      const res = await fetch(`/api/shops/${shopId}/inventory/adjust-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id: shopId,
          warehouse_id: targetWhId,
          reason: adjustReason || `Điều chỉnh lô hàng ${adjustingBatch.batch_no}: ${currentQty} -> ${targetQty}`,
          items: [
            {
              product_id: selectedStockProduct.product_id,
              qty: String(delta),
              batch_no: adjustingBatch.batch_no,
              unit_cost: String(product?.cost_price || selectedStockProduct.cost_price || 0)
            }
          ]
        })
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Điều chỉnh lô thất bại')

      if (typeof window !== 'undefined' && localDb) {
        // Update offline IndexedDB inventoryBatches
        await localDb.inventoryBatches.update(adjustingBatch.id, {
          stock_qty: targetQty
        })

        // Update offline IndexedDB inventory
        const localInvList = await localDb.inventory.where('[product_id+branch_id]').equals([selectedStockProduct.product_id, shopId]).toArray()
        const localInv = localInvList[0]
        if (localInv) {
          const newLocalInvQty = Math.max(0, Number(localInv.stock_qty || 0) + delta)
          await localDb.inventory.where('[product_id+branch_id]').equals([selectedStockProduct.product_id, shopId]).modify({
            stock_qty: newLocalInvQty
          })
        }
      }

      toast.success('Điều chỉnh lô hàng thành công!')
      setAdjustingBatch(null)

      queryClient.invalidateQueries({ queryKey: ['inventory', shopId] })
      queryClient.invalidateQueries({ queryKey: ['products-all', shopId] })

      // Dynamically update SlideOver states
      const nextTotalStock = Math.max(0, Number(selectedStockProduct.stock_qty || 0) + delta)
      const updatedStockProduct = {
        ...selectedStockProduct,
        stock_qty: nextTotalStock
      }
      setSelectedStockProduct(updatedStockProduct)

      // Refetch local batches list filtered by warehouse
      setLoadingBatches(true)
      await loadWarehouseSpecificBatches(selectedStockProduct.product_id, nextTotalStock, targetWhId || 'sale')
      setLoadingBatches(false)
    } catch (error: any) {
      toast.error(error.message || 'Có lỗi xảy ra khi điều chỉnh lô')
    } finally {
      setAdjustingLoading(false)
    }
  }
  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', email: '', address: '', note: '' })
  const [form, setForm] = useState(EMPTY_FORM)
  const [viewMovement, setViewMovement] = useState<Row | null>(null)

  // Automatically pre-select SALE warehouse in the import/export form when opened, and ensure a distinct counterpart warehouse for transfers
  useEffect(() => {
    if (showForm && warehousesData?.data && warehousesData.data.length > 0) {
      setForm((f) => {
        let updatedWarehouseId = f.warehouse_id
        let updatedToWarehouseId = f.to_warehouse_id

        // 1. Populate warehouse_id if empty
        if (!updatedWarehouseId) {
          const saleWh = warehousesData.data.find(
            (w: any) => w.code?.toLowerCase() === 'sale' || w.name?.toLowerCase().includes('sale')
          )
          if (saleWh) {
            updatedWarehouseId = saleWh.id || saleWh.warehouse_id
          } else if (selectedWarehouseId) {
            updatedWarehouseId = selectedWarehouseId
          } else {
            const firstWh = warehousesData.data[0]
            updatedWarehouseId = firstWh.id || firstWh.warehouse_id
          }
        }

        // 2. Populate to_warehouse_id if empty or identical, ensuring it's different from warehouse_id for transfers
        if (['transfer_out', 'transfer_in'].includes(f.type)) {
          if (!updatedToWarehouseId || updatedToWarehouseId === updatedWarehouseId) {
            const distinctWh = warehousesData.data.find(
              (w: any) => (w.id || w.warehouse_id) !== updatedWarehouseId
            )
            if (distinctWh) {
              updatedToWarehouseId = distinctWh.id || distinctWh.warehouse_id
            }
          }
        }

        if (updatedWarehouseId !== f.warehouse_id || updatedToWarehouseId !== f.to_warehouse_id) {
          return { ...f, warehouse_id: updatedWarehouseId, to_warehouse_id: updatedToWarehouseId }
        }
        return f
      })
    }
  }, [showForm, warehousesData, selectedWarehouseId, form.warehouse_id, form.to_warehouse_id, form.type])

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
  const [expandedMovements, setExpandedMovements] = useState<Set<string>>(new Set())
  const toggleMovementExpand = (key: string) => {
    setExpandedMovements((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Inventory rows
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['inventory', shopId, stockPage, debouncedSearch, selectedWarehouseId],
    queryFn: async () => {
      const sp = new URLSearchParams({ page: String(stockPage), limit: '50' })
      if (debouncedSearch) sp.set('search', debouncedSearch)
      if (selectedWarehouseId) sp.set('warehouse_id', selectedWarehouseId)
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
      const res = await fetch(`/api/shops/${shopId}/products?limit=5000`)
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
    queryKey: ['stock-movements', shopId, historyPage, debouncedHistorySearch, typeFilter, selectedWarehouseId],
    queryFn: async () => {
      const sp = new URLSearchParams({ page: String(historyPage), limit: '50' })
      if (debouncedHistorySearch) sp.set('search', debouncedHistorySearch)
      if (typeFilter) sp.set('type', typeFilter)
      if (selectedWarehouseId) sp.set('warehouse_id', selectedWarehouseId)
      const res = await fetch(`/api/shops/${shopId}/stock-movements?${sp}`)
      if (!res.ok) throw new Error('Không tải được lịch sử')
      return res.json() as Promise<{ data: Row[]; total: number }>
    },
    enabled: activeTab === 'history',
  })

  // Sync URL search parameters on load
  useEffect(() => {
    if (!initialSearch) return

    const movementPrefixes = ['SM-', 'PDK-', 'PN-', 'PX-', 'PTH-', 'CKV-', 'CKX-']
    const isMovementSearch = movementPrefixes.some(prefix => initialSearch.toUpperCase().startsWith(prefix))

    if (isMovementSearch) {
      setActiveTab('history')
      setHistorySearch(initialSearch)
      setSearch('')
    } else {
      setActiveTab('stock')
      setSearch(initialSearch)
      setHistorySearch(initialSearch)
    }
  }, [initialSearch])

  // Automatically expand matching movement slip details when searching for a specific slip code
  useEffect(() => {
    if (debouncedHistorySearch && movementsData?.data && movementsData.data.length > 0) {
      const movementPrefixes = ['SM-', 'PDK-', 'PN-', 'PX-', 'PTH-', 'CKV-', 'CKX-']
      const isMovementSearch = movementPrefixes.some(prefix => debouncedHistorySearch.toUpperCase().startsWith(prefix))
      
      if (isMovementSearch) {
        const keys = new Set<string>()
        movementsData.data.forEach((row: any) => {
          const key = row.movement_no || `single-${row.movement_id}`
          keys.add(key)
        })
        setExpandedMovements(keys)
      }
    }
  }, [movementsData, debouncedHistorySearch])

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
      hydrateAll(shopId, shopId)
        .then(() => {
          refreshBatchExpiries()
        })
        .catch((err) => {
          console.error('Lỗi khi đồng bộ IndexedDB:', err)
        })
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
          unit: '',
          batch_no: '',
          expiry_date: '',
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
      // Check if product with the same name is already in the list
      const duplicateNew = form.items.some(
        (item, i) => i !== idx && item.product_name?.toLowerCase().trim() === p.name.toLowerCase().trim()
      )
      if (duplicateNew) {
        toast.error(`Sản phẩm "${p.name}" đã tồn tại trong danh sách!`)
        return
      }

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

    if (p.product_id) {
      const duplicate = form.items.some((item, i) => i !== idx && item.product_id === p.product_id)
      if (duplicate) {
        toast.error(`Sản phẩm "${p.name}" đã tồn tại trong danh sách!`)
        return
      }
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
      unit: '',
      batch_no: newItems[idx]?.batch_no || '',
      expiry_date: newItems[idx]?.expiry_date || '',
    }
    setForm(f => ({ ...f, items: newItems }))

    // Background fetch existing batches and warehouse stock levels to auto-populate SlideOver
    if (p.product_id) {
      Promise.all([
        fetch(`/api/shops/${shopId}/inventory-batches?product_id=${p.product_id}&limit=100`)
          .then(res => res.ok ? res.json() as Promise<{ data: any[] }> : { data: [] }),
        fetch(`/api/shops/${shopId}/inventory?product_id=${p.product_id}&warehouse_id=${form.warehouse_id || selectedWarehouseId}`)
          .then(res => res.ok ? res.json() as Promise<{ data: any[] }> : { data: [] })
      ]).then(([batchesData, invData]) => {
        if (batchesData.data && batchesData.data.length > 0) {
          const systemStockQty = invData.data?.length > 0 ? Number(invData.data[0].stock_qty || 0) : 0

          setForm(f => {
            const currentItem = f.items[idx]
            if (currentItem && currentItem.product_id === p.product_id) {
              const updatedItems = [...f.items]
              
              // Lock batch-managed products
              updatedItems[idx].has_existing_batches = true

              // Store existing batches for search/select suggestion
              const mappedExisting = batchesData.data.map((b: any) => ({
                batch_no: b.batch_no || '',
                expiry_date: b.expiry_date ? b.expiry_date.split('T')[0] : '',
                stock_qty: Number(b.stock_qty || 0)
              }))

              // Healing check: add DEFAULT if unbatched stock exists
              const sumOfBatchQty = batchesData.data.reduce((acc: number, b: any) => acc + Number(b.stock_qty || 0), 0)
              if (systemStockQty > sumOfBatchQty) {
                mappedExisting.push({
                  batch_no: 'DEFAULT',
                  expiry_date: '',
                  stock_qty: systemStockQty - sumOfBatchQty
                })
              }
              updatedItems[idx].existing_batches = mappedExisting

              // Always start with one single blank batch row instead of pre-populating multiple rows!
              updatedItems[idx] = {
                ...updatedItems[idx],
                batches: [{ batch_no: '', expiry_date: '', qty: '1', current_qty: 0 }],
                qty: '1'
              }
              return { ...f, items: updatedItems }
            }
            return f
          })
        }
      }).catch(err => {
        console.error('Error fetching batches in background:', err)
      })
    }
  }

  const handleConfirmQuickCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (quickCreateIdx === null) return

    const duplicate = form.items.some(
      (item, i) => i !== quickCreateIdx && item.product_name?.toLowerCase().trim() === quickProductForm.name.toLowerCase().trim()
    )
    if (duplicate) {
      toast.error(`Sản phẩm "${quickProductForm.name}" đã tồn tại trong danh sách!`)
      return
    }

    const newItems = [...form.items]
    newItems[quickCreateIdx] = {
      product_id: '',
      product_name: quickProductForm.name,
      sku: `TEMP-P-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
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

    // Validate batches if enabled
    const emptyBatches = form.items.find(item => item.batches && item.batches.length === 0)
    if (emptyBatches) {
      toast.error(`Sản phẩm "${emptyBatches.product_name}" bật chế độ nhập theo Lô nhưng chưa có lô hàng con nào`)
      return
    }

    const invalidBatchQty = form.items.find(item =>
      item.batches && item.batches.length > 0 &&
      item.batches.some(b => !b.is_deleted && (!b.qty || Number(b.qty) <= 0))
    )
    if (invalidBatchQty) {
      toast.error(`Số lượng của tất cả lô hàng cho sản phẩm "${invalidBatchQty.product_name}" phải lớn hơn 0`)
      return
    }

    // Final duplicate check safety-net
    const productIds = form.items.map(item => item.product_id).filter(Boolean)
    const hasDuplicateIds = productIds.some((id, idx) => productIds.indexOf(id) !== idx)
    if (hasDuplicateIds) {
      toast.error('Có sản phẩm bị trùng lặp trong danh sách!')
      return
    }

    const productNames = form.items.map(item => item.product_name?.toLowerCase().trim()).filter(Boolean)
    const hasDuplicateNames = productNames.some((name, idx) => productNames.indexOf(name) !== idx)
    if (hasDuplicateNames) {
      toast.error('Có sản phẩm bị trùng lặp trong danh sách!')
      return
    }

    if (!form.warehouse_id) {
      toast.error('Vui lòng chọn Kho thực hiện')
      return
    }

    if (['transfer_out', 'transfer_in'].includes(form.type) && !form.to_warehouse_id) {
      toast.error('Vui lòng chọn Kho đối ứng (Kho đi/đến)')
      return
    }

    if (['transfer_out', 'transfer_in'].includes(form.type) && form.warehouse_id === form.to_warehouse_id) {
      toast.error('Kho đi và Kho đến không được trùng nhau')
      return
    }

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

    // Flatten items if they have sub-batches
    const flattenedItems: any[] = []
    form.items.forEach(item => {
      if (item.batches && item.batches.length > 0) {
        const activeBatches = item.batches.filter(b => !b.is_deleted)
        // Count blank batch numbers to decide default format
        let blankCount = 0
        activeBatches.forEach(b => { if (!b.batch_no?.trim()) blankCount++ })

        let blankIdx = 0
        activeBatches.forEach(b => {
          let finalBatchNo = b.batch_no?.trim()
          if (!finalBatchNo) {
            finalBatchNo = blankCount === 1 ? 'DEFAULT' : `L${blankIdx + 1}`
            blankIdx++
          }
          flattenedItems.push({
            ...item,
            qty: b.qty,
            batch_no: finalBatchNo,
            expiry_date: b.expiry_date || undefined
          })
        })
      } else {
        let finalBatchNo = item.batch_no?.trim()
        if (!finalBatchNo && item.expiry_date) {
          finalBatchNo = 'DEFAULT'
        }
        flattenedItems.push({
          ...item,
          batch_no: finalBatchNo || undefined,
          expiry_date: item.expiry_date || undefined
        })
      }
    })

    const payload = form.type === 'adjustment' ? {
      branch_id: '',
      reason: form.reason,
      reference_no: form.reference_no,
      warehouse_id: form.warehouse_id || undefined,
      items: flattenedItems.map(item => ({
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
        batch_no: item.batch_no,
        expiry_date: item.expiry_date,
      }))
    } : {
      type: form.type,
      branch_id: '',
      supplier_id: form.supplier_id,
      reference_no: form.reference_no,
      reason: form.reason,
      discount: form.discount || '0',
      payments: finalPayments,
      warehouse_id: form.warehouse_id || undefined,
      to_warehouse_id: form.to_warehouse_id || undefined,
      workflow_status: form.workflow_status,
      payment_status: form.payment_status,
      shipment_no: form.shipment_no,
      items: flattenedItems.map(item => ({
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
        batch_no: item.batch_no,
        expiry_date: item.expiry_date,
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
        <span className="text-xs text-slate-400">
          {row.branch_id === shopId ? shopName : 'Kho chính'}
        </span>
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
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium text-slate-900">{p?.displayName ?? p?.name ?? row.product_id}</span>
              {row.batch_no && (
                <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 py-0.2 text-[9px] font-semibold text-slate-700 border border-slate-200">
                  Lô: {row.batch_no}
                </span>
              )}
            </div>
            {(p?.sku || row.sku) && (
              <p className="text-xs text-slate-400 mt-0.5">SKU: {p?.sku || row.sku}</p>
            )}
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
        const prefix = isAdj ? (qty >= 0 ? '+' : '-') : (isIn ? '+' : '-')
        return (
          <div className="flex flex-col items-end">
            <span className={`font-semibold tabular-nums ${color}`}>
              {prefix}{Math.abs(qty).toLocaleString('vi-VN')}
            </span>
            {(row.type === 'purchase_in' || row.type === 'p2p_purchase_in') && row.unit_cost && Number(row.unit_cost) > 0 && (
              <span className="text-[11px] text-slate-500 mt-0.5">
                {hasPricingPermission || (row.type === 'purchase_in' && !row.reason?.includes('GRN')) ? (
                  <>x {fmtVND(row.unit_cost)}</>
                ) : (
                  <span className="text-slate-400 italic inline-flex items-center gap-0.5">
                    x <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline text-slate-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> ***.***
                  </span>
                )}
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
        if (row.type !== 'purchase_in' && row.type !== 'p2p_purchase_in') return <span className="text-slate-300 text-xs">—</span>
        if (!hasPricingPermission && (row.type === 'p2p_purchase_in' || (row.type === 'purchase_in' && row.reason?.includes('GRN')))) {
          return (
            <div className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-50 text-slate-400 border border-slate-200 tabular-nums">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline text-slate-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> ***.*** đ
              </span>
            </div>
          )
        }
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

        const totalCost = Number(row.unit_cost || 0) * Math.abs(Number(row.qty || 0))
        const discount = Number(row.discount || 0)
        const afterDiscount = Math.max(0, totalCost - discount)
        let paid = Number(row.paid_amount || 0)
        if (!row.paid_amount && row.payment_status === 'paid') {
          paid = afterDiscount
        }
        const debt = Math.max(0, afterDiscount - paid)
        const displayAmount = row.payment_status === 'unpaid' ? (debt > 0 ? debt : afterDiscount) : paid

        return (
          <div className="flex flex-col gap-1">
            <PaymentStatusLabel
              status={(row.payment_status as PaymentStatus) || 'paid'}
              amount={displayAmount}
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
  ], [productMap, hasPricingPermission, batchExpiryMap])

  const groupedMovements = useMemo(() => {
    if (!movementsData?.data) return []

    const groups: Record<string, {
      movement_no: string
      created_at: string
      type: string
      reason: string
      reference_no: string
      workflow_status: string
      payment_status: string
      payments?: string | any[]
      discount?: string
      paid_amount?: string
      items: any[]
      totalQty: number
      firstRow: any
    }> = {}

    const orderedKeys: string[] = []

    movementsData.data.forEach((row: any) => {
      const key = row.movement_no || `single-${row.movement_id}`
      
      if (!groups[key]) {
        groups[key] = {
          movement_no: row.movement_no || '',
          created_at: row.created_at,
          type: row.type,
          reason: row.reason || '',
          reference_no: row.reference_no || '',
          workflow_status: row.workflow_status || 'completed',
          payment_status: row.payment_status || 'paid',
          payments: row.payments,
          discount: row.discount,
          paid_amount: row.paid_amount,
          items: [],
          totalQty: 0,
          firstRow: row
        }
        orderedKeys.push(key)
      }

      groups[key].items.push(row)
      const itemQty = Number(row.qty || 0)
      if (row.type === 'adjustment') {
        groups[key].totalQty += itemQty
      } else {
        groups[key].totalQty += Math.abs(itemQty)
      }
    })

    return orderedKeys.map(key => groups[key])
  }, [movementsData?.data])

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
        <div className="flex items-center gap-2">
          <Link
            href={`${pathname}/audit`}
            className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Kiểm kho (Lô / HSD)
          </Link>
          <button
            onClick={() => setShowForm(true)}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors flex items-center"
          >
            + Nhập / xuất kho
          </button>
        </div>
      </div>

      {/* Tabs & Warehouse Filter */}
      <div className="border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <nav className="-mb-px flex space-x-4">
          {([
            { key: 'history', label: 'Lịch sử phiếu kho' },
            { key: 'stock', label: 'Tồn kho hiện tại' },
          ] as { key: Tab; label: string }[]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap pb-2 px-1 border-b-2 font-bold text-sm transition-all cursor-pointer ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 pb-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Bộ lọc Kho:</label>
          <select
            value={selectedWarehouseId}
            onChange={(e) => {
              setSelectedWarehouseId(e.target.value)
              setStockPage(1)
              setHistoryPage(1)
            }}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 focus:border-primary focus:outline-none"
          >
            {(!warehousesData?.data || warehousesData.data.length === 0) && (
              <option value="">Đang tải danh sách kho...</option>
            )}
            {(warehousesData?.data ?? []).map((w) => (
              <option key={w.id || w.warehouse_id} value={w.id || w.warehouse_id}>
                📦 {w.name}{w.code ? ` (${w.code.toUpperCase()})` : ''}
              </option>
            ))}
          </select>
        </div>
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
            onRowClick={handleStockRowClick}
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

          {movementsLoading ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm w-full p-8 flex flex-col items-center justify-center space-y-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
              <p className="text-sm text-slate-500 font-medium">Đang tải lịch sử phiếu kho...</p>
            </div>
          ) : groupedMovements.length === 0 ? (
            <EmptyState
              title="Chưa có phiếu kho nào"
              description="Các phiếu nhập hàng, bán hàng, trả hàng, điều chỉnh sẽ hiển thị ở đây."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm w-full">
              <table className="min-w-full text-sm divide-y divide-slate-200">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left w-10"></th>
                    <th className="px-4 py-3 text-left font-semibold">Mã phiếu</th>
                    <th className="px-4 py-3 text-left font-semibold">Loại phiếu</th>
                    <th className="px-4 py-3 text-left font-semibold">Sản phẩm</th>
                    <th className="px-4 py-3 text-left font-semibold">Nội dung / Ghi chú</th>
                    <th className="px-4 py-3 text-left font-semibold">Từ phiếu</th>
                    <th className="px-4 py-3 text-right font-semibold">Số lượng</th>
                    <th className="px-4 py-3 text-right font-semibold">Tổng giá trị</th>
                    <th className="px-4 py-3 text-center font-semibold w-24">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {groupedMovements.map((group) => {
                    const key = group.movement_no || `single-${group.firstRow.movement_id}`
                    const isMulti = group.items.length > 1
                    const isExpanded = expandedMovements.has(key)
                    const t = MOVEMENT_TYPE_MAP[group.type]
                    
                    // Group-level total cost calculation
                    const totalCost = group.items.reduce((acc, item) => acc + Math.abs(Number(item.qty || 0)) * Number(item.unit_cost || 0), 0)
                    const discount = Number(group.firstRow.discount || 0)
                    const afterDiscount = Math.max(0, totalCost - discount)
                    let paid = Number(group.firstRow.paid_amount || 0)
                    if (!group.firstRow.paid_amount && group.firstRow.payment_status === 'paid') {
                      paid = afterDiscount
                    }
                    const debt = Math.max(0, afterDiscount - paid)
                    const hasPricePermission = hasPricingPermission || (group.type === 'purchase_in' && !group.reason?.includes('GRN'))
                    
                    if (!isMulti) {
                      // Render single-item slip (flat view)
                      const firstItem = group.firstRow
                      const p = productMap.get(firstItem.product_id)
                      const qty = Number(firstItem.qty || 0)
                      const isIn = t?.sign === '+'
                      const isAdj = t?.sign === '±'
                      const color = isAdj
                        ? qty >= 0 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'
                        : isIn ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'
                      const prefix = isAdj ? (qty >= 0 ? '+' : '-') : (isIn ? '+' : '-')

                      return (
                        <Fragment key={key}>
                          <tr 
                            onClick={() => setViewMovement(firstItem)}
                            className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                          >
                            <td className="px-4 py-3.5 text-center">
                              <span className="text-slate-200 block select-none">—</span>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="min-w-[120px]" onClick={(e) => e.stopPropagation()}>
                                {firstItem.movement_no ? (
                                  <CopyableId id={firstItem.movement_no} className="text-sm font-semibold text-slate-800" />
                                ) : firstItem.movement_id ? (
                                  <CopyableId id={firstItem.movement_id} className="text-sm font-semibold text-slate-800" />
                                ) : (
                                  <span className="block text-sm font-semibold text-slate-800">—</span>
                                )}
                                <span className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                  {fmtDate(group.created_at)}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              {t ? (
                                <TagBadge label={t.label} color={t.color} />
                              ) : (
                                <span className="text-xs text-slate-400 font-semibold">{group.type}</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 max-w-[220px]">
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold text-slate-800 truncate" title={p?.displayName ?? p?.name ?? firstItem.product_id}>
                                    {p?.displayName ?? p?.name ?? firstItem.product_id}
                                  </span>
                                  {firstItem.batch_no && (
                                    <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 py-0.2 text-[9px] font-semibold text-slate-700 border border-slate-200 select-none">
                                      Lô: {firstItem.batch_no}
                                    </span>
                                  )}
                                </div>
                                {(p?.sku || firstItem.sku) && <p className="text-[10px] text-slate-400 font-mono mt-0.5">SKU: {p?.sku || firstItem.sku}</p>}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 max-w-[180px]">
                              <span className="text-xs text-slate-600 block line-clamp-2" title={group.reason || undefined}>
                                {group.reason || '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <div onClick={(e) => e.stopPropagation()}>
                                {group.reference_no ? (
                                  <CopyableId id={group.reference_no} className="text-sm font-semibold text-primary" />
                                ) : (
                                  <span className="text-xs text-slate-400 font-medium">—</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-right font-semibold tabular-nums">
                              <span className={color}>
                                {prefix}{Math.abs(qty).toLocaleString('vi-VN')}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <div className="flex flex-col items-end">
                                {hasPricePermission ? (
                                  <span className="font-bold text-slate-900 tabular-nums">
                                    {fmtVND(afterDiscount)}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic flex items-center gap-0.5 font-medium">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline text-slate-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> ***.*** đ
                                  </span>
                                )}
                                {discount > 0 && hasPricePermission && (
                                  <span className="text-[10px] text-red-500 font-medium mt-0.5">
                                    Giảm: -{fmtVND(discount)}
                                  </span>
                                )}
                                {['purchase_in', 'p2p_purchase_in'].includes(group.type) && (
                                  <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                                    {hasPricePermission ? (
                                      <PaymentStatusLabel
                                        status={(group.firstRow.payment_status as PaymentStatus) || 'paid'}
                                        amount={group.firstRow.payment_status === 'unpaid' ? (debt > 0 ? debt : afterDiscount) : paid}
                                      />
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-50 text-slate-400 border border-slate-200 tabular-nums">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline text-slate-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> ***.*** đ
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => setViewMovement(firstItem)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-650 shadow-xs hover:bg-slate-50 transition-colors"
                              >
                                <Eye className="h-3.5 w-3.5" /> Xem
                              </button>
                            </td>
                          </tr>
                        </Fragment>
                      )
                    }

                    // Multi-item slip (collapsable grouped view)
                    return (
                      <Fragment key={key}>
                        {/* Parent Slip Row */}
                        <tr 
                          onClick={() => toggleMovementExpand(key)}
                          className={[
                            'hover:bg-slate-50/70 transition-colors cursor-pointer',
                            isExpanded ? 'bg-slate-50/40 font-medium' : ''
                          ].join(' ')}
                        >
                          <td className="px-4 py-3.5 text-center">
                            <span className="text-slate-400 block transition-transform duration-200">
                              {isExpanded ? <ChevronUp className="h-4 w-4 mx-auto" /> : <ChevronDown className="h-4 w-4 mx-auto" />}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="min-w-[120px]" onClick={(e) => e.stopPropagation()}>
                              {group.movement_no ? (
                                <CopyableId id={group.movement_no} className="text-sm font-semibold text-slate-800" />
                              ) : group.firstRow.movement_id ? (
                                <CopyableId id={group.firstRow.movement_id} className="text-sm font-semibold text-slate-800" />
                              ) : (
                                <span className="block text-sm font-semibold text-slate-800">—</span>
                              )}
                              <span className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                {fmtDate(group.created_at)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            {t ? (
                              <TagBadge label={t.label} color={t.color} />
                            ) : (
                              <span className="text-xs text-slate-400 font-semibold">{group.type}</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 max-w-[220px]">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-650 border border-slate-200 select-none">
                                Hỗn hợp
                              </span>
                              <span className="text-xs text-slate-500 font-semibold">
                                {group.items.length} mặt hàng
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 max-w-[180px]">
                            <span className="text-xs text-slate-600 block line-clamp-2" title={group.reason || undefined}>
                              {group.reason || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div onClick={(e) => e.stopPropagation()}>
                              {group.reference_no ? (
                                <CopyableId id={group.reference_no} className="text-sm font-semibold text-primary" />
                              ) : (
                                <span className="text-xs text-slate-400 font-medium">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right font-semibold tabular-nums">
                            {(() => {
                              const isIn = t?.sign === '+'
                              const isAdj = t?.sign === '±'
                              const qty = group.totalQty
                              const prefix = isAdj ? (qty >= 0 ? '+' : '-') : (isIn ? '+' : '-')
                              const color = isAdj
                                ? qty >= 0 ? 'text-green-600' : 'text-red-500'
                                : isIn ? 'text-green-600' : 'text-red-500'
                              return (
                                <span className={color}>
                                  {prefix}{Math.abs(qty).toLocaleString('vi-VN')}
                                </span>
                              )
                            })()}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex flex-col items-end">
                              {hasPricePermission ? (
                                <span className="font-bold text-slate-900 tabular-nums">
                                  {fmtVND(afterDiscount)}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic flex items-center gap-0.5 font-medium">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline text-slate-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> ***.*** đ
                                </span>
                              )}
                              {discount > 0 && hasPricePermission && (
                                <span className="text-[10px] text-red-500 font-medium mt-0.5">
                                  Giảm: -{fmtVND(discount)}
                                </span>
                              )}
                              {['purchase_in', 'p2p_purchase_in'].includes(group.type) && (
                                <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                                  {hasPricePermission ? (
                                    <PaymentStatusLabel
                                      status={(group.firstRow.payment_status as PaymentStatus) || 'paid'}
                                      amount={group.firstRow.payment_status === 'unpaid' ? (debt > 0 ? debt : afterDiscount) : paid}
                                    />
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-50 text-slate-400 border border-slate-200 tabular-nums">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline text-slate-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> ***.*** đ
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => toggleMovementExpand(key)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-xs hover:bg-slate-50 transition-colors"
                            >
                              {isExpanded ? 'Thu gọn' : 'Chi tiết'}
                            </button>
                          </td>
                        </tr>
                        
                        {/* Expanded items section */}
                        {isExpanded && (
                          <tr className="bg-slate-50/30">
                            <td colSpan={9} className="px-6 py-4 border-l-2 border-primary/20">
                              <div className="overflow-hidden rounded-xl border border-slate-200/60 bg-white shadow-xs">
                                <table className="min-w-full text-xs">
                                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200/60">
                                    <tr>
                                      <th className="px-4 py-2.5 text-center font-semibold w-12">STT</th>
                                      <th className="px-4 py-2.5 text-left font-semibold w-80">Tên sản phẩm</th>
                                      <th className="px-4 py-2.5 text-left font-semibold w-48">Mã hàng (SKU)</th>
                                      <th className="px-4 py-2.5 text-left font-semibold w-20">ĐVT</th>
                                      <th className="px-4 py-2.5 text-right font-semibold w-24">Số lượng</th>
                                      {(group.type === 'purchase_in' || group.type === 'p2p_purchase_in') && (
                                        <>
                                          <th className="px-4 py-2.5 text-right font-semibold w-28">Đơn giá</th>
                                          <th className="px-4 py-2.5 text-right font-semibold w-32">Thành tiền</th>
                                        </>
                                      )}
                                      <th className="px-4 py-2.5 text-left font-semibold w-40">Thông tin lô / HSD</th>
                                      <th className="px-4 py-2.5 text-center font-semibold w-24">Thao tác</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 bg-white">
                                    {group.items.map((item, idx) => {
                                      const p = productMap.get(item.product_id)
                                      const qty = Number(item.qty || 0)
                                      const isIn = t?.sign === '+'
                                      const isAdj = t?.sign === '±'
                                      const color = isAdj
                                        ? qty >= 0 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'
                                        : isIn ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'
                                      const prefix = isAdj ? (qty >= 0 ? '+' : '-') : (isIn ? '+' : '-')
                                      
                                      const itemHasPricePermission = hasPricingPermission || (item.type === 'purchase_in' && !item.reason?.includes('GRN'))
                                      const itemVal = Math.abs(qty) * Number(item.unit_cost || 0)
                                      
                                      return (
                                        <tr key={item.movement_id || idx} className="hover:bg-slate-50/50 transition-colors">
                                          <td className="px-4 py-3 text-center text-slate-400 font-medium">
                                            {idx + 1}
                                          </td>
                                          <td className="px-4 py-3 font-semibold text-slate-800">
                                            {p?.displayName ?? p?.name ?? item.product_id}
                                          </td>
                                          <td className="px-4 py-3 text-slate-500 font-mono">
                                            {p?.sku || item.sku || '—'}
                                          </td>
                                          <td className="px-4 py-3 text-slate-600 font-medium">
                                            {p?.unit || item.unit || 'Cái'}
                                          </td>
                                          <td className="px-4 py-3 text-right font-semibold tabular-nums">
                                            <span className={color}>
                                              {prefix}{Math.abs(qty).toLocaleString('vi-VN')}
                                            </span>
                                          </td>
                                          {(group.type === 'purchase_in' || group.type === 'p2p_purchase_in') && (
                                            <>
                                              <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                                                {itemHasPricePermission ? (
                                                  fmtVND(item.unit_cost)
                                                ) : (
                                                  <span className="text-slate-400 italic">***.***</span>
                                                )}
                                              </td>
                                              <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
                                                {itemHasPricePermission ? (
                                                  fmtVND(itemVal)
                                                ) : (
                                                  <span className="text-slate-400 italic">***.***</span>
                                                )}
                                              </td>
                                            </>
                                          )}
                                          <td className="px-4 py-3 text-slate-500">
                                            {item.batch_no ? (() => {
                                              const key = `${item.product_id}_${item.batch_no.trim().toLowerCase()}`
                                              const expiryDate = item.expiry_date || batchExpiryMap.get(key)
                                              return (
                                                <div className="space-y-0.5">
                                                  <span className="font-semibold text-slate-700 bg-slate-100 border border-slate-200/60 rounded px-1.5 py-0.5 text-[10px] inline-block">Lô: {item.batch_no}</span>
                                                  {expiryDate && <span className="text-[10px] block text-slate-400">HSD: {fmtDate(expiryDate)}</span>}
                                                </div>
                                              )
                                            })() : (
                                              <span className="text-slate-300">—</span>
                                            )}
                                          </td>
                                          <td className="px-4 py-3 text-center">
                                            <button
                                              type="button"
                                              onClick={() => setViewMovement(item)}
                                              className="inline-flex items-center gap-1 rounded bg-slate-100 hover:bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors"
                                            >
                                              <Eye className="h-3 w-3" /> Xem
                                            </button>
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
              <div className="border-t border-slate-200 px-4 py-3 bg-slate-50/50">
                <PaginationInline 
                  page={historyPage} 
                  total={movementsData?.total ?? 0} 
                  pageSize={50} 
                  onChange={setHistoryPage} 
                />
              </div>
            </div>
          )}
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

          {/* Warehouse Selector in Form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className={['transfer_out', 'transfer_in'].includes(form.type) ? '' : 'sm:col-span-2'}>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                {form.type === 'transfer_out' ? 'Kho xuất hàng (Kho đi) *' : form.type === 'transfer_in' ? 'Kho nhận hàng (Kho đến) *' : 'Kho thực hiện *'}
              </label>
              <select
                value={form.warehouse_id}
                onChange={(e) => setForm((f) => {
                  const nextVal = e.target.value
                  let updatedToWarehouseId = f.to_warehouse_id
                  if (['transfer_out', 'transfer_in'].includes(f.type) && updatedToWarehouseId === nextVal) {
                    const distinctWh = warehousesData?.data?.find(
                      (w: any) => (w.id || w.warehouse_id) !== nextVal
                    )
                    updatedToWarehouseId = distinctWh ? (distinctWh.id || distinctWh.warehouse_id) : ''
                  }
                  return { ...f, warehouse_id: nextVal, to_warehouse_id: updatedToWarehouseId }
                })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none font-medium bg-white"
              >
                <option value="">-- Chọn kho thực hiện --</option>
                {(warehousesData?.data ?? [])
                  .filter((w) => !['transfer_out', 'transfer_in'].includes(form.type) || (w.id || w.warehouse_id) !== form.to_warehouse_id)
                  .map((w) => (
                    <option key={w.id || w.warehouse_id} value={w.id || w.warehouse_id}>
                      📦 {w.name}{w.code ? ` (${w.code.toUpperCase()})` : ''}
                    </option>
                  ))}
              </select>
            </div>

            {/* Destination Warehouse (only for transfers) */}
            {['transfer_out', 'transfer_in'].includes(form.type) && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  {form.type === 'transfer_out' ? 'Kho nhận hàng (Kho đến) *' : 'Kho xuất hàng (Kho đi) *'}
                </label>
                <select
                  value={form.to_warehouse_id}
                  onChange={(e) => setForm((f) => {
                    const nextVal = e.target.value
                    let updatedWarehouseId = f.warehouse_id
                    if (['transfer_out', 'transfer_in'].includes(f.type) && updatedWarehouseId === nextVal) {
                      const distinctWh = warehousesData?.data?.find(
                        (w: any) => (w.id || w.warehouse_id) !== nextVal
                      )
                      updatedWarehouseId = distinctWh ? (distinctWh.id || distinctWh.warehouse_id) : ''
                    }
                    return { ...f, to_warehouse_id: nextVal, warehouse_id: updatedWarehouseId }
                  })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none font-medium bg-white"
                >
                  <option value="">-- Chọn kho đối ứng --</option>
                  {(warehousesData?.data ?? [])
                    .filter((w) => (w.id || w.warehouse_id) !== form.warehouse_id)
                    .map((w) => (
                      <option key={w.id || w.warehouse_id} value={w.id || w.warehouse_id}>
                        📦 {w.name}{w.code ? ` (${w.code.toUpperCase()})` : ''}
                      </option>
                    ))}
                </select>
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
                    <Fragment key={idx}>
                      <tr className="hover:bg-slate-50/50 overflow-visible relative" style={{ zIndex: 100 - idx }}>
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
                            disabled={!!item.batches}
                            readOnly={!!item.batches}
                            onChange={(e) => {
                              const newItems = [...form.items]
                              newItems[idx].qty = e.target.value
                              setForm(f => ({ ...f, items: newItems }))
                            }}
                            placeholder={form.type === 'adjustment' ? '±10' : '0'}
                            className={`w-full text-center rounded-xl border px-2 py-2 text-sm focus:outline-none ${
                              item.batches
                                ? 'bg-amber-50/50 border-amber-200 text-amber-800 font-bold focus:border-amber-200'
                                : 'border-slate-200 focus:border-primary'
                            }`}
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
                      {(item.product_id || item.is_new) && (
                        <tr className="bg-slate-50/20" style={{ zIndex: 99 - idx }}>
                          <td colSpan={4} className="px-2 pb-3 pt-0 border-t-0">
                            <div className="rounded-xl bg-slate-50 border border-slate-200/60 p-3 text-xs w-full">
                              {!item.batches ? (
                                <div>
                                  <div className="flex gap-2">
                                    <div className="flex-1 space-y-1">
                                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Số lô</label>
                                      <input
                                        type="text"
                                        value={item.batch_no || ''}
                                        onChange={(e) => {
                                          const newItems = [...form.items]
                                          newItems[idx].batch_no = e.target.value
                                          setForm(f => ({ ...f, items: newItems }))
                                        }}
                                        placeholder="Nhập số lô..."
                                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-primary focus:outline-none"
                                      />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Hạn sử dụng</label>
                                      <input
                                        type="date"
                                        value={item.expiry_date || ''}
                                        onChange={(e) => {
                                          const newItems = [...form.items]
                                          newItems[idx].expiry_date = e.target.value
                                          setForm(f => ({ ...f, items: newItems }))
                                        }}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-primary focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                  <div className="mt-2 flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newItems = [...form.items]
                                        newItems[idx].batches = [
                                          { batch_no: item.batch_no || '', expiry_date: item.expiry_date || '', qty: item.qty || '1', current_qty: 0 }
                                        ]
                                        newItems[idx].qty = String(Number(item.qty || 1))
                                        setForm(f => ({ ...f, items: newItems }))
                                      }}
                                      className="text-[10px] font-semibold text-primary hover:text-primary-dark transition-colors flex items-center gap-1 cursor-pointer"
                                    >
                                      📦 Nhập theo Lô / HSD con
                                    </button>
                                  </div>
                                </div>
                                                            ) : (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between border-b border-slate-200/60 pb-1">
                                      <span className="font-bold text-slate-700 text-[10px] uppercase tracking-wider">Danh sách lô hàng con</span>
                                      {!item.has_existing_batches && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const newItems = [...form.items]
                                            delete newItems[idx].batches
                                            setForm(f => ({ ...f, items: newItems }))
                                          }}
                                          className="text-[10px] font-medium text-red-500 hover:text-red-700 transition-colors cursor-pointer"
                                        >
                                          Trở về nhập SL tổng
                                        </button>
                                      )}
                                    </div>
                                    <div className="rounded-xl border border-slate-200/70 overflow-hidden shadow-inner bg-white w-full">
                                      <table className="w-full text-left text-xs">
                                        <thead>
                                          <tr className="bg-slate-50 text-slate-400 font-semibold uppercase tracking-wider text-[9px] border-b border-slate-200 select-none">
                                            <th className="px-3 py-2 w-36">Số lô</th>
                                            <th className="px-3 py-2 w-32 text-center">Hạn sử dụng (HSD)</th>
                                            <th className="px-3 py-2 text-right w-24">Tồn kho</th>
                                            <th className="px-3 py-2 text-center w-36">Số lượng</th>
                                            <th className="px-3 py-2 text-center w-24">Hành động</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
                                          {item.batches.map((b, bIdx) => {
                                            return (
                                              <tr 
                                                key={bIdx}
                                                className={`transition-colors ${b.is_deleted ? 'bg-red-50/85 text-red-500 line-through decoration-red-300' : 'hover:bg-slate-50/50'}`}
                                              >
                                                {/* Batch No */}
                                                <td className="px-3 py-2 font-medium text-slate-800 text-[11px] align-middle">
                                                  <div className="flex items-center gap-1">
                                                    <span className="select-none">📦</span>
                                                    <input
                                                      type="text"
                                                      list={`existing-batches-${idx}-${bIdx}`}
                                                      value={b.batch_no}
                                                      disabled={b.is_deleted}
                                                      onChange={(e) => {
                                                        const val = e.target.value
                                                        const newItems = [...form.items]
                                                        newItems[idx].batches![bIdx].batch_no = val
                                                        
                                                        // Auto-fill expiry_date and current_qty if it matches an existing batch
                                                        const match = item.existing_batches?.find(eb => eb.batch_no === val.trim())
                                                        if (match) {
                                                          newItems[idx].batches![bIdx].expiry_date = match.expiry_date || ''
                                                          newItems[idx].batches![bIdx].current_qty = match.stock_qty || 0
                                                        } else {
                                                          newItems[idx].batches![bIdx].current_qty = 0
                                                        }
                                                        setForm(f => ({ ...f, items: newItems }))
                                                      }}
                                                      placeholder="Lô..."
                                                      className={`w-full bg-transparent border-0 border-b border-transparent hover:border-slate-200 focus:border-primary focus:outline-none py-0.5 text-xs text-slate-800 font-semibold focus:bg-white px-1 rounded transition-all ${b.is_deleted ? 'text-red-500' : ''}`}
                                                    />
                                                    {item.existing_batches && item.existing_batches.length > 0 && (
                                                      <datalist id={`existing-batches-${idx}-${bIdx}`}>
                                                        {item.existing_batches.map((eb, ebIdx) => (
                                                          <option key={ebIdx} value={eb.batch_no}>
                                                            {eb.batch_no} {eb.stock_qty !== undefined ? `(Tồn: ${eb.stock_qty})` : ''}
                                                          </option>
                                                        ))}
                                                      </datalist>
                                                    )}
                                                  </div>
                                                </td>

                                                {/* Expiry date */}
                                                <td className="px-3 py-2 text-center align-middle">
                                                  {b.is_deleted ? (
                                                    <span className="text-[10px] font-mono leading-none text-red-500 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                                                      {b.expiry_date ? fmtDate(b.expiry_date) : '—'}
                                                    </span>
                                                  ) : (
                                                    <input
                                                      type="date"
                                                      value={b.expiry_date}
                                                      disabled={b.is_deleted}
                                                      onChange={(e) => {
                                                        const newItems = [...form.items]
                                                        newItems[idx].batches![bIdx].expiry_date = e.target.value
                                                        setForm(f => ({ ...f, items: newItems }))
                                                      }}
                                                      className="rounded border border-slate-200 bg-slate-50/50 px-1.5 py-0.5 text-[10px] font-mono text-slate-800 focus:border-primary focus:outline-none"
                                                    />
                                                  )}
                                                </td>

                                                {/* Tồn kho */}
                                                <td className="px-3 py-2 text-right text-slate-500 font-mono text-[11px] align-middle select-all">
                                                  {(b.current_qty !== undefined ? b.current_qty : 0).toLocaleString()}
                                                </td>

                                                {/* Quantity actual */}
                                                <td className="px-3 py-2 text-center align-middle">
                                                  {b.is_deleted ? (
                                                    <span className="inline-flex px-1.5 py-0.5 rounded bg-red-100/50 text-[10px] font-semibold text-red-500 border border-red-200/50 select-none">
                                                      0 (Đã xóa)
                                                    </span>
                                                  ) : (
                                                    <div className="flex items-center justify-center gap-1.5 max-w-[100px] mx-auto select-none">
                                                      <button
                                                        type="button"
                                                        onClick={() => {
                                                          const newItems = [...form.items]
                                                          const currentVal = Math.max(0, Number(newItems[idx].batches![bIdx].qty || 0) - 1)
                                                          newItems[idx].batches![bIdx].qty = String(currentVal)
                                                          const total = newItems[idx].batches!.reduce((sum, itemB) => sum + (itemB.is_deleted ? 0 : Number(itemB.qty || 0)), 0)
                                                          newItems[idx].qty = String(total)
                                                          setForm(f => ({ ...f, items: newItems }))
                                                        }}
                                                        className="w-6 h-6 flex items-center justify-center rounded-full bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200 cursor-pointer select-none transition-all active:scale-90"
                                                        title="Giảm 1"
                                                      >
                                                        <Minus className="w-3 h-3" />
                                                      </button>
                                                      <input
                                                        type="number"
                                                        value={b.qty}
                                                        onChange={(e) => {
                                                          const newItems = [...form.items]
                                                          newItems[idx].batches![bIdx].qty = e.target.value
                                                          const total = newItems[idx].batches!.reduce((sum, itemB) => sum + (itemB.is_deleted ? 0 : Number(itemB.qty || 0)), 0)
                                                          newItems[idx].qty = String(total)
                                                          setForm(f => ({ ...f, items: newItems }))
                                                        }}
                                                        className="w-10 text-center rounded-lg border border-slate-200 py-0.5 text-xs focus:border-primary focus:outline-none font-medium text-slate-800 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                        style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                                                      />
                                                      <button
                                                        type="button"
                                                        onClick={() => {
                                                          const newItems = [...form.items]
                                                          const currentVal = Number(newItems[idx].batches![bIdx].qty || 0) + 1
                                                          newItems[idx].batches![bIdx].qty = String(currentVal)
                                                          const total = newItems[idx].batches!.reduce((sum, itemB) => sum + (itemB.is_deleted ? 0 : Number(itemB.qty || 0)), 0)
                                                          newItems[idx].qty = String(total)
                                                          setForm(f => ({ ...f, items: newItems }))
                                                        }}
                                                        className="w-6 h-6 flex items-center justify-center rounded-full bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200 cursor-pointer select-none transition-all active:scale-90"
                                                        title="Tăng 1"
                                                      >
                                                        <Plus className="w-3 h-3" />
                                                      </button>
                                                    </div>
                                                  )}
                                                </td>

                                                {/* Action */}
                                                <td className="px-3 py-2 text-center align-middle">
                                                  {b.is_deleted ? (
                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        const newItems = [...form.items]
                                                        newItems[idx].batches![bIdx].is_deleted = false
                                                        newItems[idx].batches![bIdx].qty = '1'
                                                        const total = newItems[idx].batches!.reduce((sum, itemB) => sum + (itemB.is_deleted ? 0 : Number(itemB.qty || 0)), 0)
                                                        newItems[idx].qty = String(total)
                                                        setForm(f => ({ ...f, items: newItems }))
                                                      }}
                                                      className="text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 font-semibold text-[10px] px-2 py-0.5 border border-emerald-250 rounded transition-all cursor-pointer shadow-xs active:scale-95 select-none"
                                                      title="Khôi phục lô"
                                                    >
                                                      Khôi phục
                                                    </button>
                                                  ) : (
                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        const newItems = [...form.items]
                                                        newItems[idx].batches![bIdx].is_deleted = true
                                                        newItems[idx].batches![bIdx].qty = '0'
                                                        const total = newItems[idx].batches!.reduce((sum, itemB) => sum + (itemB.is_deleted ? 0 : Number(itemB.qty || 0)), 0)
                                                        newItems[idx].qty = String(total)
                                                        setForm(f => ({ ...f, items: newItems }))
                                                      }}
                                                      className="text-slate-400 hover:text-red-500 bg-slate-50 hover:bg-red-50 p-1 rounded transition-all cursor-pointer active:scale-95 inline-flex items-center justify-center select-none"
                                                      title="Xóa lô"
                                                    >
                                                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                  )}
                                                </td>
                                              </tr>
                                            )
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newItems = [...form.items]
                                        newItems[idx].batches!.push({ batch_no: '', expiry_date: '', qty: '1', current_qty: 0 })
                                        const total = newItems[idx].batches!.reduce((sum, itemB) => sum + (itemB.is_deleted ? 0 : Number(itemB.qty || 0)), 0)
                                        newItems[idx].qty = String(total)
                                        setForm(f => ({ ...f, items: newItems }))
                                      }}
                                      className="w-full py-1.5 border border-dashed border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 rounded-lg text-[10px] font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer select-none"
                                    >
                                      + Thêm lô con cho sản phẩm này
                                    </button>
                                  </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
              {/* Đợt nhập */}
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

              <div className="mt-2 max-h-40 overflow-y-auto space-y-2 rounded-lg border border-slate-100 bg-white p-2">
                {(() => {
                  const flattenedPreviewItems: any[] = []
                  form.items.forEach(item => {
                    if (item.batches && item.batches.length > 0) {
                      const activeBatches = item.batches.filter(b => !b.is_deleted)
                      // Count blank batch numbers to decide default format
                      let blankCount = 0
                      activeBatches.forEach(b => { if (!b.batch_no?.trim()) blankCount++ })

                      let blankIdx = 0
                      activeBatches.forEach(b => {
                        let finalBatchNo = b.batch_no?.trim()
                        if (!finalBatchNo) {
                          finalBatchNo = blankCount === 1 ? 'DEFAULT' : `L${blankIdx + 1}`
                          blankIdx++
                        }
                        flattenedPreviewItems.push({
                          ...item,
                          qty: b.qty,
                          batch_no: finalBatchNo,
                          expiry_date: b.expiry_date || undefined
                        })
                      })
                    } else {
                      let finalBatchNo = item.batch_no?.trim()
                      if (!finalBatchNo && item.expiry_date) {
                        finalBatchNo = 'DEFAULT'
                      }
                      flattenedPreviewItems.push({
                        ...item,
                        batch_no: finalBatchNo || undefined,
                        expiry_date: item.expiry_date || undefined
                      })
                    }
                  })

                  return flattenedPreviewItems.map((item, idx) => (
                    <div key={idx} className="space-y-0.5 text-xs border-b border-slate-50 pb-1.5 last:border-0 last:pb-0">
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-700 font-medium truncate max-w-[240px]">
                          {item.product_name || 'Chưa chọn sản phẩm'}
                        </span>
                        <span className="font-mono text-slate-900 shrink-0">
                          x{item.qty} {item.unit_cost && Number(item.unit_cost) > 0 ? `(${fmtVND(item.unit_cost)})` : ''}
                        </span>
                      </div>
                      {item.batch_no && (
                        <div className="text-[10px] text-slate-500">
                          Lô: <span className="font-semibold text-slate-700">{item.batch_no}</span>
                          {item.expiry_date && (
                            <> · HSD: <span className="font-semibold text-slate-700">{fmtDate(item.expiry_date)}</span></>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                })()}
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

      {/* Confirm Batch Adjust Dialog */}
      <ConfirmDialog
        open={!!adjustingBatch}
        onClose={() => setAdjustingBatch(null)}
        onConfirm={handleConfirmAdjustBatch}
        title="Điều chỉnh / Hủy lô tồn kho"
        confirmLabel="Cập nhật"
        cancelLabel="Hủy bỏ"
        loading={adjustingLoading}
      >
        <div className="space-y-4 text-sm text-slate-600">
          <p className="font-medium text-slate-800">
            Bạn đang điều chỉnh lô hàng <span className="text-orange-600 font-bold">{adjustingBatch?.batch_no}</span> của sản phẩm <span className="font-semibold text-slate-900">{productMap.get(selectedStockProduct?.product_id)?.displayName || productMap.get(selectedStockProduct?.product_id)?.name || selectedStockProduct?.product_name}</span>.
          </p>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Số lượng tồn kho thực tế mới
              </label>
              <input
                type="number"
                min="0"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                value={adjustQtyInput}
                onChange={(e) => setAdjustQtyInput(e.target.value)}
                placeholder="Nhập 0 để hủy hoàn toàn lô"
              />
              <span className="block text-[10px] text-slate-400 mt-1">
                Tồn kho hiện tại: {adjustingBatch ? Number(adjustingBatch.stock_qty).toLocaleString('vi-VN') : 0} {selectedStockProduct?.unit || 'đv'} (Trừ đi {(adjustingBatch ? Number(adjustingBatch.stock_qty) : 0) - Number(adjustQtyInput || 0)} đv)
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Lý do điều chỉnh / hủy lô
              </label>
              <textarea
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                rows={2}
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Nhập lý do hao hụt, hết hạn, hư hỏng..."
              />
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-800 space-y-1">
            <span className="font-semibold flex items-center gap-1 text-blue-900">
              <svg className="h-3.5 w-3.5 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.085 1.085l-.04.02-.041.02a.75.75 0 01-1.085-1.085l.04-.02zM12 22.5c5.799 0 10.5-4.701 10.5-10.5S17.799 1.5 12 1.5 1.5 6.201 1.5 12 6.201 22.5 12 22.5z" />
              </svg>
              Thông tin nghiệp vụ:
            </span>
            <p>
              Khi nhấn nút cập nhật, hệ thống sẽ tự động tạo một <strong>Phiếu điều chỉnh (PDK)</strong> nhằm điều chỉnh tồn kho cho lô này thành <strong>{Number(adjustQtyInput || 0).toLocaleString('vi-VN')} {selectedStockProduct?.unit || 'đv'}</strong> (chênh lệch: {(() => {
                const diff = Number(adjustQtyInput || 0) - (adjustingBatch ? Number(adjustingBatch.stock_qty) : 0);
                return diff > 0 ? `+${diff.toLocaleString('vi-VN')}` : diff.toLocaleString('vi-VN');
              })()} {selectedStockProduct?.unit || 'đv'}).
            </p>
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
                {(() => {
                  const qty = Number(viewMovement.qty || 0)
                  const t = MOVEMENT_TYPE_MAP[viewMovement.type]
                  const isIn = t?.sign === '+'
                  const isAdj = t?.sign === '±'
                  const color = isAdj
                    ? qty >= 0 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'
                    : isIn ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'
                  const prefix = isAdj ? (qty >= 0 ? '+' : '-') : (isIn ? '+' : '-')
                  return (
                    <p className={`font-semibold tabular-nums ${color}`}>
                      {prefix}{Math.abs(qty).toLocaleString('vi-VN')}
                    </p>
                  )
                })()}
              </div>
              {viewMovement.type === 'adjustment' && (() => {
                const match = (viewMovement.reason || '').match(/(-?\d+(?:\.\d+)?)\s*->\s*(-?\d+(?:\.\d+)?)/)
                if (match) {
                  const before = Number(match[1])
                  const after = Number(match[2])
                  return (
                    <>
                      <div>
                        <p className="text-slate-500 mb-1">Tồn trước điều chỉnh</p>
                        <p className="font-medium text-slate-700">{before.toLocaleString('vi-VN')}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 mb-1">Tồn sau điều chỉnh</p>
                        <p className="font-semibold text-slate-800">{after.toLocaleString('vi-VN')}</p>
                      </div>
                    </>
                  )
                }
                return null
              })()}
              <div>
                <p className="text-slate-500 mb-1">Đơn giá</p>
                {hasPricingPermission || (viewMovement.type !== 'p2p_purchase_in' && !(viewMovement.type === 'purchase_in' && viewMovement.reason?.includes('GRN'))) ? (
                  <p className="font-medium text-slate-900">{fmtVND(viewMovement.unit_cost)}</p>
                ) : (
                  <p className="font-medium text-slate-400 italic flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline text-slate-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> ***.***
                  </p>
                )}
              </div>

               {(() => {
                 const key = `${viewMovement.product_id}_${(viewMovement.batch_no || '').trim().toLowerCase()}`
                 const expiryDate = viewMovement.expiry_date || batchExpiryMap.get(key)
                 if (!viewMovement.batch_no && !expiryDate && !viewMovement.shipment_no) return null
                 return (
                   <>
                     {viewMovement.batch_no && (
                       <div>
                         <p className="text-slate-500 mb-1">Số lô</p>
                         <p className="font-semibold text-slate-800 bg-slate-100/80 px-2 py-0.5 rounded border border-slate-200 text-xs inline-block">📦 {viewMovement.batch_no}</p>
                       </div>
                     )}
                     {expiryDate && (
                       <div>
                         <p className="text-slate-500 mb-1">Hạn sử dụng (HSD)</p>
                         <p className="font-semibold text-amber-700 bg-amber-50/80 px-2 py-0.5 rounded border border-amber-200 text-xs font-mono inline-block">📅 {fmtDate(expiryDate)}</p>
                       </div>
                     )}
                     {viewMovement.shipment_no && (
                       <div>
                         <p className="text-slate-500 mb-1">Đợt nhập</p>
                         <p className="font-medium text-slate-900">{viewMovement.shipment_no}</p>
                       </div>
                     )}
                   </>
                 )
               })()}

              {(viewMovement.type === 'purchase_in' || viewMovement.type === 'p2p_purchase_in') && (() => {
                const isP2PMovement = viewMovement.type === 'p2p_purchase_in' || (viewMovement.type === 'purchase_in' && viewMovement.reason?.includes('GRN'));
                const showMask = !hasPricingPermission && isP2PMovement;

                const totalCost = Number(viewMovement.unit_cost || 0) * Math.abs(Number(viewMovement.qty || 0));
                const discount = Number(viewMovement.discount || 0);
                const afterDiscount = Math.max(0, totalCost - discount);
                let paid = Number(viewMovement.paid_amount || 0);
                if (!viewMovement.paid_amount && viewMovement.payment_status === 'paid') paid = afterDiscount;

                const debt = Math.max(0, afterDiscount - paid);
                const displayAmount = viewMovement.payment_status === 'unpaid' ? (debt > 0 ? debt : afterDiscount) : paid;

                const methodMap: Record<string, string> = {
                  'cash': 'Tiền mặt',
                  'transfer': 'Chuyển khoản',
                  'card': 'Quẹt thẻ'
                };

                return (
                  <div className="col-span-2 mt-2 pt-2 border-t border-slate-100">
                    <p className="text-slate-500 mb-2">Thông tin thanh toán</p>
                    <div className="flex items-center justify-between mb-3">
                      {showMask ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-50 text-slate-400 border border-slate-200 tabular-nums">
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline text-slate-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> ***.*** đ
                        </span>
                      ) : (
                        <PaymentStatusLabel
                          status={(viewMovement.payment_status as PaymentStatus) || 'paid'}
                          amount={displayAmount}
                        />
                      )}
                    </div>

                    {(() => {
                      if (showMask) return null;
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

                    {showMask ? (
                      <div className="space-y-1.5 text-sm bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Tổng tiền hàng:</span>
                          <span className="font-medium text-slate-400 italic flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline text-slate-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> ***.*** đ
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Đã thanh toán:</span>
                          <span className="font-medium text-slate-400 italic flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline text-slate-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> ***.*** đ
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5 text-sm bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Tổng tiền hàng:</span>
                          <span className="font-medium text-slate-900">{fmtVND(totalCost)}</span>
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
                      </div>
                    )}

                    {!showMask && debt > 0 && viewMovement.supplier_id && (
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

      {/* ── View Stock Product Batches Details SlideOver ── */}
      <SlideOver
        open={!!selectedStockProduct}
        onClose={() => {
          setSelectedStockProduct(null)
          setSelectedProductBatches([])
        }}
        title="Chi tiết lô tồn kho"
        width={520}
      >
        {selectedStockProduct && (() => {
          const product = productMap.get(selectedStockProduct.product_id)
          const productName = product?.displayName ?? product?.name ?? selectedStockProduct.product_name ?? 'Không rõ tên sản phẩm'
          const sku = product?.sku ?? selectedStockProduct.sku ?? '—'
          const totalQty = Number(selectedStockProduct.stock_qty || 0)

          return (
            <div className="space-y-6">
              {/* Premium Light Gradient Card */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-50/80 via-slate-50/60 to-amber-50/40 p-5 text-slate-800 shadow-sm border border-orange-100/60">
                {/* Subtle graphic accent */}
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-orange-400/10 blur-2xl pointer-events-none" />
                <div className="absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-amber-400/10 blur-2xl pointer-events-none" />

                <div className="relative space-y-3">
                  <span className="inline-flex items-center rounded-full bg-orange-100/70 px-2.5 py-0.5 text-xs font-semibold text-orange-700 border border-orange-200/50">
                    Thông tin hàng hóa
                  </span>

                  <div>
                    <h3 className="text-lg font-bold tracking-tight text-slate-900 leading-snug">
                      {productName}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      SKU: {sku}
                    </p>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-200/60 pt-3 mt-1">
                    {(() => {
                      const targetWhId = selectedStockProduct.warehouse_id || selectedWarehouseId
                      const whName = warehousesData?.data?.find(
                        (w: any) => (w.id || w.warehouse_id) === targetWhId
                      )?.name
                      return (
                        <span className="text-xs font-medium text-slate-500">
                          Tổng tồn tại {whName ? `${whName}` : 'chi nhánh'}:
                        </span>
                      )
                    })()}
                    <span className="text-xl font-extrabold text-orange-600 tabular-nums">
                      {totalQty.toLocaleString('vi-VN')} {product?.unit || selectedStockProduct.unit || 'đv'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Batches Stock Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Danh sách các lô tồn kho
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setNewBatchForm({
                        batch_no: '',
                        expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Mặc định 1 năm sau
                        stock_qty: '0'
                      })
                      setAddingBatch(true)
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary-dark hover:underline transition-all"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    Thêm lô nhanh
                  </button>
                </div>

                {loadingBatches ? (
                  <div className="space-y-3 py-6">
                    {Array.from({ length: 2 }).map((_, idx) => (
                      <div key={idx} className="flex h-16 items-center justify-between rounded-xl bg-slate-50 p-4 animate-pulse">
                        <div className="space-y-2 w-1/3">
                          <div className="h-4 bg-slate-200 rounded w-full" />
                          <div className="h-3 bg-slate-200 rounded w-2/3" />
                        </div>
                        <div className="h-5 bg-slate-200 rounded w-16" />
                      </div>
                    ))}
                  </div>
                ) : selectedProductBatches.length > 0 ? (
                  <div className="space-y-2.5">
                    {selectedProductBatches.map((batch) => {
                      const qty = Number(batch.stock_qty || 0)
                      let expiryText = '—'
                      let statusBadge = null

                      if (batch.expiry_date) {
                        const expDate = new Date(batch.expiry_date)
                        const today = new Date()
                        today.setHours(0, 0, 0, 0)

                        const timeDiff = expDate.getTime() - today.getTime()
                        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24))

                        // Expiry format
                        const dateParts = batch.expiry_date.split('-')
                        if (dateParts.length === 3) {
                          expiryText = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`
                        } else {
                          expiryText = new Date(batch.expiry_date).toLocaleDateString('vi-VN')
                        }

                        if (daysDiff < 0) {
                          statusBadge = (
                            <span className="inline-flex items-center rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
                              Hết hạn ({Math.abs(daysDiff)} ngày)
                            </span>
                          )
                        } else if (daysDiff <= 30) {
                          statusBadge = (
                            <span className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/30">
                              Cận date ({daysDiff} ngày)
                            </span>
                          )
                        } else {
                          statusBadge = (
                            <span className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
                              Còn {daysDiff} ngày
                            </span>
                          )
                        }
                      }

                      return (
                        <div
                          key={batch.id || batch.batch_no}
                          className="group relative flex items-center justify-between rounded-xl border border-slate-100 bg-white p-4 shadow-sm hover:border-indigo-100 hover:bg-indigo-50/10 transition-all duration-200"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 shadow-sm">
                                Lô: {batch.batch_no}
                              </span>
                              {statusBadge}
                            </div>
                            <p className="text-xs text-slate-400 flex items-center gap-1">
                              <svg className="h-3 w-3 text-slate-400" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                              HSD: <span className="font-semibold text-slate-600">{expiryText}</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="text-base font-extrabold text-slate-900 tabular-nums">
                                {qty.toLocaleString('vi-VN')}
                              </span>
                              <span className="block text-[10px] font-medium text-slate-400">
                                {product?.unit || selectedStockProduct.unit || 'đơn vị'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleInitiateAdjustBatch(batch)
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-orange-600 hover:bg-orange-50 border border-transparent hover:border-orange-100 transition-all cursor-pointer shrink-0"
                              title="Điều chỉnh tồn kho lô"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  /* Standard non-batch product fallback */
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center shadow-sm">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                      <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
                    </div>
                    <h5 className="text-sm font-semibold text-slate-800 mb-1">Hàng hóa phổ thông</h5>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                      Sản phẩm này không được quản lý theo số lô & hạn sử dụng. Tồn kho của mặt hàng này được theo dõi chung cho toàn chi nhánh.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </SlideOver>

      {/* Quick Add Batch Dialog */}
      <ConfirmDialog
        open={addingBatch}
        onClose={() => setAddingBatch(false)}
        onConfirm={handleConfirmAddBatch}
        title="Thêm lô tồn kho nhanh"
        confirmLabel="Xác nhận khởi tạo"
        cancelLabel="Hủy bỏ"
        loading={addingBatchLoading}
      >
        <div className="space-y-4 text-sm text-slate-600">
          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3.5 text-xs text-blue-700 leading-relaxed space-y-1.5 shadow-sm">
            <div className="flex items-center gap-1.5 font-bold">
              <svg className="h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              <span>Nghiệp vụ tạo Phiếu Điều Chỉnh (PDK)</span>
            </div>
            <p>
              Hệ thống sẽ tự động tạo một <strong>Phiếu điều chỉnh tồn kho (PDK)</strong> nhằm tăng tồn kho thực tế cho lô hàng này. Việc này đảm bảo tính minh bạch của sổ sách kế toán kho và dễ dàng đối soát sau này.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Sản phẩm</label>
              <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-800 font-medium border border-slate-200/50">
                {productMap.get(selectedStockProduct?.product_id)?.displayName || productMap.get(selectedStockProduct?.product_id)?.name || selectedStockProduct?.product_name}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Số hiệu lô *</label>
                <input
                  type="text"
                  value={newBatchForm.batch_no}
                  onChange={(e) => setNewBatchForm(f => ({ ...f, batch_no: e.target.value }))}
                  placeholder="VD: LOT-001"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Hạn sử dụng *</label>
                <input
                  type="date"
                  value={newBatchForm.expiry_date}
                  onChange={(e) => setNewBatchForm(f => ({ ...f, expiry_date: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Số lượng tồn thực tế khởi tạo *</label>
              <input
                type="number"
                min="1"
                value={newBatchForm.stock_qty}
                onChange={(e) => setNewBatchForm(f => ({ ...f, stock_qty: e.target.value }))}
                placeholder="VD: 50"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none font-semibold text-slate-900"
              />
            </div>
          </div>
        </div>
      </ConfirmDialog>

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

function PaginationInline({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number
  total: number
  pageSize: number
  onChange: (page: number) => void
}) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null
  const start = Math.min((page - 1) * pageSize + 1, total)
  const end = Math.min(page * pageSize, total)

  const pages = buildPageList(page, totalPages)

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">
        Hiển thị {start}–{end} trong {total} kết quả
      </span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-xs hover:bg-slate-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          ←
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="px-2.5 py-1.5 text-xs text-slate-400">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p as number)}
              className={[
                'min-w-[32px] rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold shadow-xs transition-colors',
                p === page
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-slate-700 hover:bg-slate-50',
              ].join(' ')}
            >
              {p}
            </button>
          )
        )}
        <button
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-xs hover:bg-slate-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          →
        </button>
      </div>
    </div>
  )
}

function buildPageList(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '...')[] = []
  if (current <= 4) {
    pages.push(1, 2, 3, 4, 5, '...', total)
  } else if (current >= total - 3) {
    pages.push(1, '...', total - 4, total - 3, total - 2, total - 1, total)
  } else {
    pages.push(1, '...', current - 1, current, current + 1, '...', total)
  }
  return pages
}
