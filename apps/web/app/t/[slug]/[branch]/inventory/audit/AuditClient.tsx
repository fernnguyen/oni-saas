'use client'
import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { useRouter, useParams, usePathname } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog'
import { hydrateAll } from '@/lib/localDb/hydration'
import { useDebounce } from 'use-debounce'
import { 
  ArrowLeft, 
  Search, 
  Scan, 
  Printer, 
  Eye, 
  Info, 
  Trash2, 
  Plus, 
  Minus,
  X,
  ChevronDown, 
  ChevronUp, 
  Save,
  Calendar,
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Maximize,
  Minimize
} from 'lucide-react'

interface Props {
  shopId: string
  shopName: string
}

type TabType = 'all' | 'match' | 'discrepancy' | 'unchecked'

interface BatchItem {
  id?: string
  batch_no: string
  expiry_date: string
  system_qty: number
  actual_qty: number
  is_new?: boolean
  is_deleted?: boolean
}

interface AuditItem {
  product_id: string
  name: string
  sku: string
  barcode: string
  unit: string
  cost_price: number
  sell_price: number
  system_qty: number
  actual_qty: number
  has_batches: boolean
  batches: BatchItem[]
  is_checked: boolean
  isLoadingDetails?: boolean
}

function fmtVND(v: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v)
}

function getGMT7Time() {
  const d = new Date()
  d.setUTCHours(d.getUTCHours() + 7)
  return d.toISOString().replace('Z', '')
}

function formatExpiryDate(dateStr: string) {
  if (!dateStr) return '—'
  if (dateStr.includes('/')) return dateStr
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    const [year, month, day] = parts
    return `${day}/${month}/${year}`
  }
  return dateStr
}

