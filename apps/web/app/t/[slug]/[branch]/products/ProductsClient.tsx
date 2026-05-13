'use client'
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useDebounce } from 'use-debounce'
import { DataTable, Column } from '@/app/components/ui/DataTable'
import { SlideOver } from '@/app/components/ui/SlideOver'
import { TagBadge } from '@/app/components/ui/TagBadge'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog'
import { SearchBar } from '@/app/components/ui/SearchBar'
import { NumberInput } from '@/app/components/ui/NumberInput'

interface Props {
  shopId: string
  shopName: string
}

const EMPTY_FORM = {
  sku: '',
  name: '',
  category_id: '',
  unit: '',
  sell_price: '0',
  cost_price: '0',
  min_price: '0',
  description: '',
  image_url: '',
  active: 'TRUE',
}

export function ProductsClient({ shopId }: Props) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebounce(search, 300)
  const [formData, setFormData] = useState<Record<string, string>>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [slideOpen, setSlideOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Record<string, string> | null>(null)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [catFormData, setCatFormData] = useState({ name: '', parent_id: '', description: '' })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['products', shopId, page, debouncedSearch],
    queryFn: async () => {
      const sp = new URLSearchParams({ page: String(page), limit: '50' })
      if (debouncedSearch) sp.set('search', debouncedSearch)
      const res = await fetch(`/api/shops/${shopId}/products?${sp}`)
      if (!res.ok) throw new Error('Không tải được dữ liệu')
      return res.json() as Promise<{ data: Record<string, string>[]; total: number }>
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const url = editingId
        ? `/api/shops/${shopId}/products/${editingId}`
        : `/api/shops/${shopId}/products`
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
      queryClient.invalidateQueries({ queryKey: ['products', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/shops/${shopId}/products/${id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      toast.success('Đã xóa')
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['products', shopId] })
    },
    onError: () => toast.error('Xóa thất bại'),
  })

  const { data: catData } = useQuery({
    queryKey: ['categories', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/categories?limit=200`)
      if (!res.ok) return { data: [] }
      return res.json() as Promise<{ data: Record<string, string>[] }>
    }
  })
  const categories = catData?.data ?? []

  const createCatMutation = useMutation({
    mutationFn: async (payload: { name: string, parent_id: string, description: string }) => {
      const res = await fetch(`/api/shops/${shopId}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Không thể tạo danh mục')
      }
      return res.json()
    },
    onSuccess: (newCat) => {
      toast.success('Đã tạo danh mục')
      queryClient.invalidateQueries({ queryKey: ['categories', shopId] })
      setFormData(prev => ({ ...prev, category_id: newCat.category_id || newCat.id || '' }))
      setCategoryModalOpen(false)
    },
    onError: (err: Error) => toast.error(err.message)
  })

  function openCreateCategory() {
    setCatFormData({ name: '', parent_id: '', description: '' })
    setCategoryModalOpen(true)
  }

  function openEdit(row: Record<string, string>) {
    setFormData(row)
    setEditingId(row.product_id)
    setSlideOpen(true)
  }

  function openCreate() {
    setFormData(EMPTY_FORM)
    setEditingId(null)
    setSlideOpen(true)
  }

  const columns = useMemo<Column<Record<string, string>>[]>(() => [
    { key: 'sku', label: 'SKU' },
    { key: 'name', label: 'Tên sản phẩm' },
    { 
      key: 'category_id', 
      label: 'Danh mục',
      render: (row) => {
        const cat = categories.find((c: any) => c.category_id === row.category_id)
        return <span>{cat ? cat.name : row.category_id || '-'}</span>
      }
    },
    { key: 'unit', label: 'Đơn vị' },
    {
      key: 'sell_price',
      label: 'Giá bán',
      render: (row) => <span>{Number(row.sell_price || 0).toLocaleString('vi-VN')}đ</span>,
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
          <button
            onClick={() => setDeleteTarget(row)}
            className="rounded-lg border border-red-100 px-3 py-1 text-xs text-red-500 hover:bg-red-50"
          >
            Xóa
          </button>
        </div>
      ),
    },
  ], [categories])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Sản phẩm</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {data?.total ?? 0} sản phẩm
            {isFetching && !isLoading && <span className="ml-2 text-xs text-slate-400">Đang cập nhật...</span>}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-xl bg-[#0268FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#0256CC]"
        >
          + Thêm sản phẩm
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
        emptyState={<EmptyState title="Chưa có sản phẩm nào" description="Nhấn '+ Thêm sản phẩm' để bắt đầu." />}
        rowKey={(row) => row.product_id}
      />

      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title={editingId ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm'}
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
              className="rounded-xl bg-[#0268FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#0256CC] disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Đang lưu...' : 'Lưu'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">SKU *</label>
            <input
              type="text"
              value={formData.sku}
              onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
              placeholder="Nhập SKU"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tên sản phẩm *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
              placeholder="Nhập tên sản phẩm"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-700">Danh mục</label>
              <button 
                type="button" 
                onClick={openCreateCategory} 
                className="text-xs text-[#0268FF] hover:underline"
              >
                + Tạo mới
              </button>
            </div>
            <select
              value={formData.category_id}
              onChange={(e) => setFormData(prev => ({ ...prev, category_id: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none bg-white"
            >
              <option value="">-- Chọn danh mục --</option>
              {categories.map((c: any) => (
                <option key={c.category_id} value={c.category_id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Đơn vị</label>
            <input
              type="text"
              value={formData.unit}
              onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
              placeholder="Cái, Hộp, Kg..."
            />
          </div>
          <NumberInput
            label="Giá bán"
            value={formData.sell_price}
            onChange={(v) => setFormData(prev => ({ ...prev, sell_price: v }))}
            suffix="đ"
          />
          <NumberInput
            label="Giá vốn"
            value={formData.cost_price}
            onChange={(v) => setFormData(prev => ({ ...prev, cost_price: v }))}
            suffix="đ"
          />
          <NumberInput
            label="Giá sàn"
            value={formData.min_price}
            onChange={(v) => setFormData(prev => ({ ...prev, min_price: v }))}
            suffix="đ"
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mô tả</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none resize-none"
              placeholder="Nhập mô tả sản phẩm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">URL ảnh</label>
            <input
              type="text"
              value={formData.image_url}
              onChange={(e) => setFormData(prev => ({ ...prev, image_url: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
              placeholder="https://..."
            />
          </div>
        </div>
      </SlideOver>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.product_id) }}
        title="Xác nhận xóa"
        description={`Bạn có chắc muốn xóa "${deleteTarget?.name}"?`}
        confirmLabel="Xóa"
        variant="danger"
        loading={deleteMutation.isPending}
      />

      {/* TẠO DANH MỤC MODAL */}
      {categoryModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Tạo danh mục mới</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tên danh mục *</label>
                <input
                  type="text"
                  value={catFormData.name}
                  onChange={(e) => setCatFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none"
                  placeholder="Ví dụ: Đồ uống"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Danh mục cha</label>
                <select
                  value={catFormData.parent_id}
                  onChange={(e) => setCatFormData(prev => ({ ...prev, parent_id: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none bg-white"
                >
                  <option value="">-- Không có --</option>
                  {categories.map((c: any) => (
                    <option key={c.category_id} value={c.category_id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ghi chú</label>
                <textarea
                  value={catFormData.description}
                  onChange={(e) => setCatFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0268FF] focus:outline-none resize-none"
                  placeholder="Ghi chú thêm..."
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setCategoryModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  if (!catFormData.name.trim()) {
                    toast.error('Vui lòng nhập tên danh mục'); return;
                  }
                  createCatMutation.mutate(catFormData)
                }}
                disabled={createCatMutation.isPending}
                className="rounded-xl bg-[#0268FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#0256CC] disabled:opacity-50"
              >
                {createCatMutation.isPending ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
