'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useDebounce } from 'use-debounce'
import { useSearchParams } from 'next/navigation'
import { DataTable, Column } from '@/app/components/ui/DataTable'
import { SlideOver } from '@/app/components/ui/SlideOver'
import { TagBadge } from '@/app/components/ui/TagBadge'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog'
import { SearchBar } from '@/app/components/ui/SearchBar'
import { NumberInput } from '@/app/components/ui/NumberInput'
import { CopyableId } from '@/app/components/ui/CopyableId'
import { format } from 'date-fns'

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

export function CustomersClient({ shopId }: Props) {
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const initialSearch = searchParams?.get('search') || searchParams?.get('customerId') || ''
  
  const { data: settings } = useQuery({
    queryKey: ['settings', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/settings`)
      if (!res.ok) return {}
      return res.json()
    },
  })
  
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
      const res = await fetch(`/api/shops/${shopId}/cashbook?reference_id=${viewTarget.customer_id}&limit=100`)
      if (!res.ok) throw new Error('Không tải được lịch sử giao dịch')
      return res.json() as Promise<{ data: Record<string, any>[] }>
    },
    enabled: !!viewTarget?.customer_id && detailOpen,
  })

  const depositMutation = useMutation({
    mutationFn: async (payload: { amount: number; method: string; note: string }) => {
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
    onSuccess: () => {
      toast.success('Nạp tiền vào tài khoản thành công!')
      setDepositTarget(null)
      setDepositAmount('0')
      setDepositNote('')
      queryClient.invalidateQueries({ queryKey: ['customers', shopId] })
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
      label: '',
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); openDeposit(row); }}
            className="rounded-lg border border-emerald-100 bg-white px-3 py-1.5 text-xs font-medium text-emerald-600 shadow-sm hover:bg-emerald-50 transition-colors cursor-pointer"
            title="Nạp tiền trả trước"
          >
            Nạp tiền
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(row); }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Sửa
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}
            className="rounded-lg border border-red-100 bg-white px-3 py-1.5 text-xs font-medium text-red-500 shadow-sm hover:bg-red-50 transition-colors cursor-pointer"
          >
            Xóa
          </button>
        </div>
      ),
    },
  ], [settings])

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
        <button
          onClick={openCreate}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
        >
          + Thêm khách hàng
        </button>
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
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              onClick={() => saveMutation.mutate(formData)}
              disabled={saveMutation.isPending}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Đang lưu...' : 'Lưu'}
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Loại khách</label>
            <select
              value={formData.customer_type}
              onChange={(e) => setFormData(prev => ({ ...prev, customer_type: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
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
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none"
              placeholder="Nhập ghi chú"
            />
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
            })
          }
          setConfirmDepositOpen(false)
        }}
        title="Xác nhận nạp tiền Ví trả trước"
        description={`Hành động này sẽ tự động tạo một PHIẾU THU SỔ QUỸ (Cashbook) tương ứng. Bạn có chắc chắn muốn nạp ${Number(depositAmount).toLocaleString('vi-VN')}đ bằng hình thức "${
          depositMethod === 'bank_transfer' ? 'Chuyển khoản' :
          depositMethod === 'cash' ? 'Tiền mặt' :
          depositMethod === 'momo' ? 'Momo' :
          depositMethod === 'vnpay' ? 'VNPay' :
          depositMethod === 'zalopay' ? 'ZaloPay' : depositMethod
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
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              onClick={() => setConfirmDepositOpen(true)}
              disabled={depositMutation.isPending || parseFloat(depositAmount) <= 0}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {depositMutation.isPending ? 'Đang nạp...' : 'Nạp tiền'}
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Phương thức thanh toán *</label>
            <select
              value={depositMethod}
              onChange={(e) => setDepositMethod(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              <option value="bank_transfer">Chuyển khoản ngân hàng</option>
              <option value="cash">Tiền mặt</option>
              <option value="momo">Ví MoMo</option>
              <option value="vnpay">Ví VNPay</option>
              <option value="zalopay">Ví ZaloPay</option>
            </select>
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

      {/* Customer Detail SlideOver (Read-Only) */}
      <SlideOver
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={`Chi tiết khách hàng: ${viewTarget?.name || ''}`}
        width={720}
        footer={
          <div className="flex w-full items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (viewTarget) {
                    setDetailOpen(false)
                    openDeposit(viewTarget)
                  }
                }}
                className="rounded-xl border border-emerald-250 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 cursor-pointer active:scale-95 transition-all shadow-xs"
              >
                Nạp tiền ví
              </button>
              <button
                onClick={() => {
                  if (viewTarget) {
                    setDetailOpen(false)
                    openEdit(viewTarget)
                  }
                }}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark cursor-pointer active:scale-95 transition-all shadow-xs"
              >
                Chỉnh sửa thông tin
              </button>
            </div>
            <button
              onClick={() => setDetailOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
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
              {detailTab === 'info' && (
                <div className="space-y-4">
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
                    <div className="rounded-xl border border-red-100 bg-red-50/40 p-3 text-center space-y-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nợ hiện tại</span>
                      <span className="text-sm font-bold text-red-655 block">
                        {Number(viewTarget.debt_amount || 0).toLocaleString('vi-VN')}đ
                      </span>
                    </div>
                  </div>

                  {/* Profile Details List */}
                  <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-4 text-sm">
                    <div className="grid grid-cols-2 gap-y-4 gap-x-2">
                      <div className="space-y-0.5">
                        <span className="text-xs text-slate-400 block font-medium">Mã khách hàng</span>
                        <span className="text-slate-800 block break-all font-semibold"><CopyableId id={viewTarget.customer_id} className="text-slate-800 text-sm font-semibold" /></span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-xs text-slate-400 block font-medium">Hạn mức tín dụng</span>
                        <span className="text-slate-800 font-semibold block">{Number(viewTarget.credit_limit || 0).toLocaleString('vi-VN')}đ</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-xs text-slate-400 block font-medium">Địa chỉ Email</span>
                        <span className="text-slate-800 block break-all">{viewTarget.email || '—'}</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-xs text-slate-400 block font-medium">Địa chỉ nhà</span>
                        <span className="text-slate-800 block">{viewTarget.address || '—'}</span>
                      </div>
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
              )}

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
              {detailTab === 'transactions' && (
                <div className="space-y-3">
                  {txLoading ? (
                    <div className="py-8 text-center text-xs text-slate-400 animate-pulse">Đang tải lịch sử giao dịch...</div>
                  ) : !customerTransactions?.data || customerTransactions.data.length === 0 ? (
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
                          {customerTransactions.data.map((tx, i) => {
                            const isReceipt = tx.type === 'receipt'
                            // Vietnamese category translations for customer view
                            const catMap: Record<string, string> = {
                              prepaid_deposit: 'Nạp tiền ví trả trước',
                              debt_collection: 'Thu nợ khách hàng',
                              sales: 'Thu tiền bán hàng',
                              other: 'Giao dịch khác'
                            }
                            const methodMap: Record<string, string> = {
                              cash: 'Tiền mặt',
                              bank_transfer: 'Chuyển khoản',
                              card: 'Thẻ (POS)',
                              momo: 'Momo',
                              prepaid: 'Ví trả trước'
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
              )}
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  )
}
