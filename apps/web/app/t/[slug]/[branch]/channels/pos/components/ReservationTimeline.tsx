'use client'

import React, { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { format, addDays, startOfWeek, differenceInDays, differenceInCalendarDays, isSameDay } from 'date-fns'
import { vi } from 'date-fns/locale'
import { 
  Calendar, 
  CalendarCheck, 
  CalendarDays, 
  Check, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  AlertCircle, 
  User, 
  Plus, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight,
  X,
  Save,
  HelpCircle
} from 'lucide-react'
import { parseGMT7Date } from '@oni/core'


interface Reservation {
  id: string
  reservation_no: string
  customer_id: string
  customer_name: string
  customer_phone: string
  channel_id: string
  ota_booking_code?: string
  expected_checkin: string
  expected_checkout: string
  room_category_id?: string
  resource_id?: string
  num_guests: number
  daily_rate: string
  deposit_amount: string
  deposit_fund_id?: string
  status: 'pending_deposit' | 'confirmed' | 'checked_in' | 'cancelled' | 'no_show'
  note?: string
}

interface RoomResource {
  id: string
  name: string
  type: string
  status: string
  zone?: string
  hourly_rate?: string
  current_order_id?: string
}

interface ReservationTimelineProps {
  shopId: string
  slug: string
  branch: string
  allResources: RoomResource[]
  onRefresh?: () => void
}

export function ReservationTimeline({
  shopId,
  slug,
  branch,
  allResources,
  onRefresh
}: ReservationTimelineProps) {
  const [startDate, setStartDate] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [inProgressOrders, setInProgressOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedRes, setSelectedRes] = useState<Reservation | null>(null)
  
  // Creation modal state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [formRoomId, setFormRoomId] = useState('')
  const [formCheckIn, setFormCheckIn] = useState('')
  const [formCheckOut, setFormCheckOut] = useState('')
  const [formCustName, setFormCustName] = useState('')
  const [formCustPhone, setFormCustPhone] = useState('')
  const [formChannel, setFormChannel] = useState('direct')
  const [formRate, setFormRate] = useState('')
  const [formDeposit, setFormDeposit] = useState('0')
  const [formNote, setFormNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([])

  const [channels, setChannels] = useState<any[]>([])
  const [mounted, setMounted] = useState(false)
  const [filterRoomName, setFilterRoomName] = useState('')
  const [filterZone, setFilterZone] = useState('all')

  // Occupants (Rooming List) state
  const [occupants, setOccupants] = useState<any[]>([])
  const [loadingOccupants, setLoadingOccupants] = useState(false)
  const [showAddOccupant, setShowAddOccupant] = useState(false)
  
  // Occupant form states
  const [occName, setOccName] = useState('')
  const [occPhone, setOccPhone] = useState('')
  const [occIdentity, setOccIdentity] = useState('')
  const [occNationality, setOccNationality] = useState('Vietnam')
  const [occBirthday, setOccBirthday] = useState('')
  const [occGender, setOccGender] = useState('male')
  const [occIsPrimary, setOccIsPrimary] = useState('FALSE')
  const [occNote, setOccNote] = useState('')

  const fetchOccupants = async (resvId: string) => {
    setLoadingOccupants(true)
    try {
      const res = await fetch(`/api/shops/${shopId}/occupants?reservation_id=${resvId}&t=${Date.now()}`)
      if (res.ok) {
        const json = await res.json()
        setOccupants(json.data || [])
      }
    } catch {
      toast.error('Lỗi khi tải danh sách khách lưu trú')
    } finally {
      setLoadingOccupants(false)
    }
  }

  const resetOccForm = () => {
    setOccName('')
    setOccPhone('')
    setOccIdentity('')
    setOccNationality('Vietnam')
    setOccBirthday('')
    setOccGender('male')
    setOccIsPrimary('FALSE')
    setOccNote('')
  }

  const handleAddOccupantSubmit = async () => {
    if (!occName.trim()) {
      toast.error('Vui lòng nhập tên khách')
      return
    }
    if (!selectedRes) return

    try {
      const res = await fetch(`/api/shops/${shopId}/occupants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: selectedRes.id,
          resource_id: selectedRes.resource_id,
          guest_name: occName,
          guest_phone: occPhone,
          identity_card: occIdentity,
          nationality: occNationality,
          birthday: occBirthday,
          gender: occGender,
          is_primary: occIsPrimary,
          note: occNote
        })
      })

      if (!res.ok) throw new Error()
      toast.success('Đã thêm khách lưu trú')
      setShowAddOccupant(false)
      resetOccForm()
      fetchOccupants(selectedRes.id)
    } catch {
      toast.error('Lỗi khi thêm khách lưu trú')
    }
  }

  const handleDeleteOccupant = async (occId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa khách này khỏi danh sách lưu trú?')) return
    try {
      const res = await fetch(`/api/shops/${shopId}/occupants/${occId}`, {
        method: 'DELETE'
      })

      if (!res.ok) throw new Error()
      toast.success('Đã xóa khách lưu trú')
      if (selectedRes) {
        fetchOccupants(selectedRes.id)
      }
    } catch {
      toast.error('Lỗi khi xóa khách lưu trú')
    }
  }

  useEffect(() => {
    if (selectedRes) {
      fetchOccupants(selectedRes.id)
      setShowAddOccupant(false)
    }
  }, [selectedRes])

  const headerRef = React.useRef<HTMLDivElement>(null)
  const bodyRef = React.useRef<HTMLDivElement>(null)

  const handleBodyScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (headerRef.current) {
      headerRef.current.scrollLeft = e.currentTarget.scrollLeft
    }
  }

  const uniqueZones = Array.from(new Set(allResources.map(r => r.zone).filter(Boolean))) as string[]
  const filteredResources = allResources.filter(room => {
    const matchesName = room.name.toLowerCase().includes(filterRoomName.toLowerCase())
    const matchesZone = filterZone === 'all' || room.zone === filterZone
    return matchesName && matchesZone
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleAmountInputChange = (val: string, setter: (v: string) => void) => {
    const raw = val.replace(/\D/g, '')
    if (!raw) {
      setter('0')
      return
    }
    setter(Number(raw).toLocaleString('vi-VN'))
  }

  const parseDateTime = (dateStr: string | any) => {
    return parseGMT7Date(dateStr)
  }

  const getDayIdx = (d: Date) => {
    return differenceInCalendarDays(d, startDate)
  }

  const getGridCol = (date: Date): number => {
    const dayIdx = getDayIdx(date)
    if (dayIdx < 0) return 2 // Default to start of timeline
    if (dayIdx >= 10) return 122 // Default to end of timeline
    const hour = date.getHours()
    const minute = date.getMinutes()
    const blockWithinDay = (hour + minute / 60) / 2
    const blockIdx = Math.round(blockWithinDay)
    return 2 + dayIdx * 12 + blockIdx
  }

  const isTrackOccupied = (roomId: string, track: number) => {
    const combined = [...reservations, ...virtualReservations]
    return combined.some(r => {
      if (r.resource_id !== roomId || r.status === 'cancelled') return false
      const checkin = parseDateTime(r.expected_checkin)
      const checkout = parseDateTime(r.expected_checkout)
      
      const checkinTrack = getGridCol(checkin)
      
      let checkoutTrack: number
      if (r.id.startsWith('virtual-')) {
        checkoutTrack = getGridCol(new Date())
      } else {
        checkoutTrack = getGridCol(checkout)
      }
      
      return track >= checkinTrack && track < checkoutTrack
    })
  }

  const getVisibleReservations = (roomId: string) => {
    const combined = [...reservations, ...virtualReservations]
    return combined.filter(r => {
      if (r.resource_id !== roomId || r.status === 'cancelled') return false
      const checkin = parseDateTime(r.expected_checkin)
      const checkout = parseDateTime(r.expected_checkout)
      
      return checkout >= startDate && checkin <= daysToShow[9]
    })
  }

  // Generate 10 days array for the grid columns
  const daysToShow = Array.from({ length: 10 }).map((_, i) => addDays(startDate, i))

  const virtualReservations = React.useMemo(() => {
    const list: Reservation[] = []
    allResources.forEach(room => {
      if (room.status === 'occupied') {
        // Check if there is already an active checked-in reservation for this room
        const hasCheckedInResv = reservations.some(r => 
          r.resource_id === room.id && 
          r.status === 'checked_in'
        )
        
        if (!hasCheckedInResv) {
          // Find the in-progress order for this room
          const activeOrder = inProgressOrders.find(o => {
            if (room.current_order_id && o.id === room.current_order_id) return true
            try {
              const meta = typeof o.metadata === 'string' ? JSON.parse(o.metadata) : (o.metadata || {})
              return meta.resource_id === room.id
            } catch {
              return false
            }
          })
          
          let checkInDate = new Date()
          let orderNo = ''
          let customerName = 'Khách vãng lai (Walk-in)'
          let orderId = 'unknown'
          let orderNote = 'Phòng đang sử dụng trực tiếp tại POS (Walk-in)'
          
          if (activeOrder) {
            orderId = activeOrder.id
            orderNo = activeOrder.order_no || activeOrder.id.slice(-6)
            customerName = activeOrder.customer_name || 'Khách vãng lai (Walk-in)'
            
            try {
              const meta = typeof activeOrder.metadata === 'string' ? JSON.parse(activeOrder.metadata) : (activeOrder.metadata || {})
              if (meta.check_in) {
                checkInDate = new Date(meta.check_in)
              } else if (meta.check_in_time) {
                checkInDate = new Date(activeOrder.created_at)
                const [hh, mm] = meta.check_in_time.split(':').map(Number)
                checkInDate.setHours(hh, mm, 0, 0)
              } else {
                checkInDate = new Date(activeOrder.created_at)
              }
              if (meta.note) {
                orderNote = meta.note
              }
            } catch {
              checkInDate = new Date(activeOrder.created_at)
            }
          } else {
            // Fallback: 2 hours ago
            checkInDate = new Date(Date.now() - 2 * 60 * 60 * 1000)
          }
          
          list.push({
            id: `virtual-${room.id}-${orderId}`,
            reservation_no: orderNo ? `#${orderNo}` : `POS-${room.id.slice(-4)}`,
            customer_id: 'walk-in',
            customer_name: customerName,
            customer_phone: '',
            channel_id: 'direct',
            expected_checkin: checkInDate.toISOString(),
            expected_checkout: new Date().toISOString(), // end at NOW
            resource_id: room.id,
            num_guests: 1,
            daily_rate: room.hourly_rate || '0',
            deposit_amount: '0',
            status: 'checked_in',
            note: orderNote
          })
        }
      }
    })
    return list
  }, [allResources, reservations, inProgressOrders])

  const fetchReservations = async () => {
    setLoading(true)
    try {
      const [resResv, resOrders] = await Promise.all([
        fetch(`/api/shops/${shopId}/reservations?limit=100&t=${Date.now()}`),
        fetch(`/api/shops/${shopId}/orders?status=in_progress&limit=100&t=${Date.now()}`)
      ])
      
      if (!resResv.ok) throw new Error()
      const dataResv = await resResv.json()
      setReservations(dataResv.data || [])

      if (resOrders.ok) {
        const dataOrders = await resOrders.json()
        setInProgressOrders(dataOrders.data || [])
      }
    } catch {
      toast.error('Lỗi khi tải dữ liệu sơ đồ đặt phòng')
    } finally {
      setLoading(false)
    }
  }

  const handleManualRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const fetchRoomsPromise = onRefresh ? onRefresh() : Promise.resolve()
      const fetchResPromise = fetch(`/api/shops/${shopId}/reservations?limit=100&t=${Date.now()}`)
        .then(async (res) => {
          if (!res.ok) throw new Error()
          const data = await res.json()
          setReservations(data.data || [])
        })
      const fetchOrdersPromise = fetch(`/api/shops/${shopId}/orders?status=in_progress&limit=100&t=${Date.now()}`)
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json()
            setInProgressOrders(data.data || [])
          }
        })

      await Promise.all([fetchRoomsPromise, fetchResPromise, fetchOrdersPromise])
      toast.success('Đã cập nhật sơ đồ đặt phòng mới nhất!')
    } catch {
      toast.error('Lỗi khi làm mới sơ đồ đặt phòng')
    } finally {
      setRefreshing(false)
    }
  }

  const fetchChannels = async () => {
    try {
      const res = await fetch(`/api/shops/${shopId}/booking-channels?t=${Date.now()}`)
      if (res.ok) {
        const json = await res.json()
        setChannels(json.data || [])
      }
    } catch {}
  }

  useEffect(() => {
    fetchReservations()
    fetchChannels()
  }, [shopId, startDate])

  const handleCellClick = (roomId: string, date: Date, hourOffset?: number) => {
    setFormRoomId(roomId)
    setSelectedRoomIds([roomId])
    const checkinTime = new Date(date)
    if (hourOffset !== undefined) {
      checkinTime.setHours(hourOffset, 0, 0, 0)
    } else {
      checkinTime.setHours(14, 0, 0, 0)
    }
    const checkoutTime = addDays(checkinTime, 1)
    checkoutTime.setHours(12, 0, 0, 0)
    
    const checkinStr = format(checkinTime, "yyyy-MM-dd'T'HH:mm")
    const checkoutStr = format(checkoutTime, "yyyy-MM-dd'T'HH:mm")
    setFormCheckIn(checkinStr)
    setFormCheckOut(checkoutStr)
    
    // Prefill rate if room is found
    const room = allResources.find(r => r.id === roomId)
    const defaultRate = room?.hourly_rate || '500000'
    setFormRate(Number(defaultRate.replace(/\D/g, '')).toLocaleString('vi-VN'))
    
    setFormCustName('')
    setFormCustPhone('')
    setFormChannel('direct')
    setFormDeposit('0')
    setFormNote('')
    setCreateModalOpen(true)
  }

  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formCustName.trim()) {
      toast.error('Vui lòng nhập tên khách hàng')
      return
    }
    if (selectedRoomIds.length === 0) {
      toast.error('Vui lòng chọn ít nhất một phòng')
      return
    }

    setSubmitting(true)
    const loadToast = toast.loading('Đang xử lý đặt giữ phòng...')
    try {
      const rawRate = formRate.replace(/\D/g, '')
      const rawDeposit = formDeposit.replace(/\D/g, '')
      const depositVal = parseFloat(rawDeposit) || 0

      // Generate a group booking ID if multiple rooms are selected
      const groupBookingId = selectedRoomIds.length > 1 ? 'GRP-' + Date.now().toString().slice(-6) : null
      const customerId = 'virtual:' + Date.now()

      const promises = selectedRoomIds.map((roomId, idx) => {
        // Place deposit only on the first room of the group, others set 0
        const depositValRoom = idx === 0 ? rawDeposit : '0'
        const statusVal = idx === 0 && depositVal > 0 ? 'confirmed' : 'pending_deposit'

        return fetch(`/api/shops/${shopId}/reservations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reservation_no: 'RSV-' + (Date.now() + idx).toString().slice(-6),
            customer_id: customerId,
            customer_name: formCustName,
            customer_phone: formCustPhone,
            channel_id: formChannel,
            expected_checkin: new Date(formCheckIn).toISOString(),
            expected_checkout: new Date(formCheckOut).toISOString(),
            resource_id: roomId,
            daily_rate: rawRate,
            deposit_amount: depositValRoom,
            status: statusVal,
            group_booking_id: groupBookingId,
            note: formNote
          })
        })
      })

      const results = await Promise.all(promises)
      const hasError = results.some(res => !res.ok)
      if (hasError) throw new Error()

      toast.success(selectedRoomIds.length > 1 
        ? `Đã tạo thành công đặt phòng đoàn (${selectedRoomIds.length} phòng)!` 
        : 'Đã tạo đặt phòng thành công!'
      )
      setCreateModalOpen(false)
      fetchReservations()
      onRefresh?.()
    } catch {
      toast.error('Lỗi khi tạo đặt phòng')
    } finally {
      setSubmitting(false)
      toast.dismiss(loadToast)
    }
  }

  const handleCheckIn = async (resv: Reservation) => {
    if (!resv.resource_id) {
      toast.error('Đặt phòng này chưa được xếp phòng cụ thể!')
      return
    }

    const loadToast = toast.loading('Đang làm thủ tục nhận phòng...')
    try {
      const res = await fetch(`/api/shops/${shopId}/reservations/${resv.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'checked_in'
        })
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Lỗi nhận phòng')
      }

      toast.success('Check-in thành công! Phòng đã được kích hoạt.')
      setSelectedRes(null)
      fetchReservations()
      onRefresh?.()
    } catch (e: any) {
      toast.error(e.message || 'Lỗi khi nhận phòng')
    } finally {
      toast.dismiss(loadToast)
    }
  }

  const handleCancelReservation = async (resvId: string) => {
    if (!confirm('Bạn có chắc chắn muốn hủy đặt phòng này?')) return
    try {
      const res = await fetch(`/api/shops/${shopId}/reservations/${resvId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' })
      })

      if (!res.ok) throw new Error()
      toast.success('Đã hủy đặt phòng')
      setSelectedRes(null)
      fetchReservations()
      onRefresh?.()
    } catch {
      toast.error('Lỗi khi hủy đặt phòng')
    }
  }

  // Helper to find a reservation starting on a specific day for a specific room
  const getReservationForCell = (roomId: string, date: Date) => {
    return reservations.find(r => {
      if (r.resource_id !== roomId || r.status === 'cancelled') return false
      const checkinDate = parseDateTime(r.expected_checkin)
      return isSameDay(checkinDate, date)
    })
  }

  // Get status label badge styles
  const getStatusBadgeClass = (status: string) => {
    if (selectedRes && selectedRes.id.startsWith('virtual-')) {
      return 'bg-rose-100 text-rose-800 border-rose-200'
    }
    switch (status) {
      case 'checked_in': return 'bg-emerald-100 text-emerald-800 border-emerald-200'
      case 'confirmed': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'pending_deposit': return 'bg-amber-100 text-amber-800 border-amber-200'
      case 'no_show': return 'bg-red-100 text-red-800 border-red-200'
      default: return 'bg-slate-100 text-slate-800 border-slate-200'
    }
  }

  const getStatusIcon = (status: string) => {
    if (selectedRes && selectedRes.id.startsWith('virtual-')) {
      return <CheckCircle2 className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
    }
    switch (status) {
      case 'checked_in': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
      case 'confirmed': return <CalendarCheck className="w-3.5 h-3.5 text-blue-500" />
      case 'pending_deposit': return <Clock className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
      case 'no_show': return <AlertCircle className="w-3.5 h-3.5 text-red-500" />
      default: return <XCircle className="w-3.5 h-3.5 text-slate-500" />
    }
  }

  const getStatusTextLabel = (status: string) => {
    if (selectedRes && selectedRes.id.startsWith('virtual-')) {
      return 'Đang ở (POS Walk-in)'
    }
    switch (status) {
      case 'checked_in': return 'Đang ở (In-house)'
      case 'confirmed': return 'Xác nhận (Confirmed)'
      case 'pending_deposit': return 'Chờ cọc (Pending)'
      case 'no_show': return 'No-show'
      default: return 'Đã hủy'
    }
  }

  const getChannelLabel = (channel: string) => {
    const found = channels.find(c => c.id === channel || c.code === channel)
    return found ? found.name : channel
  }

  if (!mounted) {
    return (
      <div className="min-h-[500px] flex items-center justify-center bg-white rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium text-slate-500">Đang tải sơ đồ đặt phòng...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full flex flex-col bg-white rounded-3xl border border-slate-100 shadow-xl overflow-visible min-h-[500px]">
      {/* Navigation & Filter Header */}
      <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Navigation */}
        <div className="flex flex-wrap items-center gap-3">
          <button 
            type="button"
            onClick={() => setStartDate(addDays(startDate, -7))}
            className="px-3 py-2 hover:bg-slate-200 rounded-xl transition-colors font-bold text-slate-600 text-xs flex items-center gap-1 bg-white border border-slate-200 shadow-sm"
          >
            <ChevronLeft className="w-4 h-4" /> Tuần trước
          </button>
          <span className="text-sm font-bold text-slate-800 bg-white border border-slate-200 px-4 py-2 rounded-2xl shadow-sm flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-primary" /> Từ {format(startDate, 'dd/MM/yyyy')} đến {format(daysToShow[9], 'dd/MM/yyyy')}
          </span>
          <button 
            type="button"
            onClick={() => setStartDate(addDays(startDate, 7))}
            className="px-3 py-2 hover:bg-slate-200 rounded-xl transition-colors font-bold text-slate-600 text-xs flex items-center gap-1 bg-white border border-slate-200 shadow-sm"
          >
            Tuần sau <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Room Filter Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Tìm phòng..."
            value={filterRoomName}
            onChange={e => setFilterRoomName(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm min-w-[120px]"
          />
          <select
            value={filterZone}
            onChange={e => setFilterZone(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm bg-white"
          >
            <option value="all">Tất cả khu vực</option>
            {uniqueZones.map(z => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={refreshing}
            onClick={handleManualRefresh}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-400 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : 'animate-spin-hover'}`} /> {refreshing ? 'Đang tải...' : 'Làm mới'}
          </button>
        </div>
      </div>

      {/* Sticky Header Area */}
      <div 
        ref={headerRef}
        className="sticky top-[56px] z-20 overflow-hidden border-b border-slate-100 bg-slate-50 text-slate-500 font-bold text-xs shadow-xs"
      >
        <div 
          className="min-w-[1000px]"
          style={{ 
            display: 'grid', 
            gridTemplateColumns: '120px repeat(120, minmax(0, 1fr))'
          }}
        >
          <div 
            className="sticky left-0 bg-slate-50 p-3 border-r border-slate-100 text-slate-800 text-center flex items-center justify-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]" 
            style={{ 
              gridColumn: '1 / span 1', 
              gridRow: '1',
              zIndex: 25
            }}
          >
            Phòng
          </div>
          {daysToShow.map((date, idx) => (
            <div 
              key={idx} 
              className="p-3 text-center border-r border-slate-100 flex flex-col justify-center items-center animate-in fade-in duration-200"
              style={{ 
                gridColumn: `${12 * idx + 2} / span 12`, 
                gridRow: '1' 
              }}
            >
              <span className="uppercase text-[10px] text-slate-400 font-extrabold">{format(date, 'eee', { locale: vi })}</span>
              <span className="text-sm text-slate-800 mt-0.5">{format(date, 'dd/MM')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Grid Timeline Body Area */}
      <div 
        ref={bodyRef}
        onScroll={handleBodyScroll}
        className="flex-1 overflow-x-auto"
      >
        <div className="min-w-[1000px] relative">
          {/* Body Rows: Rooms & Blocks grouped by zone */}
          <div className="divide-y divide-slate-100 bg-white">
            {(() => {
              // 1. Group resources by zone
              const grouped: Record<string, RoomResource[]> = {}
              filteredResources.forEach(room => {
                const zoneName = room.zone || 'Khu vực khác'
                if (!grouped[zoneName]) grouped[zoneName] = []
                grouped[zoneName].push(room)
              })

              // 2. Render each group with a beautiful compact divider
              return Object.entries(grouped).map(([zoneName, rooms]) => (
                <React.Fragment key={zoneName}>
                  {/* Zone Separator Row */}
                  <div 
                    className="bg-slate-50/80 border-y border-slate-100 text-slate-500 font-extrabold text-[9px] uppercase tracking-wider py-1.5 px-3 flex items-center select-none animate-in fade-in duration-200"
                    style={{ display: 'grid', gridTemplateColumns: '120px repeat(120, minmax(0, 1fr))' }}
                  >
                    <div className="sticky left-3 text-left font-bold z-10" style={{ gridColumn: '1 / span 121' }}>
                      {zoneName}
                    </div>
                  </div>

                  {rooms.map(room => {
                    const currentDayIdx = getDayIdx(new Date())
                    const showNowIndicator = currentDayIdx >= 0 && currentDayIdx < 10
                    const nowTrack = showNowIndicator ? getGridCol(new Date()) : 0

                    const isOccupiedNow = room.status === 'occupied' || reservations.some(r => {
                      if (r.resource_id !== room.id || r.status === 'cancelled') return false
                      const checkin = parseDateTime(r.expected_checkin)
                      const checkout = parseDateTime(r.expected_checkout)
                      const now = new Date()
                      return now >= checkin && now <= checkout && r.status === 'checked_in'
                    })

                    return (
                      <div key={room.id} className="items-stretch min-h-[48px]" style={{ display: 'grid', gridTemplateColumns: '120px repeat(120, minmax(0, 1fr))' }}>
                        {/* Room Info Cell */}
                        <div className="sticky left-0 bg-slate-50/95 backdrop-blur-[3px] p-2 border-r border-slate-100 font-bold text-slate-800 text-xs flex flex-col justify-center items-center animate-in fade-in duration-200 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]" style={{ gridColumn: '1 / span 1', gridRow: '1' }}>
                          <div className="flex items-center gap-1.5 justify-center">
                            <span>{room.name}</span>
                            <span 
                              className={`w-1.5 h-1.5 rounded-full block shadow-sm ${
                                isOccupiedNow 
                                  ? 'bg-rose-500 animate-pulse' 
                                  : 'bg-emerald-500'
                              }`} 
                              title={isOccupiedNow ? 'Đang sử dụng' : 'Sẵn sàng'}
                            />
                          </div>
                          {room.status === 'dirty' && (
                            <span className="text-[8px] font-extrabold bg-amber-50 text-amber-700 border border-amber-100/50 px-1.5 py-0.5 rounded-full mt-1 flex items-center gap-1 leading-none">
                              <span className="w-1 h-1 rounded-full bg-amber-500 block" />
                              CẦN DỌN
                            </span>
                          )}
                        </div>

                        {/* Thin vertical NOW line for this row - softer dashed line */}
                        {showNowIndicator && (
                          <div 
                            style={{ gridColumn: `${nowTrack}`, gridRow: '1', pointerEvents: 'none' }}
                            className="border-l border-dashed border-rose-500/35 z-0 h-full w-[1px]"
                          />
                        )}

                        {/* 1. Render Reservation Blocks */}
                        {getVisibleReservations(room.id).map(resv => {
                          const checkin = parseDateTime(resv.expected_checkin)
                          const checkout = parseDateTime(resv.expected_checkout)
                          
                          const isVirtual = resv.id.startsWith('virtual-')
                          
                          const checkinTrack = getGridCol(checkin)
                          const gridColStart = Math.max(2, checkinTrack)
                          
                          let gridColEnd: number
                          if (isVirtual) {
                            gridColEnd = Math.max(gridColStart + 1, Math.min(122, nowTrack))
                          } else {
                            const checkoutTrack = getGridCol(checkout)
                            gridColEnd = Math.min(122, checkoutTrack)
                          }
                          
                          const duration = Math.max(1, differenceInCalendarDays(checkout, checkin))

                          let blockBg = 'bg-blue-500 text-white hover:bg-blue-600'
                          let blockStyle: React.CSSProperties = {}

                          if (isVirtual) {
                            blockBg = 'text-white animate-pulse shadow-md hover:opacity-95'
                            blockStyle = {
                              background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
                              boxShadow: '0 2px 8px rgba(244, 63, 94, 0.15)'
                            }
                          } else if (resv.status === 'checked_in') {
                            blockBg = 'text-white hover:opacity-95'
                            const checkinTime = checkin.getTime()
                            const checkoutTime = checkout.getTime()
                            const nowTime = Date.now()
                            
                            if (nowTime > checkinTime && nowTime < checkoutTime) {
                              const pct = ((nowTime - checkinTime) / (checkoutTime - checkinTime)) * 100
                              blockStyle = {
                                background: `linear-gradient(to right, #f43f5e ${pct}%, #10b981 ${pct}%)`
                              }
                            } else if (nowTime >= checkoutTime) {
                              blockStyle = {
                                backgroundColor: '#f43f5e'
                              }
                            } else {
                              blockStyle = {
                                backgroundColor: '#10b981'
                              }
                            }
                          }
                          if (resv.status === 'pending_deposit') blockBg = 'bg-amber-500 text-slate-900 hover:bg-amber-600'
                          if (resv.status === 'no_show') blockBg = 'bg-red-500 text-white hover:bg-red-600'

                          const isSmallBlock = (gridColEnd - gridColStart) <= 8

                          return (
                            <div 
                              key={resv.id} 
                              style={{ gridColumn: `${gridColStart} / ${gridColEnd}`, gridRow: '1', ...blockStyle }}
                              onClick={() => setSelectedRes(resv)}
                              className={`p-1 cursor-pointer z-0 flex flex-col justify-center items-center rounded-xl my-1 ml-1 transition-all shadow-sm active:scale-95 relative group hover:z-10 ${
                                isVirtual ? 'mr-0 rounded-r-none' : 'mr-1'
                              } ${blockBg}`}
                            >
                              {/* Premium hover Tooltip - Light Glassmorphism with arrow pointing up */}
                              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 hidden group-hover:block z-30 w-56 bg-white/95 backdrop-blur-[6px] text-slate-800 text-[11px] p-2.5 rounded-xl shadow-xl pointer-events-none border border-slate-200/80 animate-in fade-in slide-in-from-top-1 duration-150 text-left">
                                <div className="font-bold text-xs mb-1 truncate text-slate-900">{resv.customer_name}</div>
                                <div className="space-y-0.5 opacity-90 text-slate-600">
                                  <div>Kênh: <span className="font-bold text-slate-900">{isVirtual ? 'POS (Phục vụ trực tiếp)' : getChannelLabel(resv.channel_id)}</span></div>
                                  <div>Bắt đầu: <span className="font-bold text-slate-900">{format(checkin, 'dd/MM HH:mm')}</span></div>
                                  <div>Kết thúc: <span className="font-bold text-slate-900">{isVirtual ? 'Chưa xác định' : format(checkout, 'dd/MM HH:mm')}</span></div>
                                </div>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-1.5 border-4 border-transparent border-b-white/95" />
                              </div>

                              {!isSmallBlock ? (
                                <>
                                  <span className="text-xs font-normal truncate w-full text-left">{resv.customer_name}</span>
                                  <span className="text-[9px] font-normal opacity-75 truncate w-full text-left">
                                    {isVirtual 
                                      ? `Khách trực tiếp • POS` 
                                      : `${getChannelLabel(resv.channel_id)} • ${duration}đêm`
                                    }
                                  </span>
                                  {resv.status === 'checked_in' && (
                                    <span className={`text-[8px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 w-fit flex items-center gap-1 animate-pulse ${
                                      isVirtual ? 'bg-rose-600/30 text-white' : 'bg-emerald-600/30 text-white'
                                    }`}>
                                      <span className="w-1 h-1 rounded-full bg-white block animate-ping" />
                                      Đang ở (Từ {format(checkin, 'HH:mm dd/MM')})
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className={`w-1.5 h-1.5 rounded-full bg-white/80 ${resv.status === 'checked_in' ? 'animate-pulse' : ''}`} />
                              )}
                            </div>
                          )
                        })}

                        {/* 2. Render Empty/Clickable Cells */}
                        {(() => {
                          const cells: React.ReactNode[] = []
                          const nowTime = Date.now()

                          const renderPastSegment = (dayIdx: number, date: Date, start: number, end: number) => {
                            const startCol = 2 + dayIdx * 12 + start
                            const span = end - start
                            return (
                              <div 
                                key={`past-${dayIdx}-${start}-${end}`}
                                style={{ gridColumn: `${startCol} / span ${span}`, gridRow: '1' }}
                                className="border-r border-slate-100/40 bg-slate-50/15 text-slate-400/20 select-none cursor-not-allowed flex items-center justify-center"
                                title="Đã quá giờ (Không thể đặt lịch)"
                              >
                                <Clock className="w-3.5 h-3.5 opacity-15" />
                              </div>
                            )
                          }

                          const renderFutureSegment = (dayIdx: number, date: Date, start: number, end: number) => {
                            const startCol = 2 + dayIdx * 12 + start
                            const span = end - start
                            const hourOffset = start * 2
                            return (
                              <div 
                                key={`free-${dayIdx}-${start}-${end}`}
                                onClick={() => handleCellClick(room.id, date, start === 0 && span === 12 ? 14 : hourOffset)}
                                style={{ gridColumn: `${startCol} / span ${span}`, gridRow: '1' }}
                                className="border-r border-slate-100/40 hover:bg-primary/5 transition-colors cursor-pointer flex items-center justify-center text-slate-300 hover:text-primary font-bold text-sm select-none group"
                                title={`Đặt phòng từ ${hourOffset}:00`}
                              >
                                <span className="opacity-0 group-hover:opacity-100 transition-opacity font-extrabold">+</span>
                              </div>
                            )
                          }
                          
                          for (let dayIdx = 0; dayIdx < 10; dayIdx++) {
                            const date = daysToShow[dayIdx]
                            let currentPastStart: number | null = null
                            let currentFutureStart: number | null = null
                            
                            for (let blockIdx = 0; blockIdx < 12; blockIdx++) {
                              const trackNum = 2 + dayIdx * 12 + blockIdx
                              const isOccupied = isTrackOccupied(room.id, trackNum)
                              
                              const blockEndTime = new Date(date.getTime())
                              blockEndTime.setHours((blockIdx + 1) * 2, 0, 0, 0)
                              const isPast = blockEndTime.getTime() <= nowTime
                              
                              if (isOccupied) {
                                if (currentPastStart !== null) {
                                  cells.push(renderPastSegment(dayIdx, date, currentPastStart, blockIdx))
                                  currentPastStart = null
                                }
                                if (currentFutureStart !== null) {
                                  cells.push(renderFutureSegment(dayIdx, date, currentFutureStart, blockIdx))
                                  currentFutureStart = null
                                }
                              } else {
                                if (isPast) {
                                  if (currentFutureStart !== null) {
                                    cells.push(renderFutureSegment(dayIdx, date, currentFutureStart, blockIdx))
                                    currentFutureStart = null
                                  }
                                  if (currentPastStart === null) {
                                    currentPastStart = blockIdx
                                  }
                                } else {
                                  if (currentPastStart !== null) {
                                    cells.push(renderPastSegment(dayIdx, date, currentPastStart, blockIdx))
                                    currentPastStart = null
                                  }
                                  if (currentFutureStart === null) {
                                    currentFutureStart = blockIdx
                                  }
                                }
                              }
                            }
                            
                            if (currentPastStart !== null) {
                              cells.push(renderPastSegment(dayIdx, date, currentPastStart, 12))
                            }
                            if (currentFutureStart !== null) {
                              cells.push(renderFutureSegment(dayIdx, date, currentFutureStart, 12))
                            }
                          }
                          
                          return cells
                        })()}
                      </div>
                    )
                  })}
                </React.Fragment>
              ))
            })()}
          </div>
        </div>
      </div>

      {/* Reservation Detail Modal */}
      {selectedRes && (
        <div 
          onClick={() => setSelectedRes(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-md w-full shadow-2xl p-6 border border-slate-100 animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full border flex items-center gap-1 shadow-sm ${getStatusBadgeClass(selectedRes.status)}`}>
                  {getStatusIcon(selectedRes.status)}
                  {getStatusTextLabel(selectedRes.status)}
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-2">Mã đặt phòng: {selectedRes.reservation_no}</h3>
              </div>
              <button 
                onClick={() => setSelectedRes(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 border-t border-b border-slate-100 py-4 my-4 text-sm text-slate-600">
              <div className="flex justify-between">
                <span className="font-medium">Khách hàng:</span>
                <span className="font-bold text-slate-800">{selectedRes.customer_name}</span>
              </div>
              {selectedRes.customer_phone && (
                <div className="flex justify-between">
                  <span className="font-medium">Số điện thoại:</span>
                  <span className="font-bold text-slate-800">{selectedRes.customer_phone}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="font-medium">Kênh đặt phòng:</span>
                <span className="font-bold text-slate-800">{selectedRes.id.startsWith('virtual-') ? 'POS (Phục vụ trực tiếp)' : getChannelLabel(selectedRes.channel_id)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Giờ Check-in dự kiến:</span>
                <span className="font-bold text-slate-800">{format(parseDateTime(selectedRes.expected_checkin), 'dd/MM/yyyy HH:mm')}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Giờ Check-out dự kiến:</span>
                <span className="font-bold text-slate-800">
                  {selectedRes.id.startsWith('virtual-') 
                    ? 'Theo giờ / Linh hoạt (POS)' 
                    : format(parseDateTime(selectedRes.expected_checkout), 'dd/MM/yyyy HH:mm')
                  }
                </span>
              </div>
              <div className="flex justify-between border-t border-dashed border-slate-100 pt-3">
                <span className="font-medium">{selectedRes.id.startsWith('virtual-') ? 'Đơn giá phòng:' : 'Giá phòng/Đêm:'}</span>
                <span className="font-bold text-slate-800">{Number(selectedRes.daily_rate).toLocaleString('vi-VN')}₫</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Tiền đặt cọc đã thu:</span>
                <span className="font-bold text-emerald-600">{Number(selectedRes.deposit_amount).toLocaleString('vi-VN')}₫</span>
              </div>
              {selectedRes.note && (
                <div className="border-t border-dashed border-slate-100 pt-3">
                  <span className="block font-medium mb-1">Ghi chú yêu cầu:</span>
                  <p className="bg-slate-50 p-2.5 rounded-xl text-xs border border-slate-100 italic">{selectedRes.note}</p>
                </div>
              )}

              {/* Rooming List / Guest Occupants Section */}
              <div className="border-t border-slate-100 pt-4 mt-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <User className="w-4 h-4 text-primary" /> Khách lưu trú thực tế ({occupants.length})
                  </span>
                  {!showAddOccupant && (
                    <button 
                      type="button"
                      onClick={() => {
                        setShowAddOccupant(true)
                        resetOccForm()
                      }}
                      className="text-primary hover:text-primary/80 font-bold text-xs flex items-center gap-0.5 bg-primary/5 px-2 py-1.5 rounded-lg border border-primary/10 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm khách
                    </button>
                  )}
                </div>

                {/* Add Occupant Sub-Form */}
                {showAddOccupant && (
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-3 mb-3 animate-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="col-span-2">
                        <label className="block font-medium mb-1 text-slate-500">Tên khách hàng *</label>
                        <input 
                          type="text" required value={occName} onChange={e => setOccName(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none bg-white focus:border-primary"
                          placeholder="Nguyễn Văn A"
                        />
                      </div>
                      <div>
                        <label className="block font-medium mb-1 text-slate-500">SĐT</label>
                        <input 
                          type="text" value={occPhone} onChange={e => setOccPhone(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none bg-white focus:border-primary"
                          placeholder="09xx..."
                        />
                      </div>
                      <div>
                        <label className="block font-medium mb-1 text-slate-500">CCCD/Passport</label>
                        <input 
                          type="text" value={occIdentity} onChange={e => setOccIdentity(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none bg-white focus:border-primary"
                          placeholder="Số định danh..."
                        />
                      </div>
                      <div>
                        <label className="block font-medium mb-1 text-slate-500">Quốc tịch</label>
                        <input 
                          type="text" value={occNationality} onChange={e => setOccNationality(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none bg-white focus:border-primary"
                          placeholder="Việt Nam"
                        />
                      </div>
                      <div>
                        <label className="block font-medium mb-1 text-slate-500">Ngày sinh</label>
                        <input 
                          type="text" value={occBirthday} onChange={e => setOccBirthday(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none bg-white focus:border-primary"
                          placeholder="Ngày sinh..."
                        />
                      </div>
                      <div>
                        <label className="block font-medium mb-1 text-slate-500">Giới tính</label>
                        <select 
                          value={occGender} onChange={e => setOccGender(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none bg-white focus:border-primary"
                        >
                          <option value="male">Nam</option>
                          <option value="female">Nữ</option>
                          <option value="other">Khác</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-1.5 pt-4">
                        <input 
                          type="checkbox" id="isPrimaryOcc" checked={occIsPrimary === 'TRUE'} onChange={e => setOccIsPrimary(e.target.checked ? 'TRUE' : 'FALSE')}
                          className="w-3.5 h-3.5 text-primary border-slate-200 rounded"
                        />
                        <label htmlFor="isPrimaryOcc" className="font-medium text-slate-600">Đại diện</label>
                      </div>
                      <div className="col-span-2">
                        <label className="block font-medium mb-1 text-slate-500">Ghi chú</label>
                        <input 
                          type="text" value={occNote} onChange={e => setOccNote(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none bg-white focus:border-primary"
                          placeholder="Ghi chú thêm cho khách..."
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                      <button 
                        type="button" onClick={() => setShowAddOccupant(false)}
                        className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold rounded-lg transition-colors"
                      >
                        Hủy
                      </button>
                      <button 
                        type="button" onClick={handleAddOccupantSubmit}
                        className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" /> Lưu khách
                      </button>
                    </div>
                  </div>
                )}

                {/* Occupant List */}
                {loadingOccupants ? (
                  <div className="text-center py-3 text-xs text-slate-400">Đang tải danh sách khách...</div>
                ) : occupants.length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-400 border border-dashed border-slate-100 rounded-2xl italic">Chưa khai báo khách lưu trú thực tế.</div>
                ) : (
                  <div className="max-h-[160px] overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-50">
                    {occupants.map((occ) => (
                      <div key={occ.id} className="flex justify-between items-center py-2 text-xs">
                        <div className="flex flex-col gap-0.5 text-left">
                          <span className="font-bold text-slate-800 flex items-center gap-1">
                            {occ.guest_name} 
                            {occ.is_primary === 'TRUE' && (
                              <span className="bg-primary/10 text-primary text-[8px] px-1.5 py-0.5 rounded-full font-extrabold">Đại diện</span>
                            )}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {occ.guest_phone && `SĐT: ${occ.guest_phone}`} 
                            {occ.identity_card && ` • CCCD: ${occ.identity_card}`}
                          </span>
                          {occ.note && (
                            <span className="text-[9px] text-slate-400 italic font-medium">Ghi chú: {occ.note}</span>
                          )}
                        </div>
                        <button 
                          type="button"
                          onClick={() => handleDeleteOccupant(occ.id)}
                          className="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg border border-transparent hover:border-rose-100 transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              {selectedRes.id.startsWith('virtual-') ? (
                <a
                  href={`/t/${slug}/${branch}/channels/pos`}
                  className="flex-1 py-3 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-rose-200 flex items-center justify-center gap-1.5"
                >
                  <Calendar className="w-4 h-4" /> Quản lý hóa đơn tại POS
                </a>
              ) : (
                <>
                  {selectedRes.status !== 'checked_in' && (
                    <button
                      onClick={() => handleCheckIn(selectedRes)}
                      className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-200 flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-4 h-4" /> Nhận phòng (Check-in)
                    </button>
                  )}
                  <button
                    onClick={() => handleCancelReservation(selectedRes.id)}
                    className="py-3 px-4 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-xl transition-colors border border-red-100 flex items-center justify-center gap-1"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Hủy đặt phòng
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Creation Modal */}
      {createModalOpen && (
        <div 
          onClick={() => !submitting && setCreateModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <form 
            onSubmit={handleCreateReservation}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white rounded-3xl max-w-md w-full shadow-2xl p-6 border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-200"
          >
            {submitting && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] z-50 flex flex-col items-center justify-center rounded-3xl animate-in fade-in duration-200">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-bold text-slate-700">Đang lưu thông tin đặt giữ phòng...</span>
                  <span className="text-xs text-slate-500 font-medium">Vui lòng đợi trong giây lát</span>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
                <CalendarDays className="w-5 h-5 text-primary" /> Tạo Đặt phòng Mới
              </h3>
              <button type="button" disabled={submitting} onClick={() => setCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3.5 text-xs text-slate-600">
              <div className="col-span-2">
                <label className="block font-medium mb-1.5">Tên khách hàng *</label>
                <input 
                  type="text" required disabled={submitting} value={formCustName} onChange={e => setFormCustName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm disabled:bg-slate-50"
                  placeholder="Nhập họ tên khách hàng..."
                />
              </div>
              
              <div>
                <label className="block font-medium mb-1.5">Số điện thoại</label>
                <input 
                  type="text" disabled={submitting} value={formCustPhone} onChange={e => setFormCustPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm disabled:bg-slate-50"
                  placeholder="09xx..."
                />
              </div>

              <div>
                <label className="block font-medium mb-1.5">Kênh đặt phòng</label>
                <select 
                  disabled={submitting} value={formChannel} onChange={e => setFormChannel(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm bg-white disabled:bg-slate-50"
                >
                  {channels.map(c => (
                    <option key={c.id} value={c.code || c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block font-medium mb-1.5">Phòng đặt giữ (Chọn thêm nếu đặt nhóm)</label>
                <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto border border-slate-100 p-2.5 rounded-2xl bg-slate-50/50">
                  {allResources.map(r => {
                    const isChecked = selectedRoomIds.includes(r.id)
                    return (
                      <label key={r.id} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                        isChecked 
                          ? 'bg-primary/5 border-primary text-primary' 
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}>
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              if (selectedRoomIds.length > 1) {
                                setSelectedRoomIds(selectedRoomIds.filter(id => id !== r.id))
                              }
                            } else {
                              setSelectedRoomIds([...selectedRoomIds, r.id])
                            }
                          }}
                          className="w-3.5 h-3.5 text-primary border-slate-200 rounded focus:ring-primary cursor-pointer"
                        />
                        {r.name}
                      </label>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1.5">Ngày nhận (Check-in)</label>
                <input 
                  type="datetime-local" required disabled={submitting} value={formCheckIn} onChange={e => setFormCheckIn(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm bg-white disabled:bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-medium mb-1.5">Ngày trả (Check-out)</label>
                <input 
                  type="datetime-local" required disabled={submitting} value={formCheckOut} onChange={e => setFormCheckOut(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm bg-white disabled:bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-medium mb-1.5">Giá thỏa thuận/Đêm</label>
                <input 
                  type="text" required disabled={submitting} value={formRate} onChange={e => handleAmountInputChange(e.target.value, setFormRate)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm disabled:bg-slate-50"
                />
              </div>

              <div>
                <label className="block font-medium mb-1.5">Số tiền đặt cọc trước (₫)</label>
                <input 
                  type="text" disabled={submitting} value={formDeposit} onChange={e => handleAmountInputChange(e.target.value, setFormDeposit)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm disabled:bg-slate-50"
                />
              </div>

              <div className="col-span-2">
                <label className="block font-medium mb-1.5">Ghi chú thêm</label>
                <textarea 
                  disabled={submitting} value={formNote} onChange={e => setFormNote(e.target.value)} rows={2}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm disabled:bg-slate-50"
                  placeholder="Yêu cầu dọn dẹp, xe đón..."
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button 
                type="button" disabled={submitting} onClick={() => setCreateModalOpen(false)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                Hủy bỏ
              </button>
              <button 
                type="submit" disabled={submitting}
                className="flex-1 py-3 bg-primary hover:bg-primary/95 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-primary/20 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> Xác nhận đặt giữ phòng
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
