'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useDebounce } from 'use-debounce'
import { useSearchParams, useRouter } from 'next/navigation'
import { DataTable, Column } from '@/app/components/ui/DataTable'
import { SlideOver } from '@/app/components/ui/SlideOver'
import { TagBadge } from '@/app/components/ui/TagBadge'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog'
import { SearchBar } from '@/app/components/ui/SearchBar'
import { NumberInput } from '@/app/components/ui/NumberInput'
import { CopyableId } from '@/app/components/ui/CopyableId'
import { format } from 'date-fns'
import { UserPlus, Wallet, Pencil, X, Coins, Check, Upload, ArrowLeft, Clock, AlertTriangle } from 'lucide-react'
import { useShift } from '@/app/components/providers/ShiftProvider'
import { BANKS } from '@/lib/constants/banks'

export function getBankDisplayName(bankCodeOrName: string) {
  if (!bankCodeOrName) return '—'
  const trimmed = bankCodeOrName.trim().toUpperCase()
  const bank = BANKS.find(
    (b) =>
      b.code?.toUpperCase() === trimmed ||
      b.shortName?.toUpperCase() === trimmed ||
      b.name?.toUpperCase() === trimmed ||
      b.short_name?.toUpperCase() === trimmed
  )
  return bank ? bank.shortName : bankCodeOrName
}

