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
  industryType?: string
}

// Industry helpers
const FNB_INDUSTRIES = ['fnb', 'cafe', 'bubble_tea', 'restaurant', 'food']
const FASHION_INDUSTRIES = ['fashion', 'clothing', 'retail']

function isFnBIndustry(t: string) { return FNB_INDUSTRIES.includes(t) }
function isFashionIndustry(t: string) { return FASHION_INDUSTRIES.includes(t) }

const EMPTY_FORM = {
  sku: '',
  barcode: '',
  name: '',
  category_id: '',
  unit: '',
  sell_price: '0',
  cost_price: '0',
  min_price: '0',
  description: '',
  image_url: '',
  active: 'TRUE',
  product_type: 'simple',
  parent_id: '',
  variant_options: '',
  has_bom: 'FALSE',
}

// A single variant row in the UI editor
interface VariantRow {
  id: string             // temp client-side id
  value: string          // e.g. "Size L" or just "L"
  sku: string
  sell_price: string
  cost_price: string
  barcode: string
}

// Modifier system types
interface ModifierOption {
  id: string
  name: string
  price_adj: string   // "+8000" or "0"
}

interface ModifierGroup {
  id: string
  name: string
  is_required: boolean
  max_selection: number   // 1 = single choice, >1 = multi
  options: ModifierOption[]
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

export function ProductsClient({ shopId, industryType = 'retail' }: Props) {
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
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false)

interface UnitRow {
  id?: string
  unit_name: string
  conversion_rate: string
  barcode: string
  sell_price: string
  cost_price: string
}

// ── Modifier system state ──────────────────────────────────────────
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([])
  const [hasModifiersToggle, setHasModifiersToggle] = useState(false)
  const [previousCostPrice, setPreviousCostPrice] = useState('0')

  // ── Unit Conversion system state ──────────────────────────────────
  const [unitRows, setUnitRows] = useState<UnitRow[]>([])

  // ── Variant system state ──────────────────────────────────────────
  const [variantRows, setVariantRows] = useState<VariantRow[]>([])
  const [optionName, setOptionName] = useState('') // e.g. "Size", "Màu sắc"

  // ── BOM system state ───────────────────────────────────────────
  const [bomItems, setBomItems] = useState<Array<{ component_product_id: string; qty: string }>>([])
  const [componentSearch, setComponentSearch] = useState('')
  const [showComponentSearchDropdown, setShowComponentSearchDropdown] = useState(false)
  const [bomHighlightedIndex, setBomHighlightedIndex] = useState<number>(-1)
  const componentSearchRef = useRef<HTMLDivElement>(null)

  // Query to fetch all products for the BOM component selection combobox
  const { data: allProductsData } = useQuery({
    queryKey: ['all-products', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/products?limit=2000&active=TRUE`)
      if (!res.ok) return { data: [] }
      return res.json() as Promise<{ data: Record<string, string>[] }>
    },
    enabled: !!shopId,
  })
  const allProducts = allProductsData?.data ?? []

  const bomTotalCost = useMemo(() => {
    return bomItems.reduce((acc, item) => {
      const comp = allProducts.find(p => (p.product_id || p.id) === item.component_product_id)
      const unitCost = Number(comp?.cost_price || 0)
      return acc + Number(item.qty || 0) * unitCost
    }, 0)
  }, [bomItems, allProducts])



  const bomLabels = useMemo(() => {
    const isFnB = isFnBIndustry(industryType)
    return {
      toggleTitle: isFnB ? 'Định lượng nguyên liệu' : 'Định mức linh kiện (BOM)',
      toggleDesc: isFnB
        ? 'Bán sản phẩm sẽ tự động trừ kho nguyên liệu thô / thành phần'
        : 'Bán thành phẩm sẽ tự động trừ kho linh kiện / nguyên liệu cấu thành',
      addInputLabel: isFnB ? 'Thêm nguyên liệu thô / thành phần' : 'Thêm linh kiện / nguyên liệu cấu thành',
      tableHeaderName: isFnB ? 'Nguyên liệu / Thành phần' : 'Linh kiện / Nguyên liệu',
      emptyState: isFnB
        ? 'Chưa có nguyên liệu nào. Hãy tìm kiếm và thêm ở trên.'
        : 'Chưa có linh kiện nào. Hãy tìm kiếm và thêm ở trên.',
      buttonSync: isFnB ? 'Lấy từ định lượng' : 'Lấy từ BOM',
      syncSuccess: isFnB ? 'Đã lấy giá vốn từ định lượng nguyên liệu!' : 'Đã lấy giá vốn từ định mức BOM!',
    }
  }, [industryType])

  const filteredComponentProducts = useMemo(() => {
    if (!componentSearch.trim()) return []
    const q = componentSearch.toLowerCase()
    return allProducts.filter(
      p => p.product_id !== editingId && // cannot add self as component
        p.product_type !== 'variant_parent' && // cannot be parent
        (p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
    )
  }, [allProducts, componentSearch, editingId])

  useEffect(() => {
    if (filteredComponentProducts.length > 0) {
      setBomHighlightedIndex(0)
    } else {
      setBomHighlightedIndex(-1)
    }
  }, [filteredComponentProducts])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (componentSearchRef.current && !componentSearchRef.current.contains(e.target as Node)) {
        setShowComponentSearchDropdown(false)
        setBomHighlightedIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
      const isVariantParent = formData.product_type === 'variant_parent'

      // ── Variant parent: send with variants[] children ─────────────
      if (isVariantParent) {
        if (!optionName.trim()) throw new Error('Vui lòng nhập tên thuộc tính (VD: Size, Màu sắc)')
        if (variantRows.length === 0) throw new Error('Vui lòng thêm ít nhất 1 variant')
        if (variantRows.some((r) => !r.value.trim())) throw new Error('Vui lòng nhập giá trị cho tất cả các variant')

        const enrichedPayload = {
          ...payload,
          product_type: 'variant_parent',
          variant_options: JSON.stringify({ option_name: optionName.trim() }),
          sell_price: '0',
          variants: variantRows.map((r) => ({
            value: r.value.trim(),
            sku: r.sku.trim(),
            sell_price: r.sell_price || '0',
            cost_price: r.cost_price || '0',
            barcode: r.barcode.trim(),
          })),
          product_units: unitRows,
        }

        const url = editingId
          ? `/api/shops/${shopId}/products/${editingId}`
          : `/api/shops/${shopId}/products`
        const res = await fetch(url, {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enrichedPayload),
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json.error ?? 'Lưu thất bại')
        }
        return res.json()
      }

      // ── Standard product (simple or modifier inferred by modifierGroups) ──
      const hasModifiers = hasModifiersToggle && modifierGroups.length > 0
      if (hasModifiers) {
        for (const g of modifierGroups) {
          if (!g.name.trim()) throw new Error('Vui lòng nhập tên cho tất cả các nhóm modifier')
          if (g.options.length === 0) throw new Error(`Nhóm "${g.name}" cần ít nhất 1 lựa chọn`)
          if (g.options.some((o) => !o.name.trim())) throw new Error(`Vui lòng nhập tên cho tất cả lựa chọn trong nhóm "${g.name}"`)
        }
      }

      const finalProductType = hasModifiers ? 'modifier' : 'simple'
      const finalVariantOptions = hasModifiers ? JSON.stringify({ groups: modifierGroups }) : ''

      const enrichedPayload: Record<string, any> = {
        ...payload,
        product_type: finalProductType,
        variant_options: finalVariantOptions,
        product_units: unitRows,
      }

      const url = editingId
        ? `/api/shops/${shopId}/products/${editingId}`
        : `/api/shops/${shopId}/products`
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enrichedPayload),
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
          const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: webpBlob, headers: { 'Content-Type': 'image/webp' } })
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

      // Save BOM items if product is standard (simple or modifier)
      const hasBomVal = enrichedPayload.has_bom === 'TRUE'
      const finalBomItems = hasBomVal ? bomItems : []
      const bomRes = await fetch(`/api/shops/${shopId}/products/${productId}/bom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalBomItems),
      })
      if (!bomRes.ok) {
        const json = await bomRes.json().catch(() => ({}))
        throw new Error(json.error ?? 'Lưu định mức BOM thất bại')
      }

