'use client'
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DataTable, Column } from '@/app/components/ui/DataTable'
import { SlideOver } from '@/app/components/ui/SlideOver'
import { TagBadge } from '@/app/components/ui/TagBadge'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { SearchBar } from '@/app/components/ui/SearchBar'
import { NumberInput } from '@/app/components/ui/NumberInput'
import { format } from 'date-fns'

interface Props {
  shopId: string
  shopName: string
}

const EMPTY_FORM = {
  type: 'receipt',
  amount: 0,
  method: 'cash',
  category: 'other',
  reference_name: '',
  note: '',
}

export function CashbookClient({ shopId }: Props) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [slideOpen, setSlideOpen] = useState(false)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['cashbook', shopId, page, typeFilter],
    queryFn: async () => {
      const sp = new URLSearchParams({ page: String(page), limit: '50' })
      if (typeFilter) sp.set('type', typeFilter)
      const res = await fetch(`/api/shops/${shopId}/cashbook?${sp}`)
      if (!res.ok) throw new Error('Không tải được dữ liệu')
      return res.json() as Promise<{ data: Record<string, string>[]; total: number }>
    },
  })

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
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function openCreate(type: 'receipt' | 'payment') {
    setFormData({ ...EMPTY_FORM, type })
    setSlideOpen(true)
  }

  const CATEGORY_MAP: Record<string, string> = {
    sales: 'Bán hàng',
    debt_collection: 'Thu nợ',
    import: 'Nhập hàng',
    salary: 'Lương nhân viên',
    utilities: 'Điện nước/Mặt bằng',
    other: 'Khác',
  }

  const METHOD_MAP: Record<string, string> = {
    cash: 'Tiền mặt',
    bank_transfer: 'Chuyển khoản',
    card: 'Thẻ (POS)',
    momo: 'Ví Momo',
  }

  const columns = useMemo<Column<Record<string, string>>[]>(() => [
    { key: 'transaction_id', label: 'Mã Phiếu' },
    { 
      key: 'created_at', 
      label: 'Thời gian',
      render: (row) => format(new Date(row.created_at || new Date()), 'HH:mm dd/MM/yyyy')
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
        <span className={`font-medium ${row.type === 'receipt' ? 'text-green-600' : 'text-red-600'}`}>
          {row.type === 'receipt' ? '+' : '-'}{Number(row.amount || 0).toLocaleString('vi-VN')}đ
        </span>
      ),
    },
    { key: 'category', label: 'Danh mục', render: (row) => <TagBadge label={CATEGORY_MAP[row.category] || row.category} /> },
    { key: 'reference_name', label: 'Người nộp/nhận' },
    { key: 'method', label: 'Phương thức', render: (row) => METHOD_MAP[row.method] || row.method },
    { key: 'note', label: 'Ghi chú' },
  ], [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Sổ quỹ</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {data?.total ?? 0} giao dịch
            {isFetching && !isLoading && <span className="ml-2 text-xs text-slate-400">Đang cập nhật...</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openCreate('receipt')}
            className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            + Tạo Phiếu Thu
          </button>
          <button
            onClick={() => openCreate('payment')}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            + Tạo Phiếu Chi
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <button 
          onClick={() => setTypeFilter('')}
          className={`px-3 py-1.5 text-sm rounded-lg border ${!typeFilter ? 'bg-[#0268FF] text-white border-[#0268FF]' : 'bg-white text-slate-600 border-slate-200'}`}
        >
          Tất cả
        </button>
        <button 
          onClick={() => setTypeFilter('receipt')}
          className={`px-3 py-1.5 text-sm rounded-lg border ${typeFilter === 'receipt' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-600 border-slate-200'}`}
        >
          Chỉ Phiếu Thu
        </button>
        <button 
          onClick={() => setTypeFilter('payment')}
          className={`px-3 py-1.5 text-sm rounded-lg border ${typeFilter === 'payment' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-200'}`}
        >
          Chỉ Phiếu Chi
        </button>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        pagination={{ page, total: data?.total ?? 0, pageSize: 50, onChange: setPage }}
        emptyState={<EmptyState title="Chưa có giao dịch" description="Nhấn tạo phiếu để bắt đầu ghi nhận dòng tiền." />}
        rowKey={(row) => row.transaction_id}
      />

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
              disabled={saveMutation.isPending || formData.amount <= 0}
              className={`rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${formData.type === 'receipt' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Phương thức thanh toán</label>
            <select
              value={formData.method}
              onChange={(e) => setFormData(prev => ({ ...prev, method: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
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
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
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
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
              placeholder="VD: Nguyễn Văn A..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ghi chú</label>
            <textarea
              value={formData.note}
              onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none resize-none"
              placeholder="Lý do thu chi..."
            />
          </div>
        </div>
      </SlideOver>
    </div>
  )
}
