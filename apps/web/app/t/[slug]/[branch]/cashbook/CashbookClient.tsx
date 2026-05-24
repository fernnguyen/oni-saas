'use client'
import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DataTable, Column } from '@/app/components/ui/DataTable'
import { SlideOver } from '@/app/components/ui/SlideOver'
import { TagBadge } from '@/app/components/ui/TagBadge'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { SearchBar } from '@/app/components/ui/SearchBar'
import { NumberInput } from '@/app/components/ui/NumberInput'
import { format } from 'date-fns'
import { CopyableId } from '@/app/components/ui/CopyableId'
import { useSearchParams } from 'next/navigation'
import { useDebounce } from 'use-debounce'
import { HasPermission, PermissionsProvider } from '@/app/components/ui/PermissionGate'
import { useConfirm } from '@/app/components/ui/ConfirmProvider'

const Clock = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
const Wallet = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
const Plus = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const CheckList = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>

interface Props {
  shopId: string
  shopName: string
  permissions?: string[]
}

const EMPTY_FORM = {
  type: 'receipt',
  amount: 0,
  method: 'cash',
  category: 'other',
  reference_name: '',
  note: '',
  fund_id: '',
}

const EMPTY_FUND_FORM = {
  name: '',
  type: 'cash',
  account_number: '',
  bank_name: '',
  initial_balance: 0,
  is_default: false,
}

const DENOMINATIONS = [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000]

