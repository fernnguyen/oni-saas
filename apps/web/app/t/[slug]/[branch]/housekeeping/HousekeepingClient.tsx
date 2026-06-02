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

  useEffect(() => {
    fetchRooms()
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
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
          <Brush className="w-7 h-7 text-primary" /> BUỒNG PHÒNG & KIỂM MINIBAR
        </h1>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Giao diện cho Housekeeper dọn phòng, chốt tiêu hao minibar và báo phòng sạch realtime
        </p>
      </div>

      {loading ? (
        <div className="min-h-[400px] flex items-center justify-center bg-white rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-slate-500">Đang tải sơ đồ buồng phòng...</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {rooms.map(room => {
            const isOccupied = room.status === 'occupied'
            const isCleaning = room.status === 'cleaning' || room.status === 'dirty'
            
            return (
              <div 
                key={room.id}
                className="bg-white rounded-3xl border border-slate-100 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col justify-between"
              >
                {/* Room Info Block */}
                <div className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-lg font-black text-slate-900">{room.name}</span>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 shadow-sm ${getStatusBadge(room.status)}`}>
                      {getStatusIcon(room.status)}
                      {getStatusTextLabel(room.status)}
                    </span>
                  </div>
                  {room.zone && (
                    <p className="text-xs font-medium text-slate-400">Tầng/Khu vực: {room.zone}</p>
                  )}
                </div>

                {/* HK Actions */}
                <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex gap-2">
                  {isOccupied && (
                    <button
                      onClick={() => handleOpenInspection(room)}
                      className="w-full py-2.5 bg-primary hover:bg-primary/95 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-primary/10 flex items-center justify-center gap-1.5"
                    >
                      <Wine className="w-3.5 h-3.5" /> Kiểm Minibar
                    </button>
                  )}
                  {isCleaning && (
                    <button
                      onClick={() => handleMarkClean(room.id)}
                      className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-100 flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" /> Đã dọn xong
                    </button>
                  )}
                  {room.status === 'available' && (
                    <div className="w-full text-center text-xs font-semibold text-emerald-600 bg-emerald-50/30 border border-emerald-100/50 py-2 rounded-xl italic flex items-center justify-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-500" /> Phòng sạch sẵn sàng
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
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40">
          <div 
            className="fixed inset-0 cursor-pointer"
            onClick={() => !submitting && setInspectRoom(null)}
          />
          <div className="relative bg-white h-full w-full max-w-md shadow-2xl flex flex-col justify-between border-l border-slate-100 animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-1.5">
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
                          <span className="w-8 text-center text-sm font-black text-slate-800">
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
    </div>
  )
}
