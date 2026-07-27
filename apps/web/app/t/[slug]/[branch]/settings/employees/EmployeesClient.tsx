'use client'
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useDebounce } from 'use-debounce'
import { DataTable, Column } from '@/app/components/ui/DataTable'
import { SlideOver } from '@/app/components/ui/SlideOver'
import { TagBadge } from '@/app/components/ui/TagBadge'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { SearchBar } from '@/app/components/ui/SearchBar'

interface Props {
  shopId: string
  shopName: string
}

const EMPTY_FORM = {
  name: '',
  employee_code: '',
  phone: '',
  role: 'sales',
  branch_id: '',
  commission_pct: '0',
  hire_date: '',
  note: '',
  active: 'TRUE',
}

export function EmployeesClient({ shopId }: Props) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebounce(search, 300)
  const [formData, setFormData] = useState<Record<string, string>>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [slideOpen, setSlideOpen] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['employees', shopId, page, debouncedSearch],
    queryFn: async () => {
      const sp = new URLSearchParams({ page: String(page), limit: '50' })
      if (debouncedSearch) sp.set('search', debouncedSearch)
      const res = await fetch(`/api/shops/${shopId}/employees?${sp}`)
      if (!res.ok) throw new Error('Không tải được dữ liệu')
      return res.json() as Promise<{ data: Record<string, string>[]; total: number }>
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const url = editingId
        ? `/api/shops/${shopId}/employees/${editingId}`
        : `/api/shops/${shopId}/employees`
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
      queryClient.invalidateQueries({ queryKey: ['employees', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function openEdit(row: Record<string, string>) {
    setFormData(row)
    setEditingId(row.employee_id)
    setSlideOpen(true)
  }

  function openCreate() {
    setFormData({ ...EMPTY_FORM, branch_id: shopId })
    setEditingId(null)
    setSlideOpen(true)
  }

  async function handleDeactivate(row: Record<string, string>) {
    setTogglingId(row.employee_id)
    try {
      await fetch(`/api/shops/${shopId}/employees/${row.employee_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...row, active: 'FALSE' }),
      })
      queryClient.invalidateQueries({ queryKey: ['employees', shopId] })
    } catch (e) {
      console.error(e)
    } finally {
      setTogglingId(null)
    }
  }

  const columns = useMemo<Column<Record<string, string>>[]>(() => [
    { key: 'employee_code', label: 'Mã NV' },
    { key: 'name', label: 'Tên' },
    { key: 'phone', label: 'SĐT' },
    {
      key: 'role',
      label: 'Vai trò',
      render: (row) => <TagBadge label={row.role} />,
    },
    {
      key: 'active',
      label: 'Trạng thái',
      render: (row) => (
        <TagBadge label={row.active === 'TRUE' ? 'Hoạt động' : 'Ngừng'} />
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => openEdit(row)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors"
          >
            Sửa
          </button>
          {row.active === 'TRUE' && (
            <button
              onClick={() => handleDeactivate(row)}
              disabled={togglingId === row.employee_id}
              className="rounded-lg border border-amber-100 px-3 py-1 text-xs text-amber-600 hover:bg-amber-50 disabled:opacity-50"
            >
              Vô hiệu hóa
            </button>
          )}
        </div>
      ),
    },
  ], [togglingId])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Nhân viên</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {data?.total ?? 0} nhân viên
            {isFetching && !isLoading && <span className="ml-2 text-xs text-slate-400">Đang cập nhật...</span>}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
        >
          + Thêm nhân viên
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
        emptyState={<EmptyState title="Chưa có nhân viên nào" description="Nhấn '+ Thêm nhân viên' để bắt đầu." />}
        rowKey={(row) => row.employee_id}
      />

      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title={editingId ? 'Chỉnh sửa nhân viên' : 'Thêm nhân viên'}
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Họ tên *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Nhập họ tên"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mã nhân viên</label>
            <input
              type="text"
              value={formData.employee_code}
              onChange={(e) => setFormData(prev => ({ ...prev, employee_code: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Nhập mã nhân viên"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Số điện thoại</label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Nhập số điện thoại"
            />
            <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-400">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              Số điện thoại nội bộ — không ảnh hưởng đến tài khoản đăng nhập
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Vai trò</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              <option value="owner">Chủ</option>
              <option value="manager">Quản lý</option>
              <option value="sales">Kinh doanh</option>
              <option value="cashier">Thu ngân</option>
              <option value="warehouse">Kho</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Hoa hồng (%)</label>
            <input
              type="text"
              value={formData.commission_pct}
              onChange={(e) => setFormData(prev => ({ ...prev, commission_pct: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ngày vào làm</label>
            <input
              type="date"
              value={formData.hire_date}
              onChange={(e) => setFormData(prev => ({ ...prev, hire_date: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
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
    </div>
  )
}
