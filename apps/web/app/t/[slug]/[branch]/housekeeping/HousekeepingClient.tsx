'use client'

import React, { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { 
  BedDouble, 
  Sparkles, 
  Check, 
  Wine, 
  AlertTriangle, 
  Brush, 
  CheckCircle,
  X
} from 'lucide-react'

interface RoomResource {
  id: string
  name: string
  type: string
  status: 'available' | 'occupied' | 'cleaning' | 'dirty'
  current_order_id?: string
  zone?: string
  hourly_rate?: string
}

interface MinibarSetupItem {
  id: string
  product_id: string
  product_name?: string
  standard_qty: number
}

interface HousekeepingClientProps {
  shopId: string
  slug: string
  branch: string
}

export function HousekeepingClient({
  shopId,
  slug,
  branch
}: HousekeepingClientProps) {
  const [rooms, setRooms] = useState<RoomResource[]>([])
  const [loading, setLoading] = useState(true)
  
  // Inspection modal state
  const [inspectRoom, setInspectRoom] = useState<RoomResource | null>(null)
  const [minibarSetup, setMinibarSetup] = useState<MinibarSetupItem[]>([])
  const [loadingSetup, setLoadingSetup] = useState(false)
  const [remainingCounts, setRemainingCounts] = useState<Record<string, number>>({}) // product_id -> count count
  const [submitting, setSubmitting] = useState(false)

  // Minibar Setup/Config Modal States
  const [setupModalOpen, setSetupModalOpen] = useState(false)
  const [setupRoomId, setSetupRoomId] = useState('')
  const [setupProductId, setSetupProductId] = useState('')
  const [setupQty, setSetupQty] = useState(1)
  const [applyToAll, setApplyToAll] = useState(false)
  const [setupItems, setSetupItems] = useState<{ product_id: string; product_name: string; standard_qty: number }[]>([])
  const [savingSetup, setSavingSetup] = useState(false)
  const [allProducts, setAllProducts] = useState<any[]>([])

  const fetchRooms = async () => {
    try {
      const res = await fetch(`/api/shops/${shopId}/location-resources?limit=200&t=${Date.now()}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      // Filter for rooms only
      const roomList = (json.data || []).filter((r: any) => r.type === 'room')
      setRooms(roomList)
    } catch {
      toast.error('Lỗi khi tải danh sách phòng dọn dẹp')
    } finally {
      setLoading(false)
    }
  }

  const fetchProducts = async () => {
    try {
      const res = await fetch(`/api/shops/${shopId}/products?limit=200`)
      if (res.ok) {
        const json = await res.json()
        setAllProducts(json.data || [])
      }
    } catch {}
  }

  useEffect(() => {
    fetchRooms()
    fetchProducts()
  }, [shopId])

  const handleMarkClean = async (roomId: string) => {
    const loadToast = toast.loading('Đang cập nhật trạng thái phòng...')
    try {
      const res = await fetch(`/api/shops/${shopId}/location-resources/${roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'available' })
      })

      if (!res.ok) throw new Error()
      toast.success('Phòng sạch! Đã chuyển trạng thái sang Sẵn Sàng (Available).')
      fetchRooms()
    } catch {
      toast.error('Lỗi khi cập nhật trạng thái phòng')
    } finally {
      toast.dismiss(loadToast)
    }
  }

  const handleOpenInspection = async (room: RoomResource) => {
    setInspectRoom(room)
    setLoadingSetup(true)
    setMinibarSetup([])
    setRemainingCounts({})
    
    try {
      // 1. Fetch minibar setup templates
      const res = await fetch(`/api/shops/${shopId}/housekeeping/minibar-setup?resource_id=${room.id}&t=${Date.now()}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      const items = json.data || []
      
      // Let's resolve the product names for display
      const resolvedItems = []
      for (const item of items) {
        // Standard setup standard_qty
        const standardQty = parseInt(item.standard_qty || '0', 10)
        
        // Fetch product info to get name
        let productName = 'Sản phẩm ' + item.product_id
        try {
          const prodRes = await fetch(`/api/shops/${shopId}/products/${item.product_id}`)
          if (prodRes.ok) {
            const prod = await prodRes.json()
            productName = prod.name || productName
          }
        } catch {}

        resolvedItems.push({
          id: item.id,
          product_id: item.product_id,
          product_name: productName,
          standard_qty: standardQty
        })

        // Default reported remaining quantity to standard_qty (assumes none consumed initially in UI)
        setRemainingCounts(prev => ({
          ...prev,
          [item.product_id]: standardQty
        }))
      }

      setMinibarSetup(resolvedItems)
    } catch {
      toast.error('Lỗi khi tải cấu hình Minibar')
    } finally {
      setLoadingSetup(false)
    }
  }

  const handleAdjustCount = (productId: string, val: number, max: number) => {
    setRemainingCounts(prev => {
      const current = prev[productId] ?? max
      const updated = Math.min(max, Math.max(0, current + val))
      return { ...prev, [productId]: updated }
    })
  }

  const handleSubmitInspection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inspectRoom) return

    setSubmitting(true)
    const loadToast = toast.loading('Đang cập nhật tiêu hao minibar...')

    try {
      const formattedItems = Object.entries(remainingCounts).map(([product_id, current_qty]) => ({
        product_id,
        current_qty: String(current_qty)
      }))

      const res = await fetch(`/api/shops/${shopId}/housekeeping/report-consumption`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_id: inspectRoom.id,
          items: formattedItems
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Lỗi kiểm phòng')
      }

      const result = await res.json()
      const totalFee = result.totalAddedFee || 0
      
      if (totalFee > 0) {
        toast.success(`Khớp phòng thành công! Đã thêm ${totalFee.toLocaleString('vi-VN')}₫ tiêu hao minibar vào bill phòng.`)
      } else {
        toast.success(`Khớp phòng sạch sẽ! Không phát sinh tiêu hao minibar.`)
      }

      setInspectRoom(null)
      fetchRooms()
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi gửi kết quả kiểm phòng')
    } finally {
      setSubmitting(false)
      toast.dismiss(loadToast)
    }
  }

  const handleAddSetupItem = () => {
    if (!setupProductId) return
    const prod = allProducts.find(p => p.id === setupProductId)
    if (!prod) return
    
    if (setupItems.some(item => item.product_id === setupProductId)) {
      toast.warning('Sản phẩm này đã có trong danh sách định mức!')
      return
    }
    
    setSetupItems(prev => [...prev, {
      product_id: setupProductId,
      product_name: prod.name,
      standard_qty: setupQty
    }])
    
    setSetupProductId('')
    setSetupQty(1)
  }

  const handleSaveMinibarSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!applyToAll && !setupRoomId) {
      toast.error('Vui lòng chọn phòng')
      return
    }
    if (setupItems.length === 0) {
      toast.error('Vui lòng thêm ít nhất 1 sản phẩm định mức vào danh sách!')
      return
    }

    setSavingSetup(true)
    const loadToast = toast.loading('Đang lưu cấu hình định mức...')
    try {
      const payload: any[] = []
      const roomsToConfigure = applyToAll ? rooms : rooms.filter(r => r.id === setupRoomId)
      
      for (const room of roomsToConfigure) {
        for (const item of setupItems) {
          payload.push({
            resource_id: room.id,
            product_id: item.product_id,
            standard_qty: item.standard_qty
          })
        }
      }

      const res = await fetch(`/api/shops/${shopId}/housekeeping/minibar-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) throw new Error()
      toast.success(applyToAll 
        ? `Đã cấu hình định mức cho tất cả ${rooms.length} phòng thành công!` 
        : `Đã cấu hình định mức cho phòng ${rooms.find(r => r.id === setupRoomId)?.name || ''} thành công!`
      )
      setSetupModalOpen(false)
      setSetupItems([])
      setSetupProductId('')
      setSetupQty(1)
      setApplyToAll(false)
    } catch {
      toast.error('Lỗi khi cấu hình định mức Minibar')
    } finally {
      setSavingSetup(false)
      toast.dismiss(loadToast)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'occupied': return 'bg-red-50 text-red-700 border-red-100'
      case 'cleaning': return 'bg-amber-50 text-amber-700 border-amber-100'
      case 'dirty': return 'bg-orange-50 text-orange-700 border-orange-100'
      default: return 'bg-emerald-50 text-emerald-700 border-emerald-100'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'occupied': return <BedDouble className="w-3.5 h-3.5 text-red-500" />
      case 'cleaning': return <Brush className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
      case 'dirty': return <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
      default: return <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
    }
  }

  const getStatusTextLabel = (status: string) => {
    switch (status) {
      case 'occupied': return 'Có khách (Occupied)'
      case 'cleaning': return 'Đang dọn (Cleaning)'
      case 'dirty': return 'Phòng dơ (Dirty)'
      default: return 'Sẵn sàng (Available)'
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Premium Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Brush className="w-7 h-7 text-primary" /> BUỒNG PHÒNG & KIỂM MINIBAR
          </h1>
          <p className="text-xs font-semibold text-slate-500 tracking-wide uppercase">
            Giao diện cho buồng phòng dọn dẹp, kiểm đếm minibar và báo sạch thời gian thực
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setSetupModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 text-xs font-bold shadow-sm transition-colors cursor-pointer"
          >
            <Wine className="w-4 h-4 text-white" /> Cài đặt định mức Minibar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="min-h-[400px] flex items-center justify-center bg-white rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-slate-500">Đang tải sơ đồ buồng phòng...</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {rooms.map(room => {
            const isOccupied = room.status === 'occupied'
            const isCleaning = room.status === 'cleaning' || room.status === 'dirty'
            
            return (
              <div 
                key={room.id}
                className={`group relative rounded-2xl border p-4 flex flex-col justify-between transition-all hover:shadow-md overflow-hidden ${
                  room.status === 'occupied' ? 'border-red-300 bg-gradient-to-br from-red-50 to-rose-50 shadow-xs'
                  : (room.status === 'cleaning' || room.status === 'dirty') ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 shadow-xs'
                  : 'border-slate-200 bg-gradient-to-br from-white to-slate-50 hover:border-green-400'
                }`}
              >
                {/* Status indicator bar */}
                <div className={`absolute top-0 left-0 right-0 h-1 ${
                  room.status === 'occupied' ? 'bg-gradient-to-r from-red-400 to-rose-500'
                  : (room.status === 'cleaning' || room.status === 'dirty') ? 'bg-gradient-to-r from-amber-400 to-yellow-500'
                  : 'bg-gradient-to-r from-green-400 to-emerald-500'
                }`} />

                {/* Header */}
                <div className="flex items-start justify-between mb-2 mt-1">
                  <p className="text-base font-bold text-slate-800 line-clamp-2 leading-tight">{room.name}</p>
                </div>

                {/* Meta info */}
                <div className="space-y-1 text-[11px] text-slate-500 mb-3">
                  {room.zone && (
                    <div className="flex items-center gap-1.5">
                      <span className="opacity-70">📍</span> Tầng/Khu vực: <span className="font-semibold text-slate-700">{room.zone}</span>
                    </div>
                  )}
                </div>

                {/* Status label bar at the bottom */}
                <div className={`w-full rounded-lg px-2 py-1.5 text-center transition-colors ${
                  room.status === 'occupied' ? 'bg-red-100/50'
                  : (room.status === 'cleaning' || room.status === 'dirty') ? 'bg-amber-100/60'
                  : 'bg-green-50'
                }`}>
                  <p className={`text-[12px] font-bold flex items-center justify-center gap-1.5 ${
                    room.status === 'occupied' ? 'text-red-700'
                    : (room.status === 'cleaning' || room.status === 'dirty') ? 'text-amber-700'
                    : 'text-green-600'
                  }`}>
                    <span className={`h-2 w-2 rounded-full ${
                      room.status === 'occupied' ? 'bg-red-500'
                      : (room.status === 'cleaning' || room.status === 'dirty') ? 'bg-amber-500 animate-pulse'
                      : 'bg-green-500'
                    }`} />
                    {room.status === 'occupied' ? 'Có khách (Occupied)'
                     : room.status === 'cleaning' ? 'Đang dọn (Cleaning)'
                     : room.status === 'dirty' ? 'Phòng dơ (Dirty)'
                     : 'Trống (Available)'}
                  </p>
                </div>

                {/* HK Actions */}
                <div className="mt-3.5 flex gap-2 w-full pt-3 border-t border-slate-100/80">
                  {isOccupied && (
                    <button
                      onClick={() => handleOpenInspection(room)}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Wine className="w-3.5 h-3.5" /> Kiểm Minibar
                    </button>
                  )}
                  {isCleaning && (
                    <button
                      onClick={() => handleMarkClean(room.id)}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" /> Đã dọn xong
                    </button>
                  )}
                  {room.status === 'available' && (
                    <div className="w-full text-center text-xs font-semibold text-emerald-700 bg-green-50/50 border border-green-200/50 py-1.5 rounded-xl italic flex items-center justify-center gap-1 shadow-2xs">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-500 animate-pulse" /> Sạch sẵn sàng
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Minibar Count Overlay / SlideOver */}
      {inspectRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 animate-in fade-in duration-200">
          <div 
            className="fixed inset-0 cursor-pointer"
            onClick={() => !submitting && setInspectRoom(null)}
          />
          <div className="relative bg-white h-full w-full max-w-md shadow-2xl flex flex-col justify-between border-l border-slate-100 animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                  <Wine className="w-5 h-5 text-primary" /> Kiểm Minibar: {inspectRoom.name}
                </h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Nhập số lượng còn lại chuẩn định mức</p>
              </div>
              <button 
                type="button" 
                disabled={submitting}
                onClick={() => setInspectRoom(null)} 
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List Body */}
            <div className="flex-1 overflow-y-auto p-5 bg-slate-50/30 space-y-4">
              {loadingSetup ? (
                <div className="py-12 flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-semibold text-slate-400">Đang tải định mức minibar...</span>
                </div>
              ) : minibarSetup.length === 0 ? (
                <div className="py-10 border border-dashed border-slate-200 rounded-2xl bg-white text-center text-xs font-medium text-slate-400">
                  Phòng này chưa được cấu hình định mức Minibar mặc định.
                </div>
              ) : (
                <div className="space-y-3">
                  {minibarSetup.map(item => {
                    const remaining = remainingCounts[item.product_id] ?? item.standard_qty
                    const consumed = Math.max(0, item.standard_qty - remaining)
                    
                    return (
                      <div 
                        key={item.id} 
                        className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-800 truncate">{item.product_name}</p>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
                            Định mức: <span className="font-extrabold text-slate-700">{item.standard_qty}</span>
                            {consumed > 0 && (
                              <span className="ml-2 text-rose-500 font-extrabold bg-rose-50 px-2 py-0.5 rounded">
                                Tiêu hao: {consumed}
                              </span>
                            )}
                          </p>
                        </div>

                        {/* Adjust Count Grid */}
                        <div className="flex items-center gap-1.5 shrink-0 ml-4">
                          <button
                            type="button"
                            onClick={() => handleAdjustCount(item.product_id, -1, item.standard_qty)}
                            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold flex items-center justify-center transition-colors active:scale-90"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-sm font-black text-slate-880">
                            {remaining}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAdjustCount(item.product_id, 1, item.standard_qty)}
                            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold flex items-center justify-center transition-colors active:scale-90"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-slate-100 bg-white flex gap-3 shrink-0">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setInspectRoom(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
              >
                Đóng
              </button>
              <button
                type="button"
                disabled={submitting || minibarSetup.length === 0}
                onClick={handleSubmitInspection}
                className="flex-1 py-3 bg-primary hover:bg-primary/95 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" /> {submitting ? 'Đang gửi...' : 'Xác nhận & Bù đồ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Minibar Config Setup Modal */}
      {setupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 animate-in fade-in duration-200">
          <div 
            className="fixed inset-0 cursor-pointer"
            onClick={() => !savingSetup && setSetupModalOpen(false)}
          />
          <form onSubmit={handleSaveMinibarSetup} className="relative bg-white rounded-3xl max-w-md w-full shadow-2xl p-6 border border-slate-100 space-y-4 animate-in zoom-in-95 duration-200">
            {savingSetup && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] z-50 flex flex-col items-center justify-center rounded-3xl animate-in fade-in duration-200">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-bold text-slate-700">Đang lưu định mức Minibar...</span>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                <Wine className="w-5 h-5 text-primary" /> Cài đặt Định mức Minibar
              </h3>
              <button 
                type="button" 
                disabled={savingSetup} 
                onClick={() => setSetupModalOpen(false)} 
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-600">
              <div className="flex items-center gap-2 py-1 select-none">
                <input
                  type="checkbox"
                  id="applyToAll"
                  disabled={savingSetup}
                  checked={applyToAll}
                  onChange={e => {
                    setApplyToAll(e.target.checked)
                    if (e.target.checked) {
                      setSetupRoomId('all')
                    } else {
                      setSetupRoomId('')
                    }
                  }}
                  className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                />
                <label htmlFor="applyToAll" className="font-semibold text-slate-700 cursor-pointer">
                  Áp dụng định mức này cho tất cả các phòng
                </label>
              </div>

              {!applyToAll && (
                <div>
                  <label className="block font-medium mb-1.5">Chọn phòng buồng *</label>
                  <select
                    required={!applyToAll}
                    disabled={savingSetup}
                    value={setupRoomId}
                    onChange={e => setSetupRoomId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs bg-white"
                  >
                    <option value="">-- Chọn phòng --</option>
                    {rooms.map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.zone || 'Khu vực khác'})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="border border-slate-100 rounded-2xl p-3 bg-slate-50/50 space-y-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Thêm sản phẩm định mức:</p>
                <div className="space-y-3">
                  <div>
                    <label className="block font-medium mb-1">Chọn sản phẩm (Danh mục F&B) *</label>
                    <select
                      disabled={savingSetup}
                      value={setupProductId}
                      onChange={e => setSetupProductId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-xs bg-white"
                    >
                      <option value="">-- Chọn sản phẩm --</option>
                      {allProducts.map(p => (
                        <option key={p.id} value={p.id}>{p.name} - {Number(p.sell_price || 0).toLocaleString('vi-VN')}₫</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block font-medium mb-1">Số lượng định mức *</label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={savingSetup || setupQty <= 1}
                          onClick={() => setSetupQty(q => Math.max(1, q - 1))}
                          className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 font-extrabold flex items-center justify-center transition-colors active:scale-95 disabled:opacity-50"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-xs font-black text-slate-800">
                          {setupQty}
                        </span>
                        <button
                          type="button"
                          disabled={savingSetup}
                          onClick={() => setSetupQty(q => q + 1)}
                          className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 font-extrabold flex items-center justify-center transition-colors active:scale-95"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={savingSetup || !setupProductId}
                      onClick={handleAddSetupItem}
                      className="mt-4 px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 text-white text-[11px] font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      + Thêm sản phẩm
                    </button>
                  </div>
                </div>
              </div>

              {/* Product list preview */}
              {setupItems.length > 0 && (
                <div className="border border-slate-100 rounded-2xl bg-white p-3 space-y-2 max-h-[160px] overflow-y-auto shadow-2xs">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Danh sách định mức phòng ({setupItems.length}):</p>
                  <div className="space-y-1.5">
                    {setupItems.map((item, idx) => (
                      <div key={item.product_id} className="flex items-center justify-between bg-slate-50 border border-slate-200/50 p-2 rounded-xl text-xs">
                        <span className="font-semibold text-slate-700 truncate max-w-[200px]">{item.product_name}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-bold text-slate-800 bg-slate-200/50 px-2 py-0.5 rounded">SL: {item.standard_qty}</span>
                          <button
                            type="button"
                            onClick={() => setSetupItems(prev => prev.filter((_, i) => i !== idx))}
                            className="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <button 
                type="button" 
                disabled={savingSetup} 
                onClick={() => setSetupModalOpen(false)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
              >
                Hủy bỏ
              </button>
              <button 
                type="submit" 
                disabled={savingSetup || (!applyToAll && !setupRoomId) || setupItems.length === 0}
                className="flex-1 py-3 bg-primary hover:bg-primary/95 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-primary/20 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Wine className="w-4 h-4 text-white" /> Xác nhận cài đặt
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
