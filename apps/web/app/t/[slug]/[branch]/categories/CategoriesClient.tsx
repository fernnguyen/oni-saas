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

const EMPTY_FORM = { name: '', parent_id: '', sort_order: '0', active: 'TRUE' }

export function CategoriesClient({ shopId }: Props) {
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
      const res = await fetch(`/api/shops/${shopId}/categories?${sp}`)
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
    setEditingId(row.category_id)
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
        ? `/api/shops/${shopId}/categories/${editingId}`
        : `/api/shops/${shopId}/categories`
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
    setTogglingId(row.category_id)
    try {
      await fetch(`/api/shops/${shopId}/categories/${row.category_id}`, {
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
    { key: 'category_id', label: 'Mã' },
    { key: 'name', label: 'Tên' },
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
              disabled={togglingId === row.category_id}
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
          <h1 className="text-xl font-semibold text-slate-900">Danh mục</h1>
          <p className="mt-0.5 text-sm text-slate-500">{total} danh mục</p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-xl bg-[#0268FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#0256CC]"
        >
          + Thêm danh mục
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
        emptyState={<EmptyState title="Chưa có danh mục nào" description="Nhấn '+ Thêm danh mục' để bắt đầu." />}
        rowKey={(row) => row.category_id}
      />

      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title={editingId ? 'Chỉnh sửa danh mục' : 'Thêm danh mục'}
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Tên danh mục *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
              placeholder="Nhập tên danh mục"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Danh mục cha (ID)</label>
            <input
              type="text"
              value={formData.parent_id}
              onChange={(e) => setFormData(prev => ({ ...prev, parent_id: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
              placeholder="Nhập ID danh mục cha"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Thứ tự sắp xếp</label>
            <input
              type="text"
              value={formData.sort_order}
              onChange={(e) => setFormData(prev => ({ ...prev, sort_order: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
              placeholder="0"
            />
          </div>
        </div>
      </SlideOver>
    </div>
  )
}
