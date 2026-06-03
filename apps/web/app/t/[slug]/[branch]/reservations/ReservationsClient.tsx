'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { 
  CalendarDays, 
  Layers, 
  Users, 
  CalendarCheck, 
  Clock, 
  Check, 
  XCircle, 
  Search, 
  Building,
  Phone,
  Grid,
  RefreshCw
} from 'lucide-react'
import { ReservationTimeline } from '../channels/pos/components/ReservationTimeline'
import { format } from 'date-fns'
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog'
import { parseGMT7Date } from '@oni/core'

interface RoomResource {
  id: string
  name: string
  type: string
  status: string
  zone?: string
  hourly_rate?: string
}

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
  group_booking_id?: string
  note?: string
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
  const [activeTab, setActiveTab] = useState<'timeline' | 'list'>('timeline')
  const [resources, setResources] = useState<RoomResource[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingList, setLoadingList] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean
    title: string
    description: string
    onConfirm: () => void | Promise<void>
    loading?: boolean
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {}
  })

  // Occupants Modal state
  const [occupantsModalOpen, setOccupantsModalOpen] = useState(false)
  const [occSelectedRes, setOccSelectedRes] = useState<Reservation | null>(null)
  const [occupantsList, setOccupantsList] = useState<any[]>([])
  const [loadingOccList, setLoadingOccList] = useState(false)
  
  // Occupant form states
  const [formOccName, setFormOccName] = useState('')
  const [formOccPhone, setFormOccPhone] = useState('')
  const [formOccIdentity, setFormOccIdentity] = useState('')
  const [formOccNationality, setFormOccNationality] = useState('Vietnam')
  const [formOccBirthday, setFormOccBirthday] = useState('')
  const [formOccGender, setFormOccGender] = useState('male')
  const [formOccIsPrimary, setFormOccIsPrimary] = useState('FALSE')
  const [formOccNote, setFormOccNote] = useState('')
  const [formOccSaving, setFormOccSaving] = useState(false)

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

  const fetchReservations = async () => {
    setLoadingList(true)
    try {
      const res = await fetch(`/api/shops/${shopId}/reservations?limit=250&t=${Date.now()}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setReservations(json.data || [])
    } catch {
      toast.error('Lỗi khi tải danh sách đặt phòng')
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => {
    fetchRooms()
  }, [shopId])

  useEffect(() => {
    if (activeTab === 'list') {
      void fetchReservations()
    }
  }, [activeTab, shopId])

  // Grouping reservations by group_booking_id or listing them as individual bookings
  const groupedData = useMemo(() => {
    const groups: Record<string, Reservation[]> = {}
    const individuals: Reservation[] = []

    const q = searchQuery.toLowerCase().trim()
    const filtered = reservations.filter(r => {
      if (r.status === 'cancelled') return false
      const matchesSearch = 
        r.customer_name.toLowerCase().includes(q) ||
        r.customer_phone.includes(q) ||
        r.reservation_no.toLowerCase().includes(q) ||
        (r.group_booking_id && r.group_booking_id.toLowerCase().includes(q))
      return matchesSearch
    })

    filtered.forEach(r => {
      if (r.group_booking_id) {
        if (!groups[r.group_booking_id]) groups[r.group_booking_id] = []
        groups[r.group_booking_id].push(r)
      } else {
        individuals.push(r)
      }
    })

    return { groups, individuals }
  }, [reservations, searchQuery])

  const handleCheckInResv = (resv: Reservation) => {
    setConfirmState({
      isOpen: true,
      title: 'Nhận phòng (Check-in)',
      description: `Bạn có chắc chắn muốn nhận phòng ${getRoomName(resv.resource_id)} cho khách hàng ${resv.customer_name}?`,
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, loading: true }))
        const loadToast = toast.loading('Đang check-in...')
        try {
          const res = await fetch(`/api/shops/${shopId}/reservations/${resv.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'checked_in' })
          })
          if (!res.ok) throw new Error()
          toast.success(`Check-in phòng ${getRoomName(resv.resource_id)} thành công!`)
          void fetchReservations()
          void fetchRooms()
        } catch {
          toast.error('Lỗi khi check-in')
        } finally {
          toast.dismiss(loadToast)
          setConfirmState(prev => ({ ...prev, isOpen: false, loading: false }))
        }
      }
    })
  }

  const handleCancelResv = (resv: Reservation) => {
    setConfirmState({
      isOpen: true,
      title: 'Hủy đặt phòng lẻ',
      description: `Bạn có chắc chắn muốn hủy đặt phòng giữ chỗ #${resv.reservation_no} của khách hàng ${resv.customer_name}?`,
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, loading: true }))
        try {
          const res = await fetch(`/api/shops/${shopId}/reservations/${resv.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'cancelled' })
          })
          if (!res.ok) throw new Error()
          toast.success('Đã hủy đặt giữ phòng thành công')
          void fetchReservations()
        } catch {
          toast.error('Lỗi khi hủy đặt phòng')
        } finally {
          setConfirmState(prev => ({ ...prev, isOpen: false, loading: false }))
        }
      }
    })
  }

  const handleCheckInGroup = (groupId: string, resvs: Reservation[]) => {
    const roomsToCheckIn = resvs.filter(r => r.status !== 'checked_in')
    if (roomsToCheckIn.length === 0) {
      toast.info('Tất cả phòng trong đoàn đã được check-in')
      return
    }
    setConfirmState({
      isOpen: true,
      title: 'Nhận phòng đoàn (Check-in)',
      description: `Nhận phòng (Check-in) cho toàn bộ đoàn này (${roomsToCheckIn.length} phòng)?`,
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, loading: true }))
        const loadToast = toast.loading('Đang nhận phòng đoàn...')
        try {
          let errors = 0
          for (const resv of roomsToCheckIn) {
            const res = await fetch(`/api/shops/${shopId}/reservations/${resv.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'checked_in' })
            })
            if (!res.ok) errors++
          }
          if (errors > 0) {
            toast.error(`Check-in hoàn tất với ${errors} lỗi phòng. Vui lòng rà soát lại!`)
          } else {
            toast.success(`Check-in thành công toàn bộ đoàn ${groupId}!`)
          }
          void fetchReservations()
          void fetchRooms()
        } catch {
          toast.error('Lỗi khi check-in đoàn')
        } finally {
          toast.dismiss(loadToast)
          setConfirmState(prev => ({ ...prev, isOpen: false, loading: false }))
        }
      }
    })
  }

  const handleCancelGroup = (groupId: string, resvs: Reservation[]) => {
    setConfirmState({
      isOpen: true,
      title: 'Hủy đặt phòng đoàn',
      description: `Bạn có chắc chắn muốn hủy toàn bộ đặt phòng của đoàn ${groupId} (${resvs.length} phòng)?`,
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, loading: true }))
        const loadToast = toast.loading('Đang hủy phòng đoàn...')
        try {
          let errors = 0
          for (const resv of resvs) {
            const res = await fetch(`/api/shops/${shopId}/reservations/${resv.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'cancelled' })
            })
            if (!res.ok) errors++
          }
          if (errors > 0) {
            toast.error(`Hủy phòng hoàn tất với ${errors} lỗi phòng.`)
          } else {
            toast.success(`Đã hủy thành công toàn bộ đoàn ${groupId}!`)
          }
          void fetchReservations()
        } catch {
          toast.error('Lỗi khi hủy đặt phòng đoàn')
        } finally {
          toast.dismiss(loadToast)
          setConfirmState(prev => ({ ...prev, isOpen: false, loading: false }))
        }
      }
    })
  }

  const getRoomName = (roomId?: string) => {
    if (!roomId) return '-'
    const room = resources.find(r => r.id === roomId)
    return room ? room.name : roomId.slice(-4)
  }

  const fetchOccupantsForRes = async (resvId: string) => {
    setLoadingOccList(true)
    try {
      const res = await fetch(`/api/shops/${shopId}/occupants?reservation_id=${resvId}&t=${Date.now()}`)
      if (res.ok) {
        const json = await res.json()
        setOccupantsList(json.data || [])
      }
    } catch {
      toast.error('Lỗi khi tải danh sách khách lưu trú')
    } finally {
      setLoadingOccList(false)
    }
  }

  const triggerOccupantsModal = (resv: Reservation) => {
    setOccSelectedRes(resv)
    setFormOccName('')
    setFormOccPhone('')
    setFormOccIdentity('')
    setFormOccNationality('Vietnam')
    setFormOccBirthday('')
    setFormOccGender('male')
    setFormOccIsPrimary('FALSE')
    setFormOccNote('')
    setOccupantsModalOpen(true)
    void fetchOccupantsForRes(resv.id)
  }

  const handleAddOccupant = async () => {
    if (!formOccName.trim()) {
      toast.error('Vui lòng nhập tên khách')
      return
    }
    if (!occSelectedRes) return

    setFormOccSaving(true)
    try {
      const res = await fetch(`/api/shops/${shopId}/occupants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: occSelectedRes.id,
          resource_id: occSelectedRes.resource_id,
          guest_name: formOccName,
          guest_phone: formOccPhone,
          identity_card: formOccIdentity,
          nationality: formOccNationality,
          birthday: formOccBirthday,
          gender: formOccGender,
          is_primary: formOccIsPrimary,
          note: formOccNote
        })
      })

      if (!res.ok) throw new Error()
      toast.success('Đã thêm khách lưu trú')
      setFormOccName('')
      setFormOccPhone('')
      setFormOccIdentity('')
      setFormOccBirthday('')
      setFormOccNote('')
      void fetchOccupantsForRes(occSelectedRes.id)
    } catch {
      toast.error('Lỗi khi thêm khách lưu trú')
    } finally {
      setFormOccSaving(false)
    }
  }

  const handleDeleteOccupant = async (occId: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Xóa khách lưu trú',
      description: 'Bạn có chắc chắn muốn xóa khách này khỏi danh sách lưu trú?',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, loading: true }))
        try {
          const res = await fetch(`/api/shops/${shopId}/occupants/${occId}`, {
            method: 'DELETE'
          })

          if (!res.ok) throw new Error()
          toast.success('Đã xóa khách lưu trú')
          if (occSelectedRes) {
            void fetchOccupantsForRes(occSelectedRes.id)
          }
        } catch {
          toast.error('Lỗi khi xóa khách lưu trú')
        } finally {
          setConfirmState(prev => ({ ...prev, isOpen: false, loading: false }))
        }
      }
    })
  }

  return (
    <div className="space-y-6 w-full">
      {/* Premium Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <CalendarDays className="w-7 h-7 text-primary" /> Sơ đồ & Danh sách Đặt trước
          </h1>
          <p className="text-xs font-semibold text-slate-500 tracking-wide">
            Điều phối lịch đặt phòng trước, đặt phòng theo đoàn (lữ hành) và cấn trừ đặt cọc.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-100 p-0.5 rounded-xl text-xs font-bold shrink-0 self-start sm:self-center shadow-xs">
          <button 
            onClick={() => setActiveTab('timeline')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${activeTab === 'timeline' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Grid className="w-3.5 h-3.5" /> Sơ đồ Gantt
          </button>
          <button 
            onClick={() => setActiveTab('list')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${activeTab === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Layers className="w-3.5 h-3.5" /> Đặt phòng theo Đoàn
          </button>
        </div>
      </div>

      {loading ? (
        <div className="min-h-[400px] flex items-center justify-center bg-white rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-slate-500">Đang tải sơ đồ đặt phòng...</span>
          </div>
        </div>
      ) : activeTab === 'timeline' ? (
        <ReservationTimeline 
          shopId={shopId}
          slug={slug}
          branch={branch}
          allResources={resources}
          onRefresh={fetchRooms}
        />
      ) : (
        /* List View / Group Bookings Dashboard */
        <div className="space-y-4 animate-in fade-in duration-200">
          
          {/* Filters Bar */}
          <div className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <div className="relative flex-1 max-w-sm flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3" />
              <input
                type="text"
                placeholder="Tìm tên khách, số điện thoại, mã đoàn..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-10 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-slate-50/50"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-650 transition-colors cursor-pointer"
                  title="Xóa tìm kiếm"
                >
                  <XCircle className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={fetchReservations}
              disabled={loadingList}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin text-primary' : ''}`} />
              Làm mới danh sách
            </button>
          </div>

          {loadingList ? (
            <div className="min-h-[250px] flex items-center justify-center bg-white rounded-2xl border border-slate-100 shadow-sm">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : Object.keys(groupedData.groups).length === 0 && groupedData.individuals.length === 0 ? (
            <div className="min-h-[250px] flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center">
              <Building className="w-12 h-12 text-slate-350 mb-3" />
              <p className="text-sm font-bold text-slate-700">Chưa có lịch đặt phòng nào khớp bộ lọc</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm font-medium">Lịch đặt phòng đoàn được tạo bằng cách chọn nhiều phòng cùng lúc tại màn hình Sơ đồ Gantt.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Group Bookings Sections */}
              {Object.entries(groupedData.groups).map(([groupId, resvs]) => {
                const rep = resvs[0]
                const totalDeposit = resvs.reduce((sum, r) => sum + parseFloat(r.deposit_amount || '0'), 0)
                const isAllCheckedIn = resvs.every(r => r.status === 'checked_in')
                
                return (
                  <div key={groupId} className="bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                    {/* Group Header Card */}
                    <div className="bg-slate-50/70 border-b border-slate-200/80 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-2.5 py-1 text-[10px] font-black rounded-lg uppercase tracking-wider flex items-center gap-1 shadow-2xs">
                            <Layers className="w-3.5 h-3.5" /> Mã Đoàn: {groupId}
                          </span>
                          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border shadow-2xs ${
                            isAllCheckedIn 
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                              : 'bg-blue-50 border-blue-200 text-blue-700'
                          }`}>
                            {isAllCheckedIn ? 'Đã check-in tất cả' : 'Chưa check-in đầy đủ'}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5 pt-1">
                          <Users className="w-4 h-4 text-slate-400" /> Trưởng đoàn: {rep.customer_name}
                        </h3>
                        <div className="flex items-center gap-3 text-xs text-slate-500 font-medium pt-0.5">
                          <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-slate-400" /> {rep.customer_phone || 'Không có SĐT'}</span>
                          <span>•</span>
                          <span>Tổng cọc đoàn: <strong className="text-emerald-600 font-bold">{totalDeposit.toLocaleString('vi-VN')}₫</strong></span>
                        </div>
                      </div>

                      {/* Group Action Buttons */}
                      <div className="flex items-center gap-2 self-start md:self-center shrink-0">
                        {!isAllCheckedIn && (
                          <button
                            onClick={() => handleCheckInGroup(groupId, resvs)}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-black shadow-md shadow-emerald-250 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[2.5]" /> Check-in Đoàn
                          </button>
                        )}
                        <button
                          onClick={() => handleCancelGroup(groupId, resvs)}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 hover:border-rose-300 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm shadow-rose-100"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Hủy toàn bộ đoàn
                        </button>
                      </div>
                    </div>

                    {/* Room list inside the group */}
                    <div className="divide-y divide-slate-100">
                      {/* Desktop Table Header */}
                      <div className="hidden md:flex md:items-center justify-between gap-4 px-6 py-2.5 bg-slate-50/50 border-b border-slate-100 text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">
                        <div className="grid grid-cols-4 gap-4 flex-1">
                          <div>Phòng</div>
                          <div>Mã lẻ</div>
                          <div>Thời gian</div>
                          <div>Tiền cọc lẻ / Giá</div>
                        </div>
                        <div className="w-[260px] text-right">Thao tác</div>
                      </div>

                      {resvs.map(r => (
                        <div key={r.id} className="px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/40 transition-colors text-xs text-slate-600">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
                            <div className="flex flex-col text-left">
                              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider md:hidden">Phòng</span>
                              <span className="font-extrabold text-slate-800 text-sm">{getRoomName(r.resource_id)}</span>
                            </div>
                            <div className="flex flex-col text-left">
                              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider md:hidden">Mã lẻ</span>
                              <span className="font-bold text-slate-700">#{r.reservation_no}</span>
                            </div>
                            <div className="flex flex-col text-left">
                              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider md:hidden">Thời gian</span>
                              <span className="font-semibold text-slate-700">
                                {format(parseGMT7Date(r.expected_checkin), 'dd/MM HH:mm')} - {format(parseGMT7Date(r.expected_checkout), 'dd/MM HH:mm')}
                              </span>
                            </div>
                            <div className="flex flex-col text-left">
                              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider md:hidden">Tiền cọc lẻ / Giá</span>
                              <span className="font-bold text-slate-800">
                                {Number(r.deposit_amount).toLocaleString('vi-VN')}₫ / {Number(r.daily_rate).toLocaleString('vi-VN')}₫
                              </span>
                            </div>
                          </div>

                          {/* Individual Room Actions */}
                          <div className="flex items-center justify-end gap-1.5 shrink-0 w-[260px] self-start md:self-center">
                            <button
                              onClick={() => triggerOccupantsModal(r)}
                              className="bg-white hover:bg-indigo-50 text-indigo-655 hover:text-indigo-755 px-2.5 py-1.5 border border-indigo-200 hover:border-indigo-300 rounded-lg font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                            >
                              <Users className="w-3.5 h-3.5" /> Khách ở
                            </button>
                            {r.status !== 'checked_in' ? (
                              <button
                                onClick={() => handleCheckInResv(r)}
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg font-bold border border-emerald-200 transition-colors cursor-pointer"
                              >
                                Nhận phòng
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50/60 border border-emerald-200/60 rounded-lg px-3 py-1.5 font-bold select-none cursor-default">
                                <Check className="w-3.5 h-3.5" /> Đã nhận
                              </span>
                            )}
                            <button
                              onClick={() => handleCancelResv(r)}
                              className="text-slate-400 hover:text-red-650 p-1.5 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Hủy phòng con này"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* Individual/Retail Bookings Section */}
              {groupedData.individuals.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
                  <div className="bg-slate-50/50 border-b border-slate-200/80 px-6 py-3 flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-700 flex items-center gap-1.5">
                      <Grid className="w-4 h-4 text-slate-400" /> Đặt lẻ không theo đoàn ({groupedData.individuals.length})
                    </h3>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {/* Desktop Table Header */}
                    <div className="hidden md:flex md:items-center justify-between gap-4 px-6 py-2.5 bg-slate-50/85 border-b border-slate-100 text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">
                      <div className="grid grid-cols-5 gap-4 flex-1">
                        <div>Khách hàng</div>
                        <div>Mã số / Phòng</div>
                        <div>Ngày nhận - Trả</div>
                        <div>Tiền cọc</div>
                        <div>Trạng thái</div>
                      </div>
                      <div className="w-[280px] text-right">Thao tác</div>
                    </div>

                    {groupedData.individuals.map(r => (
                      <div key={r.id} className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/25 transition-colors text-xs text-slate-600">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 flex-1">
                          <div className="flex flex-col text-left">
                            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider md:hidden">Khách hàng</span>
                            <span className="font-extrabold text-slate-800 text-sm leading-snug">{r.customer_name}</span>
                            <span className="text-[10px] text-slate-500">{r.customer_phone}</span>
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider md:hidden">Mã số / Phòng</span>
                            <span className="font-bold text-slate-700">#{r.reservation_no}</span>
                            <span className="font-extrabold text-primary text-sm mt-0.5">{getRoomName(r.resource_id)}</span>
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider md:hidden">Ngày nhận - Trả</span>
                            <span className="font-semibold text-slate-700 pt-0.5">
                              {format(parseGMT7Date(r.expected_checkin), 'dd/MM HH:mm')} - {format(parseGMT7Date(r.expected_checkout), 'dd/MM HH:mm')}
                            </span>
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider md:hidden">Tiền cọc</span>
                            <span className="font-extrabold text-emerald-600 text-sm pt-0.5">{Number(r.deposit_amount).toLocaleString('vi-VN')}₫</span>
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider md:hidden">Trạng thái</span>
                            <span className="pt-0.5">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                                r.status === 'checked_in' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                                r.status === 'confirmed' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                                r.status === 'pending_deposit' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                'bg-slate-50 border-slate-200 text-slate-700'
                              }`}>
                                {r.status === 'checked_in' ? 'Đã nhận' :
                                 r.status === 'confirmed' ? 'Đã xác nhận' :
                                 r.status === 'pending_deposit' ? 'Chờ cọc' : r.status}
                              </span>
                            </span>
                          </div>
                        </div>

                        {/* Retail Actions */}
                        <div className="flex items-center justify-end gap-2 shrink-0 w-[280px] self-start md:self-center">
                          <button
                            onClick={() => triggerOccupantsModal(r)}
                            className="bg-white hover:bg-indigo-50 text-indigo-650 hover:text-indigo-750 px-2.5 py-2 border border-indigo-200 hover:border-indigo-300 rounded-xl font-bold text-xs transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                          >
                            <Users className="w-3.5 h-3.5" /> Khách ở
                          </button>
                          {r.status !== 'checked_in' ? (
                            <button
                              onClick={() => handleCheckInResv(r)}
                              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-emerald-250 transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" /> Check-in
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-650 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2 text-xs font-bold select-none cursor-default">
                              <Check className="w-3.5 h-3.5" /> Đã check-in
                            </span>
                          )}
                          <button
                            onClick={() => handleCancelResv(r)}
                            className="bg-white hover:bg-red-50 text-slate-500 hover:text-red-700 px-3.5 py-2 border border-slate-200 hover:border-red-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          >
                            Hủy đặt
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ConfirmDialog hệ thống */}
      <ConfirmDialog
        open={confirmState.isOpen}
        onClose={() => !confirmState.loading && setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        description={confirmState.description}
        loading={confirmState.loading}
        confirmLabel={confirmState.loading ? 'Đang xử lý...' : 'Xác nhận'}
        cancelLabel="Hủy"
      />

      {/* MODAL PHÂN BỔ KHÁCH LƯU TRÚ (ROOMING LIST) */}
      {occupantsModalOpen && occSelectedRes && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 shrink-0">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                <Users className="w-5 h-5 text-indigo-650 animate-pulse" /> Khách lưu trú thực tế: {getRoomName(occSelectedRes.resource_id)}
              </h2>
              <button 
                onClick={() => setOccupantsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 scrollbar-thin">
              
              {/* Form thêm khách mới */}
              <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl space-y-3">
                <h3 className="text-xs font-bold text-slate-700">Thêm khách lưu trú mới</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Họ & Tên *</label>
                    <input 
                      type="text" 
                      value={formOccName} 
                      onChange={e => setFormOccName(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none bg-white text-slate-800"
                      placeholder="Nguyễn Văn A"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Số điện thoại</label>
                    <input 
                      type="text" 
                      value={formOccPhone} 
                      onChange={e => setFormOccPhone(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none bg-white text-slate-800"
                      placeholder="0901234567"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Số CCCD / Passport</label>
                    <input 
                      type="text" 
                      value={formOccIdentity} 
                      onChange={e => setFormOccIdentity(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none bg-white text-slate-800"
                      placeholder="079..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quốc tịch</label>
                    <input 
                      type="text" 
                      value={formOccNationality} 
                      onChange={e => setFormOccNationality(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none bg-white text-slate-800"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ngày sinh</label>
                    <input 
                      type="date" 
                      value={formOccBirthday} 
                      onChange={e => setFormOccBirthday(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none bg-white text-slate-800"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Giới tính & Quyền</label>
                    <div className="flex items-center gap-4 pt-1.5">
                      <select 
                        value={formOccGender} 
                        onChange={e => setFormOccGender(e.target.value)}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none bg-white text-slate-800"
                      >
                        <option value="male">Nam</option>
                        <option value="female">Nữ</option>
                        <option value="other">Khác</option>
                      </select>
                      <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={formOccIsPrimary === 'TRUE'} 
                          onChange={e => setFormOccIsPrimary(e.target.checked ? 'TRUE' : 'FALSE')}
                          className="rounded border-slate-350 text-indigo-650 focus:ring-indigo-600 animate-pulse"
                        />
                        Đại diện phòng
                      </label>
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ghi chú yêu cầu riêng</label>
                  <input 
                    type="text" 
                    value={formOccNote} 
                    onChange={e => setFormOccNote(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none bg-white text-slate-800"
                    placeholder="Yêu cầu dị ứng món ăn, giường phụ..."
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddOccupant}
                  disabled={formOccSaving}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg px-4 py-2 text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-sm"
                >
                  {formOccSaving ? 'Đang thêm khách...' : 'Thêm khách vào danh sách'}
                </button>
              </div>

              {/* Danh sách khách hiện tại */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  Danh sách đã phân bổ ({occupantsList.length})
                </h3>
                {loadingOccList ? (
                  <div className="py-8 flex justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" /></div>
                ) : occupantsList.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl">Chưa có khách nào được phân bổ vào phòng này.</p>
                ) : (
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white overflow-hidden max-h-[220px] overflow-y-auto">
                    {occupantsList.map(occ => (
                      <div key={occ.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-slate-850">{occ.guest_name}</span>
                            {occ.guest_phone && <span className="text-slate-500 font-medium">({occ.guest_phone})</span>}
                            {occ.is_primary === 'TRUE' && (
                              <span className="bg-indigo-50 text-indigo-700 border border-indigo-150 px-1.5 py-0.5 text-[9px] font-bold rounded">Đại diện</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 space-x-2 font-medium">
                            {occ.identity_card && <span>CCCD: {occ.identity_card}</span>}
                            {occ.nationality && <span>• Quốc tịch: {occ.nationality}</span>}
                            {occ.birthday && <span>• Ngày sinh: {occ.birthday}</span>}
                            {occ.gender && <span>• Giới tính: {occ.gender === 'male' ? 'Nam' : occ.gender === 'female' ? 'Nữ' : 'Khác'}</span>}
                          </div>
                          {occ.note && <p className="text-[10px] text-amber-600 mt-1 font-semibold">📝 {occ.note}</p>}
                        </div>
                        <button
                          onClick={() => handleDeleteOccupant(occ.id)}
                          className="text-slate-400 hover:text-red-600 p-1 hover:bg-slate-100 rounded transition-colors cursor-pointer shrink-0 text-sm font-bold"
                          title="Xóa khách này"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex justify-end shrink-0">
              <button 
                onClick={() => setOccupantsModalOpen(false)}
                className="bg-slate-150 hover:bg-slate-200 text-slate-700 rounded-xl px-4 py-2 text-xs font-bold cursor-pointer"
              >
                Đóng lại
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