export function AuditClient({ shopId, shopName }: Props) {
  const router = useRouter()
  const params = useParams()
  const queryClient = useQueryClient()

  // ── States ─────────────────────────────────────────────────────────────────
  const pathname = usePathname()
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [auditItems, setAuditItems] = useState<AuditItem[]>([])
  
  const [reason, setReason] = useState(`Kiểm kê định kỳ tháng ${new Date().getMonth() + 1}/${new Date().getFullYear()}`)
  const [referenceNo, setReferenceNo] = useState('')
  const [isLoaded, setIsLoaded] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // Load draft on mount / shopId change
  useEffect(() => {
    if (!shopId) return
    const saved = localStorage.getItem(`audit-draft-${shopId}`)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed.items)) setAuditItems(parsed.items)
        if (parsed.warehouseId) setSelectedWarehouseId(parsed.warehouseId)
        if (parsed.reason) setReason(parsed.reason)
        if (parsed.referenceNo) setReferenceNo(parsed.referenceNo)
      } catch (e) {
        console.error('Failed to parse audit draft from localStorage:', e)
      }
    }
    setIsLoaded(true)
  }, [shopId])

  // Save draft on state changes
  useEffect(() => {
    if (!isLoaded || !shopId) return
    const draft = {
      items: auditItems,
      warehouseId: selectedWarehouseId,
      reason,
      referenceNo
    }
    localStorage.setItem(`audit-draft-${shopId}`, JSON.stringify(draft))
  }, [auditItems, selectedWarehouseId, reason, referenceNo, isLoaded, shopId])

  // Clear all list and wipe draft
  const handleClearAll = () => {
    if (auditItems.length === 0) return
    setShowClearConfirm(true)
  }

  const handleConfirmClearAll = () => {
    setShowClearConfirm(false)
    setAuditItems([])
    setReason(`Kiểm kê định kỳ tháng ${new Date().getMonth() + 1}/${new Date().getFullYear()}`)
    setReferenceNo('')
    localStorage.removeItem(`audit-draft-${shopId}`)
    toast.success('Đã xóa sạch phiếu kiểm, bạn có thể bắt đầu lại.')
  }
  
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set())
  const [newBatchForms, setNewBatchForms] = useState<Record<string, { batch_no: string; expiry_date: string; actual_qty: string }>>({})

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Quick Product Creation states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newProductForm, setNewProductForm] = useState({
    name: '',
    sku: '',
    unit: 'Cái',
    cost_price: '0',
    sell_price: '0',
    barcode: '',
  })
  const [creatingProduct, setCreatingProduct] = useState(false)

  const [focusedIndex, setFocusedIndex] = useState(0)

  const searchContainerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ── Fetch Warehouses ───────────────────────────────────────────────────────
  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/warehouses?limit=100`)
      if (!res.ok) return { data: [] as any[] }
      return res.json() as Promise<{ data: any[] }>
    },
  })

  // Set default warehouse (code 'sale') once draft is loaded
  useEffect(() => {
    if (isLoaded && warehousesData?.data && warehousesData.data.length > 0 && !selectedWarehouseId) {
      const saleWh = warehousesData.data.find((w: any) => w.code === 'sale') || warehousesData.data[0]
      if (saleWh) {
        setSelectedWarehouseId(saleWh.id || saleWh.warehouse_id)
      }
    }
  }, [isLoaded, warehousesData, selectedWarehouseId])

  // Reset selectedWarehouseId when shop changes
  useEffect(() => {
    setSelectedWarehouseId('')
  }, [shopId])

  // Fetch all products once for instantaneous local search (matching stock movements speed)
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products-all', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/products?limit=5000`)
      if (!res.ok) return { data: [] as any[] }
      const json = await res.json() as { data: any[] }
      return {
        data: json.data.map(p => {
          let displayName = p.name
          if (p.product_type === 'variant_child' && p.variant_options) {
            try {
              const opts = JSON.parse(p.variant_options)
              const vals = Object.values(opts).join(' / ')
              if (vals) displayName = `${p.name} (${vals})`
            } catch { }
          }
          return { ...p, displayName }
        })
      }
    },
  })

  // Compute search results instantaneously on client side
  const searchResults = useMemo(() => {
    const list = productsData?.data || []
    const q = searchQuery.trim().toLowerCase()
    
    if (!q) {
      // Focus displays 10 newest products (newest is usually first in array)
      return list.slice(0, 10)
    }
    
    return list.filter((p: any) => {
      return (
        p.name.toLowerCase().includes(q) ||
        p.displayName?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q)
      )
    }).slice(0, 15) // Limit to 15 search results
  }, [productsData, searchQuery])

  // Reset focusedIndex when search results change
  useEffect(() => {
    setFocusedIndex(0)
  }, [searchResults])

  // Handle Fullscreen events and browser fullscreen change
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(err => toast.error(`Không thể bật toàn màn hình: ${err.message}`))
    } else {
      document.exitFullscreen()
        .then(() => setIsFullscreen(false))
    }
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // Quick product creation submit handler
  const handleCreateProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProductForm.name.trim()) {
      toast.error('Vui lòng nhập tên sản phẩm')
      return
    }
    setCreatingProduct(true)
    try {
      const payload = {
        name: newProductForm.name.trim(),
        sku: newProductForm.sku.trim(),
        unit: newProductForm.unit.trim() || 'Cái',
        cost_price: String(newProductForm.cost_price || '0'),
        sell_price: String(newProductForm.sell_price || '0'),
        barcode: newProductForm.barcode.trim(),
        product_type: 'simple',
        stock_track: 'TRUE',
        active: 'TRUE'
      }

      const res = await fetch(`/api/shops/${shopId}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || 'Không thể tạo sản phẩm mới')
      }

      toast.success(`Đã tạo sản phẩm "${json.name}" thành công!`)

      // Refetch all products in background
      queryClient.invalidateQueries({ queryKey: ['products-all', shopId] })

      // Automatically add it to the audit list
      const newAuditItem: AuditItem = {
        product_id: json.id || json.product_id,
        name: json.name,
        sku: json.sku || '',
        barcode: json.barcode || '',
        unit: json.unit || 'Cái',
        cost_price: Number(json.cost_price || 0),
        sell_price: Number(json.sell_price || 0),
        system_qty: 0,
        actual_qty: 0, // Default actual qty to 0 for newly created products
        has_batches: false,
        batches: [],
        is_checked: true,
      }

      setAuditItems(prev => [newAuditItem, ...prev])
      setSearchQuery('')
      setShowSearchDropdown(false)
      setShowCreateModal(false)
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi tạo sản phẩm')
    } finally {
      setCreatingProduct(false)
    }
  }

  // Close dropdown on click outside
  useEffect(() => {
    function clickOut(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false)
      }
    }
    document.addEventListener('mousedown', clickOut)
    return () => document.removeEventListener('mousedown', clickOut)
  }, [])

  // ── Handlers ───────────────────────────────────────────────────────────────
  
  // Toggle batch sub-row expansion
  const toggleExpand = (productId: string) => {
    setExpandedProductIds(prev => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  // Add product to the audit items list with 0ms instant updates
  const handleAddProduct = (product: any) => {
    const pId = product.product_id || product.id
    
    // Check duplicate
    const exists = auditItems.find(item => item.product_id === pId)
    if (exists) {
      toast.error(`Sản phẩm "${product.displayName || product.name}" đã có trong danh sách kiểm kho.`)
      if (exists.has_batches) {
        toggleExpand(pId)
      }
      setSearchQuery('')
      setShowSearchDropdown(false)
      return
    }

    // Instantly add placeholder product to state (0ms latency response)
    const newAuditItem: AuditItem = {
      product_id: pId,
      name: product.displayName || product.name,
      sku: product.sku || '',
      barcode: product.barcode || '',
      unit: product.unit || 'Cái',
      cost_price: Number(product.cost_price || 0),
      sell_price: Number(product.sell_price || 0),
      system_qty: 0,
      actual_qty: 0, // Default to 0 while loading
      has_batches: false,
      batches: [],
      is_checked: true,
      isLoadingDetails: true, // Mark visual loading spinner
    }

    setAuditItems(prev => [newAuditItem, ...prev])
    setSearchQuery('')
    setShowSearchDropdown(false)

    // Trigger async background queries for batches & system stock level
    Promise.all([
      fetch(`/api/shops/${shopId}/inventory-batches?product_id=${pId}&limit=100`)
        .then(res => res.ok ? res.json() as Promise<{ data: any[] }> : { data: [] }),
      fetch(`/api/shops/${shopId}/inventory?product_id=${pId}&warehouse_id=${selectedWarehouseId}`)
        .then(res => res.ok ? res.json() as Promise<{ data: any[] }> : { data: [] })
    ]).then(([batchesData, invData]) => {
      const systemStockQty = invData.data?.length > 0 ? Number(invData.data[0].stock_qty || 0) : 0

      const productBatches: BatchItem[] = (batchesData.data || [])
        .filter(b => b.batch_no?.toUpperCase() !== 'DEFAULT')
        .map(b => ({
          id: b.id || b.batch_id,
          batch_no: b.batch_no,
          expiry_date: b.expiry_date ? b.expiry_date.split('T')[0] : '',
          system_qty: Number(b.stock_qty || 0),
          actual_qty: Number(b.stock_qty || 0), // Default actual stock to system stock
        }))

      const sumOfBatchQty = productBatches.reduce((acc, b) => acc + b.system_qty, 0)
      const hasBatches = productBatches.length > 0

      // Healing mechanism: if overall system stock is greater than the sum of batches, group the difference in DEFAULT
      if (hasBatches && systemStockQty > sumOfBatchQty) {
        const orphanQty = systemStockQty - sumOfBatchQty
        productBatches.push({
          id: `virtual-default-${pId}`,
          batch_no: 'DEFAULT',
          expiry_date: '',
          system_qty: orphanQty,
          actual_qty: orphanQty,
        })
      }

      setAuditItems(prev => prev.map(item => {
        if (item.product_id === pId) {
          return {
            ...item,
            system_qty: systemStockQty,
            actual_qty: hasBatches ? productBatches.reduce((acc, b) => acc + b.actual_qty, 0) : systemStockQty, // Defaults actual stock to system stock
            has_batches: hasBatches,
            batches: productBatches,
            isLoadingDetails: false
          }
        }
        return item
      }))

      if (hasBatches) {
        setExpandedProductIds(prev => new Set(prev).add(pId))
      }

      toast.success(`Đã đồng bộ tồn kho "${newAuditItem.name}"`)
    }).catch(err => {
      console.error('Error fetching product stock in background:', err)
      setAuditItems(prev => prev.map(item => {
        if (item.product_id === pId) {
          return {
            ...item,
            isLoadingDetails: false
          }
        }
        return item
      }))
      toast.error(`Không thể tải thông tin tồn kho đầy đủ cho "${newAuditItem.name}"`)
    })
  }

  // Remove product from audit list
  const handleRemoveProduct = (productId: string) => {
    setAuditItems(prev => prev.filter(item => item.product_id !== productId))
    setExpandedProductIds(prev => {
      const next = new Set(prev)
      next.delete(productId)
      return next
    })
  }

  // Update actual stock for non-batch products
  const handleUpdateProductActual = (productId: string, val: string) => {
    const qty = parseFloat(val)
    setAuditItems(prev => prev.map(item => {
      if (item.product_id === productId) {
        return {
          ...item,
          actual_qty: isNaN(qty) ? 0 : qty,
          is_checked: true
        }
      }
      return item
    }))
  }

  // Update actual stock for batch items
  const handleUpdateBatchActual = (productId: string, batchNo: string, val: string) => {
    const qty = parseFloat(val)
    setAuditItems(prev => prev.map(item => {
      if (item.product_id === productId) {
        const updatedBatches = item.batches.map(b => {
          if (b.batch_no === batchNo) {
            return { ...b, actual_qty: isNaN(qty) ? 0 : qty, is_deleted: false }
          }
          return b
        })
        return {
          ...item,
          batches: updatedBatches,
          actual_qty: updatedBatches.reduce((acc, b) => acc + (b.is_deleted ? 0 : b.actual_qty), 0),
          is_checked: true
        }
      }
      return item
    }))
  }

  // Delete a batch (mark as deleted)
  const handleDeleteBatch = (productId: string, batchNo: string) => {
    setAuditItems(prev => prev.map(item => {
      if (item.product_id === productId) {
        const updatedBatches = item.batches.map(b => {
          if (b.batch_no === batchNo) {
            return { ...b, is_deleted: true, actual_qty: 0 }
          }
          return b
        })
        return {
          ...item,
          batches: updatedBatches,
          actual_qty: updatedBatches.reduce((acc, b) => acc + (b.is_deleted ? 0 : b.actual_qty), 0),
          is_checked: true
        }
      }
      return item
    }))
    toast.success(`Đã đánh dấu xóa lô "${batchNo}"`)
  }

  // Restore a deleted batch
  const handleRestoreBatch = (productId: string, batchNo: string) => {
    setAuditItems(prev => prev.map(item => {
      if (item.product_id === productId) {
        const updatedBatches = item.batches.map(b => {
          if (b.batch_no === batchNo) {
            return { ...b, is_deleted: false, actual_qty: b.system_qty }
          }
          return b
        })
        return {
          ...item,
          batches: updatedBatches,
          actual_qty: updatedBatches.reduce((acc, b) => acc + (b.is_deleted ? 0 : b.actual_qty), 0),
          is_checked: true
        }
      }
      return item
    }))
    toast.success(`Đã khôi phục lô "${batchNo}"`)
  }

  // Inline handle adding a new batch
  const handleAddInlineBatch = (productId: string) => {
    const form = newBatchForms[productId]
    if (!form || !form.batch_no.trim()) {
      toast.error('Vui lòng nhập Số lô')
      return
    }
    const qty = parseFloat(form.actual_qty)
    if (isNaN(qty) || qty < 0) {
      toast.error('Số lượng tồn thực tế không hợp lệ')
      return
    }

    setAuditItems(prev => prev.map(item => {
      if (item.product_id === productId) {
        // Prevent duplicate batch nos
        const exists = item.batches.some(b => b.batch_no.toLowerCase().trim() === form.batch_no.toLowerCase().trim())
        if (exists) {
          toast.error(`Số lô "${form.batch_no}" đã có sẵn cho sản phẩm này!`)
          return item
        }

        const newBatch: BatchItem = {
          batch_no: form.batch_no.trim(),
          expiry_date: form.expiry_date || new Date().toISOString().split('T')[0],
          system_qty: 0, // New batch means 0 on system
          actual_qty: qty,
          is_new: true,
        }

        const updatedBatches = [...item.batches, newBatch]
        return {
          ...item,
          has_batches: true,
          batches: updatedBatches,
          actual_qty: updatedBatches.reduce((acc, b) => acc + (b.is_deleted ? 0 : b.actual_qty), 0),
          is_checked: true
        }
      }
      return item
    }))

    // Reset inline form
    setNewBatchForms(prev => ({
      ...prev,
      [productId]: { batch_no: '', expiry_date: '', actual_qty: '0' }
    }))
    toast.success(`Đã thêm mới lô "${form.batch_no}" vào bảng kê`)
  }

  // Batch inline form values handler
  const handleUpdateBatchForm = (productId: string, field: string, val: string) => {
    setNewBatchForms(prev => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || { batch_no: '', expiry_date: '', actual_qty: '0' }),
        [field]: val
      }
    }))
  }

  // Expiry date color coder
  const getExpiryBadgeColor = (dateStr: string) => {
    if (!dateStr) return 'text-slate-400 bg-slate-50 border-slate-100'
    const today = new Date()
    const expDate = new Date(dateStr)
    const diffTime = expDate.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays <= 0) {
      return 'text-red-700 bg-red-50 border-red-200 font-medium'
    } else if (diffDays <= 90) { // < 3 months
      return 'text-amber-700 bg-amber-50 border-amber-200 font-medium'
    } else {
      return 'text-emerald-700 bg-emerald-50 border-emerald-200 font-medium'
    }
  }

  // ── State Tabs Filtering ──────────────────────────────────────────────────
  const filteredAuditItems = useMemo(() => {
    return auditItems.filter(item => {
      const diff = item.actual_qty - item.system_qty
      if (activeTab === 'match') return diff === 0
      if (activeTab === 'discrepancy') return diff !== 0
      if (activeTab === 'unchecked') return !item.is_checked
      return true
    })
  }, [auditItems, activeTab])

  // Sum statistics
  const stats = useMemo(() => {
    let totalSystem = 0
    let totalActual = 0
    let totalDiscrepancyVal = 0

    auditItems.forEach(item => {
      totalSystem += item.system_qty
      totalActual += item.actual_qty
      const diff = item.actual_qty - item.system_qty
      totalDiscrepancyVal += diff * item.cost_price
    })

    return {
      totalSystem,
      totalActual,
      totalDiscrepancyVal
    }
  }, [auditItems])

  const submitDialogDescription = useMemo(() => {
    const hasChanges = auditItems.some(item => {
      if (item.has_batches) {
        return item.batches.some(b => {
          if (b.is_new && b.is_deleted) return false
          const actualQty = b.is_deleted ? 0 : b.actual_qty
          return actualQty - b.system_qty !== 0 || b.is_new
        })
      }
      return item.actual_qty - item.system_qty !== 0
    })

    return hasChanges
      ? `Bạn có chắc chắn muốn hoàn tất phiếu kiểm kho này? Hệ thống sẽ tự động cân đối tồn kho với giá trị chênh lệch dự kiến là ${fmtVND(stats.totalDiscrepancyVal)}.`
      : 'Tất cả số lượng thực tế khớp hoàn toàn với hệ thống (không lệch). Bạn vẫn muốn hoàn tất và lưu phiếu kho này chứ?'
  }, [auditItems, stats.totalDiscrepancyVal])

  // ── Mutation: Save Audit ───────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`/api/shops/${shopId}/inventory/adjust-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || 'Kiểm kho hàng loạt thất bại')
      }
      return json
    },
    onSuccess: () => {
      toast.success('Lưu phiếu kiểm kho thành công!')
      hydrateAll(shopId, shopId).catch((err) => {
        console.error('Lỗi khi đồng bộ IndexedDB:', err)
      })
      queryClient.invalidateQueries({ queryKey: ['inventory', shopId] })
      queryClient.invalidateQueries({ queryKey: ['products-all', shopId] })
      queryClient.invalidateQueries({ queryKey: ['stock-movements', shopId] })
      localStorage.removeItem(`audit-draft-${shopId}`)
      router.push(pathname.replace('/audit', ''))
    },
    onError: (err: Error) => {
      toast.error(err.message)
    }
  })

  // Submit complete audit list
  const handleSubmitAudit = async () => {
    if (auditItems.length === 0) {
      toast.error('Vui lòng thêm ít nhất 1 sản phẩm để kiểm kho')
      return
    }
    if (!selectedWarehouseId) {
      toast.error('Vui lòng chọn Kho thực hiện')
      return
    }

    setShowSubmitConfirm(true)
  }

  const handleConfirmSubmitAudit = () => {
    setShowSubmitConfirm(false)
    const payloadItems: any[] = []

    auditItems.forEach(item => {
      if (item.has_batches) {
        // Submit batch level adjustments
        item.batches.forEach(b => {
          if (b.is_new && b.is_deleted) return // Skip new batches that were deleted
          
          const actualQty = b.is_deleted ? 0 : b.actual_qty
          const delta = actualQty - b.system_qty
          if (delta !== 0 || (b.is_new && !b.is_deleted)) {
            payloadItems.push({
              product_id: item.product_id,
              qty: String(delta),
              unit_cost: String(item.cost_price),
              batch_no: b.batch_no,
              expiry_date: b.expiry_date
            })
          }
        })
      } else {
        // Standard item adjustment without batch
        const delta = item.actual_qty - item.system_qty
        if (delta !== 0) {
          payloadItems.push({
            product_id: item.product_id,
            qty: String(delta),
            unit_cost: String(item.cost_price),
          })
        }
      }
    })

    const payload = {
      branch_id: shopId,
      warehouse_id: selectedWarehouseId,
      reason: reason || 'Kiểm kho định kỳ',
      reference_no: referenceNo.trim(),
      items: payloadItems
    }

    mutation.mutate(payload)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 max-w-[1600px] mx-auto min-h-screen pb-20">
      
      {/* ── HEADER TOOLBAR ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.push(pathname.replace('/audit', ''))}
            className="p-2 hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-500 hover:text-slate-800 transition-all flex items-center justify-center cursor-pointer shadow-xs active:scale-95"
            title="Quay lại danh sách kho"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-1.5 leading-none">
              <ClipboardList className="w-5 h-5 text-primary" />
              Phiếu kiểm kho
            </h1>
            <p className="text-xs text-slate-400 font-medium mt-0.5">{shopName} · Tạo phiếu cân đối</p>
          </div>
        </div>

        {/* Barcode Search Center Area */}
        <div ref={searchContainerRef} className="relative flex-1 max-w-xl mx-auto w-full">
          <div className="relative group">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
            </span>
            <input
              ref={searchInputRef}
              type="search"
              name="audit-search-query"
              id="audit-search-query"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              data-1password-ignore="true"
              data-lpignore="true"
              data-bwignore="true"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setShowSearchDropdown(true)
              }}
              onFocus={() => setShowSearchDropdown(true)}
              onKeyDown={(e) => {
                if (!showSearchDropdown || searchResults.length === 0) return

                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setFocusedIndex(prev => (prev + 1) % searchResults.length)
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setFocusedIndex(prev => (prev - 1 + searchResults.length) % searchResults.length)
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  if (focusedIndex >= 0 && focusedIndex < searchResults.length) {
                    handleAddProduct(searchResults[focusedIndex])
                  }
                } else if (e.key === 'Escape') {
                  setShowSearchDropdown(false)
                }
              }}
              placeholder="Nhập tên sản phẩm, SKU hoặc quét mã vạch (Barcode)..."
              className="w-full pl-9 pr-24 py-2 border border-slate-200 rounded-xl bg-slate-50/50 hover:bg-white focus:bg-white text-sm focus:border-primary focus:outline-none transition-all shadow-inner font-semibold text-slate-700"
            />
            <div className="absolute inset-y-1.5 right-1.5 flex items-center gap-1">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 shrink-0">
                <Scan className="w-3 h-3" /> F4 Quét
              </span>
            </div>
          </div>

          {/* Autocomplete Dropdown Search Results */}
          {showSearchDropdown && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-80 overflow-y-auto divide-y divide-slate-100 overflow-hidden">
              {productsLoading ? (
                <div className="p-3 text-center text-xs text-slate-400 font-medium animate-pulse">Đang tải sản phẩm...</div>
              ) : searchResults.length > 0 ? (
                <>
                  {searchResults.map((product, idx) => (
                    <button
                      key={product.product_id || product.id}
                      onClick={() => handleAddProduct(product)}
                      className={`flex w-full items-center justify-between p-3 text-left hover:bg-slate-50 transition-colors text-xs font-medium ${idx === focusedIndex ? 'bg-amber-50/70 text-amber-900 border-l-2 border-amber-500' : 'text-slate-700'}`}
                    >
                      <div className="truncate flex-1 pr-4">
                        <span className="text-slate-800 font-medium block truncate">{product.displayName || product.name}</span>
                        {product.sku && <span className="text-[10px] text-slate-400 font-mono block mt-0.5">SKU: {product.sku}</span>}
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-2">
                        {idx === focusedIndex && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500 text-white animate-pulse">
                            ↵ Enter
                          </span>
                        )}
                        <div>
                          <span className="text-slate-800 font-semibold block">{fmtVND(Number(product.sell_price || 0))}</span>
                          <span className="text-[10px] text-slate-400 font-mono block mt-0.5">ĐVT: {product.unit || 'Cái'}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                  
                  {searchQuery.trim() && (
                    <div className="p-2 bg-slate-50 border-t border-slate-150 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setNewProductForm({
                            name: searchQuery.trim(),
                            sku: '',
                            unit: 'Cái',
                            cost_price: '0',
                            sell_price: '0',
                            barcode: '',
                          })
                          setShowCreateModal(true)
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-50 cursor-pointer shadow-xs active:scale-95 transition-all"
                      >
                        <Plus className="w-3 h-3 text-primary" /> Tạo sản phẩm mới: "{searchQuery}"
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-4 text-center">
                  <p className="text-xs text-slate-400 font-medium mb-2">Không tìm thấy sản phẩm trùng khớp</p>
                  <button
                    type="button"
                    onClick={() => {
                      setNewProductForm({
                        name: searchQuery.trim(),
                        sku: '',
                        unit: 'Cái',
                        cost_price: '0',
                        sell_price: '0',
                        barcode: '',
                      })
                      setShowCreateModal(true)
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary hover:bg-primary-dark text-white shadow-xs cursor-pointer active:scale-95 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tạo sản phẩm mới
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right side utility icons */}
        <div className="flex items-center gap-1.5">
          <button 
            onClick={() => window.print()}
            className="p-2 hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer shadow-xs active:scale-95" 
            title="In phiếu kiểm"
          >
            <Printer className="w-4 h-4" />
          </button>
          <button 
            onClick={toggleFullscreen}
            className="p-2 hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer shadow-xs active:scale-95" 
            title={isFullscreen ? "Thu nhỏ" : "Toàn màn hình"}
          >
            {isFullscreen ? <Minimize className="w-4 h-4 text-primary font-bold" /> : <Maximize className="w-4 h-4" />}
          </button>
          <button 
            onClick={() => toast.info('Hướng dẫn kiểm kho: \n1. Dùng thanh tìm kiếm hoặc quét barcode để thêm sản phẩm vào bảng.\n2. Bấm các nút tròn (+) hoặc (-) màu vàng nhạt hoặc click vào ô để nhập trực tiếp số lượng kiểm thực tế.\n3. Đối với mặt hàng có Quản lý lô/HSD, bấm nút mũi tên cạnh tên hàng để mở rộng và nhập tồn thực tế cho từng Lô.\n4. Chọn Kho thực hiện ở cột phải và bấm "Hoàn tất kiểm kho" để cân đối tồn kho.', { duration: 10000 })}
            className="p-2 hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer shadow-xs active:scale-95" 
            title="Hướng dẫn sử dụng"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── TWO-COLUMN CONTENT GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
        
        {/* Left Side: Audit items list (Spans 3 cols) */}
        <div className="lg:col-span-3 space-y-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs min-h-[500px] flex flex-col justify-between">
          
          <div className="space-y-4">
            {/* Status tabs and filter controls */}
            <div className="border-b border-slate-100 flex items-center justify-between pb-1.5 flex-wrap gap-2">
              <nav className="-mb-px flex space-x-5">
                {[
                  { key: 'all', label: `Tất cả (${auditItems.length})` },
                  { key: 'match', label: `Khớp (${auditItems.filter(i => i.actual_qty - i.system_qty === 0).length})` },
                  { key: 'discrepancy', label: `Lệch (${auditItems.filter(i => i.actual_qty - i.system_qty !== 0).length})` },
                  { key: 'unchecked', label: `Chưa kiểm (${auditItems.filter(i => !i.is_checked).length})` },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as TabType)}
                    className={`whitespace-nowrap pb-2 px-1 border-b-2 font-semibold text-xs transition-all cursor-pointer select-none ${
                      activeTab === tab.key
                        ? 'border-primary text-primary font-medium'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
              
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                F4: Quét / F9: Lưu
              </span>
            </div>

            {/* List Table */}
            <div className="overflow-x-auto select-none">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="w-8 px-2 py-2.5 text-center"></th>
                    <th className="w-10 px-2 py-2.5 text-center">STT</th>
                    <th className="px-3 py-2.5">Sản phẩm</th>
                    <th className="w-20 px-3 py-2.5">ĐVT</th>
                    <th className="w-24 px-3 py-2.5 text-right">Tồn kho</th>
                    <th className="w-36 px-3 py-2.5 text-center">Thực tế</th>
                    <th className="w-24 px-3 py-2.5 text-right">SL lệch</th>
                    <th className="w-32 px-3 py-2.5 text-right">Giá trị lệch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
                  {filteredAuditItems.length > 0 ? (
                    filteredAuditItems.map((item, idx) => {
                      const isExpanded = expandedProductIds.has(item.product_id)
                      const discrepancy = item.actual_qty - item.system_qty
                      const discrepancyVal = discrepancy * item.cost_price

                      return (
                        <Fragment key={item.product_id}>
                          {/* Parent row for Product */}
                          <tr className="hover:bg-slate-50/40 transition-colors group">
                            {/* Delete Button */}
                            <td className="px-2 py-3 text-center align-middle">
                              <button
                                onClick={() => handleRemoveProduct(item.product_id)}
                                className="text-slate-300 hover:text-red-500 transition-colors flex items-center justify-center p-1.5 rounded-full cursor-pointer hover:bg-red-50"
                                title="Xóa sản phẩm"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </td>
                            
                            {/* STT */}
                            <td className="px-2 py-3 text-center align-middle text-slate-400 font-mono">{idx + 1}</td>
                            
                            {/* Product Name & SKU */}
                            <td className="px-3 py-3 align-middle">
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-medium text-slate-800 text-xs block">{item.name}</span>
                                  {item.isLoadingDetails && (
                                    <span className="inline-flex items-center rounded bg-amber-50 px-1 py-0.2 text-[8px] font-semibold text-amber-700 border border-amber-200 animate-pulse select-none">
                                      Đang tải tồn...
                                    </span>
                                  )}
                                  {item.has_batches && (
                                    <button
                                      onClick={() => toggleExpand(item.product_id)}
                                      className="p-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all flex items-center justify-center cursor-pointer shadow-xs active:scale-90"
                                    >
                                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </button>
                                  )}
                                </div>
                                {item.sku && (
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    {item.sku}
                                  </span>
                                )}
                              </div>
                            </td>
                            
                            {/* Unit */}
                            <td className="px-3 py-3 text-slate-500">{item.unit}</td>
                            
                            {/* System Stock */}
                            <td className="px-3 py-3 text-right text-slate-600 text-sm">
                              {item.system_qty.toLocaleString()}
                            </td>
                            
                            {/* Actual Stock Numeric Input */}
                            <td className="px-3 py-3 text-center align-middle">
                              {item.has_batches ? (
                                <span className="text-[11px] text-slate-400 font-medium block bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/50 max-w-[100px] mx-auto select-none">
                                  {item.actual_qty.toLocaleString()}
                                </span>
                              ) : (
                                <div className="flex items-center justify-center gap-1.5 max-w-[120px] mx-auto">
                                  <button 
                                    onClick={() => handleUpdateProductActual(item.product_id, String(Math.max(0, item.actual_qty - 1)))}
                                    className="w-6 h-6 flex items-center justify-center rounded-full bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200 cursor-pointer select-none transition-all active:scale-90"
                                    title="Giảm 1"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <input
                                    type="number"
                                    value={item.actual_qty}
                                    onChange={(e) => handleUpdateProductActual(item.product_id, e.target.value)}
                                    className="w-12 text-center rounded-lg border border-slate-200 py-0.5 text-xs focus:border-primary focus:outline-none font-medium text-slate-800 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    style={{ appearance: 'textfield', WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                                  />
                                  <button 
                                    onClick={() => handleUpdateProductActual(item.product_id, String(item.actual_qty + 1))}
                                    className="w-6 h-6 flex items-center justify-center rounded-full bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200 cursor-pointer select-none transition-all active:scale-90"
                                    title="Tăng 1"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </td>
                            
                            {/* Discrepancy quantity */}
                            <td className={`px-3 py-3 text-right text-sm ${discrepancy === 0 ? 'text-slate-400' : discrepancy > 0 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}`}>
                              {discrepancy === 0 ? '0' : discrepancy > 0 ? `+${discrepancy.toLocaleString()}` : discrepancy.toLocaleString()}
                            </td>
                            
                            {/* Discrepancy value */}
                            <td className={`px-3 py-3 text-right ${discrepancyVal === 0 ? 'text-slate-400' : discrepancyVal > 0 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}`}>
                              {discrepancyVal === 0 ? '—' : discrepancyVal > 0 ? `+${fmtVND(discrepancyVal)}` : fmtVND(discrepancyVal)}
                            </td>
                          </tr>

                          {/* Expanded sub-rows for product batches */}
                          {item.has_batches && isExpanded && (
                            <tr className="bg-slate-50/70 select-none">
                              <td colSpan={8} className="px-6 py-2.5 border-t border-b border-slate-200/50">
                                <div className="rounded-xl border border-slate-200/70 overflow-hidden shadow-inner bg-white w-full">
                                  <table className="w-full text-left text-xs">
                                    <thead>
                                      <tr className="bg-slate-50 text-slate-400 font-semibold uppercase tracking-wider text-[9px] border-b border-slate-200">
                                        <th className="px-3 py-2 w-32">Số lô</th>
                                        <th className="px-3 py-2 w-28 text-center">Hạn sử dụng (HSD)</th>
                                        <th className="px-3 py-2 text-right w-24">Tồn kho</th>
                                        <th className="px-3 py-2 text-center w-36">Thực tế</th>
                                        <th className="px-3 py-2 text-right w-24">SL lệch</th>
                                        <th className="px-3 py-2 text-right w-28">Giá trị lệch</th>
                                        <th className="px-3 py-2 text-center w-24">Hành động</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
                                      {item.batches.map((b, idx) => {
                                        const actualQty = b.is_deleted ? 0 : b.actual_qty
                                        const bDiff = actualQty - b.system_qty
                                        const bDiffVal = bDiff * item.cost_price

                                        return (
                                          <tr 
                                            key={`${b.batch_no}_${idx}`} 
                                            className={`transition-colors ${b.is_deleted ? 'bg-red-50/85 text-red-700 line-through decoration-red-300' : 'hover:bg-slate-50/50'}`}
                                          >
                                            {/* Batch No */}
                                            <td className="px-3 py-2 font-medium text-slate-800 text-[11px] truncate flex items-center gap-1 mt-0.5">
                                              📦 {b.batch_no}
                                              {b.is_new && (
                                                <span className="inline-flex items-center rounded bg-emerald-50 px-1 py-0.2 text-[8px] font-semibold text-emerald-700 border border-emerald-200">
                                                  Mới
                                                </span>
                                              )}
                                            </td>
                                            
                                            {/* Expiry date */}
                                            <td className="px-3 py-2 text-center align-middle">
                                              <span className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-mono leading-none ${getExpiryBadgeColor(b.expiry_date)}`}>
                                                {formatExpiryDate(b.expiry_date)}
                                              </span>
                                            </td>
                                            
                                            {/* Batch System Stock */}
                                            <td className="px-3 py-2 text-right text-slate-500">
                                              {b.system_qty.toLocaleString()}
                                            </td>
                                            
                                            {/* Batch Actual Stock input */}
                                            <td className="px-3 py-2 text-center align-middle">
                                              {b.is_deleted ? (
                                                <span className="text-[11px] text-red-600 font-semibold bg-red-100/50 px-2 py-0.5 rounded-lg border border-red-200/50 select-none">
                                                  0 (Đã xóa)
                                                </span>
                                              ) : (
                                                <div className="flex items-center justify-center gap-1.5 max-w-[100px] mx-auto">
                                                  <button
                                                    onClick={() => handleUpdateBatchActual(item.product_id, b.batch_no, String(Math.max(0, b.actual_qty - 1)))}
                                                    className="w-6 h-6 flex items-center justify-center rounded-full bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200 cursor-pointer select-none transition-all active:scale-90"
                                                    title="Giảm 1"
                                                  >
                                                    <Minus className="w-3 h-3" />
                                                  </button>
                                                  <input
                                                    type="number"
                                                    value={b.actual_qty}
                                                    onChange={(e) => handleUpdateBatchActual(item.product_id, b.batch_no, e.target.value)}
                                                    className="w-10 text-center rounded-lg border border-slate-200 py-0.5 text-xs focus:border-primary focus:outline-none font-medium text-slate-800 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    style={{ appearance: 'textfield', WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                                                  />
                                                  <button
                                                    onClick={() => handleUpdateBatchActual(item.product_id, b.batch_no, String(b.actual_qty + 1))}
                                                    className="w-6 h-6 flex items-center justify-center rounded-full bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200 cursor-pointer select-none transition-all active:scale-90"
                                                    title="Tăng 1"
                                                  >
                                                    <Plus className="w-3 h-3" />
                                                  </button>
                                                </div>
                                              )}
                                            </td>
                                            
                                            {/* Batch discrepancy */}
                                            <td className={`px-3 py-2 text-right ${bDiff === 0 ? 'text-slate-400' : bDiff > 0 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}`}>
                                              {bDiff === 0 ? '0' : bDiff > 0 ? `+${bDiff.toLocaleString()}` : bDiff.toLocaleString()}
                                            </td>
                                            
                                            {/* Batch discrepancy val */}
                                            <td className={`px-3 py-2 text-right text-[11px] ${bDiffVal === 0 ? 'text-slate-400' : bDiffVal > 0 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}`}>
                                              {bDiffVal === 0 ? '—' : bDiffVal > 0 ? `+${fmtVND(bDiffVal)}` : fmtVND(bDiffVal)}
                                            </td>

                                            {/* Action button */}
                                            <td className="px-3 py-2 text-center align-middle">
                                              {b.is_deleted ? (
                                                <button
                                                  type="button"
                                                  onClick={() => handleRestoreBatch(item.product_id, b.batch_no)}
                                                  className="text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 font-semibold text-[10px] px-2 py-0.5 border border-emerald-250 rounded transition-all cursor-pointer shadow-xs active:scale-95"
                                                  title="Khôi phục lô"
                                                >
                                                  Khôi phục
                                                </button>
                                              ) : (
                                                <button
                                                  type="button"
                                                  onClick={() => handleDeleteBatch(item.product_id, b.batch_no)}
                                                  className="text-slate-400 hover:text-red-500 transition-colors flex items-center justify-center p-1 rounded-full cursor-pointer hover:bg-red-50 mx-auto"
                                                  title="Xóa lô"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              )}
                                            </td>
                                          </tr>
                                        )
                                      })}

                                      {/* Inline Add Batch Form */}
                                      <tr className="bg-blue-50/20">
                                        {/* New Batch No input */}
                                        <td className="px-3 py-2">
                                          <input
                                            type="text"
                                            value={newBatchForms[item.product_id]?.batch_no || ''}
                                            onChange={(e) => handleUpdateBatchForm(item.product_id, 'batch_no', e.target.value)}
                                            placeholder="Số lô mới..."
                                            className="w-full px-2 py-1 rounded border border-slate-200 text-[10px] focus:outline-none focus:border-primary font-medium text-slate-800 bg-white"
                                          />
                                        </td>
                                        
                                        {/* New Batch Expiry date input */}
                                        <td className="px-3 py-2 text-center align-middle">
                                          <input
                                            type="date"
                                            value={newBatchForms[item.product_id]?.expiry_date || ''}
                                            onChange={(e) => handleUpdateBatchForm(item.product_id, 'expiry_date', e.target.value)}
                                            onClick={(e) => {
                                              try { e.currentTarget.showPicker() } catch (err) {}
                                            }}
                                            className="px-2 py-0.5 rounded border border-slate-200 text-[10px] focus:outline-none focus:border-primary font-medium text-slate-700 bg-white"
                                          />
                                        </td>
                                        
                                        {/* Empty / 0 System stock */}
                                        <td className="px-3 py-2 text-right text-[10px] text-slate-400">0 (Hệ thống)</td>
                                        
                                        {/* New Batch Actual Qty input */}
                                        <td className="px-3 py-2 text-center align-middle">
                                          <input
                                            type="number"
                                            value={newBatchForms[item.product_id]?.actual_qty || '0'}
                                            onChange={(e) => handleUpdateBatchForm(item.product_id, 'actual_qty', e.target.value)}
                                            className="w-16 text-center rounded border border-slate-200 py-0.5 text-[10px] focus:outline-none focus:border-primary font-medium text-slate-800 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            style={{ appearance: 'textfield', WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                                          />
                                        </td>
                                        
                                        {/* Add action button */}
                                        <td colSpan={3} className="px-3 py-2 text-center align-middle">
                                          <button
                                            type="button"
                                            onClick={() => handleAddInlineBatch(item.product_id)}
                                            className="rounded bg-primary hover:bg-primary-dark text-white font-semibold text-[9px] px-2.5 py-1 flex items-center justify-center gap-0.5 cursor-pointer shadow-xs ml-auto transition-colors active:scale-95"
                                          >
                                            <Plus className="w-3 h-3" /> Thêm lô con
                                          </button>
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-20 text-center text-slate-400 font-semibold select-none bg-slate-50/30 rounded-b-2xl">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <AlertCircle className="w-8 h-8 text-slate-300" />
                          <div>
                            <p className="text-slate-800 font-bold text-sm">Chưa có sản phẩm kiểm kho nào</p>
                            <p className="text-xs text-slate-400 font-medium mt-1">Sử dụng thanh tìm kiếm phía trên hoặc quét Barcode để thêm hàng</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>

          {/* Quick audit discrepancy summary panel */}
          {auditItems.length > 0 && (
            <div className="border-t border-slate-200/80 pt-4 mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100 select-none">
              <div className="text-center md:text-left">
                <span className="text-[10px] font-medium text-slate-400 block uppercase tracking-wider">Tổng số lượng (Sổ sách)</span>
                <span className="text-lg font-semibold text-slate-600 block mt-0.5">{stats.totalSystem.toLocaleString()}</span>
              </div>
              <div className="text-center md:text-left">
                <span className="text-[10px] font-medium text-slate-400 block uppercase tracking-wider">Tổng số lượng (Thực tế)</span>
                <span className="text-lg font-semibold text-primary block mt-0.5">{stats.totalActual.toLocaleString()}</span>
              </div>
              <div className="text-center md:text-left">
                <span className="text-[10px] font-medium text-slate-400 block uppercase tracking-wider">Tổng sản phẩm đã kiểm</span>
                <span className="text-lg font-semibold text-indigo-700 block mt-0.5">{auditItems.length}</span>
              </div>
              <div className="text-center md:text-left">
                <span className="text-[10px] font-medium text-slate-400 block uppercase tracking-wider">Giá trị chênh lệch (Lệch)</span>
                <span className={`text-lg font-semibold block mt-0.5 ${stats.totalDiscrepancyVal === 0 ? 'text-slate-600' : stats.totalDiscrepancyVal > 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {stats.totalDiscrepancyVal === 0 ? '0đ' : stats.totalDiscrepancyVal > 0 ? `+${fmtVND(stats.totalDiscrepancyVal)}` : fmtVND(stats.totalDiscrepancyVal)}
                </span>
              </div>
            </div>
          )}

        </div>

        {/* Right Side: Audit Slip / Adjustment Information Panel (Spans 1 col) */}
        <div className="lg:col-span-1 space-y-4">
          
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-5">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4 text-slate-400" />
              Thông tin phiếu kiểm
            </h3>
            
            {/* Warehouse Select */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">Kho hàng thực hiện *</label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-primary focus:outline-none transition-all shadow-xs"
              >
                {(!warehousesData?.data || warehousesData.data.length === 0) && (
                  <option value="">Đang tải danh sách kho...</option>
                )}
                {warehousesData?.data && warehousesData.data.length > 0 && !selectedWarehouseId && (
                  <option value="">-- Chọn kho thực hiện --</option>
                )}
                {(warehousesData?.data ?? []).map((w) => (
                  <option key={w.id || w.warehouse_id} value={w.id || w.warehouse_id}>
                    📦 {w.name}{w.code ? ` (${w.code.toUpperCase()})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Reference No */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">Mã tham chiếu / Số phiếu</label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="Tự động tạo (PDK-...)"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-primary focus:outline-none transition-all shadow-xs font-mono"
              />
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">Ghi chú / Lý do kiểm kho *</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Nhập ghi chú hoặc lý do kiểm kê định kỳ..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-primary focus:outline-none transition-all shadow-xs resize-none"
              />
            </div>

            {/* Warn message if discrepancy is negative */}
            {stats.totalDiscrepancyVal !== 0 && (
              <div className="p-3 bg-amber-50/70 border border-amber-100 rounded-xl flex items-start gap-2 shadow-xs text-amber-800 text-[10px] leading-relaxed">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold">Lưu ý chênh lệch số sách:</strong>
                  <p className="mt-0.5 text-amber-700 font-medium">Khi hoàn tất, hệ thống sẽ tự tạo phiếu điều chỉnh (PDK) để tự động cân bằng tồn kho thực tế. Giá trị chênh lệch dự kiến là <strong className="font-semibold">{fmtVND(stats.totalDiscrepancyVal)}</strong>.</p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleSubmitAudit}
                disabled={mutation.isPending || auditItems.length === 0}
                className="w-full bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-98 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {mutation.isPending ? 'Đang xử lý kiểm...' : 'Hoàn tất kiểm kho'}
              </button>
              
              <button
                type="button"
                onClick={() => router.push(pathname.replace('/audit', ''))}
                disabled={mutation.isPending}
                className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-semibold text-xs py-2 rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-98"
              >
                Hủy phiếu / Quay về
              </button>

              <button
                type="button"
                onClick={handleClearAll}
                disabled={mutation.isPending || auditItems.length === 0}
                className="w-full bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-semibold text-xs py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-98 disabled:opacity-50"
                title="Xóa nháp và đặt lại từ đầu"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Xóa hết làm lại từ đầu
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* ── QUICK CREATE PRODUCT MODAL ── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-150 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-primary" />
                Tạo nhanh sản phẩm mới
              </h3>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-slate-400 hover:text-slate-650 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Modal Form */}
            <form onSubmit={handleCreateProductSubmit} className="p-5 space-y-4 text-xs">
              {/* Product Name */}
              <div className="space-y-1">
                <label className="block font-semibold text-slate-600">Tên thuốc / sản phẩm *</label>
                <input
                  type="text"
                  required
                  value={newProductForm.name}
                  onChange={(e) => setNewProductForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Nhập tên thuốc..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary focus:outline-none font-medium text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* SKU */}
                <div className="space-y-1">
                  <label className="block font-semibold text-slate-600">Mã hàng (SKU)</label>
                  <input
                    type="text"
                    value={newProductForm.sku}
                    onChange={(e) => setNewProductForm(prev => ({ ...prev, sku: e.target.value }))}
                    placeholder="Mã tự động sinh..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary focus:outline-none font-medium text-slate-800 font-mono"
                  />
                </div>
                {/* Barcode */}
                <div className="space-y-1">
                  <label className="block font-semibold text-slate-600">Mã vạch (Barcode)</label>
                  <input
                    type="text"
                    value={newProductForm.barcode}
                    onChange={(e) => setNewProductForm(prev => ({ ...prev, barcode: e.target.value }))}
                    placeholder="Quét hoặc nhập..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary focus:outline-none font-medium text-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {/* Unit */}
                <div className="space-y-1">
                  <label className="block font-semibold text-slate-600">ĐVT</label>
                  <input
                    type="text"
                    value={newProductForm.unit}
                    onChange={(e) => setNewProductForm(prev => ({ ...prev, unit: e.target.value }))}
                    placeholder="Cái, hộp..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary focus:outline-none font-medium text-slate-800"
                  />
                </div>
                {/* Cost Price */}
                <div className="space-y-1">
                  <label className="block font-semibold text-slate-600">Giá vốn (đ)</label>
                  <input
                    type="number"
                    value={newProductForm.cost_price}
                    onChange={(e) => setNewProductForm(prev => ({ ...prev, cost_price: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary focus:outline-none font-medium text-slate-800"
                  />
                </div>
                {/* Sell Price */}
                <div className="space-y-1">
                  <label className="block font-semibold text-slate-600">Giá bán (đ)</label>
                  <input
                    type="number"
                    value={newProductForm.sell_price}
                    onChange={(e) => setNewProductForm(prev => ({ ...prev, sell_price: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-primary focus:outline-none font-medium text-slate-800"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 font-semibold cursor-pointer active:scale-98 transition-all"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creatingProduct}
                  className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold flex items-center gap-1 shadow-md cursor-pointer active:scale-98 transition-all disabled:opacity-50"
                >
                  {creatingProduct ? 'Đang tạo...' : 'Tạo sản phẩm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Oni UI Dialogs */}
      <ConfirmDialog
        open={showSubmitConfirm}
        onClose={() => setShowSubmitConfirm(false)}
        onConfirm={handleConfirmSubmitAudit}
        title="Xác nhận hoàn tất kiểm kho"
        description={submitDialogDescription}
        confirmLabel={mutation.isPending ? 'Đang xử lý...' : 'Xác nhận'}
        loading={mutation.isPending}
      />

      <ConfirmDialog
        open={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleConfirmClearAll}
        title="Xóa hết làm lại từ đầu"
        description="Bạn có chắc chắn muốn xóa hết danh sách kiểm và làm lại từ đầu? Mọi thông tin nháp chưa lưu sẽ bị mất."
        confirmLabel="Xóa hết"
        cancelLabel="Hủy bỏ"
        variant="danger"
      />

    </div>
  )
}
