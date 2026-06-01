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
import { BANKS } from '@/lib/constants/banks'
import { VietQRPreview } from '@/app/components/ui/VietQRPreview'

const Clock = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
const Wallet = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
const Plus = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const CheckList = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>

const CashIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
const BankIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 22h18"/><path d="M6 18V11"/><path d="M10 18V11"/><path d="M14 18V11"/><path d="M18 18V11"/><path d="M12 2L2 7h20L12 2z"/></svg>
const PhoneIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
const Pencil = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
const RefreshIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M16 3h5v5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 21H3v-5"/></svg>

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
  apply_allocation: false,
  allocation_template_id: '',
  department_code: '',
}

const EMPTY_FUND_FORM = {
  name: '',
  type: 'cash',
  account_number: '',
  account_name: '',
  bank_name: '',
  initial_balance: 0,
  is_default: false,
  qr_template: 'compact2',
}

const DENOMINATIONS = [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000]

const formatDateLocal = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getPresetDates = (type: string) => {
  const now = new Date()
  let from = ''
  let to = formatDateLocal(now)
  
  switch (type) {
    case 'today':
      from = formatDateLocal(now)
      to = formatDateLocal(now)
      break
    case 'last_7_days': {
      const d = new Date()
      d.setDate(d.getDate() - 7)
      from = formatDateLocal(d)
      break
    }
    case 'this_month': {
      const d = new Date()
      const firstDay = new Date(d.getFullYear(), d.getMonth(), 1)
      from = formatDateLocal(firstDay)
      break
    }
    case 'last_3_months': {
      const d = new Date()
      d.setMonth(d.getMonth() - 3)
      from = formatDateLocal(d)
      break
    }
    default:
      break
  }
  return { from, to }
}

