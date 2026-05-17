'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { usePOSHydration } from '@/hooks/usePOSHydration'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { SyncWorker } from '@/lib/pos/syncWorker'
import { ResourceSlideOver } from './ResourceSlideOver'

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

interface Props {
  shopId: string
  branchId: string
  shopName: string
  userEmail: string
  backPath: string
  resourceLabel: string
  resourceType: string
  hasHourlyBilling: boolean
  autoPrintReceipt?: boolean
  mutePosSound?: boolean
}

const STATUS_CARDS: Record<string, { border: string; bg: string; dot: string; label: string }> = {
  available: { border: 'border-green-200 hover:border-green-400', bg: 'bg-white', dot: 'bg-green-500', label: 'Trống' },
  occupied:  { border: 'border-red-300', bg: 'bg-red-50/60', dot: 'bg-red-500', label: 'Đang sử dụng' },
  cleaning:  { border: 'border-amber-200', bg: 'bg-amber-50/60', dot: 'bg-amber-500', label: 'Dọn dẹp' },
  reserved:  { border: 'border-blue-200', bg: 'bg-blue-50/60', dot: 'bg-blue-500', label: 'Đã đặt' },
}

type ViewMode = 'grid' | 'session'

export function TableMapPOS({
  shopId, branchId, shopName, userEmail, backPath,
  resourceLabel, resourceType, hasHourlyBilling,
  autoPrintReceipt = false, mutePosSound = false,
}: Props) {
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [, setTick] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // UI state
  const [activeSlideResource, setActiveSlideResource] = useState<Resource | null>(null)

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

  const fetchResources = useCallback(async () => {
    try {
      const res = await fetch(`/api/shops/${shopId}/location-resources?limit=500`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setResources(json.data ?? [])
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

  function handleResourceClick(r: Resource) {
    if (r.status === 'available' || r.status === 'occupied') {
      setActiveSlideResource(r)
    } else if (r.status === 'cleaning') {
      handleSetAvailable(r)
    }
  }

  async function handleSetAvailable(r: Resource) {
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
    }
  }

  function handleCheckInSuccess() {
    setActiveSlideResource(null)
    fetchResources()
  }

  function handleSessionClosed() {
    setActiveSlideResource(null)
    fetchResources()
  }

  // --- Grid View ---
  // Group by zone
  const zones = new Map<string, Resource[]>()
  for (const r of resources) {
    const zone = r.zone || 'Chưa phân vùng'
    if (!zones.has(zone)) zones.set(zone, [])
    zones.get(zone)!.push(r)
  }

  // Stats
  const stats = {
    total: resources.length,
    available: resources.filter(r => r.status === 'available').length,
    occupied: resources.filter(r => r.status === 'occupied').length,
    cleaning: resources.filter(r => r.status === 'cleaning').length,
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{resourceLabel} POS</h1>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" />{stats.available} trống</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />{stats.occupied} sử dụng</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />{stats.cleaning} dọn dẹp</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              toast.promise(refreshHydration(), {
                loading: 'Đang đồng bộ dữ liệu...',
                success: 'Đã cập nhật sản phẩm & tồn kho!',
                error: 'Đồng bộ thất bại',
              })
            }}
            disabled={hydrationStatus === 'loading'}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <span className={hydrationStatus === 'loading' ? 'animate-spin' : ''}>↻</span>
            <span className="hidden sm:inline">Đồng bộ</span>
          </button>
          <a href={backPath} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
            ← Thoát
          </a>
        </div>
      </div>

      {/* Resource grid */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : resources.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <div className="text-4xl mb-3">🏪</div>
          <p className="text-sm font-medium text-slate-600">Chưa có {resourceLabel} nào</p>
          <p className="mt-1 text-xs text-slate-400">Vào Quản lý vị trí để tạo {resourceLabel}</p>
        </div>
      ) : (
        Array.from(zones.entries()).map(([zone, items]) => (
          <div key={zone}>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-slate-700">{zone}</h3>
              <span className="text-xs text-slate-400">{items.length} vị trí</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {items.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)).map(r => {
                const st = STATUS_CARDS[r.status] ?? STATUS_CARDS.available
                const rmd = safeParseJSON(r.metadata)
                const isRoomType = r.type === 'room'
                return (
                  <button
                    key={r.id}
                    onClick={() => handleResourceClick(r)}
                    className={`group relative rounded-2xl border p-4 text-left transition-all hover:shadow-lg cursor-pointer overflow-hidden ${
                      r.status === 'occupied' ? 'border-red-300 bg-gradient-to-br from-red-50 to-rose-50 shadow-sm'
                      : r.status === 'reserved' ? 'border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-sm'
                      : r.status === 'cleaning' ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 shadow-sm'
                      : 'border-slate-200 bg-gradient-to-br from-white to-slate-50 hover:border-primary/40'
                    }`}
                  >
                    {/* Status indicator bar */}
                    <div className={`absolute top-0 left-0 right-0 h-1 ${
                      r.status === 'occupied' ? 'bg-gradient-to-r from-red-400 to-rose-500'
                      : r.status === 'reserved' ? 'bg-gradient-to-r from-blue-400 to-indigo-500'
                      : r.status === 'cleaning' ? 'bg-gradient-to-r from-amber-400 to-yellow-500'
                      : 'bg-gradient-to-r from-green-400 to-emerald-500'
                    }`} />

                    {/* Header */}
                    <div className="flex items-start justify-between mb-2 mt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-lg">{isRoomType ? '🛏️' : r.type === 'court' ? '🏸' : '🪑'}</span>
                        <p className="text-sm font-bold text-slate-800 truncate">{r.name}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold ${st.text || 'text-slate-700'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot} ${r.status === 'occupied' ? 'animate-pulse' : ''}`} />
                        {st.label}
                      </span>
                    </div>

                    {/* Meta info */}
                    <div className="space-y-1 text-[11px] text-slate-500">
                      {r.capacity && <div className="flex items-center gap-1"><span>👤</span> <span>{r.capacity} người</span></div>}
                      {hasHourlyBilling && r.hourly_rate && Number(r.hourly_rate) > 0 && (
                        <div className="flex items-center gap-1"><span>⏱️</span> <span className="font-semibold text-slate-700">{Number(r.hourly_rate).toLocaleString('vi-VN')}₫/h</span></div>
                      )}
                      {isRoomType && rmd.overnight_rate && (
                        <div className="flex items-center gap-1"><span>🌙</span> <span className="font-semibold text-slate-700">{Number(rmd.overnight_rate).toLocaleString('vi-VN')}₫/đêm</span></div>
                      )}
                      {isRoomType && rmd.room_class && (
                        <div className="flex items-center gap-1"><span>⭐</span> <span className="capitalize">{rmd.room_class}</span></div>
                      )}
                    </div>

                    {/* Amenities chips */}
                    {isRoomType && rmd.amenities?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {rmd.amenities.slice(0, 3).map((a: string) => (
                          <span key={a} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">{a}</span>
                        ))}
                        {rmd.amenities.length > 3 && <span className="text-[9px] text-slate-400">+{rmd.amenities.length - 3}</span>}
                      </div>
                    )}

                    {/* Occupied: show timer */}
                    {r.status === 'occupied' && r.current_order_id && (
                      <div className="mt-3 rounded-lg bg-red-100/80 px-2 py-1.5 text-center transition-colors group-hover:bg-red-200/80">
                        <p className="text-[11px] font-medium text-red-700">Bấm để xem / order</p>
                      </div>
                    )}

                    {/* Cleaning: click hint */}
                    {r.status === 'cleaning' && (
                      <div className="mt-3 rounded-lg bg-amber-100/80 px-2 py-1.5 text-center transition-colors group-hover:bg-amber-200/80">
                        <p className="text-[11px] font-medium text-amber-700">Bấm để đánh dấu sẵn sàng</p>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))
      )}

      {/* Slide-over Manager */}
      <ResourceSlideOver
        open={!!activeSlideResource}
        onClose={() => setActiveSlideResource(null)}
        resource={activeSlideResource || { id: '', name: '', type: 'room', zone: '', capacity: '', hourly_rate: '', status: 'available' } as any}
        shopId={shopId}
        branchId={branchId}
        shopName={shopName}
        employeeId={userEmail}
        onCheckInSuccess={handleCheckInSuccess}
        onSessionClosed={handleSessionClosed}
      />
    </div>
  )
}

function safeParseJSON(str?: string): Record<string, any> {
  if (!str) return {}
  try { return JSON.parse(str) } catch { return {} }
}
