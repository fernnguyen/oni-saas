'use client'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
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

function RowActions({ r, onEdit, onDuplicate, onToggleActive }: { r: Record<string, string>, onEdit: () => void, onDuplicate: () => void, onToggleActive: () => void }) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 })

  const updatePosition = useCallback(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setCoords({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: rect.width })
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
              Ngừng bán
            </button>
          ) : (
            <button onClick={() => { setOpen(false); onToggleActive() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-green-600 hover:bg-green-50 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" /></svg>
              Mở bán lại
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

async function compressImageToWebP(file: File, maxWidth = 1024, maxHeight = 1024): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width = width * ratio
          height = height * ratio
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Failed to get canvas context'))
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob)
            else reject(new Error('Canvas to Blob failed'))
          },
          'image/webp',
          0.8
        )
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = event.target?.result as string
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export function ProductsClient({ shopId }: Props) {
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const initialSearch = searchParams?.get('search') || searchParams?.get('productId') || ''
  
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState(initialSearch)
  const [debouncedSearch] = useDebounce(search, 300)
  const [formData, setFormData] = useState<Record<string, string>>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [slideOpen, setSlideOpen] = useState(false)
  const [actionTarget, setActionTarget] = useState<Record<string, string> | null>(null)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [catFormData, setCatFormData] = useState({ name: '', parent_id: '', description: '' })
  const [filterActive, setFilterActive] = useState<string>('TRUE')
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageInputMode, setImageInputMode] = useState<'url' | 'file'>('file')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'uploading'>('idle')
  const [fileInputKey, setFileInputKey] = useState(Date.now())

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['products', shopId, page, debouncedSearch, filterActive],
    queryFn: async () => {
      const sp = new URLSearchParams({ page: String(page), limit: '50' })
      if (debouncedSearch) sp.set('search', debouncedSearch)
      if (filterActive) sp.set('active', filterActive)
      const res = await fetch(`/api/shops/${shopId}/products?${sp}`)
      if (!res.ok) throw new Error('Không tải được dữ liệu')
      return res.json() as Promise<{ data: Record<string, string>[]; total: number }>
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      setSaveStatus('saving')
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
      
      const savedProduct = await res.json()
      const productId = editingId || savedProduct.product_id || savedProduct.id

      if (imageInputMode === 'file' && selectedFile && productId) {
        try {
          setSaveStatus('uploading')
          const webpBlob = await compressImageToWebP(selectedFile)
          const uploadUrlRes = await fetch(`/api/shops/${shopId}/products/${productId}/upload-url`)
          if (!uploadUrlRes.ok) throw new Error('Không lấy được link upload')
          
          const { uploadUrl, publicUrl } = await uploadUrlRes.json()
          
          const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            body: webpBlob,
            headers: { 'Content-Type': 'image/webp' },
          })
          if (!uploadRes.ok) throw new Error('Upload ảnh thất bại')

          await fetch(`/api/shops/${shopId}/products/${productId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_url: publicUrl })
          })
        } catch (error: any) {
          throw new Error(`Đã lưu thông tin nhưng tải ảnh lỗi: ${error.message}`)
        }
      }

      return savedProduct
    },
    onSuccess: () => {
      setSaveStatus('idle')
      toast.success(editingId ? 'Đã cập nhật' : 'Đã tạo mới')
      setSlideOpen(false)
      queryClient.invalidateQueries({ queryKey: ['products', shopId] })
    },
    onError: (err: Error) => {
      setSaveStatus('idle')
      toast.error(err.message)
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: async (row: Record<string, string>) => {
      const newActive = row.active === 'TRUE' ? 'FALSE' : 'TRUE'
      const res = await fetch(`/api/shops/${shopId}/products/${row.product_id || row.id}`, { 
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: newActive })
      })
      if (!res.ok) throw new Error('Cập nhật trạng thái thất bại')
      return newActive
    },
    onSuccess: (newActive) => {
      toast.success(newActive === 'TRUE' ? 'Đã mở bán lại sản phẩm' : 'Đã ngừng kinh doanh sản phẩm')
      setActionTarget(null)
      queryClient.invalidateQueries({ queryKey: ['products', shopId] })
    },
    onError: () => toast.error('Lỗi thao tác'),
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
    setSelectedFile(null)
    setPreviewUrl(row.image_url || null)
    setImageInputMode(row.image_url ? 'url' : 'file')
    setFileInputKey(Date.now())
    setSlideOpen(true)
  }

  function openCreate() {
    setFormData(EMPTY_FORM)
    setEditingId(null)
    setSelectedFile(null)
    setPreviewUrl(null)
    setImageInputMode('file')
    setFileInputKey(Date.now())
    setSlideOpen(true)
  }

  function handleDuplicate(row: Record<string, string>) {
    const { id, product_id, created_at, updated_at, ...rest } = row
    setFormData({ ...rest, name: `${row.name} (Bản sao)` })
    setEditingId(null)
    setSelectedFile(null)
    setPreviewUrl(row.image_url || null)
    setImageInputMode(row.image_url ? 'url' : 'file')
    setFileInputKey(Date.now())
    setSlideOpen(true)
  }

  const columns = useMemo<Column<Record<string, string>>[]>(() => [
    { 
      key: 'image', 
      label: 'Ảnh',
      render: (row) => (
        <div className="h-10 w-10 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center shrink-0">
          {row.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img 
              src={row.image_url} 
              alt={row.name} 
              className="w-full h-full object-cover" 
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          ) : (
            <span className="text-slate-300 text-[10px]">Trống</span>
          )}
        </div>
      )
    },
    { 
      key: 'sku', 
      label: 'SKU',
      render: (row) => row.sku ? <CopyableId id={row.sku} className="text-sm font-semibold text-slate-800" /> : '—'
    },
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
        <TagBadge label={row.active === 'TRUE' ? 'Hoạt động' : 'Tạm ngừng'} />
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
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
        >
          + Thêm sản phẩm
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-3 w-full">
        <div className="flex-1">
          <SearchBar
            value={search}
            onChange={(v) => { setSearch(v); setPage(1) }}
            placeholder="Tìm kiếm sản phẩm..."
            hideFilter={true}
          />
        </div>
        <select
          value={filterActive}
          onChange={(e) => { setFilterActive(e.target.value); setPage(1) }}
          className="rounded border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0F766E] focus:outline-none bg-white min-w-[150px] shrink-0"
        >
          <option value="ALL">Tất cả trạng thái</option>
          <option value="TRUE">Đang hoạt động</option>
          <option value="FALSE">Đã ngừng bán</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        pagination={{ page, total: data?.total ?? 0, pageSize: 50, onChange: setPage }}
        emptyState={<EmptyState title="Chưa có sản phẩm nào" description="Nhấn '+ Thêm sản phẩm' để bắt đầu." />}
        rowKey={(row) => row.product_id}
        onRowClick={openEdit}
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
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {saveStatus === 'uploading' ? 'Đang tải ảnh...' : saveStatus === 'saving' ? 'Đang lưu...' : 'Lưu'}
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
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Nhập SKU"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tên sản phẩm *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Nhập tên sản phẩm"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-700">Danh mục</label>
              <button 
                type="button" 
                onClick={openCreateCategory} 
                className="text-xs text-primary hover:underline"
              >
                + Tạo mới
              </button>
            </div>
            <select
              value={formData.category_id}
              onChange={(e) => setFormData(prev => ({ ...prev, category_id: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white"
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
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
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
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none"
              placeholder="Nhập mô tả sản phẩm"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">Ảnh sản phẩm</label>
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setImageInputMode('file')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${imageInputMode === 'file' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Tải ảnh lên
                </button>
                <button
                  type="button"
                  onClick={() => setImageInputMode('url')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${imageInputMode === 'url' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Dùng đường dẫn (URL)
                </button>
              </div>
            </div>

            {imageInputMode === 'file' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <svg className="w-8 h-8 mb-3 text-slate-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                      </svg>
                      <p className="mb-2 text-sm text-slate-500"><span className="font-semibold">Bấm để tải ảnh</span> hoặc chụp ảnh</p>
                      <p className="text-xs text-slate-400">Hỗ trợ tự động nén WebP</p>
                    </div>
                    <input 
                      key={fileInputKey}
                      type="file" 
                      className="hidden" 
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setSelectedFile(file)
                          setPreviewUrl(URL.createObjectURL(file))
                          setFormData(prev => ({ ...prev, image_url: '' }))
                        }
                      }}
                    />
                  </label>
                </div>
                {previewUrl && !previewUrl.startsWith('http') && (
                  <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null)
                        setPreviewUrl(null)
                        setFileInputKey(Date.now())
                      }}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 shadow-sm"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  value={formData.image_url}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, image_url: e.target.value }))
                    setPreviewUrl(e.target.value)
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  placeholder="https://..."
                />
                {previewUrl && formData.image_url === previewUrl && (
                  <div className="mt-3 relative w-24 h-24 rounded-xl overflow-hidden border border-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </SlideOver>

      <ConfirmDialog
        open={!!actionTarget}
        onClose={() => setActionTarget(null)}
        onConfirm={() => { if (actionTarget) toggleActiveMutation.mutate(actionTarget) }}
        title={actionTarget?.active === 'TRUE' ? "Ngừng kinh doanh" : "Mở bán lại"}
        description={
          actionTarget?.active === 'TRUE' 
            ? `Bạn có chắc muốn ngừng kinh doanh "${actionTarget?.name}"? Sản phẩm sẽ bị ẩn khỏi các màn hình bán hàng.`
            : `Sản phẩm "${actionTarget?.name}" sẽ được bán trở lại trên toàn hệ thống.`
        }
        confirmLabel={actionTarget?.active === 'TRUE' ? "Ngừng bán" : "Mở bán lại"}
        variant={actionTarget?.active === 'TRUE' ? "danger" : "primary"}
        loading={toggleActiveMutation.isPending}
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
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  placeholder="Ví dụ: Đồ uống"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Danh mục cha</label>
                <select
                  value={catFormData.parent_id}
                  onChange={(e) => setCatFormData(prev => ({ ...prev, parent_id: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white"
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
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none"
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
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
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
