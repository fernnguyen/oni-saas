'use client'
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DataTable, Column } from '@/app/components/ui/DataTable'
import { SlideOver } from '@/app/components/ui/SlideOver'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { NumberInput } from '@/app/components/ui/NumberInput'

interface Props {
  shopId: string
  shopName: string
}

export function DebtClient({ shopId }: Props) {
  const queryClient = useQueryClient()
  const [slideOpen, setSlideOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Record<string, string> | null>(null)
  const [amountToCollect, setAmountToCollect] = useState(0)
  const [method, setMethod] = useState('cash')

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['customers-debt', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/customers/debt`)
      if (!res.ok) throw new Error('Không tải được dữ liệu')
      return res.json() as Promise<{ data: Record<string, string>[]; total: number, totalDebt: number }>
    },
  })

  const collectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) throw new Error('Không có khách hàng')
      if (amountToCollect <= 0) throw new Error('Số tiền phải lớn hơn 0')
      
      const payload = {
        type: 'receipt',
        amount: amountToCollect,
        method,
        category: 'debt_collection',
        reference_id: selectedCustomer.customer_id,
        reference_name: selectedCustomer.name,
        note: `Thu nợ khách hàng ${selectedCustomer.name}`,
      }

      const res = await fetch(`/api/shops/${shopId}/cashbook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Thu nợ thất bại')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success(`Đã thu ${amountToCollect.toLocaleString('vi-VN')}đ thành công!`)
      setSlideOpen(false)
      queryClient.invalidateQueries({ queryKey: ['customers-debt', shopId] })
      queryClient.invalidateQueries({ queryKey: ['cashbook', shopId] })
      queryClient.invalidateQueries({ queryKey: ['customers', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function openCollect(row: Record<string, string>) {
    setSelectedCustomer(row)
    setAmountToCollect(parseFloat(row.debt_amount || '0'))
    setMethod('cash')
    setSlideOpen(true)
  }

  const columns = useMemo<Column<Record<string, string>>[]>(() => [
    { key: 'customer_id', label: 'Mã KH' },
    { key: 'name', label: 'Tên Khách Hàng', render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
    { key: 'phone', label: 'SĐT' },
    {
      key: 'debt_amount',
      label: 'Công nợ hiện tại',
      render: (row) => <span className="font-semibold text-red-600">{Number(row.debt_amount || 0).toLocaleString('vi-VN')}đ</span>,
    },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={() => openCollect(row)}
            className="rounded-lg bg-[#0268FF] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#0256CC]"
          >
            Thu nợ
          </button>
        </div>
      ),
    },
  ], [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Quản lý Công Nợ</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {data?.total ?? 0} khách hàng đang nợ
            {isFetching && !isLoading && <span className="ml-2 text-xs text-slate-400">Đang cập nhật...</span>}
          </p>
        </div>
        <div className="rounded-2xl border border-red-100 bg-red-50/50 px-6 py-3 text-right">
          <p className="text-sm font-medium text-red-600/80">Tổng công nợ cần thu</p>
          <p className="text-2xl font-bold text-red-600">
            {Number(data?.totalDebt || 0).toLocaleString('vi-VN')}đ
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        emptyState={<EmptyState title="Không có công nợ" description="Tất cả khách hàng đã thanh toán đầy đủ." />}
        rowKey={(row) => row.customer_id}
      />

      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title="Thu nợ khách hàng"
        footer={
          <>
            <button
              onClick={() => setSlideOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              onClick={() => collectMutation.mutate()}
              disabled={collectMutation.isPending || amountToCollect <= 0}
              className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {collectMutation.isPending ? 'Đang xử lý...' : 'Xác nhận thu tiền'}
            </button>
          </>
        }
      >
        {selectedCustomer && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-slate-500">Khách hàng:</span>
                <span className="font-medium text-slate-900">{selectedCustomer.name}</span>
              </div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-slate-500">Số điện thoại:</span>
                <span className="font-medium text-slate-900">{selectedCustomer.phone}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200 mt-2">
                <span className="text-sm font-medium text-slate-700">Dư nợ hiện tại:</span>
                <span className="font-bold text-red-600">
                  {Number(selectedCustomer.debt_amount || 0).toLocaleString('vi-VN')}đ
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <NumberInput
                label="Số tiền thu *"
                value={String(amountToCollect)}
                onChange={(v) => setAmountToCollect(Number(v) || 0)}
                suffix="đ"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-xs text-[#0268FF] hover:underline"
                  onClick={() => setAmountToCollect(parseFloat(selectedCustomer.debt_amount || '0'))}
                >
                  Thu toàn bộ
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phương thức thanh toán</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
                >
                  <option value="cash">Tiền mặt</option>
                  <option value="bank_transfer">Chuyển khoản</option>
                  <option value="card">Thẻ (POS)</option>
                  <option value="momo">Ví Momo</option>
                </select>
              </div>
            </div>
            
            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
              <p>Sau khi thu, dư nợ của khách hàng sẽ còn <b>{Math.max(0, parseFloat(selectedCustomer.debt_amount || '0') - amountToCollect).toLocaleString('vi-VN')}đ</b>.</p>
              <p className="mt-1">Một <b>Phiếu Thu</b> sẽ được tự động tạo trong Sổ Quỹ.</p>
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  )
}
