'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { usePOSHydration } from '@/hooks/usePOSHydration'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { SyncWorker } from '@/lib/pos/syncWorker'
import { ResourceSlideOver } from './ResourceSlideOver'
import { getVerticalConfig } from '@oni/core'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { DataTable, type Column } from '@/app/components/ui/DataTable'
import dynamic from 'next/dynamic'

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

  // UI state
  const [activeSlideResource, setActiveSlideResource] = useState<Resource | null>(null)

  const vertical = getVerticalConfig(industryType)
  const [viewMode, setViewMode] = useState<ViewMode>('map')
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  
  const [shopSettings, setShopSettings] = useState<any>(null)
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

          <button
            onClick={() => {
              toast.promise(refreshHydration(), {
                loading: 'Đang đồng bộ dữ liệu...',
                success: 'Đã cập nhật sản phẩm & tồn kho!',
                error: 'Đồng bộ thất bại',
              })
            }}
            disabled={hydrationStatus === 'loading'}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <span className={hydrationStatus === 'loading' ? 'animate-spin' : ''}>↻</span>
            <span className="hidden sm:inline">Đồng bộ</span>
          </button>
          <a href={`${backPath}/resources`} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <span className="hidden sm:inline">Quản lý</span>
          </a>
        </div>
      </div>

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
                      <div className="space-y-1 text-[11px] text-slate-500">
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
                          <div className="flex flex-wrap gap-1 mt-2">
                            {rmd.amenities.slice(0, 3).map((a: string) => (
                              <span key={a} className="rounded-full bg-white border border-slate-200 px-1.5 py-0.5 text-[9px] text-slate-500">{a}</span>
                            ))}
                            {rmd.amenities.length > 3 && <span className="text-[9px] text-slate-400">+{rmd.amenities.length - 3}</span>}
                          </div>
                        )}
                      </div>

                      {/* Status label at the bottom */}
                      <div className={`mt-auto w-full rounded-lg px-2 py-1.5 text-center transition-colors ${r.status === 'cleaning' ? 'bg-amber-100 hover:bg-amber-200' : st.bg}`}>
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
      />
    </div>
  )
}

function safeParseJSON(str?: string): Record<string, any> {
  if (!str) return {}
  try { return JSON.parse(str) } catch { return {} }
}
