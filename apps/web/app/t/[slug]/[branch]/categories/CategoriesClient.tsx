'use client'
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useDebounce } from 'use-debounce'
import { DataTable, Column } from '@/app/components/ui/DataTable'
import { SlideOver } from '@/app/components/ui/SlideOver'
import { TagBadge } from '@/app/components/ui/TagBadge'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { SearchBar } from '@/app/components/ui/SearchBar'
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog'

function RowActions({ r, onEdit, onDuplicate, onToggleActive }: { r: Record<string, string>, onEdit: () => void, onDuplicate: () => void, onToggleActive: () => void }) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 })

  const updatePosition = useCallback(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
  }, [open])

  useEffect(() => {
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [updatePosition])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node) && !(e.target as Element).closest('.row-actions-dropdown')) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="flex items-center gap-2 justify-end">
      <button onClick={onEdit} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
        Sửa
      </button>
      <button ref={buttonRef} onClick={(e) => { e.stopPropagation(); setOpen(!open) }} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors">
        Thao tác
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3 text-slate-400"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div className="row-actions-dropdown fixed z-[9999] w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5" style={{ top: coords.top, right: window.innerWidth - coords.left - coords.width }}>
          <button onClick={() => { setOpen(false); onDuplicate() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>
            Nhân bản
          </button>
          <div className="my-1 h-px bg-slate-100" />
          {r.active === 'TRUE' ? (
            <button onClick={() => { setOpen(false); onToggleActive() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9v6m-4.5 0V9M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Vô hiệu hóa
            </button>
          ) : (
            <button onClick={() => { setOpen(false); onToggleActive() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-green-600 hover:bg-green-50 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Khôi phục
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

interface Props {
  shopId: string
  shopName: string
}

const EMPTY_FORM = { name: '', parent_id: '', sort_order: '0', active: 'TRUE' }

export function CategoriesClient({ shopId }: Props) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebounce(search, 300)
  const [formData, setFormData] = useState<Record<string, string>>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [slideOpen, setSlideOpen] = useState(false)
  const [actionTarget, setActionTarget] = useState<Record<string, string> | null>(null)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['categories', shopId, page, debouncedSearch],
    queryFn: async () => {
      const sp = new URLSearchParams({ page: String(page), limit: '50' })
      if (debouncedSearch) sp.set('search', debouncedSearch)
      const res = await fetch(`/api/shops/${shopId}/categories?${sp}`)
      if (!res.ok) throw new Error('Không tải được dữ liệu')
      return res.json() as Promise<{ data: Record<string, string>[]; total: number }>
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const url = editingId
        ? `/api/shops/${shopId}/categories/${editingId}`
        : `/api/shops/${shopId}/categories`
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
      queryClient.invalidateQueries({ queryKey: ['categories', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function openEdit(row: Record<string, string>) {
    setFormData(row)
    setEditingId(row.category_id)
    setSlideOpen(true)
  }

  function openCreate() {
    setFormData(EMPTY_FORM)
    setEditingId(null)
    setSlideOpen(true)
  }

  const toggleActiveMutation = useMutation({
    mutationFn: async (row: Record<string, string>) => {
      const newActive = row.active === 'TRUE' ? 'FALSE' : 'TRUE'
      const res = await fetch(`/api/shops/${shopId}/categories/${row.category_id || row.id}`, { 
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: newActive })
      })
      if (!res.ok) throw new Error('Cập nhật trạng thái thất bại')
      return newActive
    },
    onSuccess: (newActive) => {
      toast.success(newActive === 'TRUE' ? 'Đã khôi phục danh mục' : 'Đã vô hiệu hóa danh mục')
      setActionTarget(null)
      queryClient.invalidateQueries({ queryKey: ['categories', shopId] })
    },
    onError: () => toast.error('Lỗi thao tác'),
  })

  function handleDuplicate(row: Record<string, string>) {
    const { id, category_id, created_at, updated_at, ...rest } = row
    setFormData({ ...rest, name: `${row.name} (Bản sao)` })
    setEditingId(null)
    setSlideOpen(true)
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
        <RowActions
          r={row}
          onEdit={() => openEdit(row)}
          onDuplicate={() => handleDuplicate(row)}
          onToggleActive={() => setActionTarget(row)}
        />
      ),
    },
  ], [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Danh mục</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {data?.total ?? 0} danh mục
            {isFetching && !isLoading && <span className="ml-2 text-xs text-slate-400">Đang cập nhật...</span>}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
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
        data={data?.data ?? []}
        loading={isLoading}
        pagination={{ page, total: data?.total ?? 0, pageSize: 50, onChange: setPage }}
        emptyState={<EmptyState title="Chưa có danh mục nào" description="Nhấn '+ Thêm danh mục' để bắt đầu." />}
        rowKey={(row) => row.category_id}
        onRowClick={openEdit}
      />

      <ConfirmDialog
        open={!!actionTarget}
        onClose={() => setActionTarget(null)}
        onConfirm={() => { if (actionTarget) toggleActiveMutation.mutate(actionTarget) }}
        title={actionTarget?.active === 'TRUE' ? "Vô hiệu hóa danh mục" : "Khôi phục danh mục"}
        description={
          actionTarget?.active === 'TRUE' 
            ? `Bạn có chắc muốn vô hiệu hóa danh mục "${actionTarget?.name}"? Các sản phẩm thuộc danh mục này có thể bị ảnh hưởng.`
            : `Danh mục "${actionTarget?.name}" sẽ được khôi phục trạng thái hoạt động.`
        }
        confirmLabel={actionTarget?.active === 'TRUE' ? "Vô hiệu hóa" : "Khôi phục"}
        variant={actionTarget?.active === 'TRUE' ? "danger" : "default"}
        loading={toggleActiveMutation.isPending}
      />

      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title={editingId ? 'Chỉnh sửa danh mục' : 'Thêm danh mục'}
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Tên danh mục *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Nhập tên danh mục"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Danh mục cha (ID)</label>
            <input
              type="text"
              value={formData.parent_id}
              onChange={(e) => setFormData(prev => ({ ...prev, parent_id: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Nhập ID danh mục cha"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Thứ tự sắp xếp</label>
            <input
              type="text"
              value={formData.sort_order}
              onChange={(e) => setFormData(prev => ({ ...prev, sort_order: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="0"
            />
          </div>
        </div>
      </SlideOver>
    </div>
  )
}