export function CashbookClient({ shopId, shopName, permissions }: Props) {
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const initialSearch = searchParams?.get('search') || searchParams?.get('transactionId') || ''
  
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [fundFilter, setFundFilter] = useState<string>('')
  const [dateRangeType, setDateRangeType] = useState<string>('last_7_days')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  
  const [activeTab, setActiveTab] = useState<'cashbook' | 'shifts'>('cashbook')
  const [editingFundId, setEditingFundId] = useState<string | null>(null)
  const [showInactiveFunds, setShowInactiveFunds] = useState<boolean>(false)
  const [shiftPage, setShiftPage] = useState(1)

  // Tự động tính khoảng thời gian khi dateRangeType thay đổi
  useEffect(() => {
    if (dateRangeType !== 'custom') {
      const { from, to } = getPresetDates(dateRangeType)
      setFromDate(from)
      setToDate(to)
      setPage(1)
    }
  }, [dateRangeType])

  const handleCustomFromDateChange = (val: string) => {
    if (toDate && val) {
      const start = new Date(val)
      const end = new Date(toDate)
      if (start > end) {
        toast.error('Ngày bắt đầu không được lớn hơn ngày kết thúc')
        return
      }
      const diffTime = Math.abs(end.getTime() - start.getTime())
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      if (diffDays > 180) {
        toast.warning('Thời gian tra cứu tối đa là 180 ngày để đảm bảo tốc độ tải báo cáo.')
        const newStart = new Date(end)
        newStart.setDate(end.getDate() - 180)
        setFromDate(formatDateLocal(newStart))
        setPage(1)
        return
      }
    }
    setFromDate(val)
    setPage(1)
  }

  const handleCustomToDateChange = (val: string) => {
    if (fromDate && val) {
      const start = new Date(fromDate)
      const end = new Date(val)
      if (start > end) {
        toast.error('Ngày kết thúc không được nhỏ hơn ngày bắt đầu')
        return
      }
      const diffTime = Math.abs(end.getTime() - start.getTime())
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      if (diffDays > 180) {
        toast.warning('Thời gian tra cứu tối đa là 180 ngày để đảm bảo tốc độ tải báo cáo.')
        const newEnd = new Date(start)
        newEnd.setDate(start.getDate() + 180)
        setToDate(formatDateLocal(newEnd))
        setPage(1)
        return
      }
    }
    setToDate(val)
    setPage(1)
  }
  
  const [search, setSearch] = useState(initialSearch)
  const [debouncedSearch] = useDebounce(search, 300)
  
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [slideOpen, setSlideOpen] = useState(false)

  const [fundFormData, setFundFormData] = useState(EMPTY_FUND_FORM)
  const [fundSlideOpen, setFundSlideOpen] = useState(false)
  const [qrPreviewTemplate, setQrPreviewTemplate] = useState<'compact' | 'compact2' | 'qr_only'>('compact2')

  // --- SHIFT MANAGEMENT & RECONCILIATION STATES ---
  const [auditSlideOpen, setAuditSlideOpen] = useState(false)
  const [auditHistorySlideOpen, setAuditHistorySlideOpen] = useState(false)
  const [selectedFundIdForAudit, setSelectedFundIdForAudit] = useState('')
  const [actualBalanceInput, setActualBalanceInput] = useState('0')
  const [denominations, setDenominations] = useState<Record<number, number>>({})
  const [auditNote, setAuditNote] = useState('')

  // --- QUERY: LẤY DANH SÁCH QUỸ ---
  const { data: fundsData, refetch: refetchFunds } = useQuery({
    queryKey: ['payment-funds', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/payment-funds`)
      if (!res.ok) throw new Error('Không tải được danh sách quỹ')
      return res.json() as Promise<{ data: Record<string, string>[] }>
    },
  })
  const fundsList = fundsData?.data || []

  // --- QUERY: LẤY DANH SÁCH MẪU PHÂN BỔ (CHO CASHBOOK FORM) ---
  const { data: templatesRes } = useQuery({
    queryKey: ['cost-allocation-templates', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/cost-allocations?limit=100`)
      if (!res.ok) return { data: [], total: 0 }
      return res.json() as Promise<{ data: Record<string, any>[]; total: number }>
    },
  })
  const templatesList = templatesRes?.data || []

  // --- QUERY: LẤY DANH SÁCH PHÒNG BAN (COST CENTERS) ---
  const { data: deptsRes } = useQuery({
    queryKey: ['departments', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/departments?limit=100`)
      if (!res.ok) return { data: [], total: 0 }
      return res.json() as Promise<{ data: Record<string, any>[]; total: number }>
    },
  })
  const deptsList = deptsRes?.data || []

  // --- QUERY: LẤY DANH SÁCH GIAO DỊCH CASHBOOK + SỐ DƯ ĐỘNG ---
  const { data, isLoading, isFetching, refetch: refetchCashbook } = useQuery({
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

  // --- MUTATION: CẬP NHẬT TÀI KHOẢN QUỸ ---
  const updateFundMutation = useMutation({
    mutationFn: async (payload: Partial<typeof EMPTY_FUND_FORM> & { active?: string }) => {
      if (!editingFundId) throw new Error('Không tìm thấy quỹ cần cập nhật')
      const res = await fetch(`/api/shops/${shopId}/payment-funds/${editingFundId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Cập nhật tài khoản quỹ thất bại')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Đã cập nhật tài khoản quỹ thành công')
      setFundSlideOpen(false)
      setEditingFundId(null)
      queryClient.invalidateQueries({ queryKey: ['payment-funds', shopId] })
      queryClient.invalidateQueries({ queryKey: ['cashbook', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // --- MUTATION: NGỪNG HOẠT ĐỘNG (XÓA MỀM) TÀI KHOẢN QUỸ ---
  const deleteFundMutation = useMutation({
    mutationFn: async () => {
      if (!editingFundId) throw new Error('Không tìm thấy quỹ cần ngừng hoạt động')
      const res = await fetch(`/api/shops/${shopId}/payment-funds/${editingFundId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Ngừng hoạt động tài khoản quỹ thất bại')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Đã ngừng hoạt động tài khoản quỹ thành công')
      setFundSlideOpen(false)
      setEditingFundId(null)
      queryClient.invalidateQueries({ queryKey: ['payment-funds', shopId] })
      queryClient.invalidateQueries({ queryKey: ['cashbook', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // --- QUERY: LẤY LỊCH SỬ CA LÀM VIỆC ---
  const { data: shiftsData, isLoading: isShiftsLoading, refetch: refetchShifts } = useQuery({
    queryKey: ['shop-shifts', shopId, shopId, shiftPage],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/shifts?branch_id=${shopId}&page=${shiftPage}&limit=50`)
      if (!res.ok) throw new Error('Không tải được lịch sử ca làm việc')
      return res.json() as Promise<{ data: Record<string, any>[]; total: number }>
    },
    enabled: activeTab === 'shifts',
  })
  const shiftsList = shiftsData?.data || []

  // --- QUERY: LẤY DANH SÁCH NHÂN VIÊN ---
  const { data: employeesData } = useQuery({
    queryKey: ['employees', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/employees`)
      if (!res.ok) throw new Error('Không tải được danh sách nhân viên')
      return res.json() as Promise<{ data: Record<string, any>[] }>
    },
  })
  const employeesList = employeesData?.data || []

  const handleRefreshData = () => {
    if (activeTab === 'cashbook') {
      refetchCashbook()
      refetchFunds()
      toast.success('Đã làm mới dữ liệu sổ quỹ & tài khoản')
    } else {
      refetchShifts()
      toast.success('Đã làm mới danh sách lịch sử ca làm việc')
    }
  }

  const handleConfirmSaveFund = async () => {
    if (editingFundId) {
      const isConfirmed = await confirm({
        title: 'Xác nhận cập nhật tài khoản/quỹ',
        description: `Bạn có chắc chắn muốn lưu các thay đổi cho tài khoản quỹ "${fundFormData.name}" không?`,
        confirmLabel: 'Lưu thay đổi',
        cancelLabel: 'Hủy',
      })
      if (isConfirmed) {
        updateFundMutation.mutate(fundFormData)
      }
    } else {
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
  }

  const handleDeactivateFund = async () => {
    if (!editingFundId) return
    const selectedFundToEdit = fundsList.find(f => f.id === editingFundId)
    if (selectedFundToEdit?.is_default === 'TRUE') {
      toast.error('Không thể ngừng hoạt động tài khoản quỹ mặc định. Vui lòng thiết lập tài khoản khác làm mặc định trước.')
      return
    }

    const isConfirmed = await confirm({
      title: 'Xác nhận ngừng hoạt động tài khoản/quỹ',
      description: `Bạn có chắc chắn muốn ngừng hoạt động tài khoản quỹ "${fundFormData.name}"? Quỹ này sẽ ẩn trên các menu bán hàng và tạo phiếu mới, nhưng lịch sử giao dịch cũ vẫn được giữ lại để đối chiếu sổ sách.`,
      confirmLabel: 'Ngừng hoạt động',
      cancelLabel: 'Hủy',
    })
    if (isConfirmed) {
      deleteFundMutation.mutate()
    }
  }

  const handleActivateFund = async () => {
    if (!editingFundId) return
    const isConfirmed = await confirm({
      title: 'Xác nhận kích hoạt lại tài khoản/quỹ',
      description: `Bạn có chắc chắn muốn kích hoạt lại tài khoản quỹ "${fundFormData.name}" để tiếp tục sử dụng cho bán hàng và thu chi không?`,
      confirmLabel: 'Kích hoạt lại',
      cancelLabel: 'Hủy',
    })
    if (isConfirmed) {
      updateFundMutation.mutate({ ...fundFormData, active: 'TRUE' } as any)
    }
  }

  const openEditFund = (fund: Record<string, string>) => {
    setEditingFundId(fund.id)
    setFundFormData({
      name: fund.name || '',
      type: (fund.type as any) || 'cash',
      account_number: fund.account_number || '',
      account_name: fund.account_name || '',
      bank_name: fund.bank_name || '',
      initial_balance: Number(fund.initial_balance || 0),
      is_default: fund.is_default === 'TRUE',
      qr_template: fund.qr_template || 'compact2',
    })
    setQrPreviewTemplate((fund.qr_template as any) || 'compact2')
    setFundSlideOpen(true)
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
      setActualBalanceInput(total.toLocaleString('vi-VN'))
      return next
    })
  }

  const selectedFund = fundsList.find(f => f.id === selectedFundIdForAudit)
  const systemBalance = parseFloat(selectedFund?.current_balance || '0')
  const actualBalance = parseFloat(actualBalanceInput.replace(/\./g, '').replace(/,/g, '')) || 0
  const variance = actualBalance - systemBalance

  const handleConfirmSaveAudit = async () => {
    if (!selectedFundIdForAudit) return;
    
    const diff = actualBalance - systemBalance;
    let diffText = '';
    if (diff > 0) {
      diffText = `thừa ${diff.toLocaleString('vi-VN')}đ (hệ thống sẽ tự động tạo phiếu Thu điều chỉnh)`;
    } else if (diff < 0) {
      diffText = `thiếu ${Math.abs(diff).toLocaleString('vi-VN')}đ (hệ thống sẽ tự động tạo phiếu Chi điều chỉnh)`;
    } else {
      diffText = `khớp số dư sổ sách`;
    }

    const isConfirmed = await confirm({
      title: 'Xác nhận kiểm kê & Cân bằng quỹ',
      description: `Bạn có chắc chắn muốn xác nhận kết quả kiểm kê quỹ "${selectedFund?.name}"? Số dư thực tế là ${actualBalance.toLocaleString('vi-VN')}đ (${diffText}). Giao dịch này sẽ cập nhật số dư quỹ và không thể hoàn tác.`,
      confirmLabel: 'Xác nhận kiểm kê',
      cancelLabel: 'Hủy',
    })
    if (isConfirmed) {
      saveAuditMutation.mutate({
        fund_id: selectedFundIdForAudit,
        actual_balance: actualBalance,
        cash_denominations: selectedFund?.type === 'cash' ? denominations : undefined,
        note: auditNote
      })
    }
  }

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
    system: 'Hệ thống',
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
        <span className="text-xs text-slate-600 font-medium">
          {row.balance_after_transaction ? `${Number(row.balance_after_transaction).toLocaleString('vi-VN')}đ` : '—'}
        </span>
      )
    },
    { key: 'note', label: 'Ghi chú', render: (row) => <span className="text-[11px] text-slate-500 block max-w-xs">{row.note}</span> },
  ], [fundsList])

  const shiftColumns = useMemo<Column<Record<string, any>>[]>(() => [
    {
      key: 'id',
      label: 'Mã ca làm việc',
      render: (row) => (
        <div>
          <CopyableId id={row.id} className="text-xs font-mono font-semibold text-slate-700" />
          <div className="flex items-center text-[10px] text-slate-400 mt-1 gap-1">
            <span>#SHF-{row.id.substring(0, 8).toUpperCase()}</span>
          </div>
        </div>
      )
    },
    {
      key: 'time',
      label: 'Thời gian ca',
      render: (row) => {
        const opened = row.opened_at ? new Date(row.opened_at) : null
        const closed = row.closed_at ? new Date(row.closed_at) : null
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-700">
              <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full shrink-0" title="Mở ca" />
              <span className="font-medium text-[10px] uppercase text-slate-400">Mở:</span>
              <span className="font-semibold">{opened ? format(opened, 'HH:mm dd/MM/yy') : '—'}</span>
            </div>
            {row.status === 'closed' ? (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="inline-block w-2 h-2 bg-slate-400 rounded-full shrink-0" title="Chốt ca" />
                <span className="font-medium text-[10px] uppercase text-slate-400">Đóng:</span>
                <span className="font-semibold">{closed ? format(closed, 'HH:mm dd/MM/yy') : '—'}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 font-semibold animate-pulse">
                <span className="inline-block w-2 h-2 bg-amber-500 rounded-full shrink-0 animate-ping" />
                <span>Đang hoạt động...</span>
              </div>
            )}
          </div>
        )
      }
    },
    {
      key: 'user_id',
      label: 'Nhân viên',
      render: (row) => {
        const emp = employeesList.find(e => e.email === row.user_id)
        const empName = emp?.name || 'Nhân viên'
        return (
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-slate-700 block max-w-[150px] truncate" title={empName}>
              {empName}
            </span>
            <span className="text-[10px] text-slate-400 block max-w-[150px] truncate font-mono" title={row.user_id}>
              {row.user_id}
            </span>
          </div>
        )
      }
    },
    {
      key: 'cash_details',
      label: 'Số dư két tiền mặt',
      render: (row) => (
        <div className="space-y-0.5 text-xs">
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">Đầu ca (Két):</span>
            <span className="font-semibold text-slate-700">{Number(row.opening_cash || 0).toLocaleString('vi-VN')}đ</span>
          </div>
          <div className="flex justify-between gap-4 border-t border-slate-100 pt-0.5">
            <span className="text-slate-400">Dự kiến:</span>
            <span className="font-semibold text-slate-700">{Number(row.expected_closing_cash || 0).toLocaleString('vi-VN')}đ</span>
          </div>
          {row.status === 'closed' && (
            <div className="flex justify-between gap-4 border-t border-slate-100 pt-0.5">
              <span className="text-slate-500 font-medium">Thực tế:</span>
              <span className="font-bold text-slate-800">{Number(row.actual_closing_cash || 0).toLocaleString('vi-VN')}đ</span>
            </div>
          )}
        </div>
      )
    },
    {
      key: 'cash_variance',
      label: 'Chênh lệch chốt két',
      render: (row) => {
        if (row.status !== 'closed') return <span className="text-xs text-slate-400 font-medium">—</span>
        const v = parseFloat(row.cash_variance || '0')
        if (v === 0) {
          return (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
              ✓ Khớp két
            </span>
          )
        } else if (v > 0) {
          return (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/50 px-2 py-0.5 rounded border border-emerald-200">
              Thừa +{v.toLocaleString('vi-VN')}đ
            </span>
          )
        } else {
          return (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
              Thiếu {Math.abs(v).toLocaleString('vi-VN')}đ
            </span>
          )
        }
      }
    },
    {
      key: 'non_cash_revenue',
      label: 'Doanh thu điện tử',
      render: (row) => {
        try {
          const rev = typeof row.non_cash_revenue === 'string' ? JSON.parse(row.non_cash_revenue) : row.non_cash_revenue
          const bank = rev ? parseFloat(String(rev.bank_transfer || 0)) : 0
          const card = rev ? parseFloat(String(rev.card || 0)) : 0
          const momo = rev ? parseFloat(String(rev.momo || 0)) : 0
 
          if (bank === 0 && card === 0 && momo === 0) {
            return <span className="text-xs text-slate-400">Không phát sinh</span>
          }
          return (
            <div className="space-y-0.5 text-[11px] text-slate-600">
              {bank !== 0 && (
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                  <span>CK: <strong className={bank < 0 ? 'text-rose-600' : 'text-slate-700'}>{bank.toLocaleString('vi-VN')}đ</strong></span>
                </div>
              )}
              {card !== 0 && (
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                  <span>Thẻ: <strong className={card < 0 ? 'text-rose-600' : 'text-slate-700'}>{card.toLocaleString('vi-VN')}đ</strong></span>
                </div>
              )}
              {momo !== 0 && (
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-fuchsia-500 rounded-full" />
                  <span>Momo: <strong>{Number(rev.momo).toLocaleString('vi-VN')}đ</strong></span>
                </div>
              )}
            </div>
          )
        } catch (e) {
          return <span className="text-xs text-slate-400">—</span>
        }
      }
    },
    {
      key: 'note',
      label: 'Ghi chú bàn giao',
      render: (row) => (
        <span className="text-[11px] text-slate-500 block max-w-xs truncate" title={row.note}>
          {row.note || <span className="text-slate-300 italic">Không có ghi chú</span>}
        </span>
      )
    }
  ], [])

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
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setAuditHistorySlideOpen(true)}
            className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 shadow-sm flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            Lịch sử kiểm
          </button>
          <HasPermission has="cashbook.audit">
            <button
              onClick={openAudit}
              className="rounded-full border border-slate-200 bg-amber-50 px-3.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 shadow-sm flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer border-amber-100"
            >
              <CheckList className="w-3.5 h-3.5 text-amber-600" />
              Kiểm quỹ
            </button>
          </HasPermission>
          <HasPermission has="cashbook.manage">
            <button
              onClick={() => openCreate('receipt')}
              className="rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Phiếu Thu
            </button>
            <button
              onClick={() => openCreate('payment')}
              className="rounded-full bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Phiếu Chi
            </button>
          </HasPermission>
        </div>
      </div>

      {/* TAB SWITCHER */}
      <div className="border-b border-slate-200 flex items-center justify-between">
        <nav className="-mb-px flex space-x-6">
          <button
            onClick={() => { setActiveTab('cashbook'); setEditingFundId(null) }}
            className={`whitespace-nowrap pb-3 px-1 border-b-2 font-bold text-sm transition-all cursor-pointer ${
              activeTab === 'cashbook'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            Sổ quỹ tiền tệ
          </button>
          <button
            onClick={() => { setActiveTab('shifts'); setEditingFundId(null) }}
            className={`whitespace-nowrap pb-3 px-1 border-b-2 font-bold text-sm transition-all cursor-pointer ${
              activeTab === 'shifts'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            Lịch sử ca làm việc
          </button>
        </nav>

        {/* NÚT ĐỒNG BỘ NẰM BÊN PHẢI CÙNG DÒNG TAB */}
        <button
          onClick={handleRefreshData}
          disabled={isFetching || isShiftsLoading}
          className="pb-3 px-2 text-slate-400 hover:text-orange-600 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold select-none border-b-2 border-transparent hover:border-orange-500"
          title="Làm mới dữ liệu từ máy chủ"
        >
          <RefreshIcon className={`w-3.5 h-3.5 ${(isFetching || isShiftsLoading) ? 'animate-spin text-orange-500' : ''}`} />
          <span>Đồng bộ dữ liệu</span>
        </button>
      </div>

      {activeTab === 'cashbook' && (
        <>
        {/* --- STATS KPI CARDS --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD: SỐ DƯ ĐẦU KỲ */}
        <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all group">
          <div className="absolute top-0 left-0 h-1 w-full bg-slate-400 group-hover:bg-slate-500 transition-colors" />
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Số dư đầu kỳ</p>
          <div className="mt-2 flex items-baseline gap-1">
            {isLoading || isFetching ? (
              <div className="h-8 w-28 bg-slate-100 animate-pulse rounded-lg mt-0.5" />
            ) : (
              <>
                <span className="text-2xl font-bold tracking-tight text-slate-700">
                  {Number(data?.opening_balance || 0).toLocaleString('vi-VN')}
                </span>
                <span className="text-sm font-bold text-slate-400">đ</span>
              </>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Số dư tích lũy trước thời gian lọc</p>
        </div>

        {/* CARD: TỔNG THU (+) */}
        <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all group">
          <div className="absolute top-0 left-0 h-1 w-full bg-emerald-500 group-hover:bg-emerald-600 transition-colors" />
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Tổng Thu (+)</p>
          <div className="mt-2 flex items-baseline gap-1">
            {isLoading || isFetching ? (
              <div className="h-8 w-28 bg-emerald-50 animate-pulse rounded-lg mt-0.5" />
            ) : (
              <>
                <span className="text-2xl font-bold tracking-tight text-emerald-600">
                  {Number(data?.total_receipt || 0).toLocaleString('vi-VN')}
                </span>
                <span className="text-sm font-bold text-emerald-400">đ</span>
              </>
            )}
          </div>
          <p className="text-[10px] text-emerald-500/80 mt-1">Doanh thu phát sinh trong kỳ</p>
        </div>

        {/* CARD: TỔNG CHI (-) */}
        <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all group">
          <div className="absolute top-0 left-0 h-1 w-full bg-rose-500 group-hover:bg-rose-600 transition-colors" />
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-600">Tổng Chi (-)</p>
          <div className="mt-2 flex items-baseline gap-1">
            {isLoading || isFetching ? (
              <div className="h-8 w-28 bg-rose-50 animate-pulse rounded-lg mt-0.5" />
            ) : (
              <>
                <span className="text-2xl font-bold tracking-tight text-rose-600">
                  {Number(data?.total_payment || 0).toLocaleString('vi-VN')}
                </span>
                <span className="text-sm font-bold text-rose-400">đ</span>
              </>
            )}
          </div>
          <p className="text-[10px] text-rose-500/80 mt-1">Các chi phí phát sinh trong kỳ</p>
        </div>

        {/* CARD: SỐ DƯ CUỐI KỲ */}
        <div className="relative overflow-hidden rounded-2xl border border-orange-100 bg-orange-50/40 p-5 shadow-sm hover:shadow-md transition-all duration-300 group">
          <div className="absolute right-[-10%] top-[-10%] h-24 w-24 rounded-full bg-orange-100/30 blur-xl group-hover:scale-110 transition-transform duration-500" />
          <div className="absolute right-[10%] bottom-[-20%] h-16 w-16 rounded-full bg-orange-200/20 blur-lg" />
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-600 flex items-center gap-1.5 relative z-10">
            <Wallet className="w-3.5 h-3.5 text-orange-500" />
            Số dư cuối kỳ
          </p>
          <div className="mt-2.5 flex items-baseline gap-1 relative z-10">
            {isLoading || isFetching ? (
              <div className="h-9 w-32 bg-orange-100/60 animate-pulse rounded-lg mt-0.5" />
            ) : (
              <>
                <span className="text-3xl font-extrabold tracking-tight text-orange-950">
                  {Number(data?.closing_balance || 0).toLocaleString('vi-VN')}
                </span>
                <span className="text-sm font-bold text-orange-500">đ</span>
              </>
            )}
          </div>
          <p className="text-[10px] text-orange-600/80 mt-1 relative z-10">Lượng tiền hiện có thực tế</p>
        </div>
      </div>

      {/* --- SECTION: TÀI KHOẢN & QUỸ THANH TOÁN --- */}
      <div className="space-y-3 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Wallet className="w-4 h-4 text-slate-400" />
            Tài khoản & Quỹ thanh toán
          </h2>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="show_inactive_funds"
              checked={showInactiveFunds}
              onChange={(e) => setShowInactiveFunds(e.target.checked)}
              className="rounded border-slate-300 text-orange-500 focus:ring-orange-500 h-3.5 w-3.5 cursor-pointer"
            />
            <label htmlFor="show_inactive_funds" className="text-[10px] font-bold text-slate-400 uppercase tracking-wide cursor-pointer select-none">
              Hiển thị quỹ ngừng hoạt động
            </label>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2.5">
          {/* Card: Tất cả tài khoản */}
          <div 
            onClick={() => { setFundFilter(''); setPage(1); refetchFunds() }}
            className={`cursor-pointer rounded-xl border p-2 transition-all flex flex-col justify-between h-[62px] active:scale-[0.98] w-full sm:w-[170px] shrink-0 ${
              !fundFilter 
                ? 'border-orange-500 bg-orange-50/30 shadow-sm ring-1 ring-orange-500/10' 
                : 'border-slate-200/80 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[9px] font-bold uppercase tracking-wider ${!fundFilter ? 'text-orange-600' : 'text-slate-400'}`}>Tất cả quỹ</span>
              <BankIcon className={`w-3.5 h-3.5 ${!fundFilter ? 'text-orange-500' : 'text-slate-400'}`} />
            </div>
            <div className="flex items-baseline gap-0.5 mt-0.5">
              <span className={`text-sm font-bold ${!fundFilter ? 'text-orange-950' : 'text-slate-700'}`}>
                {fundsList
                  .filter(f => f.active !== 'FALSE')
                  .reduce((sum, f) => sum + parseFloat(f.current_balance || '0'), 0)
                  .toLocaleString('vi-VN')}
              </span>
              <span className="text-[9px] font-bold text-slate-400">đ</span>
            </div>
          </div>
 
          {/* Danh sách từng quỹ */}
          {fundsList
            .filter(fund => showInactiveFunds ? true : fund.active !== 'FALSE')
            .map(fund => {
              const isSelected = fundFilter === fund.id
              const isInactive = fund.active === 'FALSE'
              const balance = parseFloat(fund.current_balance || '0')
              
              // Render flat SVG icon
              let icon = <CashIcon className={`w-3.5 h-3.5 ${isSelected ? 'text-orange-500' : 'text-slate-400'}`} />
              if (fund.type === 'bank') {
                icon = <BankIcon className={`w-3.5 h-3.5 ${isSelected ? 'text-orange-500' : 'text-slate-400'}`} />
              } else if (fund.type === 'wallet') {
                icon = <PhoneIcon className={`w-3.5 h-3.5 ${isSelected ? 'text-orange-500' : 'text-slate-400'}`} />
              }
 
              return (
                <div 
                  key={fund.id}
                  onClick={() => { setFundFilter(isSelected ? '' : fund.id); setPage(1); refetchFunds() }}
                  className={`cursor-pointer rounded-xl border p-2 transition-all flex flex-col justify-between h-[62px] active:scale-[0.98] group relative w-full sm:w-[170px] shrink-0 ${
                    isInactive
                      ? 'opacity-65 grayscale bg-slate-50/70 border-slate-200 text-slate-400'
                      : isSelected 
                        ? 'border-orange-500 bg-orange-50/30 shadow-sm ring-1 ring-orange-500/10' 
                        : 'border-slate-200/80 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-[9px] font-bold uppercase tracking-wider truncate max-w-[80%] ${isInactive ? 'text-slate-400 line-through font-normal' : isSelected ? 'text-orange-600' : 'text-slate-500'}`}>
                      {fund.name}
                    </span>
                    <span className="shrink-0">{icon}</span>
                  </div>
                  <div className="flex items-baseline gap-0.5 mt-0.5">
                    <span className={`text-sm font-bold ${isInactive ? 'text-slate-500' : isSelected ? 'text-orange-950' : 'text-slate-700'}`}>
                      {balance.toLocaleString('vi-VN')}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400">đ</span>
                  </div>
                  {fund.is_default === 'TRUE' && !isInactive && (
                    <span className="absolute bottom-1 right-2 text-[7px] bg-emerald-100 text-emerald-800 font-bold px-1 rounded border border-emerald-200">
                      Mặc định
                    </span>
                  )}
                  {isInactive && (
                    <span className="absolute bottom-1 right-2 text-[7px] bg-slate-200 text-slate-600 font-bold px-1 rounded border border-slate-300">
                      Đã khóa
                    </span>
                  )}
                  
                  {/* EDIT ICON ON HOVER */}
                  <HasPermission has="cashbook.funds.manage">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditFund(fund)
                      }}
                      className="absolute -top-1.5 -right-1.5 opacity-0 group-hover:opacity-100 flex items-center justify-center bg-white hover:bg-orange-50 text-slate-400 hover:text-orange-600 border border-slate-200 hover:border-orange-200 rounded-full w-5 h-5 shadow-xs z-20 cursor-pointer transition-all duration-200"
                      title="Chỉnh sửa tài khoản quỹ"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </button>
                  </HasPermission>
                </div>
              )
            })}

          {/* Nút đứt mở quỹ mới trực quan */}
          <HasPermission has="cashbook.funds.manage">
            <div 
              onClick={openCreateFund}
              className="cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50/50 hover:bg-orange-50/20 hover:border-orange-400/80 p-2 transition-all flex flex-col justify-center items-center h-[62px] text-center active:scale-[0.98] group w-full sm:w-[170px] shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-orange-500 group-hover:scale-110 transition-transform" />
              <span className="text-[9px] font-bold text-slate-400 group-hover:text-orange-600 mt-1 uppercase tracking-wider">
                Mở thêm quỹ
              </span>
            </div>
          </HasPermission>
        </div>
      </div>

      {/* FILTER & SEARCH CONTROL SECTION */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Ô Tìm kiếm */}
          <div className="sm:col-span-2 lg:col-span-2 w-full">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Tìm kiếm nhanh</label>
            <SearchBar
              value={search}
              onChange={(v) => { setSearch(v); setPage(1) }}
              placeholder="Mã phiếu, ghi chú, người nhận..."
              hideFilter={true}
            />
          </div>

          {/* Loại phiếu */}
          <div className="w-full">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Loại phiếu</label>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white focus:border-indigo-500 focus:outline-none h-[38px] shadow-sm cursor-pointer"
            >
              <option value="">Tất cả</option>
              <option value="receipt">Phiếu Thu</option>
              <option value="payment">Phiếu Chi</option>
            </select>
          </div>

          {/* Thời gian tra cứu */}
          <div className="w-full">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Thời gian tra cứu</label>
            <select
              value={dateRangeType}
              onChange={(e) => setDateRangeType(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white focus:border-indigo-500 focus:outline-none h-[38px] shadow-sm cursor-pointer"
            >
              <option value="today">Hôm nay</option>
              <option value="last_7_days">7 ngày trước</option>
              <option value="this_month">Tháng này</option>
              <option value="last_3_months">3 tháng trước</option>
              <option value="custom">Tùy chỉnh</option>
            </select>
          </div>

          {/* Ngày bắt đầu */}
          {dateRangeType === 'custom' && (
            <div className="w-full">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Từ ngày</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => handleCustomFromDateChange(e.target.value)}
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker()
                  } catch (err) {}
                }}
                onFocus={(e) => {
                  try {
                    e.currentTarget.showPicker()
                  } catch (err) {}
                }}
                className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none h-[38px] shadow-sm cursor-pointer"
              />
            </div>
          )}

          {/* Ngày kết thúc */}
          {dateRangeType === 'custom' && (
            <div className="w-full">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Đến ngày</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => handleCustomToDateChange(e.target.value)}
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker()
                  } catch (err) {}
                }}
                onFocus={(e) => {
                  try {
                    e.currentTarget.showPicker()
                  } catch (err) {}
                }}
                className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none h-[38px] shadow-sm cursor-pointer"
              />
            </div>
          )}
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
      </>
      )}

      {activeTab === 'shifts' && (
        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
          <DataTable
            columns={shiftColumns}
            data={shiftsList}
            loading={isShiftsLoading}
            pagination={{ page: shiftPage, total: shiftsData?.total ?? 0, pageSize: 50, onChange: setShiftPage }}
            emptyState={
              <EmptyState 
                title="Chưa có lịch sử ca làm việc" 
                description="Các ca làm việc mở/chốt tại màn hình POS sẽ được tự động ghi nhận và hiển thị ở đây." 
              />
            }
            rowKey={(row) => row.id}
          />
        </div>
      )}

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
              disabled={saveMutation.isPending || formData.amount <= 0 || !formData.fund_id || (!!(formData as any).apply_allocation && !(formData as any).allocation_template_id)}
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

          {/* COST ALLOCATION SECTION */}
          {formData.type === 'payment' && (
            <div className="pt-4 border-t border-slate-100 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="block text-sm font-semibold text-slate-700">Phân bổ chi phí bộ phận</span>
                  <span className="block text-[11px] text-slate-400">Tự động bóc tách chi phí ảo cho các phòng ban (Cost Center)</span>
                </div>
                <input
                  type="checkbox"
                  checked={!!(formData as any).apply_allocation}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setFormData(prev => ({
                      ...prev,
                      apply_allocation: checked,
                      department_code: checked ? '' : (prev as any).department_code,
                      allocation_template_id: checked ? (templatesList[0]?.id || '') : '',
                    }));
                  }}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
              </div>

              {!!(formData as any).apply_allocation ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Mẫu phân bổ chi phí</label>
                    <select
                      value={(formData as any).allocation_template_id || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, allocation_template_id: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs focus:border-indigo-500 focus:outline-none bg-white"
                    >
                      <option value="">-- Chọn mẫu phân bổ --</option>
                      {templatesList.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Preview percentages */}
                  {(() => {
                    const tId = (formData as any).allocation_template_id;
                    const selectedTemplate = templatesList.find(t => t.id === tId);
                    if (!selectedTemplate) return null;
                    let rules: Array<{ department_code: string; percentage: number }> = [];
                    if (typeof selectedTemplate.rules === 'string') {
                      try { rules = JSON.parse(selectedTemplate.rules); } catch {}
                    } else if (Array.isArray(selectedTemplate.rules)) {
                      rules = selectedTemplate.rules;
                    }
                    if (rules.length === 0) return null;
                    return (
                      <div className="space-y-1.5 pt-1 border-t border-slate-100">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Xem trước phân bổ ({Number(formData.amount).toLocaleString('vi-VN')}đ):</span>
                        <div className="flex flex-wrap gap-1.5">
                          {rules.map(r => {
                            const amt = Math.round((formData.amount * r.percentage) / 100);
                            return (
                              <span key={r.department_code} className="inline-flex text-[10px] bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-600">
                                <strong>{r.department_code}:</strong> {r.percentage}% ({amt.toLocaleString('vi-VN')}đ)
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Gắn riêng cho bộ phận (Cost Center đơn)</label>
                  <select
                    value={(formData as any).department_code || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, department_code: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none bg-white shadow-sm"
                  >
                    <option value="">-- Chi chung toàn chi nhánh --</option>
                    {deptsList.map(d => (
                      <option key={d.id} value={d.code}>{d.name} ({d.code})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      </SlideOver>

      {/* SLIDEOVER: THÊM/SỬA QUỸ */}
      <SlideOver
        open={fundSlideOpen}
        onClose={() => { setFundSlideOpen(false); setEditingFundId(null) }}
        title={editingFundId ? 'Chỉnh sửa tài khoản / Quỹ thanh toán' : 'Thêm tài khoản / Quỹ thanh toán'}
        footer={
          <>
            <button
              onClick={() => { setFundSlideOpen(false); setEditingFundId(null) }}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              onClick={handleConfirmSaveFund}
              disabled={saveFundMutation.isPending || updateFundMutation.isPending || !fundFormData.name}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 shadow-sm cursor-pointer active:scale-95 transition-all"
            >
              {editingFundId
                ? (updateFundMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi')
                : (saveFundMutation.isPending ? 'Đang tạo...' : 'Tạo tài khoản')}
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
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none shadow-sm bg-white"
              placeholder="VD: Két tiền mặt quầy, Vietcombank chính..."
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Loại quỹ *</label>
            <select
              value={fundFormData.type}
              onChange={(e) => setFundFormData(prev => ({ ...prev, type: e.target.value as any }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none bg-white shadow-sm"
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
                <select
                  value={fundFormData.bank_name}
                  onChange={(e) => setFundFormData(prev => ({ ...prev, bank_name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none shadow-sm bg-white cursor-pointer"
                >
                  <option value="">-- Chọn ngân hàng --</option>
                  {BANKS.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.shortName} - {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Số tài khoản *</label>
                <input
                  type="text"
                  value={fundFormData.account_number}
                  onChange={(e) => setFundFormData(prev => ({ ...prev, account_number: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none shadow-sm bg-white"
                  placeholder="VD: 1029384756..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tên chủ tài khoản *</label>
                <input
                  type="text"
                  value={fundFormData.account_name}
                  onChange={(e) => setFundFormData(prev => ({ ...prev, account_name: e.target.value.toUpperCase() }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none shadow-sm bg-white uppercase font-semibold"
                  placeholder="VD: NGUYEN VAN A..."
                />
              </div>

              {/* VietQR Live Preview Card */}
              <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-200/60 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Xem trước hóa đơn QR (VietQR Card)</span>
                  <select
                    value={fundFormData.qr_template || 'compact2'}
                    onChange={(e) => {
                      const val = e.target.value as any
                      setQrPreviewTemplate(val)
                      setFundFormData(prev => ({ ...prev, qr_template: val }))
                    }}
                    className="rounded-lg border border-slate-250 bg-white px-2 py-1 text-[10px] text-slate-650 focus:outline-none cursor-pointer"
                  >
                    <option value="compact2">Rút gọn (compact2)</option>
                    <option value="compact">Cổ điển (compact)</option>
                    <option value="qr_only">Chỉ mã QR (qr_only)</option>
                  </select>
                </div>
                
                <VietQRPreview
                  bankCode={fundFormData.bank_name}
                  accountNumber={fundFormData.account_number}
                  accountName={fundFormData.account_name || shopName}
                  template={qrPreviewTemplate}
                  amount={50000}
                  addInfo="DEMO123456"
                  className="border border-slate-200/80 bg-white shadow-3xs"
                />
                
                <p className="text-[10px] text-slate-450 text-center leading-normal">
                  Mã QR động sẽ tự hiển thị tại quầy POS và được in ra hóa đơn khi khách chọn chuyển khoản tương ứng với Quỹ này.
                </p>
              </div>
            </>
          )}

          <NumberInput
            label="Số dư ban đầu"
            value={String(fundFormData.initial_balance)}
            onChange={(v) => setFundFormData(prev => ({ ...prev, initial_balance: Number(v) || 0 }))}
            suffix="đ"
            disabled={editingFundId !== null}
          />
          {editingFundId !== null && (
            <p className="text-[10px] text-amber-600 leading-normal italic mt-0.5">
              * Số dư ban đầu chỉ được thiết lập một lần khi tạo quỹ. Để điều chỉnh số dư hiện tại của quỹ, vui lòng sử dụng chức năng "Kiểm quỹ" ngoài màn hình chính để ghi nhận phiếu điều chỉnh tự động.
            </p>
          )}

          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
            <input
              type="checkbox"
              id="is_default"
              checked={fundFormData.is_default}
              onChange={(e) => setFundFormData(prev => ({ ...prev, is_default: e.target.checked }))}
              className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 h-4 w-4 cursor-pointer"
            />
            <label htmlFor="is_default" className="text-sm font-medium text-slate-700 select-none cursor-pointer">
              Đặt làm tài khoản mặc định khi bán hàng
            </label>
          </div>

          {/* CÀI ĐẶT NGỪNG HOẠT ĐỘNG / KÍCH HOẠT LẠI */}
          {editingFundId && (() => {
            const selectedFundToEdit = fundsList.find(f => f.id === editingFundId)
            const isFundInactive = selectedFundToEdit?.active === 'FALSE'

            return (
              <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col gap-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Trạng thái vận hành</label>
                {isFundInactive ? (
                  <button
                    type="button"
                    onClick={handleActivateFund}
                    disabled={updateFundMutation.isPending}
                    className="w-full rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-4 py-2.5 text-xs font-semibold text-emerald-800 shadow-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {updateFundMutation.isPending ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-emerald-600 inline" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        Đang kích hoạt lại...
                      </>
                    ) : (
                      '🚀 Kích hoạt lại tài khoản quỹ'
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleDeactivateFund}
                    disabled={deleteFundMutation.isPending}
                    className="w-full rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 px-4 py-2.5 text-xs font-semibold text-rose-800 shadow-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {deleteFundMutation.isPending ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-rose-600 inline" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        Đang ngừng hoạt động quỹ...
                      </>
                    ) : (
                      '🔒 Ngừng hoạt động tài khoản quỹ'
                    )}
                  </button>
                )}
                <p className="text-[10px] text-slate-400 leading-relaxed italic mt-1">
                  * Khi ngừng hoạt động, tài khoản quỹ sẽ ẩn khỏi các thanh công cụ bán hàng/phiếu thu chi mới. Toàn bộ lịch sử dòng tiền cũ của quỹ vẫn được lưu giữ an toàn phục vụ mục đích đối chiếu báo cáo.
                </p>
              </div>
            )
          })()}
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
              onClick={handleConfirmSaveAudit}
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
                <span className="font-bold text-slate-800">{systemBalance.toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="flex justify-between border-t border-slate-200/50 pt-2 text-xs">
                <span className="text-slate-500 font-semibold">Chênh lệch khi cân bằng:</span>
                <span className={`font-black ${variance > 0 ? 'text-emerald-600' : variance < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
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

              <div className="grid grid-cols-1 gap-2 pr-1 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                {DENOMINATIONS.map(denom => (
                  <div key={denom} className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-bold text-slate-700 w-16">{denom.toLocaleString('vi-VN')}</span>
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
                    <span className="font-bold text-slate-800 w-24 text-right">
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
                type="text"
                value={actualBalanceInput}
                onChange={(e) => {
                  const rawVal = e.target.value.replace(/\D/g, '')
                  const formatted = rawVal ? parseInt(rawVal, 10).toLocaleString('vi-VN') : '0'
                  setActualBalanceInput(formatted)
                  // Hủy đếm mệnh giá nếu nhập tay
                  if (selectedFund?.type === 'cash') setDenominations({})
                }}
                className="w-full text-lg font-bold border border-slate-200 rounded-xl py-2 px-8 focus:outline-none focus:border-amber-500 bg-white text-slate-800 shadow-sm"
                placeholder="Nhập số dư đếm được..."
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
                        <span className="font-bold text-slate-700">{Number(audit.system_balance || 0).toLocaleString('vi-VN')}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-slate-400 font-semibold uppercase">Thực tế</span>
                        <span className="font-bold text-slate-800">{Number(audit.actual_balance || 0).toLocaleString('vi-VN')}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-slate-400 font-semibold uppercase">Chênh lệch</span>
                        <span className={`font-black ${v < 0 ? 'text-rose-600' : v > 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
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
                      <span className="text-[9px] text-slate-300">#{audit.id.substring(0, 8).toUpperCase()}</span>
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
