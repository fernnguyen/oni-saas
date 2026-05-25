'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { usePOSHydration } from '@/hooks/usePOSHydration'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { SyncWorker } from '@/lib/pos/syncWorker'
import { SyncStatusBar } from './SyncStatusBar'
import { ResourceSlideOver } from './ResourceSlideOver'
import { getVerticalConfig } from '@oni/core'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { DataTable, type Column } from '@/app/components/ui/DataTable'
import dynamic from 'next/dynamic'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog'
import { format } from 'date-fns'

const MapViewer = dynamic(() => import('./MapViewer'), { ssr: false })

const UserIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
)

interface Resource {
  id: string
  name: string
  type: string
  status: string
  current_order_id?: string
  zone: string
  capacity: string
  hourly_rate: string
  sort_order: string
  metadata?: string
}

interface OrderData {
  id: string
  order_no: string
  status: string
  customer_name: string
  customer_id: string
  total_amount: string
  paid_amount: string
  debt_amount: string
  metadata: string
  created_at: string
}

interface Props {
  shopId: string
  branchId: string
  shopName: string
  userEmail: string
  backPath: string
  resourceLabel: string
  resourceType: string
  posLabel?: string
  hasHourlyBilling: boolean
  autoPrintReceipt?: boolean
  mutePosSound?: boolean
  industryType: string
  permissions?: string[]
}

const STATUS_CARDS: Record<string, { border: string; bg: string; dot: string; label: string; text?: string }> = {
  available: { border: 'border-green-200 hover:border-green-400', bg: 'bg-white', dot: 'bg-green-500', label: 'Trống', text: 'text-green-600' },
  occupied:  { border: 'border-red-300', bg: 'bg-red-50/60', dot: 'bg-red-500', label: 'Đang sử dụng', text: 'text-red-700' },
  cleaning:  { border: 'border-amber-200', bg: 'bg-amber-50/60', dot: 'bg-amber-500', label: 'Dọn dẹp', text: 'text-amber-700' },
  reserved:  { border: 'border-blue-200', bg: 'bg-blue-50/60', dot: 'bg-blue-500', label: 'Đã đặt', text: 'text-blue-700' },
  maintenance: { border: 'border-slate-300', bg: 'bg-slate-100', dot: 'bg-slate-400', label: 'Tạm ngừng', text: 'text-slate-600' },
}

type ViewMode = 'grid' | 'list' | 'map'