export function CashbookClient({ shopId, permissions }: Props) {
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const initialSearch = searchParams?.get('search') || searchParams?.get('transactionId') || ''
  
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [fundFilter, setFundFilter] = useState<string>('')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  
  const [search, setSearch] = useState(initialSearch)
  const [debouncedSearch] = useDebounce(search, 300)
  
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [slideOpen, setSlideOpen] = useState(false)

  const [fundFormData, setFundFormData] = useState(EMPTY_FUND_FORM)
  const [fundSlideOpen, setFundSlideOpen] = useState(false)

  // --- SHIFT MANAGEMENT & RECONCILIATION STATES ---
  const [auditSlideOpen, setAuditSlideOpen] = useState(false)
  const [auditHistorySlideOpen, setAuditHistorySlideOpen] = useState(false)
  const [selectedFundIdForAudit, setSelectedFundIdForAudit] = useState('')
  const [actualBalanceInput, setActualBalanceInput] = useState('0')
  const [denominations, setDenominations] = useState<Record<number, number>>({})
  const [auditNote, setAuditNote] = useState('')

  // --- QUERY: LẤY DANH SÁCH QUỸ ---
  const { data: fundsData } = useQuery({
    queryKey: ['payment-funds', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/payment-funds`)
      if (!res.ok) throw new Error('Không tải được danh sách quỹ')
      return res.json() as Promise<{ data: Record<string, string>[] }>
    },
  })
  const fundsList = fundsData?.data || []

  // --- QUERY: LẤY DANH SÁCH GIAO DỊCH CASHBOOK + SỐ DƯ ĐỘNG ---
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['cashbook', shopId, page, typeFilter, debouncedSearch, fundFilter, fromDate, toDate],
    queryFn: async () => {
      const sp = new URLSearchParams({ page: String(page), limit: '50' })
      if (typeFilter) sp.set('type', typeFilter)
      if (debouncedSearch) sp.set('search', debouncedSearch)
      if (fundFilter) sp.set('fund_id', fundFilter)
      if (fromDate) sp.set('from_date', fromDate)
      if (toDate) sp.set('to_date', toDate)
      const res = await fetch(`/api/shops/${shopId}/cashbook?${sp}`)
      if (!res.ok) throw new Error('Không tải được dữ liệu')
      return res.json() as Promise<{
        data: Record<string, string>[]
        total: number
        opening_balance: string
        total_receipt: string
        total_payment: string
        closing_balance: string
      }>
    },
  })

  // --- QUERY: LẤY LỊCH SỬ KIỂM QUỸ ---
  const { data: auditsData } = useQuery({
    queryKey: ['fund-audits', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/fund-audits`)
      if (!res.ok) throw new Error('Không tải được lịch sử kiểm quỹ')
      return res.json() as Promise<{ data: Record<string, string>[] }>
    },
  })
  const auditsList = auditsData?.data || []

  // --- MUTATION: TẠO PHIẾU THU/CHI ---
  const saveMutation = useMutation({
    mutationFn: async (payload: typeof EMPTY_FORM) => {
      const res = await fetch(`/api/shops/${shopId}/cashbook`, {
        method: 'POST',
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
      toast.success('Đã tạo phiếu thành công')
      setSlideOpen(false)
      queryClient.invalidateQueries({ queryKey: ['cashbook', shopId] })
      queryClient.invalidateQueries({ queryKey: ['payment-funds', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // --- MUTATION: TẠO TÀI KHOẢN QUỸ MỚI ---
  const saveFundMutation = useMutation({
    mutationFn: async (payload: typeof EMPTY_FUND_FORM & { branch_id: string }) => {
      const res = await fetch(`/api/shops/${shopId}/payment-funds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Tạo quỹ thất bại')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Đã tạo tài khoản quỹ thành công')
      setFundSlideOpen(false)
      queryClient.invalidateQueries({ queryKey: ['payment-funds', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleConfirmCreateFund = async () => {
    const isConfirmed = await confirm({
      title: 'Xác nhận tạo tài khoản/quỹ',
      description: `Bạn có chắc chắn muốn thêm tài khoản quỹ "${fundFormData.name}" với số dư ban đầu là ${Number(fundFormData.initial_balance).toLocaleString('vi-VN')}đ không?`,
      confirmLabel: 'Tạo tài khoản',
      cancelLabel: 'Hủy',
    })
    if (isConfirmed) {
      saveFundMutation.mutate({ ...fundFormData, branch_id: activeBranchId })
    }
  }

  // --- MUTATION: TẠO PHIẾU KIỂM QUỸ (CÂN BẰNG TỰ ĐỘNG) ---
  const saveAuditMutation = useMutation({
    mutationFn: async (payload: { fund_id: string; actual_balance: number; cash_denominations?: Record<number, number>; note: string }) => {
      const res = await fetch(`/api/shops/${shopId}/fund-audits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Kiểm quỹ thất bại')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Kiểm kê và tự động cân bằng số dư quỹ thành công!')
      setAuditSlideOpen(false)
      queryClient.invalidateQueries({ queryKey: ['cashbook', shopId] })
      queryClient.invalidateQueries({ queryKey: ['payment-funds', shopId] })
      queryClient.invalidateQueries({ queryKey: ['fund-audits', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function openCreate(type: 'receipt' | 'payment') {
    const defaultFund = fundsList.find(f => f.is_default === 'TRUE') || fundsList[0]
    setFormData({ ...EMPTY_FORM, type, fund_id: defaultFund?.id || '' })
    setSlideOpen(true)
  }

  function openCreateFund() {
    setFundFormData(EMPTY_FUND_FORM)
    setFundSlideOpen(true)
  }

  function openAudit() {
    const defaultFund = fundsList.find(f => f.is_default === 'TRUE') || fundsList[0]
    setSelectedFundIdForAudit(defaultFund?.id || '')
    setActualBalanceInput('0')
    setDenominations({})
    setAuditNote('')
    setAuditSlideOpen(true)
  }

  // Cập nhật số tờ đếm được khi kiểm quỹ tiền mặt
  const updateDenomination = (denom: number, count: number) => {
    setDenominations(prev => {
      const next = { ...prev, [denom]: count }
      const total = Object.entries(next).reduce((sum, [d, c]) => sum + Number(d) * c, 0)
      setActualBalanceInput(String(total))
      return next
    })
  }

  const selectedFund = fundsList.find(f => f.id === selectedFundIdForAudit)
  const systemBalance = parseFloat(selectedFund?.current_balance || '0')
  const actualBalance = parseFloat(actualBalanceInput) || 0
  const variance = actualBalance - systemBalance

  const CATEGORY_MAP: Record<string, string> = {
    sales: 'Bán hàng',
    debt_collection: 'Thu nợ',
    debt_payment: 'Trả nợ',
    import: 'Nhập hàng',
    salary: 'Lương nhân viên',
    utilities: 'Điện nước/Mặt bằng',
    other: 'Khác',
    refund: 'Hoàn tiền',
    inventory: 'Kho hàng',
    inventory_payment: 'Thanh toán nhập kho',
    inventory_receipt: 'Thu nhập kho',
    prepaid_deposit: 'Nạp tiền ví trả trước',
  }

  const METHOD_MAP: Record<string, string> = {
    cash: 'Tiền mặt',
    bank_transfer: 'Chuyển khoản',
    card: 'Thẻ (POS)',
    momo: 'Ví Momo',
    prepaid: 'Ví trả trước',
  }

  const columns = useMemo<Column<Record<string, string>>[]>(() => [
    { 
      key: 'transaction_id', 
      label: 'Số phiếu',
      render: (row) => (
        <div>
          {row.transaction_id ? (
            <CopyableId id={row.transaction_id} className="text-sm font-semibold text-slate-900" />
          ) : (
            <span className="block text-sm font-semibold text-slate-900">—</span>
          )}
          <div className="flex items-center text-[11px] text-slate-500 mt-1 gap-1">
            <Clock className="w-3 h-3" />
            <span>{format(new Date(row.created_at || new Date()), 'HH:mm dd/MM/yy')}</span>
          </div>
        </div>
      )
    },
    {
      key: 'type',
      label: 'Loại',
      render: (row) => (
        <TagBadge 
          label={row.type === 'receipt' ? 'Phiếu Thu' : 'Phiếu Chi'} 
          color={row.type === 'receipt' ? 'green' : 'red'} 
        />
      ),
    },
    {
      key: 'amount',
      label: 'Số tiền',
      render: (row) => (
        <div>
          <span className={`block font-semibold text-sm ${row.type === 'receipt' ? 'text-emerald-600' : 'text-rose-600'}`}>
            {row.type === 'receipt' ? '+' : '-'}{Number(row.amount || 0).toLocaleString('vi-VN')}đ
          </span>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
              {METHOD_MAP[row.method] || row.method}
            </span>
            {row.fund_id && (
              <span className="inline-flex items-center text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100 gap-0.5">
                <Wallet className="w-2.5 h-2.5" />
                {fundsList.find(f => f.id === row.fund_id)?.name || 'Quỹ'}
              </span>
            )}
          </div>
        </div>
      ),
    },
    { 
      key: 'category', 
      label: 'Danh mục', 
      render: (row) => {
        let color: any = 'gray'
        if (row.category === 'sales') color = 'blue'
        else if (row.category === 'debt_collection' || row.category === 'debt_payment') color = 'orange'
        else if (row.category === 'import' || row.category === 'inventory_payment' || row.category === 'inventory_receipt' || row.category === 'inventory') color = 'purple'
        else if (row.category === 'salary') color = 'yellow'
        else if (row.category === 'utilities') color = 'blue'
        
        return <TagBadge label={CATEGORY_MAP[row.category] || row.category} color={color} />
      } 
    },
    { key: 'reference_name', label: 'Người nộp/nhận' },
    { 
      key: 'balance_after_transaction', 
      label: 'Số dư sau GD',
      render: (row) => (
        <span className="text-xs text-slate-600 font-medium font-mono">
          {row.balance_after_transaction ? `${Number(row.balance_after_transaction).toLocaleString('vi-VN')}đ` : '—'}
        </span>
      )
    },
    { key: 'note', label: 'Ghi chú', render: (row) => <span className="text-[11px] text-slate-500 block max-w-xs">{row.note}</span> },
  ], [fundsList])

  const activeBranchId = shopId

  return (
    <PermissionsProvider permissions={permissions || []}>
      <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sổ quỹ tài chính</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Theo dõi dòng tiền mặt, chuyển khoản ngân hàng và kiểm soát quỹ của cửa hàng.
            {isFetching && !isLoading && <span className="ml-2 text-xs text-indigo-500 animate-pulse font-medium">Đang đồng bộ...</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setAuditHistorySlideOpen(true)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            Lịch sử kiểm quỹ
          </button>
          <HasPermission has="cashbook.audit">
            <button
              onClick={openAudit}
              className="rounded-xl border border-slate-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 shadow-sm flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer border-amber-100"
            >
              <CheckList className="w-4 h-4 text-amber-700" />
              Kiểm Quỹ
            </button>
          </HasPermission>
          <HasPermission has="cashbook.funds.manage">
            <button
              onClick={openCreateFund}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            >
              <Wallet className="w-4 h-4 text-slate-500" />
              Tài khoản/Quỹ
            </button>
          </HasPermission>
          <HasPermission has="cashbook.manage">
            <button
              onClick={() => openCreate('receipt')}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Tạo Phiếu Thu
            </button>
            <button
              onClick={() => openCreate('payment')}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Tạo Phiếu Chi
            </button>
          </HasPermission>
        </div>
      </div>

      {/* --- STATS KPI CARDS --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD: SỐ DƯ ĐẦU KỲ */}
        <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all group">
          <div className="absolute top-0 left-0 h-1 w-full bg-slate-400 group-hover:bg-slate-500 transition-colors" />
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Số dư đầu kỳ</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-bold tracking-tight text-slate-700 font-mono">
              {Number(data?.opening_balance || 0).toLocaleString('vi-VN')}
            </span>
            <span className="text-sm font-bold text-slate-400">đ</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Số dư tích lũy trước thời gian lọc</p>
        </div>

        {/* CARD: TỔNG THU (+) */}
        <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all group">
          <div className="absolute top-0 left-0 h-1 w-full bg-emerald-500 group-hover:bg-emerald-600 transition-colors" />
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Tổng Thu (+)</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 font-mono">
              {Number(data?.total_receipt || 0).toLocaleString('vi-VN')}
            </span>
            <span className="text-sm font-bold text-emerald-400">đ</span>
          </div>
          <p className="text-[10px] text-emerald-500/80 mt-1">Doanh thu phát sinh trong kỳ</p>
        </div>

        {/* CARD: TỔNG CHI (-) */}
        <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all group">
          <div className="absolute top-0 left-0 h-1 w-full bg-rose-500 group-hover:bg-rose-600 transition-colors" />
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-600">Tổng Chi (-)</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-bold tracking-tight text-rose-600 font-mono">
              {Number(data?.total_payment || 0).toLocaleString('vi-VN')}
            </span>
            <span className="text-sm font-bold text-rose-400">đ</span>
          </div>
          <p className="text-[10px] text-rose-500/80 mt-1">Các chi phí phát sinh trong kỳ</p>
        </div>

        {/* CARD: SỐ DƯ CUỐI KỲ */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 via-orange-600 to-rose-700 p-5 shadow-lg shadow-orange-500/10 hover:shadow-xl hover:shadow-orange-500/20 transition-all duration-300 group text-white">
          <div className="absolute right-[-10%] top-[-25%] h-24 w-24 rounded-full bg-white/10 blur-[1px] group-hover:scale-110 transition-transform duration-500" />
          <div className="absolute right-[15%] bottom-[-30%] h-16 w-16 rounded-full bg-white/5 blur-[2px]" />
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-100 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-orange-200" />
            Số dư cuối kỳ
          </p>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="text-3xl font-extrabold tracking-tight text-white font-mono">
              {Number(data?.closing_balance || 0).toLocaleString('vi-VN')}
            </span>
            <span className="text-sm font-bold text-orange-200">đ</span>
          </div>
          <p className="text-[10px] text-orange-100/90 mt-1">Lượng tiền hiện có thực tế</p>
        </div>
      </div>

      {/* --- SECTION: TÀI KHOẢN & QUỸ THANH TOÁN --- */}
      <div className="space-y-3 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Wallet className="w-4 h-4 text-slate-400" />
            Tài khoản & Quỹ thanh toán
          </h2>
          <HasPermission has="cashbook.funds.manage">
            <button
              onClick={openCreateFund}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm tài khoản mới
            </button>
          </HasPermission>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {/* Card: Tất cả tài khoản */}
          <div 
            onClick={() => { setFundFilter(''); setPage(1) }}
            className={`cursor-pointer rounded-xl border p-3 transition-all flex flex-col justify-between h-[82px] active:scale-[0.98] ${
              !fundFilter 
                ? 'border-indigo-600 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-600/10' 
                : 'border-slate-200/80 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${!fundFilter ? 'text-indigo-600' : 'text-slate-400'}`}>Tất cả quỹ</span>
              <span className="text-sm">🏦</span>
            </div>
            <div className="flex items-baseline gap-0.5 mt-1">
              <span className={`text-base font-bold font-mono ${!fundFilter ? 'text-indigo-950' : 'text-slate-700'}`}>
                {fundsList.reduce((sum, f) => sum + parseFloat(f.current_balance || '0'), 0).toLocaleString('vi-VN')}
              </span>
              <span className="text-[9px] font-bold text-slate-400">đ</span>
            </div>
          </div>

          {/* Danh sách từng quỹ */}
          {fundsList.map(fund => {
            const isSelected = fundFilter === fund.id
            const balance = parseFloat(fund.current_balance || '0')
            let emoji = '💵'
            if (fund.type === 'bank') emoji = '🏦'
            else if (fund.type === 'wallet') emoji = '📱'

            return (
              <div 
                key={fund.id}
                onClick={() => { setFundFilter(isSelected ? '' : fund.id); setPage(1) }}
                className={`cursor-pointer rounded-xl border p-3 transition-all flex flex-col justify-between h-[82px] active:scale-[0.98] group relative ${
                  isSelected 
                    ? 'border-indigo-600 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-600/10' 
                    : 'border-slate-200/80 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-[10px] font-bold uppercase tracking-wider truncate max-w-[80%] ${isSelected ? 'text-indigo-600' : 'text-slate-500'}`}>
                    {fund.name}
                  </span>
                  <span className="text-sm shrink-0">{emoji}</span>
                </div>
                <div className="flex items-baseline gap-0.5 mt-1">
                  <span className={`text-base font-bold font-mono ${isSelected ? 'text-indigo-950' : 'text-slate-700'}`}>
                    {balance.toLocaleString('vi-VN')}
                  </span>
                  <span className="text-[9px] font-bold text-slate-400">đ</span>
                </div>
                {fund.is_default === 'TRUE' && (
                  <span className="absolute bottom-1 right-2 text-[8px] bg-emerald-100 text-emerald-800 font-bold px-1 py-0.2 rounded border border-emerald-200">
                    Mặc định
                  </span>
                )}
              </div>
            )
          })}

          {/* Nút đứt mở quỹ mới trực quan */}
          <HasPermission has="cashbook.funds.manage">
            <div 
              onClick={openCreateFund}
              className="cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50/50 hover:bg-indigo-50/30 hover:border-indigo-400/80 p-3 transition-all flex flex-col justify-center items-center h-[82px] text-center active:scale-[0.98] group"
            >
              <div className="rounded-full bg-slate-200/80 group-hover:bg-indigo-100 p-1 transition-colors">
                <Plus className="w-4 h-4 text-slate-500 group-hover:text-indigo-600" />
              </div>
              <span className="text-[11px] font-bold text-slate-500 group-hover:text-indigo-600 mt-1">Mở thêm quỹ mới</span>
            </div>
          </HasPermission>
        </div>
      </div>

      {/* FILTER & SEARCH CONTROL SECTION */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Ô Tìm kiếm */}
          <div className="w-full">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Tìm kiếm nhanh</label>
            <SearchBar
              value={search}
              onChange={(v) => { setSearch(v); setPage(1) }}
              placeholder="Mã phiếu, ghi chú, người nhận..."
            />
          </div>

          {/* Bộ lọc Quỹ */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Tài khoản/Quỹ</label>
            <select
              value={fundFilter}
              onChange={(e) => { setFundFilter(e.target.value); setPage(1) }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white focus:border-indigo-500 focus:outline-none h-[38px] shadow-sm"
            >
              <option value="">Tất cả tài khoản ({fundsList.length})</option>
              {fundsList.map(f => (
                <option key={f.id} value={f.id}>{f.name} ({Number(f.current_balance || 0).toLocaleString('vi-VN')}đ)</option>
              ))}
            </select>
          </div>

          {/* Ngày bắt đầu */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Từ ngày</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
              className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none h-[38px] shadow-sm"
            />
          </div>

          {/* Ngày kết thúc */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Đến ngày</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1) }}
              className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none h-[38px] shadow-sm"
            />
          </div>
        </div>

        {/* Lọc loại phiếu */}
        <div className="flex gap-1.5 flex-wrap border-t border-slate-100 pt-3">
          <button 
            onClick={() => { setTypeFilter(''); setPage(1) }}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-all ${!typeFilter ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
          >
            Tất cả phiếu
          </button>
          <button 
            onClick={() => { setTypeFilter('receipt'); setPage(1) }}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-all ${typeFilter === 'receipt' ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
          >
            Chỉ Phiếu Thu
          </button>
          <button 
            onClick={() => { setTypeFilter('payment'); setPage(1) }}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-all ${typeFilter === 'payment' ? 'bg-rose-600 text-white border-rose-600 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
          >
            Chỉ Phiếu Chi
          </button>
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          loading={isLoading}
          pagination={{ page, total: data?.total ?? 0, pageSize: 50, onChange: setPage }}
          emptyState={<EmptyState title="Chưa có giao dịch" description="Nhấn tạo phiếu thu hoặc phiếu chi để bắt đầu ghi nhận dòng tiền." />}
          rowKey={(row) => row.transaction_id || row.id}
        />
      </div>

      {/* SLIDEOVER: TẠO PHIẾU THU / CHI */}
      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title={formData.type === 'receipt' ? 'Tạo Phiếu Thu' : 'Tạo Phiếu Chi'}
        footer={
          <>
            <button
              onClick={() => setSlideOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              onClick={() => saveMutation.mutate(formData)}
              disabled={saveMutation.isPending || formData.amount <= 0 || !formData.fund_id}
              className={`rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${formData.type === 'receipt' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
            >
              {saveMutation.isPending ? 'Đang lưu...' : 'Lưu phiếu'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <NumberInput
            label="Số tiền *"
            value={String(formData.amount)}
            onChange={(v) => setFormData(prev => ({ ...prev, amount: Number(v) || 0 }))}
            suffix="đ"
          />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tài khoản/Quỹ thanh toán *</label>
            <select
              value={formData.fund_id}
              onChange={(e) => setFormData(prev => ({ ...prev, fund_id: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none bg-white shadow-sm"
              required
            >
              <option value="">-- Chọn tài khoản quỹ nhận --</option>
              {fundsList.map(f => (
                <option key={f.id} value={f.id}>{f.name} ({Number(f.current_balance || 0).toLocaleString('vi-VN')}đ)</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phương thức thanh toán *</label>
            <select
              value={formData.method}
              onChange={(e) => setFormData(prev => ({ ...prev, method: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none bg-white shadow-sm"
            >
              <option value="cash">Tiền mặt</option>
              <option value="bank_transfer">Chuyển khoản</option>
              <option value="card">Thẻ (POS)</option>
              <option value="momo">Ví Momo</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Danh mục thu/chi *</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none bg-white shadow-sm"
            >
              {formData.type === 'receipt' ? (
                <>
                  <option value="sales">Bán hàng</option>
                  <option value="debt_collection">Thu nợ khách hàng</option>
                  <option value="other">Thu nhập khác</option>
                </>
              ) : (
                <>
                  <option value="import">Nhập hàng</option>
                  <option value="salary">Lương nhân viên</option>
                  <option value="utilities">Điện nước/Mặt bằng</option>
                  <option value="other">Chi phí khác</option>
                </>
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Người {formData.type === 'receipt' ? 'nộp' : 'nhận'}
            </label>
            <input
              type="text"
              value={formData.reference_name}
              onChange={(e) => setFormData(prev => ({ ...prev, reference_name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none shadow-sm"
              placeholder="VD: Nguyễn Văn A..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ghi chú</label>
            <textarea
              value={formData.note}
              onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none resize-none shadow-sm"
              placeholder="Lý do thu chi..."
            />
          </div>
        </div>
      </SlideOver>

      {/* SLIDEOVER: THÊM QUỸ MỚI */}
      <SlideOver
        open={fundSlideOpen}
        onClose={() => setFundSlideOpen(false)}
        title="Thêm tài khoản / Quỹ thanh toán"
        footer={
          <>
            <button
              onClick={() => setFundSlideOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              onClick={handleConfirmCreateFund}
              disabled={saveFundMutation.isPending || !fundFormData.name}
              className="rounded-xl px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 shadow-sm cursor-pointer"
            >
              {saveFundMutation.isPending ? 'Đang tạo...' : 'Tạo tài khoản'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tên tài khoản/Quỹ *</label>
            <input
              type="text"
              value={fundFormData.name}
              onChange={(e) => setFundFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none shadow-sm"
              placeholder="VD: Két tiền mặt quầy, Vietcombank chính..."
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Loại quỹ *</label>
            <select
              value={fundFormData.type}
              onChange={(e) => setFundFormData(prev => ({ ...prev, type: e.target.value as any }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none bg-white shadow-sm"
            >
              <option value="cash">Tiền mặt (Két tiền)</option>
              <option value="bank">Tài khoản Ngân hàng</option>
              <option value="wallet">Ví điện tử (Momo, ZaloPay...)</option>
            </select>
          </div>

          {fundFormData.type === 'bank' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tên ngân hàng *</label>
                <input
                  type="text"
                  value={fundFormData.bank_name}
                  onChange={(e) => setFundFormData(prev => ({ ...prev, bank_name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none shadow-sm"
                  placeholder="VD: Vietcombank, Techcombank..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Số tài khoản *</label>
                <input
                  type="text"
                  value={fundFormData.account_number}
                  onChange={(e) => setFundFormData(prev => ({ ...prev, account_number: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none shadow-sm"
                  placeholder="VD: 1029384756..."
                />
              </div>
            </>
          )}

          <NumberInput
            label="Số dư ban đầu"
            value={String(fundFormData.initial_balance)}
            onChange={(v) => setFundFormData(prev => ({ ...prev, initial_balance: Number(v) || 0 }))}
            suffix="đ"
          />

          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
            <input
              type="checkbox"
              id="is_default"
              checked={fundFormData.is_default}
              onChange={(e) => setFundFormData(prev => ({ ...prev, is_default: e.target.checked }))}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
            />
            <label htmlFor="is_default" className="text-sm font-medium text-slate-700 select-none">
              Đặt làm tài khoản mặc định khi bán hàng
            </label>
          </div>
        </div>
      </SlideOver>

      {/* SLIDEOVER: LẬP PHIẾU KIỂM QUỸ */}
      <SlideOver
        open={auditSlideOpen}
        onClose={() => setAuditSlideOpen(false)}
        title="Lập phiếu kiểm kê quỹ"
        footer={
          <>
            <button
              onClick={() => setAuditSlideOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              onClick={() => saveAuditMutation.mutate({
                fund_id: selectedFundIdForAudit,
                actual_balance: actualBalance,
                cash_denominations: selectedFund?.type === 'cash' ? denominations : undefined,
                note: auditNote
              })}
              disabled={saveAuditMutation.isPending || !selectedFundIdForAudit}
              className="rounded-xl px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 shadow-sm cursor-pointer"
            >
              {saveAuditMutation.isPending ? 'Đang xử lý...' : 'Xác nhận kiểm kê & Cân bằng'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tài khoản quỹ cần kiểm *</label>
            <select
              value={selectedFundIdForAudit}
              onChange={(e) => {
                setSelectedFundIdForAudit(e.target.value)
                setActualBalanceInput('0')
                setDenominations({})
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none bg-white shadow-sm"
              required
            >
              <option value="">-- Chọn quỹ kiểm kê --</option>
              {fundsList.map(f => (
                <option key={f.id} value={f.id}>{f.name} ({f.type === 'cash' ? 'Tiền mặt' : 'Ngân hàng'})</option>
              ))}
            </select>
          </div>

          {selectedFund && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Số dư sổ sách hiện tại:</span>
                <span className="font-bold text-slate-800 font-mono">{systemBalance.toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="flex justify-between border-t border-slate-200/50 pt-2 text-xs">
                <span className="text-slate-500 font-semibold">Chênh lệch khi cân bằng:</span>
                <span className={`font-black font-mono ${variance > 0 ? 'text-emerald-600' : variance < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                  {variance > 0 ? '+' : ''}{variance.toLocaleString('vi-VN')}đ
                </span>
              </div>
            </div>
          )}

          {/* Bảng kiểm mệnh giá cho quỹ TIỀN MẶT */}
          {selectedFund?.type === 'cash' && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Đếm mệnh giá tiền mặt</h4>
                <button
                  type="button"
                  onClick={() => {
                    setDenominations({})
                    setActualBalanceInput('0')
                  }}
                  className="text-xs font-semibold text-rose-500 hover:text-rose-700 underline"
                >
                  Xóa tất cả số đếm
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                {DENOMINATIONS.map(denom => (
                  <div key={denom} className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-bold text-slate-700 font-mono w-16">{denom.toLocaleString('vi-VN')}</span>
                    <span className="text-slate-400 font-medium">x</span>
                    <input
                      type="number"
                      min="0"
                      value={denominations[denom] || ''}
                      onChange={(e) => updateDenomination(denom, Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-20 rounded-lg border border-slate-200 text-center py-1 px-2 focus:outline-none focus:border-amber-500 bg-white"
                      placeholder="0 tờ"
                    />
                    <span className="text-slate-400 font-medium">=</span>
                    <span className="font-bold text-slate-800 font-mono w-24 text-right">
                      {((denominations[denom] || 0) * denom).toLocaleString('vi-VN')}đ
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Số dư đếm thực tế *</label>
            <div className="relative flex items-center">
              <input
                type="number"
                value={actualBalanceInput}
                onChange={(e) => {
                  setActualBalanceInput(e.target.value)
                  // Hủy đếm mệnh giá nếu nhập tay
                  if (selectedFund?.type === 'cash') setDenominations({})
                }}
                className="w-full text-lg font-bold border border-slate-200 rounded-xl py-2 px-8 focus:outline-none focus:border-amber-500 bg-white text-slate-800 shadow-sm"
                placeholder="Nhập số dư đếm được..."
                min="0"
                required
              />
              <span className="absolute right-4 text-sm font-semibold text-slate-400">đ</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ghi chú kiểm kê</label>
            <textarea
              value={auditNote}
              onChange={(e) => setAuditNote(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none resize-none bg-white text-slate-800 shadow-sm"
              placeholder="Lý do chênh lệch hoặc ghi chú bàn giao..."
            />
          </div>
        </div>
      </SlideOver>

      {/* SLIDEOVER: XEM LỊCH SỬ PHIẾU KIỂM QUỸ */}
      <SlideOver
        open={auditHistorySlideOpen}
        onClose={() => setAuditHistorySlideOpen(false)}
        title="Lịch sử phiếu kiểm kê quỹ"
        footer={
          <button
            onClick={() => setAuditHistorySlideOpen(false)}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white hover:bg-slate-50 shadow-sm w-full cursor-pointer"
          >
            Đóng bảng
          </button>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500 leading-normal">
            Danh sách các phiếu kiểm kê quỹ và đối chiếu số dư tài khoản đã được thực hiện tại chi nhánh.
          </p>

          <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
            {auditsList.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl">
                <span className="text-2xl">📋</span>
                <p className="text-xs text-slate-400 mt-2 font-medium">Chưa có phiếu kiểm kê nào được lập</p>
              </div>
            ) : (
              auditsList.map((audit) => {
                const auditedFund = fundsList.find(f => f.id === audit.fund_id)
                const v = parseFloat(audit.variance || '0')
                return (
                  <div key={audit.id} className="border border-slate-200 rounded-2xl p-4 bg-white shadow-xs hover:border-indigo-100 transition-colors space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">{auditedFund?.name || 'Tài khoản Quỹ'}</h4>
                        <div className="flex items-center text-[10px] text-slate-400 mt-1 gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{format(new Date(audit.audited_at || new Date()), 'HH:mm - dd/MM/yyyy')}</span>
                        </div>
                      </div>
                      <TagBadge 
                        label={v === 0 ? 'Khớp quỹ' : v > 0 ? 'Thừa quỹ' : 'Thiếu quỹ'} 
                        color={v === 0 ? 'gray' : v > 0 ? 'green' : 'red'} 
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center text-[11px]">
                      <div>
                        <span className="block text-[9px] text-slate-400 font-semibold uppercase">Sổ sách</span>
                        <span className="font-bold text-slate-700 font-mono">{Number(audit.system_balance || 0).toLocaleString('vi-VN')}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-slate-400 font-semibold uppercase">Thực tế</span>
                        <span className="font-bold text-slate-800 font-mono">{Number(audit.actual_balance || 0).toLocaleString('vi-VN')}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-slate-400 font-semibold uppercase">Chênh lệch</span>
                        <span className={`font-black font-mono ${v < 0 ? 'text-rose-600' : v > 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                          {v > 0 ? '+' : ''}{v.toLocaleString('vi-VN')}
                        </span>
                      </div>
                    </div>

                    {audit.note && (
                      <p className="text-[10px] text-slate-500 bg-slate-50/50 p-2 rounded-lg italic border border-slate-100 leading-relaxed">
                        "{audit.note}"
                      </p>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 pt-2">
                      <span>Người kiểm: <strong className="text-slate-600 font-semibold">{audit.audited_by}</strong></span>
                      <span className="text-[9px] font-mono text-slate-300">#{audit.id.substring(0, 8).toUpperCase()}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </SlideOver>
      </div>
    </PermissionsProvider>
  )
}
