'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { usePOSHydration } from '@/hooks/usePOSHydration'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { SyncWorker } from '@/lib/pos/syncWorker'
import { ResourceSlideOver } from './ResourceSlideOver'
import { getVerticalConfig } from '@oni/core'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { DataTable, type Column } from '@/app/components/ui/DataTable'

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
}

const STATUS_CARDS: Record<string, { border: string; bg: string; dot: string; label: string; text?: string }> = {
  available: { border: 'border-green-200 hover:border-green-400', bg: 'bg-white', dot: 'bg-green-500', label: 'Trống', text: 'text-green-600' },
  occupied:  { border: 'border-red-300', bg: 'bg-red-50/60', dot: 'bg-red-500', label: 'Đang sử dụng', text: 'text-red-700' },
  cleaning:  { border: 'border-amber-200', bg: 'bg-amber-50/60', dot: 'bg-amber-500', label: 'Dọn dẹp', text: 'text-amber-700' },
  reserved:  { border: 'border-blue-200', bg: 'bg-blue-50/60', dot: 'bg-blue-500', label: 'Đã đặt', text: 'text-blue-700' },
  maintenance: { border: 'border-slate-300', bg: 'bg-slate-100', dot: 'bg-slate-400', label: 'Tạm ngừng', text: 'text-slate-600' },
}

type ViewMode = 'grid' | 'list'

export function TableMapPOS({
  shopId, branchId, shopName, userEmail, backPath,
  resourceLabel, resourceType, posLabel, hasHourlyBilling,
  autoPrintReceipt = false, mutePosSound = false,
  industryType,
}: Props) {
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [, setTick] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // UI state
  const [activeSlideResource, setActiveSlideResource] = useState<Resource | null>(null)

  const vertical = getVerticalConfig(industryType)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  useEffect(() => {
    const saved = localStorage.getItem('pos_view_mode')
    if (saved === 'grid' || saved === 'list') setViewMode(saved)
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

  function handleCheckInSuccess(orderId: string) {
    if (activeSlideResource) {
      setActiveSlideResource({ ...activeSlideResource, status: 'occupied', current_order_id: orderId })
    }
    fetchResources()
  }

  function handleSessionClosed() {
    setActiveSlideResource(null)
    fetchResources()
  }

  // --- Grid View ---
  // Group by zone (filter out deleted)
  const activeResources = resources.filter(r => r.status !== 'deleted')
  const zones = new Map<string, Resource[]>()
  for (const r of activeResources) {
    const zone = r.zone || 'Chưa phân vùng'
    if (!zones.has(zone)) zones.set(zone, [])
    zones.get(zone)!.push(r)
  }

  // Stats
  const stats = {
    total: activeResources.length,
    available: activeResources.filter(r => r.status === 'available').length,
    occupied: activeResources.filter(r => r.status === 'occupied').length,
    cleaning: activeResources.filter(r => r.status === 'cleaning').length,
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{posLabel || `${resourceLabel} POS`}</h1>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" />{stats.available} trống</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />{stats.occupied} sử dụng</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />{stats.cleaning} dọn dẹp</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
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
          </div>

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

      {/* Resource grid */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : resources.length === 0 ? (
        <EmptyState title={`Chưa có ${resourceLabel} nào`} description={`Vào Quản lý vị trí để tạo ${resourceLabel}`} />
      ) : (
        <>
          {viewMode === 'grid' && Array.from(zones.entries()).map(([zone, items]) => (
            <div key={zone}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-slate-700">{zone}</h3>
                <span className="text-xs text-slate-400">{items.length} vị trí</span>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {items.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)).map(r => {
                  const st = STATUS_CARDS[r.status] ?? STATUS_CARDS.available
                  const rmd = safeParseJSON(r.metadata)
                  const tpl = vertical.resourceTemplates?.find(t => t.id === r.type)
                  const isRoomType = r.type === 'room'
                  return (
                    <button
                      key={r.id}
                      onClick={() => handleResourceClick(r)}
                      className={`group relative rounded-2xl border p-4 flex flex-col text-left transition-all hover:shadow-lg cursor-pointer overflow-hidden ${
                        r.status === 'occupied' ? 'border-red-300 bg-gradient-to-br from-red-50 to-rose-50 shadow-sm'
                        : r.status === 'reserved' ? 'border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-sm'
                        : r.status === 'cleaning' ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 shadow-sm'
                        : r.status === 'maintenance' ? 'border-slate-300 bg-slate-100 opacity-60'
                        : 'border-slate-200 bg-gradient-to-br from-white to-slate-50 hover:border-primary/40'
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
                        <div className="flex items-center gap-1.5">
                          <span className="text-xl">{tpl?.icon || (isRoomType ? '🛏️' : r.type === 'court' ? '🏸' : '🪑')}</span>
                          <p className="text-base font-bold text-slate-800 line-clamp-2 leading-tight">{r.name}</p>
                        </div>
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
                      <div className={`mt-auto w-full rounded-lg px-2 py-1.5 text-center transition-colors ${r.status === 'cleaning' ? 'bg-amber-100 border-amber-300 hover:bg-amber-200' : st.bg} ${st.border} border`}>
                        <p className={`text-[12px] font-bold flex items-center justify-center gap-1.5 ${st.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${st.dot} ${r.status === 'occupied' ? 'animate-pulse' : ''}`} />
                          {r.status === 'cleaning' ? '✓ Dọn xong' : st.label}
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
              className: 'w-[25%]',
              render: (r) => {
                const tpl = vertical.resourceTemplates?.find(t => t.id === r.type)
                const isRoomType = r.type === 'room'
                return (
                  <button onClick={() => handleResourceClick(r)} className="flex items-center gap-2 text-left group">
                    <span className="text-lg group-hover:scale-110 transition-transform">{tpl?.icon || (isRoomType ? '🛏️' : r.type === 'court' ? '🏸' : '🪑')}</span>
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
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${st.bg} ${st.text} border ${st.border}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${st.dot} ${r.status === 'occupied' ? 'animate-pulse' : ''}`} />
                    {st.label}
                  </span>
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
                  onClick={() => handleResourceClick(r)}
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
          groupedData={Array.from(zones.entries()).map(([zone, items]) => ({
            key: zone,
            label: (
              <span className="uppercase tracking-wider">
                {zone}
                <span className="text-slate-400 text-xs font-normal normal-case ml-2">({items.length} vị trí)</span>
              </span>
            ),
            items: items.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
          }))}
          rowKey={(row) => row.id}
        />
      )}
      </>
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
        resourceTemplate={vertical.resourceTemplates?.find(t => t.id === activeSlideResource?.type) || vertical.resourceTemplate}
        allResources={activeResources}
        onRefresh={fetchResources}
        autoPrintReceipt={autoPrintReceipt}
      />
    </div>
  )
}

function safeParseJSON(str?: string): Record<string, any> {
  if (!str) return {}
  try { return JSON.parse(str) } catch { return {} }
}
