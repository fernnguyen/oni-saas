'use client'

import React, { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { CalendarDays } from 'lucide-react'
import { ReservationTimeline } from '../channels/pos/components/ReservationTimeline'

interface RoomResource {
  id: string
  name: string
  type: string
  status: string
  zone?: string
  hourly_rate?: string
}

interface ReservationsClientProps {
  shopId: string
  slug: string
  branch: string
}

export function ReservationsClient({
  shopId,
  slug,
  branch
}: ReservationsClientProps) {
  const [resources, setResources] = useState<RoomResource[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRooms = async () => {
    try {
      const res = await fetch(`/api/shops/${shopId}/location-resources?limit=200&t=${Date.now()}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      // Filter for rooms only
      const rooms = (json.data || []).filter((r: any) => r.type === 'room')
      setResources(rooms)
    } catch {
      toast.error('Lỗi khi tải sơ đồ phòng')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRooms()
  }, [shopId])

  return (
    <div className="space-y-6 w-full">
      {/* Premium Header */}
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <CalendarDays className="w-7 h-7 text-primary" /> Sơ đồ đặt phòng trước
        </h1>
        <p className="text-xs font-semibold text-slate-500 tracking-wide">
          Bảng điều khiển Gantt điều phối và đặt cọc phòng lưu trú dành cho chi nhánh
        </p>
      </div>

      {loading ? (
        <div className="min-h-[400px] flex items-center justify-center bg-white rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-slate-500">Đang tải sơ đồ đặt phòng...</span>
          </div>
        </div>
      ) : (
        <ReservationTimeline 
          shopId={shopId}
          slug={slug}
          branch={branch}
          allResources={resources}
          onRefresh={fetchRooms}
        />
      )}
    </div>
  )
}