export function TableMapPOS({
  shopId, branchId, shopName, userEmail, backPath,
  resourceLabel, resourceType, posLabel, hasHourlyBilling,
  autoPrintReceipt = false, mutePosSound = false,
  industryType,
  permissions = [],
}: Props) {
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingTakeaway, setLoadingTakeaway] = useState(false)
  const [, setTick] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [shopSettings, setShopSettings] = useState<any>(null)

  // --- SHIFT MANAGEMENT STATES & QUERIES ---
  const [shiftOpenModalOpen, setShiftOpenModalOpen] = useState(false)
  const [shiftCloseModalOpen, setShiftCloseModalOpen] = useState(false)
  const [openingCashInput, setOpeningCashInput] = useState('0')
  const [actualCashInput, setActualCashInput] = useState('0')
  const [shiftNote, setShiftNote] = useState('')

  const [lastClosedShift, setLastClosedShift] = useState<Record<string, string> | null>(null)
  const [shiftSummaryModalOpen, setShiftSummaryModalOpen] = useState(false)
  const [hasDismissedShiftOpen, setHasDismissedShiftOpen] = useState(false)

  const isShiftEnabled = shopSettings?.enable_shift_management ?? false

  const { data: openShiftData, isLoading: isOpenShiftLoading, refetch: refetchOpenShift } = useQuery({
    queryKey: ['open-shift', shopId, branchId, userEmail],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/shifts?status=open&branch_id=${branchId}&user_id=${userEmail}`)
      if (!res.ok) return { data: [] }
      return res.json() as Promise<{ data: Record<string, string>[], total: number }>
    },
    enabled: !!shopId && !!branchId && !!userEmail && isShiftEnabled,
  })

  const { data: allOpenShiftsData } = useQuery({
    queryKey: ['all-open-shifts', shopId, branchId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/shifts?status=open&branch_id=${branchId}`)
      if (!res.ok) return { data: [] }
      return res.json() as Promise<{ data: Record<string, string>[], total: number }>
    },
    enabled: !!shopId && !!branchId && isShiftEnabled,
  })

  const { data: employeesData } = useQuery({
    queryKey: ['employees', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/employees`)
      if (!res.ok) return []
      return res.json() as Promise<Record<string, string>[]>
    },
    enabled: !!shopId && isShiftEnabled,
  })

  const otherOpenShifts = allOpenShiftsData?.data?.filter(s => s.user_id !== userEmail) || []

  const getEmployeeName = (email: string) => {
    const emp = employeesData?.find((e: any) => e.email === email)
    return emp ? emp.name : email.split('@')[0]
  }

  const activeShift = openShiftData?.data?.[0] || null
  const hasActiveShift = !!activeShift

  // Auto-open Shift Open Modal if enabled but no active shift
  useEffect(() => {
    if (isShiftEnabled && !isOpenShiftLoading && !hasActiveShift && !hasDismissedShiftOpen) {
      setShiftOpenModalOpen(true)
    } else {
      setShiftOpenModalOpen(false)
    }
  }, [isShiftEnabled, isOpenShiftLoading, hasActiveShift, hasDismissedShiftOpen])

  const openShiftMutation = useMutation({
    mutationFn: async (payload: { branch_id: string; opening_cash: number }) => {
      const res = await fetch(`/api/shops/${shopId}/shifts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Mở ca thất bại')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Mở ca làm việc thành công!')
      setShiftOpenModalOpen(false)
      refetchOpenShift()
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const closeShiftMutation = useMutation({
    mutationFn: async (payload: { actual_closing_cash: number; note: string }) => {
      const res = await fetch(`/api/shops/${shopId}/shifts/${activeShift?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Chốt ca thất bại')
      }
      return res.json() as Promise<Record<string, string>>
    },
    onSuccess: (data) => {
      toast.success('Chốt ca thành công!')
      setShiftCloseModalOpen(false)
      setLastClosedShift(data)
      setShiftSummaryModalOpen(true)
      refetchOpenShift()
    },
    onError: (err: Error) => toast.error(err.message)
  })

  // UI state
  const [activeSlideResource, setActiveSlideResource] = useState<Resource | null>(null)

  const vertical = getVerticalConfig(industryType)
  const [viewMode, setViewMode] = useState<ViewMode>('map')
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  
  const [inProgressOrders, setInProgressOrders] = useState<OrderData[]>([])

  // Map orders for fast lookup
  const ordersMap = useMemo(() => {
    const map = new Map<string, OrderData>()
    for (const order of inProgressOrders) {
      map.set(order.id, order)
      try {
        const meta = typeof order.metadata === 'string' ? JSON.parse(order.metadata) : (order.metadata || {})
        if (meta.resource_id) {
          map.set(`res-${meta.resource_id}`, order)
        }
      } catch {}
    }
    return map
  }, [inProgressOrders])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'F7') {
        e.preventDefault()
        setSelectedZone(null)
        toast.success('Đã chọn hiển thị Tất cả phòng/bàn')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('pos_view_mode')
    if (saved === 'grid' || saved === 'list' || saved === 'map') setViewMode(saved)
  }, [])

  function toggleViewMode(mode: ViewMode) {
    setViewMode(mode)
    localStorage.setItem('pos_view_mode', mode)
  }

  // Sync state
  const isOnline = useNetworkStatus()
  const { status: hydrationStatus, lastHydratedAt, refresh: refreshHydration } = usePOSHydration(shopId, branchId)
  const workerRef = useRef<SyncWorker | null>(null)

  useEffect(() => {
    const worker = new SyncWorker(shopId)
    workerRef.current = worker
    void worker.start()
    return () => worker.stop()
  }, [shopId])

  useEffect(() => {
    if (isOnline) workerRef.current?.flushAll()
  }, [isOnline])

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/shops/${shopId}/settings`)
      if (!res.ok) return
      const json = await res.json()
      setShopSettings(json)
    } catch {}
  }, [shopId])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const fetchResources = useCallback(async () => {
    try {
      // Fetch physical resources and takeaway orders in parallel
      const [resResources, resOrders] = await Promise.all([
        fetch(`/api/shops/${shopId}/location-resources?limit=500`),
        fetch(`/api/shops/${shopId}/orders?status=in_progress&limit=100`)
      ])
      
      if (!resResources.ok) throw new Error()
      
      const jsonResources = await resResources.json()
      const physicalResources = jsonResources.data ?? []
      
      let virtualResources: Resource[] = []
      if (resOrders.ok) {
        const jsonOrders = await resOrders.json()
        const ordersList = jsonOrders.data ?? []
        setInProgressOrders(ordersList)

        const takeawayOrders = ordersList.filter((o: any) => {
          try {
            const meta = typeof o.metadata === 'string' ? JSON.parse(o.metadata) : (o.metadata || {})
            return meta.resource_id === 'takeaway'
          } catch {
            return false
          }
        })
        
        virtualResources = takeawayOrders.map((o: any, idx: number) => ({
          id: `takeaway-${o.id}`, // pseudo id
          name: o.order_no ? `Takeaway #${o.order_no}` : `Đơn Takeaway ${idx + 1}`,
          type: 'takeaway',
          status: 'occupied',
          current_order_id: o.id,
          zone: 'Takeaway',
          capacity: '0',
          hourly_rate: '0',
          sort_order: '0'
        }))
      }
      
      setResources([...physicalResources, ...virtualResources])
    } catch {
      toast.error('Không thể tải danh sách')
    } finally {
      setLoading(false)
    }
  }, [shopId])

  useEffect(() => { fetchResources() }, [fetchResources])

  // Real-time synchronization for table map status via BroadcastChannel
  useEffect(() => {
    if (typeof window === 'undefined') return
    const bc = new BroadcastChannel('oni-pos-sync')
    const listener = (e: MessageEvent) => {
      if (e.data?.type === 'REFRESH_TABLE_MAP' && e.data?.shopId === shopId) {
        void fetchResources()
      }
    }
    bc.addEventListener('message', listener)
    return () => {
      bc.removeEventListener('message', listener)
      bc.close()
    }
  }, [shopId, fetchResources])

  // Timer for occupied resources
  useEffect(() => {
    const hasOccupied = resources.some(r => r.status === 'occupied')
    if (hasOccupied && !timerRef.current) {
      timerRef.current = setInterval(() => setTick(t => t + 1), 1000)
    } else if (!hasOccupied && timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [resources])

  // Group by zone (filter out deleted)
  const activeResources = useMemo<Resource[]>(() => resources.filter((r: Resource) => r.status !== 'deleted'), [resources])
  const zones = useMemo<Map<string, Resource[]>>(() => {
    const map = new Map<string, Resource[]>()
    for (const r of activeResources) {
      const zone = r.zone || 'Chưa phân vùng'
      if (!map.has(zone)) map.set(zone, [])
      map.get(zone)!.push(r)
    }
    return map
  }, [activeResources])

  // Parse custom sorting order from settings
  const zoneOrder = useMemo<string[]>(() => {
    if (!shopSettings?.resource_sub_types) return []
    try {
      const parsed = typeof shopSettings.resource_sub_types === 'string'
        ? JSON.parse(shopSettings.resource_sub_types)
        : shopSettings.resource_sub_types
      return (parsed[`${industryType}_zone_order`] || []) as string[]
    } catch {
      return []
    }
  }, [shopSettings, industryType])

  const sortedZones = useMemo<string[]>(() => {
    const list = Array.from(zones.keys())
    list.sort((a: string, b: string) => {
      if (a === 'Chưa phân vùng') return 1
      if (b === 'Chưa phân vùng') return -1
      
      const idxA = zoneOrder.indexOf(a)
      const idxB = zoneOrder.indexOf(b)
      
      if (idxA !== -1 && idxB !== -1) {
        return idxA - idxB
      }
      if (idxA !== -1) return -1
      if (idxB !== -1) return 1
      
      return a.localeCompare(b, 'vi')
    })
    
    // Filter out "Chưa phân vùng" if it has 0 physical tables/active resources
    return list.filter((z: string) => {
      if (z === 'Chưa phân vùng') {
        const count = zones.get(z)?.length || 0
        return count > 0
      }
      return true
    })
  }, [zones, zoneOrder])

  // Redirect to first zone when in map mode and selectedZone is null or invalid
  useEffect(() => {
    if (viewMode === 'map') {
      const visibleZones = sortedZones
      if (!selectedZone || !visibleZones.includes(selectedZone)) {
        if (visibleZones.length > 0) {
          setSelectedZone(visibleZones[0])
        } else {
          setSelectedZone('Chưa phân vùng')
        }
      }
    }
  }, [viewMode, selectedZone, sortedZones])

  function handleResourceClick(r: Resource) {
    if (r.status === 'available' || r.status === 'occupied') {
      setActiveSlideResource(r)
    } else if (r.status === 'cleaning') {
      handleSetAvailable(r)
    }
  }

  async function handleSetAvailable(r: Resource) {
    setResources(prev => prev.map(res => res.id === r.id ? { ...res, status: 'available', current_order_id: '' } : res))
    try {
      await fetch(`/api/shops/${shopId}/location-resources/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'available', current_order_id: '' }),
      })
      toast.success(`${r.name} đã sẵn sàng`)
      fetchResources()
    } catch {
      toast.error('Lỗi')
      fetchResources() // rollback on error
    }
  }

  function handleCheckInSuccess(orderId: string) {
    if (activeSlideResource) {
      setActiveSlideResource({ ...activeSlideResource, status: 'occupied', current_order_id: orderId })
      setResources(prev => prev.map(res => res.id === activeSlideResource.id ? { ...res, status: 'occupied', current_order_id: orderId } : res))
    }
    fetchResources()
  }

  function handleSessionClosed() {
    setActiveSlideResource(null)
    fetchResources()
  }

  async function handleTakeawayClick() {
    setLoadingTakeaway(true)
    try {
      const res = await fetch(`/api/shops/${shopId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'in_progress',
          customer_name: 'Khách lẻ',
          branch_id: branchId,
          subtotal: '0',
          total_amount: '0',
          paid_amount: '0',
          metadata: JSON.stringify({
            resource_id: 'takeaway',
            resource_name: 'Takeaway',
            note: 'Takeaway'
          })
        })
      })
      if (!res.ok) throw new Error()
      const createdOrder = await res.json()
      
      const newTakeawayResource: Resource = {
         id: `takeaway-${createdOrder.id}`,
         name: `Đơn Takeaway mới`,
         type: 'takeaway',
         status: 'occupied',
         current_order_id: createdOrder.id,
         zone: 'Takeaway',
         capacity: '0',
         hourly_rate: '0',
         sort_order: '0'
      }
      
      setResources(prev => [...prev, newTakeawayResource])
      setActiveSlideResource(newTakeawayResource)
    } catch {
       toast.error('Lỗi tạo đơn Takeaway')
    } finally {
       setLoadingTakeaway(false)
    }
  }

  // --- Grid View ---
  const displayedZones = useMemo<[string, Resource[]][]>(() => {
    const entries = Array.from(zones.entries())
    entries.sort((a: [string, Resource[]], b: [string, Resource[]]) => {
      const idxA = sortedZones.indexOf(a[0])
      const idxB = sortedZones.indexOf(b[0])
      if (idxA !== -1 && idxB !== -1) return idxA - idxB
      if (idxA !== -1) return -1
      if (idxB !== -1) return 1
      return a[0].localeCompare(b[0], 'vi')
    })
    
    if (selectedZone) {
      return entries.filter(([z]: [string, Resource[]]) => z === selectedZone)
    }
    
    return entries.filter(([z]: [string, Resource[]]) => sortedZones.includes(z))
  }, [zones, sortedZones, selectedZone])

  // Stats
  const stats = {
    total: activeResources.length,
    available: activeResources.filter((r: Resource) => r.status === 'available').length,
    occupied: activeResources.filter((r: Resource) => r.status === 'occupied').length,
    cleaning: activeResources.filter((r: Resource) => r.status === 'cleaning').length,
  }

  return (
    <div className="flex flex-col h-[calc(100vh-88px)] md:h-[calc(100vh-104px)] gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{posLabel || `${resourceLabel} POS`}</h1>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" />{stats.available} trống</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />{stats.occupied} sử dụng</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />{stats.cleaning} dọn dẹp</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* View Mode Toggle */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm shrink-0">
            <button
              onClick={() => toggleViewMode('grid')}
              className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${viewMode === 'grid' ? 'bg-slate-100 text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              title="Dạng lưới"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </button>
            <button
              onClick={() => toggleViewMode('list')}
              className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-slate-100 text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              title="Dạng danh sách"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <button
              onClick={() => toggleViewMode('map')}
              className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${viewMode === 'map' ? 'bg-slate-100 text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              title="Dạng sơ đồ"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
            </button>
          </div>

          <button
            onClick={handleTakeawayClick}
            disabled={loadingTakeaway}
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {loadingTakeaway ? (
              <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            )}
            <span className="hidden sm:inline">Takeaway</span>
          </button>

          {isShiftEnabled && hasActiveShift && (
            <button
              onClick={() => {
                setActualCashInput('0')
                setShiftNote('')
                setShiftCloseModalOpen(true)
              }}
              className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer shrink-0"
              title="Chốt ca và đếm két tiền"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="h-3.5 w-3.5 shrink-0 text-rose-600">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>Chốt ca</span>
            </button>
          )}

          {isShiftEnabled && !hasActiveShift && (
            <button
              onClick={() => {
                setOpeningCashInput('0')
                setShiftOpenModalOpen(true)
              }}
              className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors animate-pulse cursor-pointer shrink-0"
              title="Mở ca làm việc mới"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="h-3.5 w-3.5 shrink-0 text-amber-600">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
              </svg>
              <span>Mở ca</span>
            </button>
          )}

          <button
            onClick={() => {
              if (!isOnline) {
                toast.error('Không có kết nối mạng')
                return
              }
              toast.promise(refreshHydration(), {
                loading: 'Đang đồng bộ dữ liệu...',
                success: 'Đã cập nhật sản phẩm & tồn kho!',
                error: 'Đồng bộ thất bại',
              })
            }}
            disabled={hydrationStatus === 'loading'}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors shrink-0"
            title="Đồng bộ dữ liệu mới nhất từ server"
          >
            {hydrationStatus === 'loading' ? (
              <svg className="h-3.5 w-3.5 animate-spin text-primary shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg
                className="h-3.5 w-3.5 shrink-0 text-slate-500"
                xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            )}
            <span className="hidden sm:inline">{hydrationStatus === 'loading' ? 'Đang đồng bộ...' : 'Đồng bộ'}</span>
            <span className={['h-2 w-2 rounded-full shrink-0 ml-0.5', isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'].join(' ')} title={isOnline ? 'Online' : 'Offline'} />
          </button>

          <SyncStatusBar
            isOnline={isOnline}
            onRetryFailed={() => workerRef.current?.retryFailed()}
            onRetryAll={() => workerRef.current?.retryAll()}
          />

          <a href={`${backPath}/resources`} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <span className="hidden sm:inline">Quản lý</span>
          </a>
        </div>
      </div>

      {isShiftEnabled && otherOpenShifts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200/80 rounded-2xl px-4 py-2.5 flex items-center justify-between text-xs text-amber-800 animate-in slide-in-from-top duration-300 shadow-sm shrink-0">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span>
              🔔 <strong>Nhắc nhở:</strong> Nhân viên <strong className="font-bold text-amber-950">{getEmployeeName(otherOpenShifts[0].user_id)}</strong> ({otherOpenShifts[0].user_id}) đang có ca trùng hoạt động chưa chốt tại chi nhánh này (mở lúc {new Date(otherOpenShifts[0].opened_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}).
            </span>
          </div>
          <span className="text-[10px] text-amber-600 font-medium hidden lg:inline">
            Vui lòng chắc chắn các phiên làm việc và bàn giao két được đối soát độc lập, tránh chồng chéo dòng tiền!
          </span>
        </div>
      )}

      {/* Zone selection filter tabs (F7 to select all) */}
      {sortedZones.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide select-none shrink-0">
          {viewMode !== 'map' && (
            <button
              onClick={() => setSelectedZone(null)}
              className={[
                'shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition-all shadow-xs active:scale-95 border cursor-pointer',
                selectedZone === null
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
              ].join(' ')}
              title="Nhấn F7 để chọn Tất cả phòng/bàn"
            >
              Tất cả phòng/bàn (F7)
            </button>
          )}
          {sortedZones.map((z: string) => (
            <button
              key={z}
              onClick={() => setSelectedZone(z)}
              className={[
                'shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition-all shadow-xs active:scale-95 border cursor-pointer',
                selectedZone === z
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              {z}
            </button>
          ))}
        </div>
      )}

      {/* Resource grid */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[300px]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : resources.length === 0 ? (
        <div className="flex-1 flex items-center justify-center min-h-[300px]">
          <EmptyState title={`Chưa có ${resourceLabel} nào`} description={`Vào Quản lý vị trí để tạo ${resourceLabel}`} />
        </div>
      ) : (
        <div className={`flex-1 min-h-0 w-full ${viewMode === 'map' ? 'overflow-hidden h-full' : 'overflow-y-auto h-full pr-1 pb-4'}`}>
          {viewMode === 'map' && (() => {
            const activeZoneResources = resources.filter(r => r.status !== 'deleted' && (r.zone || 'Chưa phân vùng') === (selectedZone || 'Chưa phân vùng'))
            const hasPositionedTables = activeZoneResources.some(r => {
              try {
                const meta = r.metadata ? JSON.parse(r.metadata) : {}
                return !!meta.layout
              } catch {
                return false
              }
            })

            if (!hasPositionedTables) {
              return (
                <div className="flex flex-col items-center justify-center border border-dashed border-slate-200 bg-slate-50/80 rounded-3xl p-12 text-center h-full min-h-[300px] relative shadow-sm overflow-hidden select-none">
                  <div className="relative z-10 max-w-md space-y-4">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white border border-slate-200 shadow-sm">
                      <svg className="h-7 w-7 text-slate-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                      </svg>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-base font-bold text-slate-800">Khu vực chưa được thiết lập sơ đồ</h3>
                      <p className="text-xs text-slate-500 leading-relaxed font-medium">
                        Phòng/bàn trong khu vực <strong className="text-primary font-bold">{selectedZone || 'Chưa phân vùng'}</strong> chưa được sắp xếp vị trí tọa độ trực quan trên bản đồ.
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-3 pt-2">
                      <button
                        onClick={() => setViewMode('grid')}
                        className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 text-xs font-bold active:scale-95 transition-all shadow-sm cursor-pointer"
                      >
                        Xem dạng lưới
                      </button>
                      <a
                        href={`${backPath}/resources`}
                        className="rounded-xl bg-primary hover:bg-primary/90 text-white px-4 py-2 text-xs font-bold active:scale-95 transition-all shadow-md shadow-primary/20 cursor-pointer"
                      >
                        Thiết lập sơ đồ
                      </a>
                    </div>
                  </div>
                </div>
              )
            }

            return (
              <MapViewer
                shopId={shopId}
                industryType={industryType}
                resources={resources}
                selectedZone={selectedZone}
                shopSettings={shopSettings}
                inProgressOrders={inProgressOrders}
                onResourceClick={handleResourceClick}
                onRefresh={fetchResources}
              />
            )
          })()}

          {viewMode === 'grid' && displayedZones.map(([zone, items]: [string, Resource[]]) => (
            <div key={zone} className="mb-6 last:mb-0">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-slate-700">{zone}</h3>
                <span className="text-xs text-slate-400">{items.length} vị trí</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {items.sort((a: Resource, b: Resource) => Number(a.sort_order || 0) - Number(b.sort_order || 0)).map((r: Resource) => {
                  const st = STATUS_CARDS[r.status] ?? STATUS_CARDS.available
                  const rmd = safeParseJSON(r.metadata)
                  const isRoomType = r.type === 'room'
                  const activeOrder = r.status === 'occupied'
                    ? (ordersMap.get(r.current_order_id || '') || ordersMap.get(`res-${r.id}`))
                    : null
                  return (
                    <button
                      key={r.id}
                      onClick={() => handleResourceClick(r)}
                      className={`group relative rounded-2xl border p-4 flex flex-col text-left transition-all hover:shadow-lg cursor-pointer overflow-hidden ${
                        r.status === 'occupied' ? 'border-red-300 bg-gradient-to-br from-red-50 to-rose-50 shadow-sm hover:border-red-400'
                        : r.status === 'reserved' ? 'border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-sm hover:border-blue-400'
                        : r.status === 'cleaning' ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 shadow-sm hover:border-amber-400'
                        : r.status === 'maintenance' ? 'border-slate-300 bg-slate-100 opacity-60 hover:border-slate-400'
                        : 'border-slate-200 bg-gradient-to-br from-white to-slate-50 hover:border-green-400'
                      }`}
                    >
                      {/* Status indicator bar */}
                      <div className={`absolute top-0 left-0 right-0 h-1 ${
                        r.status === 'occupied' ? 'bg-gradient-to-r from-red-400 to-rose-500'
                        : r.status === 'reserved' ? 'bg-gradient-to-r from-blue-400 to-indigo-500'
                        : r.status === 'cleaning' ? 'bg-gradient-to-r from-amber-400 to-yellow-500'
                        : r.status === 'maintenance' ? 'bg-slate-400'
                        : 'bg-gradient-to-r from-green-400 to-emerald-500'
                      }`} />

                      {/* Header */}
                      <div className="flex items-start justify-between mb-2 mt-1">
                        <p className="text-base font-bold text-slate-800 line-clamp-2 leading-tight">{r.name}</p>
                      </div>

                      {/* Meta info */}
                      <div className="space-y-1 text-[11px] text-slate-500 mb-3.5">
                        {r.capacity && <div className="flex items-center gap-1.5"><UserIcon className="w-3 h-3 opacity-70" />{r.capacity} người</div>}
                        {hasHourlyBilling && r.hourly_rate && Number(r.hourly_rate) > 0 && (
                          <div className="flex items-center gap-1.5"><span>⏱️</span> <span className="font-semibold text-slate-700">{Number(r.hourly_rate).toLocaleString('vi-VN')}₫/h</span></div>
                        )}
                        {isRoomType && rmd.overnight_rate && (
                          <div className="flex items-center gap-1.5"><span>🌙</span> <span className="font-semibold text-slate-700">{Number(rmd.overnight_rate).toLocaleString('vi-VN')}₫/đêm</span></div>
                        )}
                        {isRoomType && rmd.room_class && (
                          <div className="flex items-center gap-1.5"><span>⭐</span> <span className="capitalize">{rmd.room_class}</span></div>
                        )}
                        {isRoomType && rmd.amenities?.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                            {rmd.amenities.slice(0, 3).map((a: string) => (
                              <span key={a} className="rounded-full bg-white border border-slate-200 px-1.5 py-0.5 text-[9px] text-slate-550 font-medium shadow-2xs">{a}</span>
                            ))}
                            {rmd.amenities.length > 3 && (
                              <span className="text-[10px] text-slate-400 font-bold ml-1.5 select-none shrink-0 self-center">
                                +{rmd.amenities.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Status label at the bottom */}
                      <div className={`mt-auto mt-3.5 w-full rounded-lg px-2 py-1.5 text-center transition-colors ${r.status === 'cleaning' ? 'bg-amber-100 hover:bg-amber-200' : st.bg}`}>
                        <p className={`text-[12px] font-bold flex items-center justify-center gap-1.5 ${st.text}`}>
                          {r.status === 'cleaning'
                            ? '✓ Dọn xong'
                            : r.status === 'occupied'
                            ? (activeOrder?.customer_name || 'Khách lẻ')
                            : st.label}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {viewMode === 'list' && resources.length > 0 && (
            <DataTable
          columns={[
            {
              key: 'name',
              label: 'Tên',
              className: 'w-[20%]',
              render: (r) => {
                return (
                  <button onClick={(e) => { e.stopPropagation(); handleResourceClick(r); }} className="text-left group">
                    <span className="font-bold text-slate-800 group-hover:text-primary transition-colors">{r.name}</span>
                  </button>
                )
              }
            },
            {
              key: 'status',
              label: 'Trạng thái',
              className: 'w-[15%]',
              render: (r) => {
                const st = STATUS_CARDS[r.status] ?? STATUS_CARDS.available
                return (
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${st.bg} ${st.text}`}>
                    {st.label}
                  </span>
                )
              }
            },
            {
              key: 'customer',
              label: 'Khách hàng',
              className: 'w-[20%]',
              render: (r) => {
                const activeOrder = r.status === 'occupied'
                  ? (ordersMap.get(r.current_order_id || '') || ordersMap.get(`res-${r.id}`))
                  : null
                return activeOrder ? (
                  <span className="font-bold text-slate-700">
                    {activeOrder.customer_name || 'Khách lẻ'}
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                )
              }
            },
            {
              key: 'capacity',
              label: 'Sức chứa',
              className: 'w-[20%]',
              render: (r) => r.capacity ? (
                <div className="flex items-center gap-1.5 text-slate-600">
                  <UserIcon className="w-3.5 h-3.5 opacity-70" /> {r.capacity} người
                </div>
              ) : <span className="text-slate-400">-</span>
            },
            ...(hasHourlyBilling ? [{
              key: 'price',
              label: 'Giá giờ',
              className: 'w-[15%]',
              render: (r: Resource) => (
                <span className="font-semibold text-slate-700">
                  {r.hourly_rate && Number(r.hourly_rate) > 0 ? `${Number(r.hourly_rate).toLocaleString('vi-VN')}₫` : '-'}
                </span>
              )
            }] : []),
            {
              key: 'class',
              label: 'Phân loại',
              className: 'w-[15%] hidden sm:table-cell',
              render: (r) => {
                const rmd = safeParseJSON(r.metadata)
                return <span className="text-slate-500 capitalize">{rmd.room_class || rmd.sub_type || '-'}</span>
              }
            },
            {
              key: 'actions',
              label: 'Thao tác',
              align: 'right',
              className: 'w-[10%]',
              render: (r) => (
                <button
                  onClick={(e) => { e.stopPropagation(); handleResourceClick(r); }}
                  className={r.status === 'cleaning'
                    ? "rounded-lg bg-white border border-amber-300 px-3 py-1.5 text-xs font-bold text-amber-600 hover:bg-amber-50 hover:text-amber-700 transition-colors shadow-sm whitespace-nowrap"
                    : "rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors shadow-sm whitespace-nowrap"
                  }
                >
                  {r.status === 'cleaning' ? '✓ Dọn xong' : 'Thao tác'}
                </button>
              )
            }
          ]}
          groupedData={Array.from(zones.entries()).map(([zone, items]: [string, Resource[]]) => ({
            key: zone,
            label: (
              <span className="uppercase tracking-wider">
                {zone}
                <span className="text-slate-400 text-xs font-normal normal-case ml-2">({items.length} vị trí)</span>
              </span>
            ),
            items: items.sort((a: Resource, b: Resource) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
          }))}
          rowKey={(row) => row.id}
          onRowClick={handleResourceClick}
        />
      )}
        </div>
      )}

      {/* Slide-over Manager */}
      <ResourceSlideOver
        open={!!activeSlideResource}
        onClose={() => setActiveSlideResource(null)}
        resource={resources.find(r => r.id === activeSlideResource?.id) || activeSlideResource || { id: '', name: '', type: 'room', zone: '', capacity: '', hourly_rate: '', status: 'available' } as any}
        shopId={shopId}
        branchId={branchId}
        shopName={shopName}
        employeeId={userEmail}
        onCheckInSuccess={handleCheckInSuccess}
        onSessionClosed={handleSessionClosed}
        resourceTemplate={vertical.resourceTemplate}
        allResources={activeResources}
        onRefresh={fetchResources}
        autoPrintReceipt={autoPrintReceipt}
        permissions={permissions}
        hasActiveShift={hasActiveShift}
        isShiftEnabled={isShiftEnabled}
        onOpenShiftModal={() => setShiftOpenModalOpen(true)}
      />

      {/* DIALOG 1: MỞ CA LÀM VIỆC (SHIFT OPEN) */}
      <ConfirmDialog
        open={shiftOpenModalOpen}
        onClose={() => {
          setShiftOpenModalOpen(false)
          setHasDismissedShiftOpen(true)
        }}
        onConfirm={() => openShiftMutation.mutate({ branch_id: branchId, opening_cash: Number(openingCashInput) || 0 })}
        title="Mở ca làm việc POS"
        confirmLabel={openShiftMutation.isPending ? 'Đang mở ca...' : 'Xác nhận Mở ca'}
        cancelLabel="Để sau"
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="text-center bg-indigo-50 p-4 rounded-2xl border border-indigo-100/50 space-y-1">
            <div className="text-3xl">🏦</div>
            <h3 className="text-sm font-bold text-slate-800">Yêu cầu mở ca làm việc</h3>
            <p className="text-xs text-slate-500 leading-normal">
              Hệ thống đang bật chế độ Quản lý ca. Nhân viên cần khai báo số tiền mặt hiện có trong két trước khi thanh toán hóa đơn.
            </p>
          </div>

          {otherOpenShifts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-3 text-xs text-amber-800 space-y-1 animate-in fade-in slide-in-from-top-1 duration-300">
              <div className="flex items-center gap-1.5 font-bold text-amber-900">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-600">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <span>Chú ý: Phát sinh ca trùng lặp!</span>
              </div>
              <p className="leading-relaxed">
                Nhân viên <strong className="font-semibold text-amber-950">{getEmployeeName(otherOpenShifts[0].user_id)}</strong> ({otherOpenShifts[0].user_id}) hiện đang trong một ca làm việc chưa chốt tại chi nhánh này (mở từ {new Date(otherOpenShifts[0].opened_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}).
              </p>
              <p className="text-[10px] text-amber-600/90 italic pt-1 leading-normal border-t border-amber-200/40">
                * Vui lòng nhắc nhở nhân viên trên thực hiện chốt ca bàn giao trước để đảm bảo tính tách bạch và tránh nhầm lẫn két tiền!
              </p>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Số tiền mặt đầu ca</label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={openingCashInput ? Number(openingCashInput).toLocaleString('vi-VN') : ''}
                onChange={(e) => setOpeningCashInput(e.target.value.replace(/\D/g, ''))}
                className="w-full text-center text-xl font-extrabold border border-slate-200 rounded-xl py-2.5 px-8 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white text-slate-800"
                placeholder="Nhập số tiền mặt đầu ca"
                autoFocus
              />
              <span className="absolute right-4 text-sm font-semibold text-slate-400">đ</span>
            </div>
          </div>
        </div>
      </ConfirmDialog>

      {/* DIALOG 2: CHỐT CA LÀM VIỆC (SHIFT CLOSE) */}
      <ConfirmDialog
        open={shiftCloseModalOpen}
        onClose={() => setShiftCloseModalOpen(false)}
        onConfirm={() => closeShiftMutation.mutate({ actual_closing_cash: Number(actualCashInput) || 0, note: shiftNote })}
        title="Chốt ca làm việc & Bàn giao"
        confirmLabel={closeShiftMutation.isPending ? 'Đang chốt ca...' : 'Xác nhận Chốt ca'}
        cancelLabel="Hủy"
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="text-center bg-rose-50 p-4 rounded-2xl border border-rose-100/50 space-y-1">
            <div className="text-3xl">🔐</div>
            <h3 className="text-sm font-bold text-slate-800">Chốt két & Đóng ca</h3>
            <p className="text-xs text-slate-500 leading-normal">
              Nhân viên đếm và khai báo toàn bộ số tiền mặt thực tế đang có trong két két tiền lúc đóng ca. Phiếu chốt ca sẽ bị khóa sau khi gửi.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Tổng tiền mặt đếm thực tế</label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={actualCashInput ? Number(actualCashInput).toLocaleString('vi-VN') : ''}
                onChange={(e) => setActualCashInput(e.target.value.replace(/\D/g, ''))}
                className="w-full text-center text-xl font-extrabold border border-slate-200 rounded-xl py-2.5 px-8 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 bg-white text-slate-800"
                placeholder="Đếm tiền mặt trong két..."
                autoFocus
              />
              <span className="absolute right-4 text-sm font-semibold text-slate-400">đ</span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Ghi chú giải trình (nếu có)</label>
            <textarea
              value={shiftNote}
              onChange={(e) => setShiftNote(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none resize-none bg-white text-slate-800 shadow-sm"
              placeholder="Lý do chênh lệch tiền mặt, bàn giao đặc biệt..."
            />
          </div>
        </div>
      </ConfirmDialog>

      {/* DIALOG 3: XEM KẾT QUẢ CHỐT CA (SHIFT SUMMARY) */}
      <ConfirmDialog
        open={shiftSummaryModalOpen}
        onClose={() => setShiftSummaryModalOpen(false)}
        onConfirm={() => setShiftSummaryModalOpen(false)}
        title="Báo cáo kết quả Chốt ca"
        confirmLabel="Đã hiểu"
        cancelLabel=""
      >
        {lastClosedShift && (
          <div className="space-y-4 py-1 text-slate-800">
            <div className="text-center bg-gradient-to-r from-orange-500 to-amber-600 text-white p-5 rounded-2xl space-y-1 shadow-md">
              <p className="text-xs text-orange-100 uppercase tracking-wider font-semibold">Trạng thái ca</p>
              <h3 className="text-xl font-black text-white">CA ĐÃ ĐÓNG THÀNH CÔNG</h3>
              <p className="text-[10px] text-orange-200">
                Thời gian chốt: {format(new Date(), 'HH:mm - dd/MM/yyyy')}
              </p>
            </div>

            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Tiền mặt đầu ca:</span>
                <span className="font-bold">{Number(lastClosedShift.opening_cash || 0).toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Tiền mặt hệ thống tính toán (Expected):</span>
                <span className="font-bold">{Number(lastClosedShift.expected_closing_cash || 0).toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="flex justify-between items-center text-xs border-t border-slate-200/60 pt-2">
                <span className="text-slate-500 font-medium">Tiền mặt đếm thực tế (Actual):</span>
                <span className="font-bold text-orange-600">{Number(lastClosedShift.actual_closing_cash || 0).toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="flex justify-between items-center text-xs border-t border-slate-200 pt-2">
                <span className="text-slate-500 font-bold">Chênh lệch tiền mặt (Variance):</span>
                <span className={`font-black ${Number(lastClosedShift.cash_variance || 0) < 0 ? 'text-rose-600' : Number(lastClosedShift.cash_variance || 0) > 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                  {Number(lastClosedShift.cash_variance || 0) > 0 ? '+' : ''}
                  {Number(lastClosedShift.cash_variance || 0).toLocaleString('vi-VN')}đ
                </span>
              </div>
            </div>

            {lastClosedShift.non_cash_revenue && (
              <div className="border border-slate-200 rounded-2xl p-4 space-y-2.5 bg-slate-50/40">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Doanh thu không tiền mặt khác</h4>
                {(() => {
                  try {
                    const nonCash = JSON.parse(lastClosedShift.non_cash_revenue)
                    return (
                      <div className="space-y-2.5 pt-3">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-500 font-medium">Chuyển khoản:</span>
                          <span className="font-bold">{Number(nonCash.bank_transfer || 0).toLocaleString('vi-VN')}đ</span>
                        </div>
                        <div className="flex justify-between items-center text-xs border-t border-slate-200/50 pt-2">
                          <span className="text-slate-500 font-medium">Quẹt thẻ (POS):</span>
                          <span className="font-bold">{Number(nonCash.card || 0).toLocaleString('vi-VN')}đ</span>
                        </div>
                        <div className="flex justify-between items-center text-xs border-t border-slate-200/50 pt-2">
                          <span className="text-slate-500 font-medium">Ví điện tử:</span>
                          <span className="font-bold">{Number(nonCash.momo || 0).toLocaleString('vi-VN')}đ</span>
                        </div>
                      </div>
                    )
                  } catch { return null }
                })()}
              </div>
            )}

            {lastClosedShift.note && (
              <div className="space-y-1 px-1">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Giải trình của nhân viên:</span>
                <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 italic leading-relaxed">
                  "{lastClosedShift.note}"
                </p>
              </div>
            )}
          </div>
        )}
      </ConfirmDialog>
    </div>
  )
}

function safeParseJSON(str?: string): Record<string, any> {
  if (!str) return {}
  try { return JSON.parse(str) } catch { return {} }
}