      return savedProduct
    },
    onSuccess: () => {
      setSaveStatus('idle')
      toast.success(editingId ? 'Đã cập nhật' : 'Đã tạo mới')
      setSlideOpen(false)
      setSaveConfirmOpen(false)
      queryClient.invalidateQueries({ queryKey: ['products', shopId] })
    },
    onError: (err: Error) => {
      setSaveStatus('idle')
      setSaveConfirmOpen(false)
      toast.error(err.message)
    },
  })

  const handlePreSave = () => {
    if (!formData.name?.trim()) {
      toast.error('Vui lòng nhập tên sản phẩm')
      return
    }

    const isVariantParent = formData.product_type === 'variant_parent'

    if (isVariantParent) {
      if (!optionName.trim()) {
        toast.error('Vui lòng nhập tên thuộc tính (VD: Size, Màu sắc)')
        return
      }
      if (variantRows.length === 0) {
        toast.error('Vui lòng thêm ít nhất 1 variant')
        return
      }
      if (variantRows.some((r) => !r.value.trim())) {
        toast.error('Vui lòng nhập giá trị cho tất cả các variant')
        return
      }
    } else {
      const hasModifiers = hasModifiersToggle && modifierGroups.length > 0
      if (hasModifiers) {
        for (const g of modifierGroups) {
          if (!g.name.trim()) {
            toast.error('Vui lòng nhập tên cho tất cả các nhóm modifier')
            return
          }
          if (g.options.length === 0) {
            toast.error(`Nhóm "${g.name}" cần ít nhất 1 lựa chọn`)
            return
          }
          if (g.options.some((o) => !o.name.trim())) {
            toast.error(`Vui lòng nhập tên cho tất cả lựa chọn trong nhóm "${g.name}"`)
            return
          }
        }
      }
    }

    setSaveConfirmOpen(true)
  }


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
    setUnitRows((row as any).product_units || [])

    // Reset and Fetch BOM items if product is standard (simple or modifier)
    setBomItems([])
    if (row.product_type !== 'variant_parent') {
      fetch(`/api/shops/${shopId}/products/${row.product_id || row.id}/bom`)
        .then(res => res.json())
        .then(resData => {
          if (Array.isArray(resData)) {
            setBomItems(resData)
          }
        })
        .catch(err => {
          console.error('Fetch BOM failed:', err)
        })
    }

    // If editing a variant_parent, load its variant children
    if (row.product_type === 'variant_parent') {
      const opts = safeParseJson(row.variant_options)
      setOptionName(opts?.option_name ?? '')
      const children = (data?.data ?? []).filter(
        (p) => p.parent_id === row.product_id
      )
      setVariantRows(
        children.map((c) => ({
          id: c.product_id,
          value: safeParseJson(c.variant_options)?.[opts?.option_name ?? ''] ?? '',
          sku: c.sku ?? '',
          sell_price: c.sell_price ?? '0',
          cost_price: c.cost_price ?? '0',
          barcode: c.barcode ?? '',
        }))
      )
      setModifierGroups([])
      setHasModifiersToggle(false)
    } else if (row.product_type === 'modifier') {
      // Load modifier config from variant_options JSON
      const config = safeParseJson(row.variant_options)
      const groups = Array.isArray(config?.groups)
        ? config.groups.map((g: ModifierGroup) => ({ ...g, id: g.id || `g-${Date.now()}` }))
        : []
      setModifierGroups(groups)
      setHasModifiersToggle(groups.length > 0)
      setVariantRows([])
      setOptionName('')
    } else {
      setVariantRows([])
      setOptionName('')
      setModifierGroups([])
      setHasModifiersToggle(false)
    }
    setPreviousCostPrice(row.cost_price || '0')
    setSlideOpen(true)
  }

  function openCreate() {
    setFormData(EMPTY_FORM)
    setEditingId(null)
    setSelectedFile(null)
    setPreviewUrl(null)
    setImageInputMode('file')
    setFileInputKey(Date.now())
    setVariantRows([])
    setOptionName('')
    setModifierGroups([])
    setHasModifiersToggle(false)
    setPreviousCostPrice('0')
    setUnitRows([])
    setBomItems([])
    setSlideOpen(true)
  }

  function handleDuplicate(row: Record<string, string>) {
    const { id, product_id, created_at, updated_at, ...rest } = row
    setFormData({ ...rest, name: `${row.name} (Bản sao)`, product_type: 'simple' })
    setEditingId(null)
    setSelectedFile(null)
    setPreviewUrl(row.image_url || null)
    setImageInputMode(row.image_url ? 'url' : 'file')
    setFileInputKey(Date.now())
    setVariantRows([])
    setOptionName('')
    setModifierGroups([])
    setHasModifiersToggle(false)
    setPreviousCostPrice('0')
    setUnitRows([])
    setBomItems([])
    setSlideOpen(true)
  }

  function addVariantRow() {
    setVariantRows((prev) => [
      ...prev,
      { id: `new-${Date.now()}`, value: '', sku: '', sell_price: '0', cost_price: '0', barcode: '' },
    ])
  }

  function removeVariantRow(id: string) {
    setVariantRows((prev) => prev.filter((r) => r.id !== id))
  }

  function updateVariantRow(id: string, field: keyof VariantRow, value: string) {
    setVariantRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  function safeParseJson(s?: string | null) {
    try { return s ? JSON.parse(s) : null } catch { return null }
  }

  // ── Modifier handlers ───────────────────────────────────────────
  function addModifierGroup() {
    setModifierGroups((prev) => [
      ...prev,
      { id: `g-${Date.now()}`, name: '', is_required: true, max_selection: 1, options: [] },
    ])
  }

  function removeModifierGroup(gid: string) {
    setModifierGroups((prev) => prev.filter((g) => g.id !== gid))
  }

  function updateModifierGroup(gid: string, field: keyof ModifierGroup, value: unknown) {
    setModifierGroups((prev) => prev.map((g) => g.id === gid ? { ...g, [field]: value } : g))
  }

  function addModifierOption(gid: string) {
    setModifierGroups((prev) => prev.map((g) =>
      g.id === gid
        ? { ...g, options: [...g.options, { id: `o-${Date.now()}`, name: '', price_adj: '0' }] }
        : g
    ))
  }

  function removeModifierOption(gid: string, oid: string) {
    setModifierGroups((prev) => prev.map((g) =>
      g.id === gid ? { ...g, options: g.options.filter((o) => o.id !== oid) } : g
    ))
  }

  function updateModifierOption(gid: string, oid: string, field: keyof ModifierOption, value: string) {
    setModifierGroups((prev) => prev.map((g) =>
      g.id === gid
        ? { ...g, options: g.options.map((o) => o.id === oid ? { ...o, [field]: value } : o) }
        : g
    ))
  }

  const handleToggleBom = () => {
    const turningOn = formData.has_bom !== 'TRUE'
    if (turningOn) {
      setPreviousCostPrice(formData.cost_price || '0')
      setFormData(prev => ({
        ...prev,
        has_bom: 'TRUE',
        cost_price: String(bomTotalCost)
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        has_bom: 'FALSE',
        cost_price: previousCostPrice || '0'
      }))
    }
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
    {
      key: 'name',
      label: 'Tên sản phẩm',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-800">{row.name}</span>
          {row.product_type === 'variant_child' && (
            <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-600 ring-1 ring-violet-200">
              {(() => { try { const o = JSON.parse(row.variant_options || '{}'); return Object.values(o).join(' / ') || 'Variant' } catch { return 'Variant' } })()}
            </span>
          )}
          {row.product_type === 'variant_parent' && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
              (nhóm)
            </span>
          )}
          {row.product_type === 'modifier' && (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600 ring-1 ring-amber-200">
              Modifier
            </span>
          )}
        </div>
      )
    },
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
      render: (row) => row.product_type === 'variant_parent'
        ? <span className="text-slate-400 text-xs">Nhiều giá</span>
        : <span>{Number(row.sell_price || 0).toLocaleString('vi-VN')}đ</span>,
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

  // Filter: exclude variant_parent from table (show children + simple)
  const tableData = (data?.data ?? []).filter(
    (p) => p.product_type !== 'variant_parent'
  )

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
        data={tableData}
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
        width={800}
        footer={
          <>
            <button
              onClick={() => setSlideOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              onClick={handlePreSave}
              disabled={saveMutation.isPending}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {saveStatus === 'uploading' ? 'Đang tải ảnh...' : saveStatus === 'saving' ? 'Đang lưu...' : 'Lưu'}
            </button>
          </>
        }
      >
        {(() => {
          const isStandardProduct = formData.product_type !== 'variant_parent'
          const showSplitScreen = isStandardProduct && formData.has_bom === 'TRUE'

          return (
            <div className="space-y-4">
              {/* Left Column / Main Form Details */}
              <div className="space-y-4">

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tên sản phẩm *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    placeholder={
                      formData.product_type === 'variant_parent' ? 'Ví dụ: Áo thun Polo, Quần Jeans...' :
                        isFnBIndustry(industryType) ? 'Ví dụ: Trà sữa, Cà phê...' :
                          'Nhập tên sản phẩm'
                    }
                  />
                </div>

                {formData.product_type !== 'variant_parent' ? (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">SKU</label>
                      <input
                        type="text"
                        value={formData.sku}
                        onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white"
                        placeholder="Tự động tạo"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Mã vạch</label>
                      <input
                        type="text"
                        value={formData.barcode}
                        onChange={(e) => setFormData(prev => ({ ...prev, barcode: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white"
                        placeholder="Mã vạch gốc"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Đơn vị</label>
                      <input
                        type="text"
                        value={formData.unit}
                        onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white"
                        placeholder="Cái, Hộp, Ly..."
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-medium text-slate-700">Danh mục</label>
                        <button
                          type="button"
                          onClick={openCreateCategory}
                          className="text-xs text-primary hover:underline font-medium"
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
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Đơn vị</label>
                      <input
                        type="text"
                        value={formData.unit}
                        onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white"
                        placeholder="Cái, Hộp, Ly..."
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-medium text-slate-700">Danh mục</label>
                        <button
                          type="button"
                          onClick={openCreateCategory}
                          className="text-xs text-primary hover:underline font-medium"
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
                  </div>
                )}

                {/* ── Giá bán / Giá vốn / Giá sàn (grouped horizontally in columns) ── */}
                {formData.product_type !== 'variant_parent' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-medium text-slate-700">Giá bán</label>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-slate-400"></span>
                          {[10, 20, 50, 100].map(pct => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => {
                                const cost = Number(formData.cost_price || 0)
                                if (cost > 0) {
                                  const sell = Math.round(cost * (1 + pct / 100))
                                  setFormData(prev => ({ ...prev, sell_price: String(sell) }))
                                  toast.success(`Đã tính giá bán: Giá vốn + ${pct}%`)
                                } else {
                                  toast.error('Vui lòng nhập Giá vốn trước')
                                }
                              }}
                              className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-medium text-slate-600 hover:bg-primary/10 hover:text-primary transition-colors"
                            >
                              +{pct}%
                            </button>
                          ))}
                        </div>
                      </div>
                      <NumberInput
                        value={formData.sell_price}
                        onChange={(v) => setFormData(prev => ({ ...prev, sell_price: v }))}
                        suffix="đ"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-medium text-slate-700">Giá vốn</label>
                        {formData.has_bom === 'TRUE' && (
                          <button
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, cost_price: String(bomTotalCost) }))
                              toast.success(bomLabels.syncSuccess)
                            }}
                            className="text-xs text-primary hover:underline font-medium"
                          >
                            + {bomLabels.buttonSync}
                          </button>
                        )}
                      </div>
                      <NumberInput
                        value={formData.cost_price}
                        onChange={(v) => setFormData(prev => ({ ...prev, cost_price: v }))}
                        suffix="đ"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Giá sàn <small className="text-[10px] text-slate-400 font-normal normal-case">(Giá tối thiểu cho phép bán)</small>
                      </label>
                      <NumberInput
                        value={formData.min_price}
                        onChange={(v) => setFormData(prev => ({ ...prev, min_price: v }))}
                        suffix="đ"
                      />
                    </div>
                  </div>
                )}

                {/* ── Đơn vị tính quy đổi (Unit Conversions) ────────────── */}
                {formData.product_type !== 'variant_parent' && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="text-sm font-medium text-slate-800">Đơn vị tính quy đổi</h4>
                        <p className="text-xs text-slate-500">Thiết lập các đơn vị phụ (VD: Hộp, Vỉ) và quy đổi ra đơn vị cơ bản.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setUnitRows(prev => [
                            ...prev,
                            { id: `new-unit-${Date.now()}`, unit_name: '', conversion_rate: '1', barcode: '', sell_price: '0', cost_price: '0' }
                          ])
                        }}
                        className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
                      >
                        <i className="fi fi-rr-plus" /> Thêm đơn vị phụ
                      </button>
                    </div>

                    {unitRows.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 text-xs text-slate-500 font-medium">
                              <th className="py-2 pr-2 font-medium">Tên ĐV phụ</th>
                              <th className="py-2 pr-2 font-medium">SL quy đổi</th>
                              <th className="py-2 pr-2 font-medium">Mã vạch</th>
                              <th className="py-2 pr-2 font-medium">Giá bán</th>
                              <th className="py-2 pr-2 font-medium">Giá vốn</th>
                              <th className="py-2 w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {unitRows.map((row, idx) => (
                              <tr key={row.id || idx} className="border-b border-slate-100 last:border-0 group">
                                <td className="py-2 pr-2">
                                  <input
                                    type="text"
                                    value={row.unit_name}
                                    placeholder="VD: Hộp"
                                    onChange={(e) => {
                                      const newRows = [...unitRows]
                                      newRows[idx].unit_name = e.target.value
                                      setUnitRows(newRows)
                                    }}
                                    className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-primary"
                                  />
                                </td>
                                <td className="py-2 pr-2">
                                  <input
                                    type="number"
                                    min="1"
                                    value={row.conversion_rate}
                                    onChange={(e) => {
                                      const newRows = [...unitRows]
                                      newRows[idx].conversion_rate = e.target.value
                                      setUnitRows(newRows)
                                    }}
                                    className="w-20 rounded border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-primary"
                                  />
                                </td>
                                <td className="py-2 pr-2">
                                  <input
                                    type="text"
                                    value={row.barcode}
                                    placeholder="Mã vạch ĐV phụ"
                                    onChange={(e) => {
                                      const newRows = [...unitRows]
                                      newRows[idx].barcode = e.target.value
                                      setUnitRows(newRows)
                                    }}
                                    className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-primary"
                                  />
                                </td>
                                <td className="py-2 pr-2">
                                  <NumberInput
                                    value={row.sell_price}
                                    inputClassName="w-full rounded border border-slate-200 px-2 py-1.5 text-right text-sm outline-none focus:border-primary bg-white"
                                    onChange={(v) => {
                                      const newRows = [...unitRows]
                                      newRows[idx].sell_price = v
                                      setUnitRows(newRows)
                                    }}
                                  />
                                </td>
                                <td className="py-2 pr-2">
                                  <NumberInput
                                    value={row.cost_price}
                                    inputClassName="w-full rounded border border-slate-200 px-2 py-1.5 text-right text-sm outline-none focus:border-primary bg-white"
                                    onChange={(v) => {
                                      const newRows = [...unitRows]
                                      newRows[idx].cost_price = v
                                      setUnitRows(newRows)
                                    }}
                                  />
                                </td>
                                <td className="py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newRows = [...unitRows]
                                      newRows.splice(idx, 1)
                                      setUnitRows(newRows)
                                    }}
                                    className="text-slate-300 hover:text-red-500 p-1"
                                    title="Xóa đơn vị"
                                  >
                                    ✕
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}                {/* ── Variant builder (only when variant_parent) ────────────── */}
                {formData.product_type === 'variant_parent' && (
                  <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-violet-500">
                        <path d="M2 4.5A2.5 2.5 0 014.5 2h11a2.5 2.5 0 010 5h-11A2.5 2.5 0 012 4.5zM2.75 9.083a.75.75 0 000 1.5h14.5a.75.75 0 000-1.5H2.75zM2.75 12.663a.75.75 0 000 1.5h14.5a.75.75 0 000-1.5H2.75zM2.75 16.25a.75.75 0 000 1.5h14.5a.75.75 0 000-1.5H2.75z" />
                      </svg>
                      <span className="text-sm font-semibold text-violet-700">Quản lý thuộc tính</span>
                    </div>

                    {/* Option name */}
                    <div>
                      <label className="block text-xs font-medium text-violet-600 mb-1">Tên thuộc tính *</label>
                      <input
                        type="text"
                        value={optionName}
                        onChange={(e) => setOptionName(e.target.value)}
                        className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
                        placeholder="Ví dụ: Size, Màu sắc, Kiểu dáng..."
                      />
                    </div>

                    {/* Variant rows */}
                    <div className="space-y-2">
                      <div className="grid grid-cols-12 gap-1.5 text-[11px] font-semibold text-violet-500 uppercase tracking-wide px-1">
                        <div className="col-span-2">Giá trị</div>
                        <div className="col-span-3">SKU</div>
                        <div className="col-span-3">Giá bán</div>
                        <div className="col-span-3">Giá vốn</div>
                        <div className="col-span-1"></div>
                      </div>
                      {variantRows.length === 0 && (
                        <p className="text-xs text-violet-400 text-center py-2">Chưa có variant nào. Nhấn &quot;+ Thêm&quot; bên dưới.</p>
                      )}
                      {variantRows.map((row) => (
                        <div key={row.id} className="grid grid-cols-12 gap-1.5 items-center">
                          <input
                            className="col-span-2 rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
                            placeholder={optionName || 'VD: S'}
                            value={row.value}
                            onChange={(e) => updateVariantRow(row.id, 'value', e.target.value)}
                          />
                          <input
                            className="col-span-3 rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-sm focus:border-violet-400 focus:outline-none font-mono"
                            placeholder="SKU-001"
                            value={row.sku}
                            onChange={(e) => updateVariantRow(row.id, 'sku', e.target.value)}
                          />
                          <input
                            className="col-span-3 rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
                            placeholder="0"
                            value={row.sell_price}
                            onChange={(e) => updateVariantRow(row.id, 'sell_price', e.target.value)}
                          />
                          <input
                            className="col-span-3 rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
                            placeholder="0"
                            value={row.cost_price}
                            onChange={(e) => updateVariantRow(row.id, 'cost_price', e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => removeVariantRow(row.id)}
                            className="col-span-1 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addVariantRow}
                        className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-violet-300 py-2 text-xs font-medium text-violet-600 hover:bg-violet-50 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
                        Thêm variant
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Modifier groups builder ─────────────────────── */}
                {isStandardProduct && (
                  <div className={`space-y-3 p-4 rounded-xl border transition-all ${hasModifiersToggle ? 'border-primary/20 bg-slate-50/50 shadow-sm' : 'border-slate-200 bg-white'
                    }`}>
                    {/* Header Row with Toggle Switch */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-primary">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                        </svg>
                        <div>
                          <span className="text-xs font-semibold text-slate-700">Thêm nhóm lựa chọn (Ví dụ size, màu...)</span>
                          <p className="text-[10px] text-slate-400 leading-none mt-0.5">Sản phẩm có thể đi kèm các lựa chọn (Modifier groups)</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setHasModifiersToggle(!hasModifiersToggle)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${hasModifiersToggle ? 'bg-primary' : 'bg-slate-200'
                          }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${hasModifiersToggle ? 'translate-x-5' : 'translate-x-0'
                            }`}
                        />
                      </button>
                    </div>

                    {hasModifiersToggle && (
                      <div className="space-y-4 pt-3 border-t border-slate-200/60">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-500">Các nhóm lựa chọn đã thiết lập</span>
                          <button
                            type="button"
                            onClick={addModifierGroup}
                            className="flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
                            Thêm nhóm
                          </button>
                        </div>

                        {modifierGroups.length === 0 && (
                          <p className="text-xs text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-xl bg-white shadow-sm">
                            Chưa có nhóm nào. Nhấn &quot;Thêm nhóm&quot; để bắt đầu.
                          </p>
                        )}

                        {modifierGroups.map((group, gi) => (
                          <div key={group.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-3 shadow-sm">
                            {/* Group header */}
                            <div className="flex items-start gap-2">
                              <div className="flex-1 space-y-2">
                                <input
                                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium focus:border-primary focus:outline-none"
                                  placeholder={`Nhóm ${gi + 1}: Ví dụ "Chọn size", "Topping"...`}
                                  value={group.name}
                                  onChange={(e) => updateModifierGroup(group.id, 'name', e.target.value)}
                                />
                                <div className="flex items-center gap-4 text-xs text-slate-500">
                                  {/* Required toggle */}
                                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                    <button
                                      type="button"
                                      onClick={() => updateModifierGroup(group.id, 'is_required', !group.is_required)}
                                      className={`relative w-8 h-4 rounded-full transition-colors ${group.is_required ? 'bg-primary' : 'bg-slate-200'}`}
                                    >
                                      <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${group.is_required ? 'translate-x-4' : ''}`} />
                                    </button>
                                    <span className={group.is_required ? 'text-primary font-semibold' : 'text-slate-500'}>
                                      {group.is_required ? 'Bắt buộc' : 'Tùy chọn'}
                                    </span>
                                  </label>
                                  {/* Single/Multi toggle */}
                                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                    <button
                                      type="button"
                                      onClick={() => updateModifierGroup(group.id, 'max_selection', group.max_selection === 1 ? 99 : 1)}
                                      className={`relative w-8 h-4 rounded-full transition-colors ${group.max_selection > 1 ? 'bg-primary' : 'bg-slate-200'}`}
                                    >
                                      <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${group.max_selection > 1 ? 'translate-x-4' : ''}`} />
                                    </button>
                                    <span className={group.max_selection > 1 ? 'text-primary font-semibold' : 'text-slate-500'}>
                                      {group.max_selection > 1 ? 'Nhiều lựa chọn' : 'Chọn 1'}
                                    </span>
                                  </label>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeModifierGroup(group.id)}
                                className="mt-1 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>

                            {/* Options */}
                            <div className="space-y-1.5 pl-1">
                              <div className="grid grid-cols-12 gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-1">
                                <div className="col-span-7">Lựa chọn</div>
                                <div className="col-span-4">Giá thêm (đ)</div>
                                <div className="col-span-1"></div>
                              </div>
                              {group.options.length === 0 && (
                                <p className="text-xs text-slate-400 px-1 py-1">Chưa có lựa chọn nào</p>
                              )}
                              {group.options.map((opt) => (
                                <div key={opt.id} className="grid grid-cols-12 gap-1.5 items-center">
                                  <input
                                    className="col-span-7 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                                    placeholder={group.max_selection > 1 ? 'VD: Trân châu' : 'VD: Size L'}
                                    value={opt.name}
                                    onChange={(e) => updateModifierOption(group.id, opt.id, 'name', e.target.value)}
                                  />
                                  <input
                                    className="col-span-4 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-right focus:border-primary focus:outline-none"
                                    placeholder="0"
                                    value={opt.price_adj}
                                    onChange={(e) => updateModifierOption(group.id, opt.id, 'price_adj', e.target.value)}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeModifierOption(group.id, opt.id)}
                                    className="col-span-1 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => addModifierOption(group.id)}
                                className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-primary/20 py-1.5 text-xs font-medium text-primary hover:bg-primary/5 bg-slate-50 transition-colors"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
                                Thêm lựa chọn
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── BOM / Định lượng nguyên liệu Section ── */}
                {isStandardProduct && (
                  <div className={`space-y-3 p-4 rounded-xl border transition-all ${formData.has_bom === 'TRUE' ? 'border-primary/20 bg-slate-50/50 shadow-sm' : 'border-slate-200 bg-white'
                    }`}>
                    {/* Header Row with Toggle Switch */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-primary">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                        </svg>
                        <div>
                          <span className="text-xs font-semibold text-slate-700">{bomLabels.toggleTitle}</span>
                          <p className="text-[10px] text-slate-400 leading-none mt-0.5">{bomLabels.toggleDesc}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleToggleBom}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${formData.has_bom === 'TRUE' ? 'bg-primary' : 'bg-slate-200'
                          }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.has_bom === 'TRUE' ? 'translate-x-5' : 'translate-x-0'
                            }`}
                        />
                      </button>
                    </div>

                    {formData.has_bom === 'TRUE' && (
                      <div className="space-y-3 pt-3 border-t border-slate-200/60">
                        {/* Search / Add Component dropdown */}
                        <div className="relative" ref={componentSearchRef}>
                          <label className="block text-xs font-medium text-slate-700 mb-1">{bomLabels.addInputLabel}</label>
                          <input
                            type="text"
                            value={componentSearch}
                            onChange={(e) => {
                              setComponentSearch(e.target.value)
                              setShowComponentSearchDropdown(true)
                              setBomHighlightedIndex(-1)
                            }}
                            onFocus={() => {
                              setShowComponentSearchDropdown(true)
                              setBomHighlightedIndex(-1)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowDown') {
                                e.preventDefault()
                                if (filteredComponentProducts.length > 0) {
                                  setBomHighlightedIndex(prev => (prev === -1 ? 0 : (prev + 1) % filteredComponentProducts.length))
                                }
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault()
                                if (filteredComponentProducts.length > 0) {
                                  setBomHighlightedIndex(prev => (prev === -1 ? filteredComponentProducts.length - 1 : (prev - 1 + filteredComponentProducts.length) % filteredComponentProducts.length))
                                }
                              } else if (e.key === 'Escape') {
                                setShowComponentSearchDropdown(false)
                                setBomHighlightedIndex(-1)
                              } else if (e.key === 'Enter') {
                                e.preventDefault()
                                let selectedProduct = null
                                if (bomHighlightedIndex >= 0 && bomHighlightedIndex < filteredComponentProducts.length) {
                                  selectedProduct = filteredComponentProducts[bomHighlightedIndex]
                                } else if (filteredComponentProducts.length === 1) {
                                  selectedProduct = filteredComponentProducts[0]
                                }

                                if (selectedProduct) {
                                  const pId = selectedProduct.product_id || selectedProduct.id
                                  if (bomItems.some(item => item.component_product_id === pId)) {
                                    toast.error('Linh kiện này đã có trong danh sách')
                                  } else {
                                    setBomItems(prev => [...prev, { component_product_id: pId, qty: '1' }])
                                    setComponentSearch('')
                                    setShowComponentSearchDropdown(false)
                                    setBomHighlightedIndex(-1)
                                    toast.success(`Đã thêm ${selectedProduct.name}`)
                                  }
                                }
                              }
                            }}
                            placeholder="Tìm theo tên sản phẩm hoặc SKU..."
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white"
                          />

                          {showComponentSearchDropdown && filteredComponentProducts.length > 0 && (
                            <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                              {filteredComponentProducts.map((p, index) => (
                                <button
                                  key={p.product_id || p.id}
                                  type="button"
                                  onMouseEnter={() => setBomHighlightedIndex(index)}
                                  onClick={() => {
                                    const pId = p.product_id || p.id
                                    // Check if already exists
                                    if (bomItems.some(item => item.component_product_id === pId)) {
                                      toast.error('Linh kiện này đã có trong danh sách')
                                    } else {
                                      setBomItems(prev => [...prev, { component_product_id: pId, qty: '1' }])
                                      setComponentSearch('')
                                      setShowComponentSearchDropdown(false)
                                      setBomHighlightedIndex(-1)
                                      toast.success(`Đã thêm ${p.name}`)
                                    }
                                  }}
                                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                                    index === bomHighlightedIndex
                                      ? 'bg-primary/10 border-l-2 border-primary'
                                      : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="flex-1 min-w-0 pr-2">
                                    <div className="flex items-center gap-2">
                                      <p className="font-semibold text-slate-900 truncate">{p.name}</p>
                                      {(index === bomHighlightedIndex || filteredComponentProducts.length === 1) && (
                                        <kbd className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-sans font-bold text-slate-500 shadow-sm shrink-0">
                                          Enter
                                        </kbd>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-500 font-mono">SKU: {p.sku || 'N/A'} • ĐVT: {p.unit || 'Cái'}</p>
                                  </div>
                                  <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded flex-shrink-0">
                                    {Number(p.cost_price || 0).toLocaleString()}đ
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                          {showComponentSearchDropdown && componentSearch && filteredComponentProducts.length === 0 && (
                            <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-lg text-center text-xs text-slate-400">
                              Không tìm thấy linh kiện nào
                            </div>
                          )}
                        </div>

                        {/* Components List Table */}
                        <div className="rounded-xl border border-slate-200 overflow-x-auto bg-white shadow-sm">
                          <table className="w-full text-left border-collapse min-w-[600px]">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-600 uppercase tracking-wider">
                                <th className="px-3 py-2.5">{bomLabels.tableHeaderName}</th>
                                <th className="px-3 py-2.5 w-16 text-center">ĐVT</th>
                                <th className="px-3 py-2.5 w-20 text-center">Số lượng</th>
                                <th className="px-3 py-2.5 text-right w-24">Giá vốn (đ)</th>
                                <th className="px-3 py-2.5 text-right w-28">Thành tiền</th>
                                <th className="px-2 py-2.5 w-8"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {bomItems.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="px-3 py-6 text-center text-xs text-slate-400">
                                    {bomLabels.emptyState}
                                  </td>
                                </tr>
                              ) : (
                                bomItems.map((item, idx) => {
                                  const comp = allProducts.find(p => (p.product_id || p.id) === item.component_product_id)
                                  if (!comp) return null
                                  const unitCost = Number(comp.cost_price || 0)
                                  const subtotal = Number(item.qty || 0) * unitCost
                                  return (
                                    <tr key={item.component_product_id} className="border-b border-slate-100 text-xs hover:bg-slate-50/50 transition-colors">
                                      <td className="px-3 py-2 min-w-0">
                                        <p className="font-semibold text-slate-900 truncate">{comp.name}</p>
                                        <p className="text-[10px] text-slate-400 font-mono">{comp.sku || 'N/A'}</p>
                                      </td>
                                      <td className="px-3 py-2 text-center text-slate-600 font-medium">
                                        {comp.unit || 'Cái'}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <input
                                          type="text"
                                          value={item.qty}
                                          onChange={(e) => {
                                            const val = e.target.value
                                            if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                              setBomItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: val } : it))
                                            }
                                          }}
                                          placeholder="0"
                                          className="w-full text-center rounded-lg border border-slate-200 px-1 py-1 text-xs font-semibold focus:border-primary focus:outline-none"
                                        />
                                      </td>
                                      <td className="px-3 py-2 text-right text-slate-600 font-mono">
                                        {unitCost.toLocaleString()}
                                      </td>
                                      <td className="px-3 py-2 text-right font-bold text-slate-900 font-mono">
                                        {subtotal.toLocaleString()}
                                      </td>
                                      <td className="px-2 py-2 text-center">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setBomItems(prev => prev.filter((_, i) => i !== idx))
                                          }}
                                          className="text-slate-400 hover:text-red-500 transition-colors"
                                        >
                                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                          </svg>
                                        </button>
                                      </td>
                                    </tr>
                                  )
                                })
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* Summary calculations */}
                        {bomItems.length > 0 && (() => {
                          const sellPrice = Number(formData.sell_price || 0)
                          const profit = sellPrice - bomTotalCost
                          const margin = sellPrice > 0 ? (profit / sellPrice) * 100 : 0

                          return (
                            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1.5 shadow-sm">
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-600 font-semibold">
                                  Tổng chi phí công thức (A)
                                </span>
                                <span className="font-bold text-slate-900 text-sm font-mono">{bomTotalCost.toLocaleString()}đ</span>
                              </div>
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-600 font-medium">Giá bán lẻ hiện tại (B)</span>
                                <span className="font-semibold text-slate-700 font-mono">{sellPrice.toLocaleString()}đ</span>
                              </div>
                              <div className="border-t border-slate-100 my-1 pt-1.5 flex justify-between items-center text-xs">
                                <span className="text-slate-600 font-medium">Lợi nhuận gộp dự kiến (B - A)</span>
                                <span className={`font-bold font-mono ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                  {profit.toLocaleString()}đ
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-600 font-medium">Tỷ suất lợi nhuận gộp</span>
                                <span className={`font-bold font-mono ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                  {margin.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mô tả</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none bg-white"
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
                              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2" />
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
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white"
                        placeholder="https://..."
                      />
                      {previewUrl && formData.image_url === previewUrl && (
                        <div className="mt-3 relative w-24 h-24 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                        </div>
                      )}
                    </div>
                  )}
                </div>


              </div>
            </div>
          )
        })()}
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
        variant={actionTarget?.active === 'TRUE' ? "danger" : "default"}
        loading={toggleActiveMutation.isPending}
      />

      <ConfirmDialog
        open={saveConfirmOpen}
        onClose={() => setSaveConfirmOpen(false)}
        onConfirm={() => saveMutation.mutate(formData)}
        title={editingId ? "Xác nhận cập nhật sản phẩm" : "Xác nhận tạo sản phẩm"}
        confirmLabel={editingId ? "Cập nhật" : "Tạo sản phẩm"}
        variant="default"
        loading={saveMutation.isPending}
      >
        {(() => {
          const isVariantParent = formData.product_type === 'variant_parent'
          const hasModifiers = hasModifiersToggle && modifierGroups.length > 0 && !isVariantParent
          const hasBom = formData.has_bom === 'TRUE' && !isVariantParent

          let productTypeLabel = 'Sản phẩm thường (Simple)'
          if (isVariantParent) {
            productTypeLabel = `Nhóm sản phẩm có nhiều phiên bản (${optionName || 'Thuộc tính'} - ${variantRows.length} phiên bản)`
          } else if (hasModifiers) {
            productTypeLabel = 'Sản phẩm kèm nhóm lựa chọn (Modifier)'
          }

          return (
            <div className="space-y-3 text-slate-600 text-sm mt-3">
              <p>Vui lòng kiểm tra lại cấu hình sản phẩm trước khi lưu:</p>
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-2.5 text-xs shadow-inner">
                <div className="flex justify-between items-start gap-4">
                  <span className="font-medium text-slate-500 shrink-0">Tên sản phẩm:</span>
                  <span className="font-bold text-slate-800 text-right">{formData.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-slate-500 shrink-0">Cấu trúc sản phẩm:</span>
                  <span className="font-semibold text-slate-800 text-right">{productTypeLabel}</span>
                </div>

                {!isVariantParent && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                    <div className="rounded-lg bg-white p-2 border border-slate-100/80">
                      <span className="text-[10px] text-slate-400 block">Giá bán</span>
                      <span className="font-bold text-slate-800 text-xs">{Number(formData.sell_price || 0).toLocaleString()}đ</span>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-slate-100/80">
                      <span className="text-[10px] text-slate-400 block">Giá vốn</span>
                      <span className="font-bold text-slate-800 text-xs">{Number(formData.cost_price || 0).toLocaleString()}đ</span>
                    </div>
                  </div>
                )}

                {hasBom && (
                  <div className="border-t border-slate-200/60 pt-2.5 mt-2 bg-primary/5 rounded-lg p-2.5 border border-primary/10">
                    <span className="font-bold text-primary flex items-center gap-1 text-[11px] mb-1">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
                      Định lượng nguyên liệu (BOM): ĐANG BẬT
                    </span>
                    <p className="text-[10px] text-slate-600 leading-tight">
                      Sản phẩm được cấu thành từ <strong className="text-slate-800 font-semibold">{bomItems.length} thành phần/nguyên liệu</strong>. Khi xuất bán sẽ tự động trừ kho nguyên liệu cấu thành.
                    </p>
                  </div>
                )}

                {hasModifiers && (
                  <div className="border-t border-slate-200/60 pt-2.5 mt-2 bg-amber-50/50 rounded-lg p-2.5 border border-amber-100">
                    <span className="font-bold text-amber-700 flex items-center gap-1 text-[11px] mb-1">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
                      Nhóm lựa chọn đi kèm (Modifier): ĐANG BẬT
                    </span>
                    <div className="space-y-1 text-[10px] text-slate-600 max-h-24 overflow-y-auto">
                      {modifierGroups.map((g, idx) => (
                        <div key={g.id} className="bg-white p-1 rounded border border-slate-100">
                          • {g.name} ({g.is_required ? 'Bắt buộc' : 'Tùy chọn'}, {g.max_selection === 1 ? 'Chọn 1' : 'Nhiều'}):{' '}
                          <strong className="text-slate-700">{g.options.map(o => `${o.name} (+${Number(o.price_adj || 0).toLocaleString()}đ)`).join(', ')}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </ConfirmDialog>

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
