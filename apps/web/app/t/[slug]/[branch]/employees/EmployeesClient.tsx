'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
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
  const [data, setData] = useState<Record<string, string>[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [formData, setFormData] = useState<Record<string, string>>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [slideOpen, setSlideOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const sp = new URLSearchParams({ page: String(page), limit: '50' })
      if (search) sp.set('search', search)
      const res = await fetch(`/api/shops/${shopId}/employees?${sp}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      setData(json.data)
      setTotal(json.total)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [shopId, page, search])

  useEffect(() => { fetchData() }, [fetchData])

  function openEdit(row: Record<string, string>) {
    setFormData(row)
    setEditingId(row.employee_id)
    setSlideOpen(true)
    setError(null)
  }

  function openCreate() {
    setFormData(EMPTY_FORM)
    setEditingId(null)
    setSlideOpen(true)
    setError(null)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const url = editingId
        ? `/api/shops/${shopId}/employees/${editingId}`
        : `/api/shops/${shopId}/employees`
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Lưu thất bại')
      }
      setSlideOpen(false)
      fetchData()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(row: Record<string, string>) {
    setTogglingId(row.employee_id)
    try {
      await fetch(`/api/shops/${shopId}/employees/${row.employee_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...row, active: 'FALSE' }),
      })
      fetchData()
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
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
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
          <p className="mt-0.5 text-sm text-slate-500">{total} nhân viên</p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-xl bg-[#0268FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#0256CC]"
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
        data={data}
        loading={loading}
        pagination={{ page, total, pageSize: 50, onChange: setPage }}
        emptyState={<EmptyState title="Chưa có nhân viên nào" description="Nhấn '+ Thêm nhân viên' để bắt đầu." />}
        rowKey={(row) => row.employee_id}
      />

      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title={editingId ? 'Chỉnh sửa nhân viên' : 'Thêm nhân viên'}
        footer={
          <>
            {error && <p className="mr-auto text-xs text-red-500">{error}</p>}
            <button
              onClick={() => setSlideOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-[#0268FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#0256CC] disabled:opacity-50"
            >
              {saving ? 'Đang lưu...' : 'Lưu'}
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
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
              placeholder="Nhập họ tên"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mã nhân viên</label>
            <input
              type="text"
              value={formData.employee_code}
              onChange={(e) => setFormData(prev => ({ ...prev, employee_code: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
              placeholder="Nhập mã nhân viên"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Số điện thoại</label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
              placeholder="Nhập số điện thoại"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Vai trò</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
            >
              <option value="owner">Chủ</option>
              <option value="manager">Quản lý</option>
              <option value="sales">Kinh doanh</option>
              <option value="cashier">Thu ngân</option>
              <option value="warehouse">Kho</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mã chi nhánh</label>
            <input
              type="text"
              value={formData.branch_id}
              onChange={(e) => setFormData(prev => ({ ...prev, branch_id: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
              placeholder="Nhập mã chi nhánh"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Hoa hồng (%)</label>
            <input
              type="text"
              value={formData.commission_pct}
              onChange={(e) => setFormData(prev => ({ ...prev, commission_pct: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ngày vào làm</label>
            <input
              type="date"
              value={formData.hire_date}
              onChange={(e) => setFormData(prev => ({ ...prev, hire_date: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ghi chú</label>
            <textarea
              value={formData.note}
              onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none resize-none"
              placeholder="Nhập ghi chú"
            />
          </div>
        </div>
      </SlideOver>
    </div>
  )
}