export function calculateDebtAge(
  orders: any[] = [],
  transactions: any[] = [],
  currentDebtAmount: number = 0,
  importedDebtDays: number = 0,
  createdAt?: string
): number {
  if (currentDebtAmount <= 0) return 0

  // 1. Collect all debt-incrementing events
  const debtIncrements: { amount: number; date: Date }[] = []

  // Orders with debt_amount > 0 (excluding cancelled orders)
  orders.forEach((order) => {
    const debtAmount = Number(order.debt_amount || 0)
    if (debtAmount > 0 && order.status !== 'cancelled') {
      debtIncrements.push({
        amount: debtAmount,
        date: new Date(order.created_at || new Date()),
      })
    }
  })

  // Virtual debt entries created upon Excel import
  transactions.forEach((tx) => {
    const isVirtualDebt =
      tx.is_virtual === 'TRUE' &&
      tx.type === 'receipt' &&
      tx.method === 'debt' &&
      tx.category === 'debt_collection'
    if (isVirtualDebt) {
      debtIncrements.push({
        amount: Number(tx.amount || 0),
        date: new Date(tx.created_at || new Date()),
      })
    }
  })

  // Fallback: If no transactions/orders are loaded yet in DB, but we have imported debt_days metadata
  if (debtIncrements.length === 0 && importedDebtDays > 0) {
    const baseDate = createdAt ? new Date(createdAt) : new Date()
    if (!isNaN(baseDate.getTime())) {
      baseDate.setDate(baseDate.getDate() - importedDebtDays)
      debtIncrements.push({
        amount: currentDebtAmount,
        date: baseDate,
      })
    }
  }

  if (debtIncrements.length === 0) return 0

  // 2. Sort by date ascending (oldest -> newest)
  debtIncrements.sort((a, b) => a.date.getTime() - b.date.getTime())

  // 3. FIFO backward loop to resolve oldest unpaid transaction
  let remainingDebt = currentDebtAmount
  let oldestUnpaidTx: { amount: number; date: Date } | null = null

  for (let i = debtIncrements.length - 1; i >= 0; i--) {
    const item = debtIncrements[i]
    if (remainingDebt > 0) {
      oldestUnpaidTx = item
      remainingDebt -= item.amount
    } else {
      break
    }
  }

  if (!oldestUnpaidTx) return 0

  // 4. Calculate day diff from oldest unpaid transaction date to now
  const diffTime = Math.abs(new Date().getTime() - oldestUnpaidTx.date.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}


export function MemberTierBadge({ label, color }: { label: string; color?: string }) {
  const c = (color || 'slate').toLowerCase()
  let classes = 'bg-slate-100 text-slate-600 border border-slate-200/50 shadow-none font-medium'
  
  const TYPE_LABEL_MAP: Record<string, string> = {
    retail: 'Bán lẻ',
    wholesale: 'Khách sỉ',
    vip: 'VIP',
    staff: 'Nội bộ'
  }
  const displayLabel = TYPE_LABEL_MAP[label.toLowerCase()] || label
  const isRetail = label.trim().toLowerCase() === 'retail' || displayLabel === 'Bán lẻ'

  if (isRetail) {
    classes = 'bg-slate-100 text-slate-500 border border-slate-200/60 shadow-none font-medium'
  } else {
    if (c === 'emerald') classes = 'bg-gradient-to-r from-emerald-500 to-teal-650 text-white border border-emerald-400/30 shadow-xs'
    else if (c === 'sapphire') classes = 'bg-gradient-to-r from-blue-600 to-indigo-650 text-white border border-blue-500/30 shadow-xs'
    else if (c === 'amethyst') classes = 'bg-gradient-to-r from-purple-500 to-fuchsia-650 text-white border border-purple-400/30 shadow-xs'
    else if (c === 'ruby') classes = 'bg-gradient-to-r from-rose-500 to-red-600 text-white border border-rose-400/30 shadow-xs'
    else if (c === 'amber') classes = 'bg-gradient-to-r from-amber-500 to-orange-600 text-white border border-amber-400/30 shadow-xs'
    else if (c === 'rose') classes = 'bg-gradient-to-r from-pink-500 to-rose-500 text-white border border-pink-400/30 shadow-xs'
    else if (c === 'cyan') classes = 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white border border-cyan-400/30 shadow-xs'
    else if (c === 'indigo') classes = 'bg-gradient-to-r from-indigo-500 to-violet-650 text-white border border-indigo-400/30 shadow-xs'
    else if (c === 'slate') classes = 'bg-gradient-to-r from-slate-500 to-slate-700 text-white border border-slate-400/30 shadow-xs'
    else if (c === 'gold') classes = 'bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 text-white border border-yellow-400/35 shadow-sm'
    else if (c === 'silver') classes = 'bg-gradient-to-r from-slate-200 via-slate-350 to-zinc-500 text-slate-800 border border-slate-300/40 shadow-xs'
    else if (c === 'bronze') classes = 'bg-gradient-to-r from-orange-400 via-amber-700 to-orange-700 text-white border border-orange-500/30 shadow-xs'
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold leading-relaxed ${classes}`}>
      {displayLabel}
    </span>
  )
}

interface Props {
  shopId: string
  shopName: string
  permissions?: string[]
}

const EMPTY_FORM = {
  name: '',
  phone: '',
  email: '',
  address: '',
  customer_type: 'retail',
  credit_limit: '0',
  note: '',
}

export function CustomersClient({ shopId, shopName, permissions = [] }: Props) {
  const { checkShiftOrOpen } = useShift()
  const canManageCrm = permissions.includes('crm.manage')
  const canAdjustWallet = permissions.includes('crm.wallet_adjust')

  const router = useRouter()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const initialSearch = searchParams?.get('search') || searchParams?.get('customerId') || ''

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [depositFundId, setDepositFundId] = useState('')

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.dropdown-actions-trigger') || target.closest('.dropdown-actions-menu')) {
        return
      }
      setActiveDropdown(null)
    }
    document.addEventListener('click', handleOutsideClick)
    return () => document.removeEventListener('click', handleOutsideClick)
  }, [])
  
  const { data: settings } = useQuery({
    queryKey: ['settings', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/settings`)
      if (!res.ok) return {}
      return res.json()
    },
  })
  
    // Excel Import States
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importProvider, setImportProvider] = useState<'kiotviet' | 'oni' | null>(null)
  const [parsedCustomers, setParsedCustomers] = useState<any[]>([])
  const [isParsingExcel, setIsParsingExcel] = useState(false)
  const [importingProgress, setImportingProgress] = useState(false)
  const [conflictStrategy, setConflictStrategy] = useState<'skip' | 'overwrite'>('skip')
  const [balanceStrategy, setBalanceStrategy] = useState<'overwrite' | 'accumulate'>('accumulate')

  // CRM Debt Collection (Trả nợ) States
  const [collectDebtTarget, setCollectDebtTarget] = useState<Record<string, string> | null>(null)
  const [collectDebtAmount, setCollectDebtAmount] = useState('0')
  const [collectDebtMethod, setCollectDebtMethod] = useState('cash')
  const [collectDebtFundId, setCollectDebtFundId] = useState('')
  const [collectDebtNote, setCollectDebtNote] = useState('')
  const [confirmCollectDebtOpen, setConfirmCollectDebtOpen] = useState(false)

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState(initialSearch)
  const [debouncedSearch] = useDebounce(search, 300)
  const [formData, setFormData] = useState<Record<string, string>>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [slideOpen, setSlideOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Record<string, string> | null>(null)
  const hasAutoOpened = useRef(false)

  // CRM Deposit States
  const [depositTarget, setDepositTarget] = useState<Record<string, string> | null>(null)
  const [depositAmount, setDepositAmount] = useState('0')
  const [depositMethod, setDepositMethod] = useState('bank_transfer')
  const [depositNote, setDepositNote] = useState('')
  const [confirmDepositOpen, setConfirmDepositOpen] = useState(false)

  // Customer Detail States
  const [viewTarget, setViewTarget] = useState<Record<string, string> | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailTab, setDetailTab] = useState<'info' | 'orders' | 'transactions'>('info')

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['customers', shopId, page, debouncedSearch],
    queryFn: async () => {
      const sp = new URLSearchParams({ page: String(page), limit: '50' })
      if (debouncedSearch) sp.set('search', debouncedSearch)
      const res = await fetch(`/api/shops/${shopId}/customers?${sp}`)
      if (!res.ok) throw new Error('Không tải được dữ liệu')
      return res.json() as Promise<{ data: Record<string, string>[]; total: number }>
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const url = editingId
        ? `/api/shops/${shopId}/customers/${editingId}`
        : `/api/shops/${shopId}/customers`
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Lưu thất bại')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success(editingId ? 'Đã cập nhật' : 'Đã tạo mới')
      setSlideOpen(false)
      queryClient.invalidateQueries({ queryKey: ['customers', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/shops/${shopId}/customers/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Xóa thất bại')
      }
    },
    onSuccess: () => {
      toast.success('Đã xóa')
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['customers', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function openEdit(row: Record<string, string>) {
    setFormData(row)
    setEditingId(row.customer_id)
    setSlideOpen(true)
  }

  function openDetail(row: Record<string, string>) {
    setViewTarget(row)
    setDetailTab('info')
    setDetailOpen(true)
  }

  // 1. Fetch Customer Purchase History
  const { data: customerOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ['customer-orders', shopId, viewTarget?.customer_id],
    queryFn: async () => {
      if (!viewTarget?.customer_id) return { data: [] }
      const res = await fetch(`/api/shops/${shopId}/orders?customer_id=${viewTarget.customer_id}&limit=100`)
      if (!res.ok) throw new Error('Không tải được lịch sử đơn hàng')
      return res.json() as Promise<{ data: Record<string, any>[] }>
    },
    enabled: !!viewTarget?.customer_id && detailOpen,
  })

  // 2. Fetch Customer Financial Transaction History
  const { data: customerTransactions, isLoading: txLoading } = useQuery({
    queryKey: ['customer-transactions', shopId, viewTarget?.customer_id],
    queryFn: async () => {
      if (!viewTarget?.customer_id) return { data: [] }
      const res = await fetch(`/api/shops/${shopId}/cashbook?reference_id=${viewTarget.customer_id}&limit=100&is_virtual=all`)
      if (!res.ok) throw new Error('Không tải được lịch sử giao dịch')
      return res.json() as Promise<{ data: Record<string, any>[] }>
    },
    enabled: !!viewTarget?.customer_id && detailOpen,
  })

  const maxDebtDays = Number(settings?.default_max_debt_days ?? 30)

  const depositMutation = useMutation({
    mutationFn: async (payload: { amount: number; method: string; note: string; fund_id: string }) => {
      if (!depositTarget) return
      const res = await fetch(`/api/shops/${shopId}/customers/${depositTarget.customer_id}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Nạp tiền thất bại')
      }
      return res.json()
    },
    onSuccess: (_, variables) => {
      toast.success('Nạp tiền vào tài khoản thành công!')
      const customerId = depositTarget?.customer_id || depositTarget?.id
      if (customerId) {
        queryClient.invalidateQueries({ queryKey: ['customer-transactions', shopId, customerId] })
        setViewTarget((prev) => {
          if (prev && (prev.customer_id === customerId || prev.id === customerId)) {
            const currentBalance = parseFloat(prev.prepaid_balance || '0')
            return {
              ...prev,
              prepaid_balance: String(currentBalance + variables.amount)
            }
          }
          return prev
        })
      }
      setDepositTarget(null)
      setDepositAmount('0')
      setDepositNote('')
      queryClient.invalidateQueries({ queryKey: ['customers', shopId] })
      queryClient.invalidateQueries({ queryKey: ['cashbook', shopId] })
      queryClient.invalidateQueries({ queryKey: ['payment-funds', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  useEffect(() => {
    if (data?.data && data.data.length === 1 && !hasAutoOpened.current) {
      const row = data.data[0]
      if (
        initialSearch && 
        (row.customer_id === initialSearch || 
         row.customer_code === initialSearch || 
         row.phone === initialSearch)
      ) {
        hasAutoOpened.current = true
        openEdit(row)
      }
    }
  }, [data, initialSearch])

  function openCreate() {
    setFormData(EMPTY_FORM)
    setEditingId(null)
    setSlideOpen(true)
  }

  function openDeposit(row: Record<string, string>) {
    setDepositTarget(row)
    setDepositAmount('0')
    setDepositMethod('bank_transfer')
    setDepositNote('')

    const defaultFund = funds.find(f => f.is_default === 'TRUE') || funds[0]
    setDepositFundId(defaultFund?.id || '')
    if (defaultFund) {
      setDepositMethod(defaultFund.type === 'cash' ? 'cash' : 'bank_transfer')
    }
  }

  const columns = useMemo<Column<Record<string, string>>[]>(() => [
    { 
      key: 'customer_id', 
      label: 'Mã KH',
      render: (row) => row.customer_id ? <CopyableId id={row.customer_id} className="text-sm font-semibold text-primary" /> : '—'
    },
    { key: 'name', label: 'Tên' },
    { key: 'phone', label: 'SĐT' },
    {
      key: 'customer_type',
      label: 'Hạng thành viên',
      render: (row) => {
        const type = (row.customer_type || '').trim().toLowerCase()
        const tiers = settings?.has_crm_access ? (settings?.membership_tiers || []) : []
        const activeTier = tiers.find((t: any) => (t.name || '').trim().toLowerCase() === type)
        return <MemberTierBadge label={row.customer_type} color={activeTier?.color || 'slate'} />
      },
    },
    {
      key: 'loyalty_points',
      label: 'Điểm tích lũy',
      render: (row) => <span className="font-medium text-blue-600">{Number(row.loyalty_points || 0).toLocaleString('vi-VN')} điểm</span>,
    },
    {
      key: 'prepaid_balance',
      label: 'Số dư trả trước',
      render: (row) => <span className="font-semibold text-emerald-600">{Number(row.prepaid_balance || 0).toLocaleString('vi-VN')}đ</span>,
    },
    {
      key: 'debt_amount',
      label: 'Công nợ',
      render: (row) => <span className="font-medium text-slate-700">{Number(row.debt_amount || 0).toLocaleString('vi-VN')}đ</span>,
    },
    {
      key: 'actions',
      label: 'Thao tác',
      render: (row) => {
        const isOpen = activeDropdown === row.customer_id
        return (
          <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveDropdown(isOpen ? null : row.customer_id)
              }}
              className="dropdown-actions-trigger inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-all cursor-pointer active:scale-95"
            >
              Thao tác
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className={`w-3 h-3 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {isOpen && (
              <div className="dropdown-actions-menu absolute right-0 mt-1.5 w-36 rounded-xl border border-slate-200/80 bg-white py-1 shadow-lg z-[60] origin-top-right focus:outline-none animate-in fade-in slide-in-from-top-1 duration-100">
                <button
                  onClick={() => {
                    setActiveDropdown(null);
                    if (canAdjustWallet) openDeposit(row);
                  }}
                  disabled={!canAdjustWallet}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-xs font-medium transition-colors cursor-pointer text-left ${
                    canAdjustWallet
                      ? 'text-slate-700 hover:bg-slate-50'
                      : 'text-slate-400 cursor-not-allowed opacity-50'
                  }`}
                  title={canAdjustWallet ? "Nạp tiền trả trước" : "Nạp tiền trả trước 🔒 (Cần quyền)"}
                >
                  <Wallet className="w-3.5 h-3.5 text-emerald-500" />
                  Nạp tiền {!canAdjustWallet && '🔒'}
                </button>
                <button
                  onClick={() => {
                    setActiveDropdown(null);
                    openEdit(row);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer text-left"
                >
                  <Pencil className="w-3.5 h-3.5 text-blue-500" />
                  Chỉnh sửa
                </button>
                <div className="border-t border-slate-100 my-1" />
                <button
                  onClick={() => {
                    setActiveDropdown(null);
                    setDeleteTarget(row);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-red-650 hover:bg-red-50 transition-colors cursor-pointer text-left"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3.5 h-3.5 text-red-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                  Xóa bỏ
                </button>
              </div>
            )}
          </div>
        )
      }
    },
  ], [settings, activeDropdown])

  // Excel Import Handlers
  async function handleExcelImport(file: File) {
    setIsParsingExcel(true)
    setImportFile(file)
    try {
      const { read, utils } = await import('xlsx')
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const binaryStr = e.target?.result
          const workbook = read(binaryStr, { type: 'binary' })
          const sheetName = workbook.SheetNames[0]
          const sheet = workbook.Sheets[sheetName]
          const rows = utils.sheet_to_json<any[]>(sheet, { header: 1 })
          
          if (rows.length < 2) {
            toast.error('Tệp Excel trống hoặc không có dòng tiêu đề')
            setIsParsingExcel(false)
            return
          }

          const headers = rows[0].map((h: any) => String(h || '').trim())
          const records: any[] = []

          const colMap: Record<string, number> = {}
          headers.forEach((h, idx) => {
            colMap[h] = idx
          })

          const getVal = (row: any[], headerName: string, directIdx: number) => {
            const idx = colMap[headerName] !== undefined ? colMap[headerName] : directIdx
            return row[idx] !== undefined && row[idx] !== null ? String(row[idx]).trim() : ''
          }

          for (let i = 1; i < rows.length; i++) {
            const row = rows[i] as any[]
            if (!row || row.length === 0) continue

            const name = getVal(row, 'Tên khách hàng', 3)
            if (!name) continue

            const phone = getVal(row, 'Điện thoại', 4)
            const customer_code = getVal(row, 'Mã khách hàng', 2)
            const customer_type_str = getVal(row, 'Loại khách', 0)
            const address_base = getVal(row, 'Địa chỉ', 5)
            const shipping_area = getVal(row, 'Khu vực giao hàng', 6)
            const ward = getVal(row, 'Phường/Xã', 7)

            let fullAddress = address_base
            if (ward) fullAddress += (fullAddress ? ', ' : '') + ward
            if (shipping_area) fullAddress += (fullAddress ? ', ' : '') + shipping_area

            const email = getVal(row, 'Email', 13)
            const birthday = getVal(row, 'Ngày sinh', 11)
            const note = getVal(row, 'Ghi chú', 16)
            const credit_limit = getVal(row, 'Hạn mức tín dụng', -1) || '0'
            const debt_amount = getVal(row, 'Nợ cần thu hiện tại', 23) || '0'
            const loyalty_points = getVal(row, 'Điểm hiện tại', 17) || '0'
            const debt_days = getVal(row, 'Số ngày nợ', -1) || '0'

            const facebook = getVal(row, 'Facebook', 14)
            const zalo = getVal(row, 'Zalo', -1)
            const tax_code = getVal(row, 'Mã số thuế', 9)
            const id_card = getVal(row, 'Số CMND/CCCD', 10)
            const gender = getVal(row, 'Giới tính', 12)
            const company = getVal(row, 'Công ty', 8)
            const created_by = getVal(row, 'Người tạo', 19)
            const customer_group = getVal(row, 'Nhóm khách hàng', 15)

            let customer_type = 'retail'
            if (customer_type_str.toLowerCase().includes('sỉ') || customer_type_str.toLowerCase().includes('wholesale')) {
              customer_type = 'wholesale'
            } else if (customer_type_str.toLowerCase().includes('vip')) {
              customer_type = 'vip'
            } else if (customer_type_str.toLowerCase().includes('nội bộ') || customer_type_str.toLowerCase().includes('staff')) {
              customer_type = 'staff'
            }

            records.push({
              name,
              phone,
              customer_code,
              customer_type,
              email,
              address: fullAddress,
              birthday,
              note,
              credit_limit,
              debt_amount,
              loyalty_points,
              prepaid_balance: '0',
              debt_days,
              zalo,
              facebook,
              tax_code,
              id_card,
              gender,
              company,
              created_by,
              customer_group,
              shipping_area,
              ward
            })
          }

          setParsedCustomers(records)
          toast.success(`Đã đọc thành công ${records.length} khách hàng!`)
        } catch (err: any) {
          toast.error('Lỗi khi phân tích dữ liệu Excel: ' + err.message)
        } finally {
          setIsParsingExcel(false)
        }
      }
      reader.readAsBinaryString(file)
    } catch (err: any) {
      toast.error('Không thể load thư viện xlsx: ' + err.message)
      setIsParsingExcel(false)
    }
  }

  async function submitExcelImport() {
    if (parsedCustomers.length === 0) return
    setImportingProgress(true)
    try {
      const res = await fetch(`/api/shops/${shopId}/customers/import-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customers: parsedCustomers,
          conflict_strategy: conflictStrategy,
          balance_strategy: balanceStrategy,
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Import thất bại')
      }

      const result = await res.json()
      toast.success(`Import hoàn tất! Tạo mới: ${result.created}, Cập nhật: ${result.updated}, Bỏ qua: ${result.skipped}`)
      setImportModalOpen(false)
      setImportFile(null)
      setImportProvider(null)
      setParsedCustomers([])
      queryClient.resetQueries({ queryKey: ['customers', shopId] })
      queryClient.refetchQueries({ queryKey: ['customers', shopId] })
      queryClient.invalidateQueries({ queryKey: ['customers', shopId] })
      queryClient.invalidateQueries({ queryKey: ['cashbook', shopId] })
      router.refresh()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setImportingProgress(false)
    }
  }

  async function downloadOniTemplate() {
    try {
      const { utils, write } = await import('xlsx')
      const headers = [
        'Loại khách', 'Mã khách hàng', 'Tên khách hàng', 'Điện thoại', 'Email', 
        'Địa chỉ', 'Khu vực giao hàng', 'Phường/Xã', 'Công ty', 'Mã số thuế', 
        'Số CMND/CCCD', 'Ngày sinh', 'Giới tính', 'Facebook', 'Zalo', 'Nhóm khách hàng', 
        'Ghi chú', 'Điểm hiện tại', 'Nợ cần thu hiện tại'
      ]
      const sample = [
        ['Cá nhân', 'KH0001', 'Nguyễn Văn A', '0912345678', 'a@example.com', '123 Đường Lê Lợi', 'Quận 1, TP Hồ Chí Minh', 'Bến Nghé', '', '', '', '15/10/1990', 'Nam', 'fb.com/nguyenvana', '0912345678', 'Khách thân thiết', 'Khách VIP POS', '100', '0'],
        ['Công ty', 'KH0002', 'Công ty TNHH Oni', '0987654321', 'contact@oni.vn', '456 Đường Nguyễn Huệ', 'Quận 1, TP Hồ Chí Minh', 'Bến Nghé', 'Công ty TNHH Oni', '0102030405', '038201001234', '', '', '', '', 'Doanh nghiệp', 'Đối tác chiến lược', '0', '5500000']
      ]
      const ws = utils.aoa_to_sheet([headers, ...sample])
      const wb = utils.book_new()
      utils.book_append_sheet(wb, ws, 'KhachHang')
      const out = write(wb, { bookType: 'xlsx', type: 'binary' })
      const buf = new ArrayBuffer(out.length)
      const view = new Uint8Array(buf)
      for (let i = 0; i < out.length; i++) view[i] = out.charCodeAt(i) & 0xff
      const blob = new Blob([buf], { type: 'application/octet-stream' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'template_KH_Oni.xlsx'
      a.click()
    } catch (err: any) {
      toast.error('Không thể xuất template: ' + err.message)
    }
  }

  // Load payment funds (Quỹ tiền mặt, Ngân hàng...)
  const { data: fundsData } = useQuery({
    queryKey: ['payment-funds', shopId, 'active'],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/payment-funds?active=TRUE`)
      if (!res.ok) throw new Error('Không tải được danh sách quỹ')
      return res.json() as Promise<{ data: Record<string, any>[] }>
    }
  })
  const funds = fundsData?.data ?? []

  // CRM Debt Collection (Trả nợ) Mutation
  const collectDebtMutation = useMutation({
    mutationFn: async (payload: { amount: number; method: string; note: string; fund_id: string }) => {
      if (!collectDebtTarget) return
      const res = await fetch(`/api/shops/${shopId}/cashbook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'receipt',
          amount: payload.amount,
          method: payload.method,
          category: 'debt_collection',
          reference_id: collectDebtTarget.customer_id || collectDebtTarget.id,
          reference_name: collectDebtTarget.name,
          note: payload.note || `Thu nợ khách hàng ${collectDebtTarget.name}`,
          fund_id: payload.fund_id || undefined,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Thu nợ thất bại')
      }
      return res.json()
    },
    onSuccess: (_, variables) => {
      toast.success('Ghi nhận thu nợ khách hàng thành công!')
      const customerId = collectDebtTarget?.customer_id || collectDebtTarget?.id
      if (customerId) {
        queryClient.invalidateQueries({ queryKey: ['customer-transactions', shopId, customerId] })
        setViewTarget((prev) => {
          if (prev && (prev.customer_id === customerId || prev.id === customerId)) {
            const currentDebt = parseFloat(prev.debt_amount || '0')
            const amountPaid = variables.amount
            const newDebt = Math.max(0, currentDebt - amountPaid)
            return {
              ...prev,
              debt_amount: String(newDebt)
            }
          }
          return prev
        })
      }
      setCollectDebtTarget(null)
      setCollectDebtAmount('0')
      setCollectDebtNote('')
      queryClient.invalidateQueries({ queryKey: ['customers', shopId] })
      queryClient.invalidateQueries({ queryKey: ['cashbook', shopId] })
      queryClient.invalidateQueries({ queryKey: ['payment-funds', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function openCollectDebt(row: Record<string, string>) {
    setCollectDebtTarget(row)
    setCollectDebtAmount(String(parseFloat(row.debt_amount || '0')))
    setCollectDebtMethod('cash')
    
    // Auto-select default fund
    const defaultFund = funds.find(f => f.is_default === 'TRUE') || funds[0]
    setCollectDebtFundId(defaultFund?.id || '')
    if (defaultFund) {
      setCollectDebtMethod(defaultFund.type === 'cash' ? 'cash' : 'bank_transfer')
    }
    
    setCollectDebtNote(`Thu nợ khách hàng ${row.name}`)
  }

    return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Khách hàng</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {data?.total ?? 0} khách hàng
            {isFetching && !isLoading && <span className="ml-2 text-xs text-slate-400">Đang cập nhật...</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setImportModalOpen(true)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-sm"
          >
            <Upload className="w-4 h-4 text-slate-500" />
            Import từ Excel
          </button>
          <button
            onClick={openCreate}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Thêm khách hàng
          </button>
        </div>
      </div>

      <SearchBar
        value={search}
        onChange={(v) => { setSearch(v); setPage(1) }}
        placeholder="Tìm kiếm..."
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        pagination={{ page, total: data?.total ?? 0, pageSize: 50, onChange: setPage }}
        emptyState={<EmptyState title="Chưa có khách hàng nào" description="Nhấn '+ Thêm khách hàng' để bắt đầu." />}
        rowKey={(row) => row.customer_id}
        onRowClick={openDetail}
      />

      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title={editingId ? 'Chỉnh sửa khách hàng' : 'Thêm khách hàng'}
        footer={
          <>
            <button
              onClick={() => setSlideOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            >
              <X className="w-4 h-4" />
              Hủy
            </button>
            <button
              onClick={() => saveMutation.mutate(formData)}
              disabled={saveMutation.isPending}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-sm"
            >
              {saveMutation.isPending ? (
                <>
                  <svg className="animate-spin -ml-1 mr-1.5 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Đang lưu...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Lưu khách hàng
                </>
              )}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tên khách hàng *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Nhập tên khách hàng"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Số điện thoại *</label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Nhập số điện thoại"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="text"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Nhập email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Địa chỉ</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Nhập địa chỉ"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Loại khách {!canManageCrm && '🔒 (Cần quyền crm.manage)'}</label>
            <select
              value={formData.customer_type}
              onChange={(e) => setFormData(prev => ({ ...prev, customer_type: e.target.value }))}
              disabled={!canManageCrm}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
            >
              <option value="retail">Bán lẻ (Mặc định)</option>
              <option value="wholesale">Sỉ (Mặc định)</option>
              <option value="vip">VIP (Mặc định)</option>
              <option value="staff">Nội bộ (Mặc định)</option>
              {settings?.has_crm_access && settings?.membership_tiers?.map((t: any) => {
                const lowercaseName = (t.name || '').trim().toLowerCase()
                const isLegacy = ['retail', 'wholesale', 'vip', 'staff'].includes(lowercaseName)
                if (isLegacy) return null
                return (
                  <option key={t.name} value={t.name}>
                    {t.name} (Chiết khấu {t.discount}%)
                  </option>
                )
              })}
            </select>
          </div>
          <NumberInput
            label="Hạn mức tín dụng"
            value={formData.credit_limit}
            onChange={(v) => setFormData(prev => ({ ...prev, credit_limit: v }))}
            suffix="đ"
          />
          {editingId && (
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3.5 text-sm">
              <h4 className="font-bold text-slate-700 text-xs tracking-wider uppercase mb-1 flex items-center gap-1.5">
                <span className="text-primary">✨</span> Thông tin tài khoản (CRM)
              </h4>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Điểm tích lũy hiện có:</span>
                <span className="font-semibold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100/50 text-xs">
                  {Number(formData.loyalty_points || 0).toLocaleString('vi-VN')} điểm
                </span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-100 pt-3">
                <span className="text-slate-500 font-medium">Số dư Ví trả trước:</span>
                <span className="font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100/50 text-xs">
                  {Number(formData.prepaid_balance || 0).toLocaleString('vi-VN')}đ
                </span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-100 pt-3">
                <span className="text-slate-500 font-medium">Nợ hiện tại:</span>
                <span className="font-semibold text-red-650 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-100/50 text-xs">
                  {Number(formData.debt_amount || 0).toLocaleString('vi-VN')}đ
                </span>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ghi chú</label>
            <textarea
              value={formData.note}
              onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none bg-white"
              placeholder="Nhập ghi chú"
            />
          </div>

          <div className="border-t border-slate-100 pt-4 mt-4 space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Thông tin mở rộng (CRM)</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Zalo</label>
                <input
                  type="text"
                  value={(() => {
                    try {
                      const meta = typeof formData.metadata === 'string' ? JSON.parse(formData.metadata) : formData.metadata || {}
                      return meta.zalo || ''
                    } catch (e) {
                      return ''
                    }
                  })()}
                  onChange={(e) => {
                    const val = e.target.value
                    setFormData(prev => {
                      let meta = {}
                      try {
                        meta = typeof prev.metadata === 'string' ? JSON.parse(prev.metadata) : prev.metadata || {}
                      } catch (err) {}
                      return {
                        ...prev,
                        metadata: JSON.stringify({ ...meta, zalo: val })
                      }
                    })
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-primary focus:outline-none bg-white"
                  placeholder="SĐT Zalo"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Facebook Link</label>
                <input
                  type="text"
                  value={(() => {
                    try {
                      const meta = typeof formData.metadata === 'string' ? JSON.parse(formData.metadata) : formData.metadata || {}
                      return meta.facebook || ''
                    } catch (e) {
                      return ''
                    }
                  })()}
                  onChange={(e) => {
                    const val = e.target.value
                    setFormData(prev => {
                      let meta = {}
                      try {
                        meta = typeof prev.metadata === 'string' ? JSON.parse(prev.metadata) : prev.metadata || {}
                      } catch (err) {}
                      return {
                        ...prev,
                        metadata: JSON.stringify({ ...meta, facebook: val })
                      }
                    })
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-primary focus:outline-none bg-white"
                  placeholder="https://facebook.com/..."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Số CMND/CCCD</label>
                <input
                  type="text"
                  value={(() => {
                    try {
                      const meta = typeof formData.metadata === 'string' ? JSON.parse(formData.metadata) : formData.metadata || {}
                      return meta.id_card || ''
                    } catch (e) {
                      return ''
                    }
                  })()}
                  onChange={(e) => {
                    const val = e.target.value
                    setFormData(prev => {
                      let meta = {}
                      try {
                        meta = typeof prev.metadata === 'string' ? JSON.parse(prev.metadata) : prev.metadata || {}
                      } catch (err) {}
                      return {
                        ...prev,
                        metadata: JSON.stringify({ ...meta, id_card: val })
                      }
                    })
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-primary focus:outline-none bg-white"
                  placeholder="CCCD/CMND"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Mã số thuế</label>
                <input
                  type="text"
                  value={(() => {
                    try {
                      const meta = typeof formData.metadata === 'string' ? JSON.parse(formData.metadata) : formData.metadata || {}
                      return meta.tax_code || ''
                    } catch (e) {
                      return ''
                    }
                  })()}
                  onChange={(e) => {
                    const val = e.target.value
                    setFormData(prev => {
                      let meta = {}
                      try {
                        meta = typeof prev.metadata === 'string' ? JSON.parse(prev.metadata) : prev.metadata || {}
                      } catch (err) {}
                      return {
                        ...prev,
                        metadata: JSON.stringify({ ...meta, tax_code: val })
                      }
                    })
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-primary focus:outline-none bg-white"
                  placeholder="Mã số thuế"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tên công ty</label>
                <input
                  type="text"
                  value={(() => {
                    try {
                      const meta = typeof formData.metadata === 'string' ? JSON.parse(formData.metadata) : formData.metadata || {}
                      return meta.company || ''
                    } catch (e) {
                      return ''
                    }
                  })()}
                  onChange={(e) => {
                    const val = e.target.value
                    setFormData(prev => {
                      let meta = {}
                      try {
                        meta = typeof prev.metadata === 'string' ? JSON.parse(prev.metadata) : prev.metadata || {}
                      } catch (err) {}
                      return {
                        ...prev,
                        metadata: JSON.stringify({ ...meta, company: val })
                      }
                    })
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-primary focus:outline-none bg-white"
                  placeholder="Tên công ty"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Giới tính</label>
                <select
                  value={(() => {
                    try {
                      const meta = typeof formData.metadata === 'string' ? JSON.parse(formData.metadata) : formData.metadata || {}
                      return meta.gender || ''
                    } catch (e) {
                      return ''
                    }
                  })()}
                  onChange={(e) => {
                    const val = e.target.value
                    setFormData(prev => {
                      let meta = {}
                      try {
                        meta = typeof prev.metadata === 'string' ? JSON.parse(prev.metadata) : prev.metadata || {}
                      } catch (err) {}
                      return {
                        ...prev,
                        metadata: JSON.stringify({ ...meta, gender: val })
                      }
                    })
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-primary focus:outline-none bg-white"
                >
                  <option value="">-- Chưa chọn --</option>
                  <option value="Nam">Nam</option>
                  <option value="Nữ">Nữ</option>
                  <option value="Khác">Khác</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </SlideOver>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.customer_id) }}
        title="Xác nhận xóa"
        description={`Bạn có chắc muốn xóa "${deleteTarget?.name}"?`}
        confirmLabel="Xóa"
        variant="danger"
        loading={deleteMutation.isPending}
      />

      <ConfirmDialog
        open={confirmDepositOpen}
        onClose={() => setConfirmDepositOpen(false)}
        onConfirm={() => {
          if (depositTarget) {
            depositMutation.mutate({
              amount: parseFloat(depositAmount),
              method: depositMethod,
              note: depositNote,
              fund_id: depositFundId,
            })
          }
          setConfirmDepositOpen(false)
        }}
        title="Xác nhận nạp tiền Ví trả trước"
        description={`Hành động này sẽ tự động tạo một PHIẾU THU SỔ QUỸ (Cashbook) tương ứng và nạp tiền vào ví khách hàng. Bạn có chắc chắn muốn nạp ${Number(depositAmount).toLocaleString('vi-VN')}đ thông qua sổ quỹ "${
          funds.find(f => f.id === depositFundId)?.name || 'đã chọn'
        }" cho khách hàng "${depositTarget?.name}" không?`}
        confirmLabel="Xác nhận nạp tiền"
        variant="default"
        loading={depositMutation.isPending}
      />

      {/* Deposit SlideOver */}
      <SlideOver
        open={!!depositTarget}
        onClose={() => setDepositTarget(null)}
        title={`Nạp tiền ví trả trước: ${depositTarget?.name}`}
        footer={
          <>
            <button
              onClick={() => setDepositTarget(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            >
              <X className="w-4 h-4" />
              Hủy
            </button>
            <button
              onClick={() => setConfirmDepositOpen(true)}
              disabled={depositMutation.isPending || parseFloat(depositAmount) <= 0}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-sm"
            >
              {depositMutation.isPending ? (
                <>
                  <svg className="animate-spin -ml-1 mr-1.5 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Đang nạp...
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4" />
                  Nạp tiền
                </>
              )}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Số dư hiện tại:</span>
              <span className="font-semibold text-slate-800">
                {Number(depositTarget?.prepaid_balance || 0).toLocaleString('vi-VN')}đ
              </span>
            </div>
            <div className="flex justify-between mt-1.5 border-t border-slate-200/50 pt-1.5">
              <span className="text-slate-500">Số dư sau khi nạp:</span>
              <span className="font-semibold text-emerald-600">
                {Number((parseFloat(depositTarget?.prepaid_balance || '0') + (parseFloat(depositAmount) || 0))).toLocaleString('vi-VN')}đ
              </span>
            </div>
          </div>

          <NumberInput
            label="Số tiền nạp *"
            value={depositAmount}
            onChange={(v) => setDepositAmount(v)}
            suffix="đ"
          />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tài khoản/Sổ quỹ nhận tiền *</label>
            <select
              value={depositFundId}
              onChange={(e) => {
                const val = e.target.value;
                setDepositFundId(val);
                const selectedFund = funds.find(f => f.id === val);
                if (selectedFund) {
                  const fundType = selectedFund.type || 'cash';
                  if (fundType === 'cash') {
                    setDepositMethod('cash');
                  } else {
                    setDepositMethod('bank_transfer');
                  }
                }
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none transition-colors"
            >
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.type === 'cash' ? 'Tiền mặt' : 'Tài khoản ngân hàng'} - Số dư: {Number(f.current_balance || 0).toLocaleString('vi-VN')}đ)
                </option>
              ))}
              {funds.length === 0 && <option value="">Đang tải danh sách sổ quỹ...</option>}
            </select>
          </div>

          {(() => {
            const selectedFund = funds.find(f => f.id === depositFundId);
            if (selectedFund && selectedFund.type === 'bank' && (selectedFund.bank_name || selectedFund.account_number)) {
              return (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 space-y-2 text-xs text-indigo-900 animate-in fade-in slide-in-from-top-1 duration-200 shadow-xs relative overflow-hidden">
                  <div className="absolute right-3 top-3 opacity-10 text-3xl font-bold select-none pointer-events-none">🏛️</div>
                  <p className="font-bold text-[10px] uppercase tracking-wider text-indigo-500 mb-1 flex items-center gap-1">
                    <span>🏛️</span> Thông tin thanh toán (Chuyển khoản)
                  </p>
                  <div className="grid grid-cols-3 gap-y-1.5 gap-x-2">
                    <span className="text-indigo-650 font-medium">Ngân hàng:</span>
                    <span className="col-span-2 font-bold text-slate-800">
                      {getBankDisplayName(selectedFund.bank_name)}
                    </span>
                    
                    <span className="text-indigo-650 font-medium">Số tài khoản:</span>
                    <span className="col-span-2">
                      {selectedFund.account_number ? (
                        <CopyableId
                          id={selectedFund.account_number}
                          className="text-sm font-bold text-slate-800"
                        />
                      ) : (
                        <span className="text-sm font-bold text-slate-800">—</span>
                      )}
                    </span>
                    
                    <span className="text-indigo-650 font-medium">Chủ tài khoản:</span>
                    <span className="col-span-2">
                      {selectedFund.account_name ? (
                        <CopyableId
                          id={selectedFund.account_name.toUpperCase()}
                          className="text-sm font-bold text-slate-800 uppercase"
                        />
                      ) : (
                        <span className="text-sm font-bold text-slate-800">—</span>
                      )}
                    </span>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 11.082 1.29l-.041.02a.75.75 0 01-.082-1.29zM12 20.25a8.25 8.25 0 100-16.5 8.25 8.25 0 000 16.5z" /></svg>
              Tự động khớp phương thức:
            </p>
            <p>Khi chọn sổ quỹ trên, phương thức thanh toán tương ứng là: <b>{depositMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản ngân hàng'}</b>.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ghi chú</label>
            <textarea
              value={depositNote}
              onChange={(e) => setDepositNote(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none"
              placeholder="Nhập ghi chú nạp tiền..."
            />
          </div>
        </div>
      </SlideOver>

      <ConfirmDialog
        open={confirmCollectDebtOpen}
        onClose={() => setConfirmCollectDebtOpen(false)}
        onConfirm={() => {
          if (collectDebtTarget) {
            checkShiftOrOpen(() => {
              collectDebtMutation.mutate({
                amount: parseFloat(collectDebtAmount),
                method: collectDebtMethod,
                fund_id: collectDebtFundId,
                note: collectDebtNote,
              })
            })
          }
          setConfirmCollectDebtOpen(false)
        }}
        title="Xác nhận thu nợ khách hàng"
        description={`Hành động này sẽ tự động tạo một PHIẾU THU SỔ QUỸ tương ứng và khấu trừ công nợ của khách hàng. Bạn có chắc chắn muốn thu ${Number(collectDebtAmount).toLocaleString('vi-VN')}đ từ khách hàng "${collectDebtTarget?.name}" không?`}
        confirmLabel="Xác nhận thu nợ"
        variant="default"
        loading={collectDebtMutation.isPending}
      />

      {/* Collect Debt SlideOver */}
      <SlideOver
        open={!!collectDebtTarget}
        onClose={() => setCollectDebtTarget(null)}
        title={`Thu nợ khách hàng: ${collectDebtTarget?.name}`}
        footer={
          <>
            <button
              onClick={() => setCollectDebtTarget(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            >
              <X className="w-4 h-4" />
              Hủy
            </button>
            <button
              onClick={() => setConfirmCollectDebtOpen(true)}
              disabled={collectDebtMutation.isPending || parseFloat(collectDebtAmount) <= 0}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-sm"
            >
              {collectDebtMutation.isPending ? (
                <>
                  <svg className="animate-spin -ml-1 mr-1.5 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Đang xử lý...
                </>
              ) : (
                <>
                  <Coins className="w-4 h-4" />
                  Xác nhận thu nợ
                </>
              )}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-red-100 bg-red-50/50 p-3 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Dư nợ hiện tại:</span>
              <span className="font-bold text-red-600">
                {Number(collectDebtTarget?.debt_amount || 0).toLocaleString('vi-VN')}đ
              </span>
            </div>
            <div className="flex justify-between mt-1.5 border-t border-slate-200/50 pt-2">
              <span className="text-slate-500 font-medium">Dư nợ còn lại sau thu:</span>
              <span className="font-bold text-slate-800">
                {Number(Math.max(0, parseFloat(collectDebtTarget?.debt_amount || '0') - (parseFloat(collectDebtAmount) || 0))).toLocaleString('vi-VN')}đ
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <NumberInput
              label="Số tiền thu *"
              value={collectDebtAmount}
              onChange={(v) => setCollectDebtAmount(v)}
              suffix="đ"
            />
            <div className="flex justify-end pt-1">
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:underline hover:text-primary-dark transition-colors cursor-pointer"
                onClick={() => setCollectDebtAmount(String(parseFloat(collectDebtTarget?.debt_amount || '0')))}
              >
                Thu toàn bộ dư nợ
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tài khoản/Sổ quỹ nhận tiền *</label>
            <select
              value={collectDebtFundId}
              onChange={(e) => {
                const val = e.target.value;
                setCollectDebtFundId(val);
                const selectedFund = funds.find(f => f.id === val);
                if (selectedFund) {
                  const fundType = selectedFund.type || 'cash';
                  if (fundType === 'cash') {
                    setCollectDebtMethod('cash');
                  } else {
                    setCollectDebtMethod('bank_transfer');
                  }
                }
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none transition-colors"
            >
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.type === 'cash' ? 'Tiền mặt' : 'Tài khoản ngân hàng'} - Số dư: {Number(f.current_balance || 0).toLocaleString('vi-VN')}đ)
                </option>
              ))}
              {funds.length === 0 && <option value="">Đang tải danh sách sổ quỹ...</option>}
            </select>
          </div>

          {(() => {
            const selectedFund = funds.find(f => f.id === collectDebtFundId);
            if (selectedFund && selectedFund.type === 'bank' && (selectedFund.bank_name || selectedFund.account_number)) {
              return (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 space-y-2 text-xs text-indigo-900 animate-in fade-in slide-in-from-top-1 duration-200 shadow-xs relative overflow-hidden">
                  <div className="absolute right-3 top-3 opacity-10 text-3xl font-bold select-none pointer-events-none">🏛️</div>
                  <p className="font-bold text-[10px] uppercase tracking-wider text-indigo-500 mb-1 flex items-center gap-1">
                    <span>🏛️</span> Thông tin thanh toán (Chuyển khoản)
                  </p>
                  <div className="grid grid-cols-3 gap-y-1.5 gap-x-2">
                    <span className="text-indigo-650 font-medium">Ngân hàng:</span>
                    <span className="col-span-2 font-bold text-slate-800">
                      {getBankDisplayName(selectedFund.bank_name)}
                    </span>
                    
                    <span className="text-indigo-650 font-medium">Số tài khoản:</span>
                    <span className="col-span-2">
                      {selectedFund.account_number ? (
                        <CopyableId
                          id={selectedFund.account_number}
                          className="text-sm font-bold text-slate-800"
                        />
                      ) : (
                        <span className="text-sm font-bold text-slate-800">—</span>
                      )}
                    </span>
                    
                    <span className="text-indigo-650 font-medium">Chủ tài khoản:</span>
                    <span className="col-span-2">
                      {selectedFund.account_name ? (
                        <CopyableId
                          id={selectedFund.account_name.toUpperCase()}
                          className="text-sm font-bold text-slate-800 uppercase"
                        />
                      ) : (
                        <span className="text-sm font-bold text-slate-800">—</span>
                      )}
                    </span>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 11.082 1.29l-.041.02a.75.75 0 01-.082-1.29zM12 20.25a8.25 8.25 0 100-16.5 8.25 8.25 0 000 16.5z" /></svg>
              Tự động khớp phương thức:
            </p>
            <p>Khi chọn sổ quỹ trên, phương thức thanh toán tương ứng là: <b>{collectDebtMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản ngân hàng'}</b>.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ghi chú</label>
            <textarea
              value={collectDebtNote}
              onChange={(e) => setCollectDebtNote(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none transition-colors"
              placeholder="Nhập ghi chú thu nợ..."
            />
          </div>
        </div>
      </SlideOver>

      {/* Customer Detail SlideOver (Read-Only) */}
      <SlideOver
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={`Chi tiết khách hàng: ${viewTarget?.name || ''}`}
        width={720}
        footer={
          <div className="flex w-full items-center justify-between">
            <div className="flex gap-2">
              {viewTarget && Number(viewTarget.debt_amount || 0) > 0 && (
                <button
                  onClick={() => {
                    setDetailOpen(false)
                    openCollectDebt(viewTarget)
                  }}
                  disabled={!permissions.includes('cashbook.manage')}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium shadow-xs transition-all flex items-center gap-1.5 ${
                    permissions.includes('cashbook.manage')
                      ? 'border-red-255 bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer active:scale-95'
                      : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed opacity-60'
                  }`}
                  title={permissions.includes('cashbook.manage') ? "Trả nợ (Thu nợ khách hàng)" : "Trả nợ 🔒 (Cần quyền quản lý sổ quỹ)"}
                >
                  <Coins className="w-4 h-4" />
                  Thu nợ {!permissions.includes('cashbook.manage') && '🔒'}
                </button>
              )}
              <button
                onClick={() => {
                  if (viewTarget && canAdjustWallet) {
                    setDetailOpen(false)
                    openDeposit(viewTarget)
                  }
                }}
                disabled={!canAdjustWallet}
                className={`rounded-xl border px-4 py-2 text-sm font-medium shadow-xs transition-all flex items-center gap-1.5 ${
                  canAdjustWallet
                    ? 'border-emerald-250 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer active:scale-95'
                    : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed opacity-60'
                }`}
                title={canAdjustWallet ? "Nạp tiền ví trả trước" : "Nạp tiền ví trả trước 🔒 (Cần quyền)"}
              >
                <Wallet className="w-4 h-4" />
                Nạp tiền ví {!canAdjustWallet && '🔒'}
              </button>
              <button
                onClick={() => {
                  if (viewTarget) {
                    setDetailOpen(false)
                    openEdit(viewTarget)
                  }
                }}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark cursor-pointer active:scale-95 transition-all shadow-xs flex items-center gap-1.5"
              >
                <Pencil className="w-4 h-4" />
                Chỉnh sửa thông tin
              </button>
            </div>
            <button
              onClick={() => setDetailOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
            >
              <X className="w-4 h-4" />
              Đóng
            </button>
          </div>
        }
      >
        {viewTarget && (
          <div className="space-y-6">
            {/* Header Profiling & Membership Color Badge */}
            <div className="flex flex-col items-center bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center space-y-2 relative overflow-hidden">
              {/* Branch pro ambient gradient accent backdrop */}
              <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center text-lg font-bold">
                {viewTarget.name?.charAt(0).toUpperCase()}
              </div>
              <h3 className="font-bold text-base text-slate-900 leading-tight">{viewTarget.name}</h3>
              <p className="text-xs text-slate-500">{viewTarget.phone || '—'}</p>
              
              <div className="pt-1">
                {(() => {
                  const type = (viewTarget.customer_type || '').trim().toLowerCase()
                  const tiers = settings?.has_crm_access ? (settings?.membership_tiers || []) : []
                  const activeTier = tiers.find((t: any) => (t.name || '').trim().toLowerCase() === type)
                  return <MemberTierBadge label={viewTarget.customer_type || 'Bán lẻ'} color={activeTier?.color || 'slate'} />
                })()}
              </div>
            </div>

            {/* Premium Tabs */}
            <div className="border-b border-slate-200">
              <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                <button
                  onClick={() => setDetailTab('info')}
                  className={`border-b-2 py-2 px-1 text-sm font-medium transition-all cursor-pointer ${
                    detailTab === 'info'
                      ? 'border-primary text-primary font-semibold'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  Thông tin cơ bản
                </button>
                <button
                  onClick={() => setDetailTab('orders')}
                  className={`border-b-2 py-2 px-1 text-sm font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                    detailTab === 'orders'
                      ? 'border-primary text-primary font-semibold'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span>Lịch sử mua hàng</span>
                  {customerOrders?.data && (
                    <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-[10px]">
                      {customerOrders.data.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setDetailTab('transactions')}
                  className={`border-b-2 py-2 px-1 text-sm font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                    detailTab === 'transactions'
                      ? 'border-primary text-primary font-semibold'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span>Lịch sử ví & thu nợ</span>
                  {customerTransactions?.data && (
                    <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-[10px]">
                      {customerTransactions.data.length}
                    </span>
                  )}
                </button>
              </nav>
            </div>

            {/* Tab Contents */}
            <div className="space-y-4 pt-1">
              {/* Tab 1: Info (Read-only) */}
              {detailTab === 'info' && (() => {
                let importedDebtDays = 0
                try {
                  if (viewTarget.metadata) {
                    const meta = typeof viewTarget.metadata === 'string'
                      ? JSON.parse(viewTarget.metadata)
                      : viewTarget.metadata
                    if (meta && meta.debt_days) {
                      importedDebtDays = parseInt(String(meta.debt_days), 10) || 0
                    }
                  }
                } catch (e) {
                  console.error('Failed to parse metadata in CustomersClient detail:', e)
                }

                const debtAge = calculateDebtAge(
                  customerOrders?.data || [],
                  customerTransactions?.data || [],
                  Number(viewTarget.debt_amount || 0),
                  importedDebtDays,
                  viewTarget.created_at
                )
                return (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                    {/* Financial Quick Cards */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-center space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Điểm tích lũy</span>
                        <span className="text-sm font-bold text-blue-600 block">
                          {Number(viewTarget.loyalty_points || 0).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 text-center space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ví trả trước</span>
                        <span className="text-sm font-bold text-emerald-600 block">
                          {Number(viewTarget.prepaid_balance || 0).toLocaleString('vi-VN')}đ
                        </span>
                      </div>
                      <div className="rounded-xl border border-red-100 bg-red-50/40 p-3 text-center space-y-0.5 relative overflow-hidden">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nợ hiện tại</span>
                        <span className="text-sm font-bold text-red-655 block">
                          {Number(viewTarget.debt_amount || 0).toLocaleString('vi-VN')}đ
                        </span>
                        {debtAge > 0 && (
                          <span className={`text-[9px] font-semibold block mt-0.5 rounded-md py-0.5 px-1.5 inline-flex items-center gap-1.5 ${
                            debtAge > maxDebtDays 
                              ? 'text-red-600 bg-red-100/50' 
                              : 'text-slate-600 bg-slate-100'
                          }`}>
                            <Clock className="w-2.5 h-2.5" /> {debtAge} ngày nợ
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Profile Details List */}
                    <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-4 text-sm">
                      <div className="grid grid-cols-2 gap-y-4 gap-x-2">
                        <div className="space-y-0.5">
                          <span className="text-xs text-slate-400 block font-medium">Mã khách hàng</span>
                          <span className="text-slate-800 block break-all font-semibold">
                            <CopyableId id={viewTarget.customer_id} className="text-slate-800 text-sm font-semibold" />
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-xs text-slate-400 block font-medium">Nhóm khách hàng</span>
                          <span className="text-slate-800 block">{viewTarget.customer_group || 'Mặc định'}</span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-xs text-slate-400 block font-medium">Số điện thoại</span>
                          <span className="text-slate-800 block font-semibold text-primary">{viewTarget.phone || '—'}</span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-xs text-slate-400 block font-medium">Ngày sinh nhật</span>
                          <span className="text-slate-800 block">{viewTarget.birthday || '—'}</span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-xs text-slate-400 block font-medium">Hạn mức tín dụng</span>
                          <span className="text-slate-800 font-semibold block">{Number(viewTarget.credit_limit || 0).toLocaleString('vi-VN')}đ</span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-xs text-slate-400 block font-medium">Địa chỉ Email</span>
                          <span className="text-slate-800 block break-all">{viewTarget.email || '—'}</span>
                        </div>
                        <div className="space-y-0.5 col-span-2">
                          <span className="text-xs text-slate-400 block font-medium">Địa chỉ nhà</span>
                          <span className="text-slate-800 block">{viewTarget.address || '—'}</span>
                        </div>

                        {Number(viewTarget.debt_amount || 0) > 0 && (
                          <div className="space-y-0.5 col-span-2 border-t border-dashed border-slate-100 pt-3 mt-1">
                            <span className="text-xs text-slate-400 block font-medium">Theo dõi tuổi nợ (FIFO)</span>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-3xs border ${
                                debtAge > maxDebtDays
                                  ? 'text-red-600 bg-red-50 border-red-100'
                                  : 'text-slate-600 bg-slate-50 border-slate-100'
                              }`}>
                                <Clock className="w-3.5 h-3.5" /> Khách nợ: {debtAge} ngày
                              </span>
                              {debtAge > maxDebtDays ? (
                                <span className="text-[10px] font-bold text-red-700 bg-red-100 border border-red-200/50 px-2.5 py-1 rounded-lg flex items-center gap-1 animate-pulse">
                                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" /> CẢNH BÁO QUÁ HẠN
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200/50 px-2.5 py-1 rounded-lg flex items-center gap-1">
                                  Trong thời hạn cho phép
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {viewTarget.note && (
                        <div className="border-t border-slate-100 pt-3 space-y-1">
                          <span className="text-xs text-slate-400 block font-medium">Ghi chú đặc biệt</span>
                          <p className="text-slate-600 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100/60 leading-relaxed text-xs italic">
                            {viewTarget.note}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Tab 2: Purchase/Order History */}
              {detailTab === 'orders' && (
                <div className="space-y-3">
                  {ordersLoading ? (
                    <div className="py-8 text-center text-xs text-slate-400 animate-pulse">Đang tải lịch sử đơn hàng...</div>
                  ) : !customerOrders?.data || customerOrders.data.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 italic">Khách hàng chưa có lịch sử mua hàng.</div>
                  ) : (
                    <div className="overflow-hidden border border-slate-200 rounded-2xl bg-white shadow-xs max-h-[380px] overflow-y-auto">
                      <table className="min-w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200 sticky top-0 z-10">
                          <tr>
                            <th className="px-3 py-2.5">Mã đơn / Ngày</th>
                            <th className="px-3 py-2.5">Kênh / Giao dịch</th>
                            <th className="px-3 py-2.5 text-right">Tổng tiền</th>
                            <th className="px-3 py-2.5 text-right">Đã thanh toán / Nợ</th>
                            <th className="px-3 py-2.5 text-center">Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(() => {
                            const CHANNEL_MAP: Record<string, string> = {
                              pos: 'POS (Cửa hàng)',
                              online: 'Trực tuyến',
                              phone: 'Điện thoại',
                              zalo: 'Zalo'
                            }
                            const ORDER_PAYMENT_MAP: Record<string, string> = {
                              cash: 'Tiền mặt',
                              card: 'Thẻ',
                              bank_transfer: 'Chuyển khoản',
                              momo: 'Ví Momo',
                              vnpay: 'VNPAY',
                              zalopay: 'ZaloPay',
                              debt: 'Ghi nợ',
                              prepaid: 'Ví trả trước'
                            }
                            
                            return customerOrders.data.map((order, i) => {
                              const subtotalVal = Number(order.subtotal || 0)
                              const discountVal = Number(order.discount_amount || 0)
                              const totalVal = Number(order.total_amount || 0)
                              const paidVal = Number(order.paid_amount || 0)
                              const debtVal = Number(order.debt_amount || 0)

                              return (
                                <tr key={order.order_id || i} className="hover:bg-slate-50">
                                  <td className="px-3 py-2.5">
                                    <span className="font-bold text-slate-800">#{order.order_no || order.order_id || '—'}</span>
                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                      {order.created_at ? format(new Date(order.created_at), 'HH:mm dd/MM/yyyy') : '—'}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <div className="font-medium text-slate-700 text-xs">
                                      {CHANNEL_MAP[order.channel] || order.channel || 'POS'}
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                      {ORDER_PAYMENT_MAP[order.payment_method] || order.payment_method || '—'}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 text-right">
                                    <div className="font-semibold text-slate-800">{totalVal.toLocaleString('vi-VN')}đ</div>
                                    {discountVal > 0 && (
                                      <div className="text-[9px] text-red-500 font-medium">Giảm {discountVal.toLocaleString('vi-VN')}đ</div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-xs">
                                    <div className="text-emerald-600 font-semibold">{paidVal.toLocaleString('vi-VN')}đ</div>
                                    {debtVal > 0 && (
                                      <div className="text-red-600 font-bold text-[9px] mt-0.5">{debtVal.toLocaleString('vi-VN')}đ nợ</div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-center">
                                    <TagBadge
                                      label={
                                        order.status === 'completed' ? 'Hoàn thành' :
                                        order.status === 'cancelled' ? 'Đã hủy' :
                                        order.status === 'pending' ? 'Chờ duyệt' : order.status || '—'
                                      }
                                      color={order.status === 'completed' ? 'green' : order.status === 'cancelled' ? 'red' : 'yellow'}
                                    />
                                  </td>
                                </tr>
                              )
                            })
                          })()}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: prepaid / cashbook financial history */}
              {detailTab === 'transactions' && (() => {
                const allTxs = customerTransactions?.data || []
                return (
                  <div className="space-y-3">
                    {txLoading ? (
                      <div className="py-8 text-center text-xs text-slate-400 animate-pulse">Đang tải lịch sử giao dịch...</div>
                    ) : allTxs.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400 italic">Chưa có phát sinh giao dịch tài chính/nạp ví.</div>
                    ) : (
                      <div className="overflow-hidden border border-slate-200 rounded-2xl bg-white shadow-xs max-h-[380px] overflow-y-auto">
                        <table className="min-w-full text-xs text-left">
                          <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200 sticky top-0 z-10">
                            <tr>
                              <th className="px-3 py-2.5">Số phiếu / Ngày</th>
                              <th className="px-3 py-2.5">Danh mục / Ghi chú</th>
                              <th className="px-3 py-2.5">Hình thức</th>
                              <th className="px-3 py-2.5 text-right">Số tiền</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {allTxs.map((tx, i) => {
                              const isVirtualDebt = tx.is_virtual === 'TRUE' && tx.method === 'debt'
                              const isReceipt = tx.type === 'receipt' && !isVirtualDebt
                              const catMap: Record<string, string> = {
                                prepaid_deposit: 'Nạp tiền ví trả trước',
                                debt_collection: tx.is_virtual === 'TRUE' ? 'Dư nợ đầu kỳ (Import KiotViet)' : 'Thu nợ khách hàng',
                                sales: 'Thu tiền bán hàng',
                                other: 'Giao dịch khác'
                              }
                              const methodMap: Record<string, string> = {
                                cash: 'Tiền mặt',
                                bank_transfer: 'Chuyển khoản',
                                card: 'Thẻ (POS)',
                                momo: 'Momo',
                                prepaid: 'Ví trả trước',
                                debt: 'Ghi nợ'
                              }
                              return (
                                <tr key={tx.transaction_id || i} className="hover:bg-slate-50">
                                  <td className="px-3 py-2.5">
                                    <span className="font-bold text-slate-800">
                                      {tx.transaction_id ? <CopyableId id={tx.transaction_id} className="text-slate-800 font-bold" /> : '—'}
                                    </span>
                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                      {tx.created_at ? format(new Date(tx.created_at), 'HH:mm dd/MM/yyyy') : '—'}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className="font-semibold text-slate-700 block">
                                      {catMap[tx.category] || tx.category || 'Thu/Chi khác'}
                                    </span>
                                    {tx.note && <div className="text-[10px] text-slate-500 max-w-[220px] break-words mt-0.5">{tx.note}</div>}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className="inline-flex text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200/60 font-medium">
                                      {methodMap[tx.method] || tx.method}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5 text-right">
                                    <span className={`font-bold block text-sm ${isReceipt ? 'text-green-600' : 'text-red-600'}`}>
                                      {isReceipt ? '+' : '-'}{Number(tx.amount || 0).toLocaleString('vi-VN')}đ
                                    </span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        )}
      </SlideOver>
      {/* MULTI-PROVIDER EXCEL IMPORT WIZARD MODAL */}
      {importModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                {importProvider !== null && parsedCustomers.length === 0 && (
                  <button
                    type="button"
                    disabled={importingProgress}
                    onClick={() => {
                      setImportProvider(null)
                      setImportFile(null)
                      setParsedCustomers([])
                    }}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 mr-1 flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <div className="p-2 rounded-xl bg-primary text-white shadow-md shadow-primary/20">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">
                    {importProvider === null
                      ? 'Nhập dữ liệu khách hàng từ Excel'
                      : importProvider === 'kiotviet'
                        ? 'Nhập dữ liệu khách hàng từ KiotViet'
                        : 'Nhập dữ liệu khách hàng từ Template chuẩn'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {importProvider === null
                      ? 'Chọn nhà cung cấp dịch vụ hoặc sử dụng file mẫu chuẩn của ONI'
                      : importProvider === 'kiotviet'
                        ? 'Hỗ trợ nợ đầu kỳ, điểm tích lũy, các trường động (Zalo, Facebook, MST, CMND...)'
                        : 'Mẫu file tối ưu hóa dữ liệu khách hàng chuẩn hệ thống với cấu trúc đơn giản'}
                  </p>
                </div>
              </div>
              <button
                disabled={importingProgress}
                onClick={() => {
                  setImportModalOpen(false)
                  setImportFile(null)
                  setImportProvider(null)
                  setParsedCustomers([])
                }}
                className="text-slate-400 hover:text-slate-600 text-lg p-1 cursor-pointer disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-4 flex-1 overflow-y-auto space-y-4 pr-1">
              {importProvider === null ? (
                <div className="py-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
                    {/* KIOTVIET CARD */}
                    <div
                      onClick={() => setImportProvider('kiotviet')}
                      className="group cursor-pointer rounded-2xl border-2 border-slate-100 hover:border-orange-200 bg-white p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between min-h-[200px]"
                    >
                      <div>
                        <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                          <Upload className="w-6 h-6" />
                        </div>
                        <h4 className="text-base font-bold text-slate-800 group-hover:text-orange-600 transition-colors">KiotViet Excel</h4>
                        <p className="text-xs text-slate-500 mt-2 leading-relaxed">Nhập danh sách khách hàng từ file Excel xuất trực tiếp từ quản lý KiotViet. Giữ nguyên công nợ, điểm số và thông tin cá nhân.</p>
                      </div>
                      <div className="mt-4 flex items-center text-xs font-semibold text-orange-600 group-hover:translate-x-1 transition-transform gap-1">
                        Chọn nguồn này
                        <ArrowLeft className="w-4 h-4 rotate-180" />
                      </div>
                    </div>

                    {/* TEMPLATE ONI CARD */}
                    <div
                      className="group rounded-2xl border-2 border-slate-100 hover:border-primary/30 bg-white p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between min-h-[200px]"
                    >
                      <div onClick={() => setImportProvider('oni')} className="cursor-pointer">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                          <Upload className="w-6 h-6" />
                        </div>
                        <h4 className="text-base font-bold text-slate-800 group-hover:text-primary transition-colors">Template Chuẩn ONI</h4>
                        <p className="text-xs text-slate-500 mt-2 leading-relaxed">Nhập dữ liệu tối ưu theo file Excel mẫu chuẩn Oni. Thích hợp cho việc khởi tạo mới nhanh chóng và chính xác.</p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={downloadOniTemplate}
                          className="text-[11px] font-bold text-primary hover:text-primary-dark underline flex items-center gap-1 cursor-pointer"
                        >
                          Tải File Mẫu
                        </button>
                        <button
                          type="button"
                          onClick={() => setImportProvider('oni')}
                          className="text-xs font-semibold text-primary hover:text-primary-dark flex items-center gap-1 cursor-pointer group-hover:translate-x-1 transition-transform"
                        >
                          Chọn nguồn này
                          <ArrowLeft className="w-4 h-4 rotate-180" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : parsedCustomers.length === 0 ? (
                // Drag and drop zone
                <div className="py-8 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl hover:border-primary transition-colors duration-300 bg-slate-50/50">
                  <Upload className="w-12 h-12 text-slate-400 mb-4 animate-bounce" />
                  <p className="text-sm font-semibold text-slate-700">Kéo thả file Excel của bạn vào đây</p>
                  <p className="text-xs text-slate-400 mt-1">Hỗ trợ tệp Excel `.xlsx` hoặc `.xls` chứa danh sách khách hàng đầy đủ.</p>
                  <div className="mt-4 flex gap-3">
                    {importProvider === 'oni' && (
                      <button
                        type="button"
                        onClick={downloadOniTemplate}
                        className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 cursor-pointer shadow-xs transition-colors"
                      >
                        Tải File Mẫu (.xlsx)
                      </button>
                    )}
                    <label className="rounded-xl bg-primary text-white hover:bg-primary-dark px-4 py-2 text-xs font-semibold cursor-pointer shadow-sm hover:shadow-md transition-all active:scale-95">
                      Chọn file Excel (.xlsx)
                      <input
                        type="file"
                        className="hidden"
                        accept=".xlsx, .xls"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleExcelImport(file)
                        }}
                      />
                    </label>
                  </div>
                </div>
              ) : (
                // Preview data and strategy forms
                <div className="space-y-6">
                  {/* Stats card */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                      <span className="text-[10px] uppercase font-bold text-blue-500 tracking-wider">Tổng số khách hàng</span>
                      <div className="text-xl font-black text-blue-650 mt-1">{parsedCustomers.length.toLocaleString()} khách</div>
                    </div>
                    <div className="rounded-2xl border border-red-100 bg-red-50/50 p-4">
                      <span className="text-[10px] uppercase font-bold text-red-500 tracking-wider">Tổng nợ đầu kỳ</span>
                      <div className="text-xl font-black text-red-600 mt-1">
                        {parsedCustomers.reduce((sum, c) => sum + (parseFloat(c.debt_amount) || 0), 0).toLocaleString()}đ
                      </div>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                      <span className="text-[10px] uppercase font-bold text-emerald-500 tracking-wider">Tổng điểm tích lũy</span>
                      <div className="text-xl font-black text-emerald-600 mt-1">
                        {parsedCustomers.reduce((sum, c) => sum + (parseFloat(c.loyalty_points) || 0), 0).toLocaleString()} điểm
                      </div>
                    </div>
                  </div>

                  {/* Strategy Config Card */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.68-.34-1.16-.94-1.34-1.62-.18-.68-.08-1.4.3-1.98l1.4-2.1c.38-.58.98-.98 1.66-1.12.68-.14 1.38-.02 1.96.34l2.1 1.4c.58.38.98.98 1.12 1.66.14.68.02 1.38-.34 1.96l-1.4 2.1c-.38.58-.98.98-1.66 1.12-.68.14-1.38.02-1.96-.34l-2.1-1.4z" /></svg>
                      Cấu hình xử lý trùng lặp và số dư nợ
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Duplicate Conflict Strategy */}
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-slate-600">Khi trùng Số điện thoại hoặc Mã khách hàng:</label>
                        <div className="flex gap-4">
                          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                            <input
                              type="radio"
                              name="conflict_strategy"
                              checked={conflictStrategy === 'skip'}
                              onChange={() => setConflictStrategy('skip')}
                              className="text-primary focus:ring-primary w-4 h-4"
                            />
                            Bỏ qua (Giữ thông tin cũ)
                          </label>
                          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                            <input
                              type="radio"
                              name="conflict_strategy"
                              checked={conflictStrategy === 'overwrite'}
                              onChange={() => setConflictStrategy('overwrite')}
                              className="text-primary focus:ring-primary w-4 h-4"
                            />
                            Cập nhật (Ghi đè thông tin mới)
                          </label>
                        </div>
                      </div>

                      {/* Balance Update Strategy */}
                      {conflictStrategy === 'overwrite' && (
                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-slate-600">Cách xử lý Công nợ và Điểm tích lũy:</label>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                              <input
                                type="radio"
                                name="balance_strategy"
                                checked={balanceStrategy === 'overwrite'}
                                onChange={() => setBalanceStrategy('overwrite')}
                                className="text-primary focus:ring-primary w-4 h-4"
                              />
                              Ghi đè số dư từ Excel
                            </label>
                            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                              <input
                                type="radio"
                                name="balance_strategy"
                                checked={balanceStrategy === 'accumulate'}
                                onChange={() => setBalanceStrategy('accumulate')}
                                className="text-primary focus:ring-primary w-4 h-4"
                              />
                              Cộng dồn vào số hiện tại
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl bg-amber-50 border border-amber-100 p-2.5 text-[10px] text-amber-700 leading-relaxed font-medium">
                      * Cửa hàng sẽ tự động ghi nhận các Phiếu Sổ quỹ (Cashbook) ảo được đánh dấu là `is_virtual` để khớp dòng công nợ đầu kỳ, hoàn toàn không làm sai lệch số dư két tiền/ngân hàng của shop.
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block px-1">Danh sách xem trước (10 dòng đầu)</span>
                    <div className="rounded-xl border border-slate-200 overflow-x-auto shadow-sm bg-white max-h-60 overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                            <th className="px-3 py-2">Họ tên</th>
                            <th className="px-3 py-2">Số điện thoại</th>
                            <th className="px-3 py-2">Mã KH</th>
                            <th className="px-3 py-2">Loại khách</th>
                            <th className="px-3 py-2 text-right">Nợ cần thu</th>
                            <th className="px-3 py-2 text-right">Điểm số</th>
                            <th className="px-3 py-2">Địa chỉ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedCustomers.slice(0, 10).map((c, idx) => (
                            <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                              <td className="px-3 py-2 font-semibold text-slate-800">{c.name}</td>
                              <td className="px-3 py-2 text-slate-700">{c.phone || '—'}</td>
                              <td className="px-3 py-2 font-mono font-semibold text-slate-600">{c.customer_code || '—'}</td>
                              <td className="px-3 py-2 text-slate-600">
                                <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600">
                                  {c.customer_type === 'wholesale' ? 'Khách sỉ' : c.customer_type === 'vip' ? 'VIP' : c.customer_type === 'staff' ? 'Nội bộ' : 'Bán lẻ'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right font-bold text-red-600 font-mono">{Number(c.debt_amount || 0).toLocaleString()}đ</td>
                              <td className="px-3 py-2 text-right font-semibold text-blue-600 font-mono">{Number(c.loyalty_points || 0).toLocaleString()}</td>
                              <td className="px-3 py-2 text-slate-500 truncate max-w-[150px]">{c.address || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3 flex justify-end gap-3">
              <button
                disabled={importingProgress}
                onClick={() => {
                  setImportModalOpen(false)
                  setImportFile(null)
                  setImportProvider(null)
                  setParsedCustomers([])
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                Hủy
              </button>
              {parsedCustomers.length > 0 && (
                <button
                  disabled={importingProgress}
                  onClick={submitExcelImport}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark cursor-pointer transition-colors shadow-sm disabled:opacity-50"
                >
                  {importingProgress ? 'Đang Import...' : `Bắt đầu Import (${parsedCustomers.length} KH)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
