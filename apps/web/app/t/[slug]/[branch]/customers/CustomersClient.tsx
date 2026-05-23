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
      label: 'Loại KH',
      render: (row) => <TagBadge label={row.customer_type} />,
    },
    {
      key: 'loyalty_points',
      label: 'Điểm tích lũy',
      render: (row) => <span className="font-medium text-blue-600">{Number(row.loyalty_points || 0).toLocaleString('vi-VN')}đ</span>,
    },
    {
      key: 'prepaid_balance',
      label: 'Số dư trả trước',
      render: (row) => <span className="font-semibold text-emerald-600">{Number(row.prepaid_balance || 0).toLocaleString('vi-VN')}đ</span>,
    },
    {
      key: 'debt_amount',
      label: 'Công nợ',
      render: (row) => <span>{Number(row.debt_amount || 0).toLocaleString('vi-VN')}đ</span>,
    },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => openDeposit(row)}
            className="rounded-lg border border-emerald-100 bg-white px-3 py-1.5 text-xs font-medium text-emerald-600 shadow-sm hover:bg-emerald-50 transition-colors"
            title="Nạp tiền trả trước"
          >
            Nạp tiền
          </button>
          <button
            onClick={() => openEdit(row)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors"
          >
            Sửa
          </button>
          <button
            onClick={() => setDeleteTarget(row)}
            className="rounded-lg border border-red-100 bg-white px-3 py-1.5 text-xs font-medium text-red-500 shadow-sm hover:bg-red-50 transition-colors"
          >
            Xóa
          </button>
        </div>
      ),
    },
  ], [])

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
              <option value="retail">Bán lẻ</option>
              <option value="wholesale">Sỉ</option>
              <option value="vip">VIP</option>
              <option value="staff">Nội bộ</option>
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
              onClick={() => {
                if (depositTarget) {
                  depositMutation.mutate({
                    amount: parseFloat(depositAmount),
                    method: depositMethod,
                    note: depositNote,
                  })
                }
              }}
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
    </div>
  )
}
