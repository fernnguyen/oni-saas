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
import { Trash2, Edit, AlertCircle, Warehouse } from 'lucide-react'

interface Props {
  shopId: string
  shopName: string
}

interface WarehouseItem {
  id: string
  name: string
  code: string
  type: 'sale' | 'supply' | 'asset' | 'custom'
  active: 'TRUE' | 'FALSE'
  branch_id: string
}

const EMPTY_FORM = {
  name: '',
  code: '',
  type: 'custom' as const,
  active: 'TRUE' as const,
}

export function WarehouseClient({ shopId, shopName }: Props) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebounce(search, 300)
  const [formData, setFormData] = useState<{
    name: string
    code: string
    type: 'sale' | 'supply' | 'asset' | 'custom'
    active: 'TRUE' | 'FALSE'
  }>({
    name: '',
    code: '',
    type: 'custom',
    active: 'TRUE',
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [slideOpen, setSlideOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Fetch warehouses
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['warehouses-list', shopId, page],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/warehouses?page=${page}&limit=100`)
      if (!res.ok) throw new Error('Không tải được danh sách kho')
      return res.json() as Promise<{ data: WarehouseItem[]; total: number }>
    },
  })

  // Filter items on client side since backend lists all warehouses
  const filteredWarehouses = useMemo(() => {
    const list = data?.data || []
    if (!debouncedSearch) return list
    const s = debouncedSearch.toLowerCase()
    return list.filter(w => 
      w.name.toLowerCase().includes(s) || 
      w.code.toLowerCase().includes(s)
    )
  }, [data, debouncedSearch])

  // Save (Create or Update) mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: {
      name: string
      code: string
      type: 'sale' | 'supply' | 'asset' | 'custom'
      active: 'TRUE' | 'FALSE'
    }) => {
      const url = editingId
        ? `/api/shops/${shopId}/warehouses/${editingId}`
        : `/api/shops/${shopId}/warehouses`
      
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Lưu kho hàng thất bại')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success(editingId ? 'Đã cập nhật kho hàng' : 'Đã tạo kho hàng mới')
      setSlideOpen(false)
      queryClient.invalidateQueries({ queryKey: ['warehouses-list', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/shops/${shopId}/warehouses/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Xóa kho hàng thất bại')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Đã xóa kho hàng')
      queryClient.invalidateQueries({ queryKey: ['warehouses-list', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setDeletingId(null)
  })

  const isBuiltIn = (code: string) => {
    return ['sale', 'supply', 'asset', 'default'].includes(code.toLowerCase())
  }

  const getWarehouseTypeLabel = (type: string) => {
    switch (type) {
      case 'sale': return 'Kho Bán lẻ / Kinh doanh'
      case 'supply': return 'Kho Vật tư & Tiêu hao'
      case 'asset': return 'Kho Tài sản cố định'
      default: return 'Kho Tùy biến (Custom)'
    }
  }

  function openEdit(row: WarehouseItem) {
    setFormData({
      name: row.name,
      code: row.code,
      type: row.type,
      active: row.active,
    })
    setEditingId(row.id)
    setSlideOpen(true)
  }

  function openCreate() {
    setFormData({
      name: '',
      code: '',
      type: 'custom',
      active: 'TRUE',
    })
    setEditingId(null)
    setSlideOpen(true)
  }

  function handleDelete(row: WarehouseItem) {
    if (isBuiltIn(row.code)) {
      toast.error('Không thể xóa kho tiêu chuẩn hệ thống!')
      return
    }

    if (confirm(`Bạn có chắc chắn muốn xóa kho "${row.name}" (${row.code}) không?`)) {
      setDeletingId(row.id)
      deleteMutation.mutate(row.id)
    }
  }

  const columns = useMemo<Column<WarehouseItem>[]>(() => [
    { 
      key: 'code', 
      label: 'Mã kho',
      render: (row) => (
        <span className="font-bold text-slate-800 bg-slate-100/80 px-2 py-1 rounded-md text-xs">
          {row.code}
        </span>
      )
    },
    { 
      key: 'name', 
      label: 'Tên kho hàng',
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-semibold text-slate-900 text-sm">{row.name}</span>
          {isBuiltIn(row.code) && (
            <span className="text-[10px] font-semibold text-primary flex items-center gap-1 mt-0.5">
              <AlertCircle className="w-3 h-3" /> Kho hệ thống mặc định
            </span>
          )}
        </div>
      )
    },
    {
      key: 'type',
      label: 'Phân loại kho',
      render: (row) => (
        <span className="text-xs text-slate-600 font-medium">
          {getWarehouseTypeLabel(row.type)}
        </span>
      ),
    },
    {
      key: 'active',
      label: 'Trạng thái',
      render: (row) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
          row.active === 'TRUE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-50 text-slate-400 border border-slate-100'
        }`}>
          {row.active === 'TRUE' ? 'Hoạt động' : 'Tạm ngưng'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (row) => {
        const disabledDelete = isBuiltIn(row.code) || deletingId === row.id
        return (
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => openEdit(row)}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-slate-800 transition-colors"
            >
              <Edit className="w-3.5 h-3.5" /> Sửa
            </button>
            {!isBuiltIn(row.code) && (
              <button
                onClick={() => handleDelete(row)}
                disabled={disabledDelete}
                className="flex items-center gap-1 rounded-lg border border-rose-100 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-600 shadow-2xs hover:bg-rose-50 disabled:opacity-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Xóa
              </button>
            )}
          </div>
        )
      },
    },
  ], [deletingId])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{shopName}</div>
          <h1 className="mt-1 text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Warehouse className="w-5 h-5 text-primary" /> Danh mục kho
          </h1>
          <p className="mt-0.5 text-xs text-slate-400">
            Quản lý và định cấu hình các kho lưu trữ sản phẩm, vật tư, tiêu hao buồng phòng
          </p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
        >
          + Thêm kho hàng mới
        </button>
      </div>

      {/* Searchbar */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-2xs">
        <SearchBar
          value={search}
          onChange={(v) => setSearch(v)}
          placeholder="Tìm kiếm theo tên kho hoặc mã kho..."
        />
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xs overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredWarehouses}
          loading={isLoading}
          pagination={{ page, total: filteredWarehouses.length, pageSize: 50, onChange: setPage }}
          emptyState={
            <EmptyState 
              title="Chưa có kho hàng tùy chỉnh" 
              description="Hệ thống đã có sẵn 3 kho mặc định. Bạn có thể nhấn '+ Thêm Kho Hàng Mới' để mở rộng." 
            />
          }
          rowKey={(row) => row.id}
        />
      </div>

      {/* SlideOver Form */}
      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title={editingId ? 'Chỉnh sửa Kho hàng' : 'Thêm Kho hàng Mới'}
        footer={
          <div className="flex justify-end gap-3 w-full">
            <button
              onClick={() => setSlideOpen(false)}
              className="flex-1 sm:flex-none rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              onClick={() => saveMutation.mutate(formData)}
              disabled={saveMutation.isPending || !formData.name || !formData.code}
              className="flex-1 sm:flex-none rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white hover:bg-primary/95 disabled:opacity-50 shadow-md shadow-primary/20 flex items-center justify-center gap-1"
            >
              {saveMutation.isPending ? 'Đang lưu...' : 'Xác nhận & Lưu'}
            </button>
          </div>
        }
      >
        <div className="space-y-5 p-1 text-xs">
          {isBuiltIn(formData.code) && editingId && (
            <div className="flex gap-2.5 bg-primary/10 border border-primary/20 p-4 rounded-2xl text-primary font-semibold leading-relaxed">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>Đây là kho mặc định của hệ thống. Bạn chỉ có thể đổi tên kho để dễ quản lý, không được sửa mã kho hoặc xóa kho này.</span>
            </div>
          )}

          <div>
            <label className="block text-slate-700 font-bold mb-1.5">Tên kho hàng *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none shadow-3xs"
              placeholder="Ví dụ: Kho Buồng Phòng Tầng 1"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1.5">Mã kho hàng *</label>
            <input
              type="text"
              required
              disabled={editingId !== null && isBuiltIn(formData.code)}
              value={formData.code}
              onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }))}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none shadow-3xs disabled:bg-slate-50 font-semibold"
              placeholder="ví_dụ: lodging_hskp"
            />
            <p className="text-[10px] text-slate-400 font-medium mt-1">Chỉ chứa chữ thường không dấu, số, dấu gạch dưới và gạch ngang.</p>
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1.5">Phân loại kho</label>
            <select
              disabled={editingId !== null && isBuiltIn(formData.code)}
              value={formData.type}
              onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as any }))}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-white shadow-3xs disabled:bg-slate-50"
            >
              <option value="custom">Kho Tùy biến / Kho Dịch vụ (Custom)</option>
              <option value="sale">Kho Bán lẻ / Lễ tân (Sale)</option>
              <option value="supply">Kho Vật tư & Tiêu hao (Supply)</option>
              <option value="asset">Kho Tài sản cố định (Asset)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1.5">Trạng thái hoạt động</label>
            <select
              value={formData.active}
              onChange={(e) => setFormData(prev => ({ ...prev, active: e.target.value as any }))}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-white shadow-3xs"
            >
              <option value="TRUE">Hoạt động (Active)</option>
              <option value="FALSE">Tạm ngưng (Inactive)</option>
            </select>
          </div>
        </div>
      </SlideOver>
    </div>
  )
}
