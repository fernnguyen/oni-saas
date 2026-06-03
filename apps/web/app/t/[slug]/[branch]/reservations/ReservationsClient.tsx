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
  X,
  XCircle, 
  Search, 
  Building,
  Phone,
  Grid,
  RefreshCw,
  Plus,
  FileText,
  Trash2,
  Download,
  AlertTriangle
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
  capacity?: string
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
  const [allOccupants, setAllOccupants] = useState<any[]>([])
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

  // Group Rooming List states
  const [groupRoomingModalOpen, setGroupRoomingModalOpen] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [selectedGroupResvs, setSelectedGroupResvs] = useState<Reservation[]>([])
  const [groupOccupants, setGroupOccupants] = useState<any[]>([])
  const [loadingGroupOccs, setLoadingGroupOccs] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [assigningGuest, setAssigningGuest] = useState<any | null>(null)
  const [assignRoomSearch, setAssignRoomSearch] = useState('')

  // Single guest manual form states inside group
  const [showAddGuestForm, setShowAddGuestForm] = useState(false)
  const [gFormName, setGFormName] = useState('')
  const [gFormPhone, setGFormPhone] = useState('')
  const [gFormIdentity, setGFormIdentity] = useState('')
  const [gFormNationality, setGFormNationality] = useState('Vietnam')
  const [gFormBirthday, setGFormBirthday] = useState('')
  const [gFormGender, setGFormGender] = useState('male')
  const [gFormNote, setGFormNote] = useState('')

  const fetchGroupOccupants = async (groupId: string, resvs: Reservation[]) => {
    setLoadingGroupOccs(true)
    try {
      const unassignedRes = await fetch(`/api/shops/${shopId}/occupants?reservation_id=${groupId}&t=${Date.now()}`)
      const unassignedJson = unassignedRes.ok ? await unassignedRes.json() : { data: [] }
      const unassignedList = (unassignedJson.data || []).map((occ: any) => ({
        ...occ,
        reservation_id: groupId,
        resource_id: 'unassigned'
      }))

      const assignedLists = await Promise.all(
        resvs.map(async r => {
          const res = await fetch(`/api/shops/${shopId}/occupants?reservation_id=${r.id}&t=${Date.now()}`)
          const json = res.ok ? await res.json() : { data: [] }
          return (json.data || []).map((occ: any) => ({
            ...occ,
            reservation_id: r.id,
            resource_id: r.resource_id
          }))
        })
      )

      const allOccs = [...unassignedList, ...assignedLists.flat()]
      setGroupOccupants(allOccs)
    } catch {
      toast.error('Lỗi khi tải danh sách khách đoàn')
    } finally {
      setLoadingGroupOccs(false)
    }
  }

  const triggerGroupRoomingList = (groupId: string, resvs: Reservation[]) => {
    setSelectedGroupId(groupId)
    setSelectedGroupResvs(resvs)
    setGroupRoomingModalOpen(true)
    setAssigningGuest(null)
    setShowAddGuestForm(false)
    void fetchGroupOccupants(groupId, resvs)
  }

  const handleAddGroupGuest = async () => {
    if (!gFormName.trim()) {
      toast.error('Vui lòng nhập tên khách')
      return
    }
    if (!selectedGroupId) return

    try {
      const res = await fetch(`/api/shops/${shopId}/occupants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: selectedGroupId,
          resource_id: 'unassigned',
          guest_name: gFormName,
          guest_phone: gFormPhone,
          identity_card: gFormIdentity,
          nationality: gFormNationality,
          birthday: gFormBirthday,
          gender: gFormGender,
          is_primary: 'FALSE',
          note: gFormNote
        })
      })

      if (!res.ok) throw new Error()
      toast.success('Đã thêm khách vào danh sách đoàn')
      setGFormName('')
      setGFormPhone('')
      setGFormIdentity('')
      setGFormBirthday('')
      setGFormNote('')
      setShowAddGuestForm(false)
      void fetchGroupOccupants(selectedGroupId, selectedGroupResvs)
      void fetchAllOccupants()
    } catch {
      toast.error('Lỗi khi thêm khách')
    }
  }

  const handleDeleteGroupGuest = async (occId: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Xóa khách đoàn',
      description: 'Bạn có chắc chắn muốn xóa khách này khỏi danh sách đoàn?',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, loading: true }))
        try {
          const res = await fetch(`/api/shops/${shopId}/occupants/${occId}`, {
            method: 'DELETE'
          })
          if (!res.ok) throw new Error()
          toast.success('Đã xóa khách')
          if (selectedGroupId) {
            void fetchGroupOccupants(selectedGroupId, selectedGroupResvs)
            void fetchAllOccupants()
          }
        } catch {
          toast.error('Lỗi khi xóa khách')
        } finally {
          setConfirmState(prev => ({ ...prev, isOpen: false, loading: false }))
        }
      }
    })
  }

  const handleAssignGuest = async (occId: string, resv: Reservation) => {
    if (!selectedGroupId) return
    
    // Check if room is full
    const currentOccs = groupOccupants.filter(o => o.reservation_id === resv.id)
    const capacityNum = getRoomCapacityNum(resv)

    const performAssign = async () => {
      try {
        const res = await fetch(`/api/shops/${shopId}/occupants/${occId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reservation_id: resv.id,
            resource_id: resv.resource_id
          })
        })
        if (!res.ok) throw new Error()
        toast.success(`Đã gán vào ${getRoomName(resv.resource_id)}`)
        void fetchGroupOccupants(selectedGroupId, selectedGroupResvs)
        void fetchAllOccupants()
      } catch {
        toast.error('Lỗi khi gán phòng')
      }
    }

    if (currentOccs.length >= capacityNum) {
      setConfirmState({
        isOpen: true,
        title: 'Cảnh báo vượt sức chứa',
        description: `${getRoomName(resv.resource_id)} đã đạt sức chứa tối đa (${capacityNum} người). Bạn có chắc muốn tiếp tục gán quá số người? (Yêu cầu phụ thu sẽ được ghi nhận)`,
        onConfirm: async () => {
          setConfirmState(prev => ({ ...prev, isOpen: false }))
          await performAssign()
        }
      })
    } else {
      await performAssign()
    }
  }

  const handleUnassignGuest = async (occId: string) => {
    if (!selectedGroupId) return
    try {
      const res = await fetch(`/api/shops/${shopId}/occupants/${occId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: selectedGroupId,
          resource_id: 'unassigned'
        })
      })
      if (!res.ok) throw new Error()
      toast.success('Đã bỏ gán phòng')
      void fetchGroupOccupants(selectedGroupId, selectedGroupResvs)
      void fetchAllOccupants()
    } catch {
      toast.error('Lỗi khi bỏ gán phòng')
    }
  }

  const getRoomCapacityNum = (resv: Reservation) => {
    const room = resources.find(r => r.id === resv.resource_id)
    return room && room.capacity ? parseInt(room.capacity) : 2
  }

  const handleAutoAssignGroup = async () => {
    if (!selectedGroupId) return
    const unassigned = groupOccupants.filter(o => o.resource_id === 'unassigned')
    if (unassigned.length === 0) {
      toast.info('Tất cả khách đã được gán phòng')
      return
    }

    const loadToast = toast.loading('Đang tự động gán phòng thông minh...')
    try {
      let assignedCount = 0
      const femaleList = unassigned.filter(o => o.gender === 'female')
      const maleList = unassigned.filter(o => o.gender === 'male')
      const otherList = unassigned.filter(o => o.gender !== 'female' && o.gender !== 'male')

      for (const resv of selectedGroupResvs) {
        const capacity = getRoomCapacityNum(resv)
        const currentOccs = groupOccupants.filter(o => o.reservation_id === resv.id)
        const currentOccsCount = currentOccs.length
        const slotsAvailable = Math.max(0, capacity - currentOccsCount)

        if (slotsAvailable <= 0) continue

        // Xác định giới tính được phép gán cho phòng này
        let allowedGender: 'female' | 'male' | 'other' | null = null
        if (currentOccsCount > 0) {
          const hasFemale = currentOccs.some(o => o.gender === 'female')
          const hasMale = currentOccs.some(o => o.gender === 'male')
          if (hasFemale && !hasMale) {
            allowedGender = 'female'
          } else if (hasMale && !hasFemale) {
            allowedGender = 'male'
          } else if (!hasFemale && !hasMale) {
            allowedGender = 'other'
          } else {
            // Phòng đã có sẵn cả nam và nữ (hỗn hợp), bỏ qua không tự động gán thêm để tránh nhầm lẫn
            continue
          }
        } else {
          // Phòng trống: chọn nhóm giới tính còn nhiều khách nhất để tối ưu hóa phòng
          if (femaleList.length > 0 && femaleList.length >= maleList.length) {
            allowedGender = 'female'
          } else if (maleList.length > 0) {
            allowedGender = 'male'
          } else if (otherList.length > 0) {
            allowedGender = 'other'
          } else if (femaleList.length > 0) {
            allowedGender = 'female'
          }
        }

        // Lấy danh sách khách phù hợp
        let guestsToAssign: typeof unassigned = []
        if (allowedGender === 'female') {
          guestsToAssign = femaleList.splice(0, slotsAvailable)
        } else if (allowedGender === 'male') {
          guestsToAssign = maleList.splice(0, slotsAvailable)
        } else if (allowedGender === 'other') {
          guestsToAssign = otherList.splice(0, slotsAvailable)
        } else {
          // Fallback nếu không xác định được và phòng trống
          if (maleList.length > 0) {
            guestsToAssign = maleList.splice(0, slotsAvailable)
          } else if (femaleList.length > 0) {
            guestsToAssign = femaleList.splice(0, slotsAvailable)
          } else if (otherList.length > 0) {
            guestsToAssign = otherList.splice(0, slotsAvailable)
          }
        }

        // Thực hiện gán phòng cho khách đã chọn
        for (const guest of guestsToAssign) {
          await fetch(`/api/shops/${shopId}/occupants/${guest.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reservation_id: resv.id,
              resource_id: resv.resource_id
            })
          })
          assignedCount++
        }
      }

      if (assignedCount > 0) {
        toast.success(`Đã tự động gán thông minh thành công ${assignedCount} khách! (Tách biệt Nam/Nữ)`)
        void fetchGroupOccupants(selectedGroupId, selectedGroupResvs)
        void fetchAllOccupants()
      } else {
        toast.info('Không thể tự động gán thêm khách nào phù hợp với quy tắc giới tính phòng.')
      }
    } catch {
      toast.error('Lỗi khi gán tự động')
    } finally {
      toast.dismiss(loadToast)
    }
  }

  const handleImportCSV = async (csvText: string) => {
    if (!selectedGroupId) return
    if (!csvText.trim()) {
      toast.error('Vui lòng nhập nội dung dữ liệu CSV')
      return
    }

    const lines = csvText.split('\n')
    const parsedGuests: any[] = []
    for (let line of lines) {
      line = line.trim()
      if (!line) continue
      const parts = line.split(',').map(s => s.trim())
      if (parts.length === 0 || !parts[0]) continue
      
      if (parts[0].toLowerCase().includes('họ tên') || parts[0].toLowerCase().includes('ho ten') || parts[0].toLowerCase() === 'name') {
        continue
      }

      parsedGuests.push({
        guest_name: parts[0],
        guest_phone: parts[1] || '',
        identity_card: parts[2] || '',
        nationality: parts[3] || 'Vietnam',
        birthday: parts[4] || '',
        gender: parts[5]?.toLowerCase() === 'nữ' || parts[5]?.toLowerCase() === 'nu' || parts[5]?.toLowerCase() === 'female' ? 'female' : 'male',
        note: parts[6] || ''
      })
    }

    if (parsedGuests.length === 0) {
      toast.error('Không tìm thấy dữ liệu hợp lệ để import')
      return
    }

    const loadToast = toast.loading(`Đang import ${parsedGuests.length} khách...`)
    try {
      for (const guest of parsedGuests) {
        await fetch(`/api/shops/${shopId}/occupants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reservation_id: selectedGroupId,
            resource_id: 'unassigned',
            guest_name: guest.guest_name,
            guest_phone: guest.guest_phone,
            identity_card: guest.identity_card,
            nationality: guest.nationality,
            birthday: guest.birthday,
            gender: guest.gender,
            is_primary: 'FALSE',
            note: guest.note
          })
        })
      }
      toast.success(`Đã import thành công ${parsedGuests.length} khách!`)
      setImportText('')
      setImportModalOpen(false)
      void fetchGroupOccupants(selectedGroupId, selectedGroupResvs)
      void fetchAllOccupants()
    } catch {
      toast.error('Lỗi khi import danh sách')
    } finally {
      toast.dismiss(loadToast)
    }
  }

  const handleDownloadTemplateCSV = () => {
    const csvContent = "Họ và tên,Số điện thoại,CCCD hoặc Hộ chiếu,Quốc tịch,Ngày sinh (YYYY-MM-DD),Giới tính (Nam/Nữ),Ghi chú\n" +
      "Nguyễn Văn A,0901234567,079123456789,Việt Nam,1995-05-15,Nam,Yêu cầu ăn chay\n" +
      "Tran Thi B,0987654321,B1234567,Việt Nam,1998-10-20,Nữ,Yêu cầu tầng cao\n";
    
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", "mau_danh_sach_khach_doan.csv")
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Đã tải file mẫu CSV!')
  }

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
    void fetchAllOccupants()
  }, [shopId])

  useEffect(() => {
    if (activeTab === 'list') {
      void fetchReservations()
      void fetchAllOccupants()
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
      description: `Bạn có chắc chắn muốn nhận ${getRoomName(resv.resource_id)} cho khách hàng ${resv.customer_name}?`,
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
          toast.success(`Check-in ${getRoomName(resv.resource_id)} thành công!`)
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
    return room ? room.name : `Phòng ${roomId.slice(-4)}`
  }

  const formatBirthdayAndAge = (birthdayStr?: string) => {
    if (!birthdayStr) return ''
    try {
      const parts = birthdayStr.split('-')
      if (parts.length === 3) {
        const y = parseInt(parts[0])
        const m = parseInt(parts[1])
        const d = parseInt(parts[2])
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
          const formattedDate = `${d.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}/${y}`
          const today = new Date()
          let age = today.getFullYear() - y
          const birthMonth = m - 1
          if (today.getMonth() < birthMonth || (today.getMonth() === birthMonth && today.getDate() < d)) {
            age--
          }
          return `${formattedDate} (${age} tuổi)`
        }
      }
      const slashParts = birthdayStr.split('/')
      if (slashParts.length === 3) {
        const d = parseInt(slashParts[0])
        const m = parseInt(slashParts[1])
        const y = parseInt(slashParts[2])
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
          const formattedDate = `${d.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}/${y}`
          const today = new Date()
          let age = today.getFullYear() - y
          const birthMonth = m - 1
          if (today.getMonth() < birthMonth || (today.getMonth() === birthMonth && today.getDate() < d)) {
            age--
          }
          return `${formattedDate} (${age} tuổi)`
        }
      }
    } catch {
      // ignore
    }
    return birthdayStr
  }

  const fetchAllOccupants = async () => {
    try {
      const res = await fetch(`/api/shops/${shopId}/occupants?t=${Date.now()}`)
      if (res.ok) {
        const json = await res.json()
        setAllOccupants(json.data || [])
      }
    } catch (e) {
      console.error('Error fetching occupants:', e)
    }
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
      void fetchAllOccupants()
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
            void fetchAllOccupants()
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
              <Building className="w-12 h-12 text-slate-400 mb-3" />
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
                    <div className="bg-slate-50/70 border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-2.5 py-1 text-[10px] font-semibold rounded-lg uppercase tracking-wider flex items-center gap-1 shadow-2xs">
                            <Layers className="w-3.5 h-3.5" /> Mã Đoàn: {groupId}
                          </span>
                          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border shadow-2xs ${
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
                            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[2.5]" /> Check-in Đoàn
                          </button>
                        )}
                        <button
                          onClick={() => triggerGroupRoomingList(groupId, resvs)}
                          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 hover:border-indigo-300 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm shadow-indigo-500/10"
                        >
                          <Users className="w-3.5 h-3.5" />
                          Khách đoàn & Phân phòng
                        </button>
                        <button
                          onClick={() => handleCancelGroup(groupId, resvs)}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 hover:border-rose-300 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm shadow-rose-500/10"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Hủy toàn bộ đoàn
                        </button>
                      </div>
                    </div>

                    {/* Room list inside the group */}
                    <div className="divide-y divide-slate-100">
                      {/* Desktop Table Header */}
                      <div className="hidden md:flex md:items-center justify-between gap-4 px-6 py-2.5 bg-slate-50/50 border-b border-slate-100 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                        <div className="grid grid-cols-4 gap-4 flex-1">
                          <div>Phòng</div>
                          <div>Mã lẻ</div>
                          <div>Thời gian</div>
                          <div>Tiền cọc / Giá</div>
                        </div>
                        <div className="w-[260px] text-right">Thao tác</div>
                      </div>

                      {resvs.map(r => (
                        <div key={r.id} className="px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/40 transition-colors text-xs text-slate-600">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
                            <div className="flex flex-col text-left">
                              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider md:hidden">Phòng</span>
                              <span className="font-semibold text-slate-800 text-sm">{getRoomName(r.resource_id)}</span>
                            </div>
                            <div className="flex flex-col text-left">
                              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider md:hidden">Mã lẻ</span>
                              <span className="font-bold text-slate-700">#{r.reservation_no}</span>
                            </div>
                            <div className="flex flex-col text-left">
                              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider md:hidden">Thời gian</span>
                              <span className="font-semibold text-slate-700">
                                {format(parseGMT7Date(r.expected_checkin), 'dd/MM HH:mm')} - {format(parseGMT7Date(r.expected_checkout), 'dd/MM HH:mm')}
                              </span>
                            </div>
                            <div className="flex flex-col text-left">
                              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider md:hidden">Tiền cọc / Giá</span>
                              <span className="font-bold text-slate-800">
                                {Number(r.deposit_amount).toLocaleString('vi-VN')}₫ / {Number(r.daily_rate).toLocaleString('vi-VN')}₫
                              </span>
                            </div>
                          </div>

                          {/* Individual Room Actions */}
                          <div className="flex items-center justify-end gap-1.5 shrink-0 w-[260px] self-start md:self-center">
                            <button
                              onClick={() => triggerOccupantsModal(r)}
                              className="bg-white hover:bg-indigo-50 text-indigo-600 hover:text-indigo-700 px-2.5 py-1.5 border border-indigo-200 hover:border-indigo-300 rounded-lg font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                            >
                              <Users className="w-3.5 h-3.5" /> Khách ({allOccupants.filter(occ => occ.reservation_id === r.id).length})
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
                  <div className="bg-slate-50/50 border-b border-slate-200 px-6 py-3 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                      <Grid className="w-4 h-4 text-slate-400" /> Đặt lẻ không theo đoàn ({groupedData.individuals.length})
                    </h3>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {/* Desktop Table Header */}
                    <div className="hidden md:flex md:items-center justify-between gap-4 px-6 py-2.5 bg-slate-50/85 border-b border-slate-100 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
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
                            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider md:hidden">Khách hàng</span>
                            <span className="font-semibold text-slate-800 text-sm leading-snug">{r.customer_name}</span>
                            <span className="text-[10px] text-slate-500">{r.customer_phone}</span>
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider md:hidden">Mã số / Phòng</span>
                            <span className="font-bold text-slate-700">#{r.reservation_no}</span>
                            <span className="font-semibold text-primary text-sm mt-0.5">{getRoomName(r.resource_id)}</span>
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider md:hidden">Ngày nhận - Trả</span>
                            <span className="font-semibold text-slate-700 pt-0.5">
                              {format(parseGMT7Date(r.expected_checkin), 'dd/MM HH:mm')} - {format(parseGMT7Date(r.expected_checkout), 'dd/MM HH:mm')}
                            </span>
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider md:hidden">Tiền cọc</span>
                            <span className="font-bold text-emerald-600 text-sm pt-0.5">{Number(r.deposit_amount).toLocaleString('vi-VN')}₫</span>
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider md:hidden">Trạng thái</span>
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
                            className="bg-white hover:bg-indigo-50 text-indigo-600 hover:text-indigo-700 px-2.5 py-2 border border-indigo-200 hover:border-indigo-300 rounded-xl font-bold text-xs transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                          >
                            <Users className="w-3.5 h-3.5" /> Khách ({allOccupants.filter(occ => occ.reservation_id === r.id).length})
                          </button>
                          {r.status !== 'checked_in' ? (
                            <button
                              onClick={() => handleCheckInResv(r)}
                              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 transition-all active:scale-95 cursor-pointer flex items-center gap-1"
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
                <Users className="w-5 h-5 text-indigo-600 animate-pulse" /> Khách lưu trú thực tế: {getRoomName(occSelectedRes.resource_id)}
              </h2>
              <button 
                onClick={() => setOccupantsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                title="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 scrollbar-thin">
              
              {/* Form thêm khách mới */}
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
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
                            <span className="font-semibold text-slate-800">{occ.guest_name}</span>
                            {occ.guest_phone && <span className="text-slate-500 font-medium">({occ.guest_phone})</span>}
                            {occ.is_primary === 'TRUE' && (
                              <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 text-[9px] font-bold rounded">Đại diện</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 space-x-2 font-medium">
                            {occ.identity_card && <span>CCCD: {occ.identity_card}</span>}
                            {occ.nationality && <span>• Quốc tịch: {occ.nationality}</span>}
                            {occ.birthday && <span>• Ngày sinh: {formatBirthdayAndAge(occ.birthday)}</span>}
                            {occ.gender && <span>• Giới tính: {occ.gender === 'male' ? 'Nam' : occ.gender === 'female' ? 'Nữ' : 'Khác'}</span>}
                          </div>
                          {occ.note && (
                            <div className="text-[10px] text-amber-600 mt-1 font-semibold flex items-center gap-1">
                              <FileText className="w-3 h-3" /> {occ.note}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteOccupant(occ.id)}
                          className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Xóa khách này"
                        >
                          <Trash2 className="w-4 h-4" />
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
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer"
              >
                Đóng lại
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL QUẢN LÝ KHÁCH ĐOÀN & PHÂN PHÒNG */}
      {groupRoomingModalOpen && selectedGroupId && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="mx-4 w-full max-w-5xl h-[85vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
                  <Users className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800 leading-tight">
                    Quản lý Khách đoàn & Phân phòng
                  </h2>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">
                    Mã đoàn: <span className="text-indigo-600 font-bold">{selectedGroupId}</span> • Quy mô: <span className="font-semibold">{selectedGroupResvs.length} phòng đã đặt</span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setGroupRoomingModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-colors cursor-pointer"
                title="Đóng bảng phân phòng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body Grid */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden divide-y md:divide-y-0 md:divide-x divide-slate-100">
              
              {/* CỘT TRÁI: DANH SÁCH KHÁCH ĐOÀN */}
              <div className="w-full md:w-[45%] flex flex-col h-full bg-slate-50/40 overflow-hidden">
                {/* Header list */}
                <div className="px-5 py-3 bg-slate-100/70 border-b border-slate-100 flex items-center justify-between shrink-0 text-xs">
                  <span className="font-semibold text-slate-700">
                    Khách lưu trú ({groupOccupants.length} người)
                  </span>
                  <span className="bg-slate-200/50 text-slate-600 font-semibold px-2 py-0.5 rounded-full text-[10px]">
                    Chưa gán: {groupOccupants.filter(o => o.resource_id === 'unassigned').length}
                  </span>
                </div>

                {/* Actions row */}
                <div className="p-3 border-b border-slate-100 flex items-center gap-2 shrink-0 bg-white shadow-3xs">
                  <button
                    onClick={handleAutoAssignGroup}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-xs active:scale-95"
                    title="Tự động gán khách vào các phòng theo sức chứa"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2]" /> Gán tự động
                  </button>
                  <button
                    onClick={() => {
                      setImportText('')
                      setImportModalOpen(true)
                    }}
                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 text-[11px] font-semibold py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" /> Import CSV
                  </button>
                  <button
                    onClick={() => setShowAddGuestForm(!showAddGuestForm)}
                    className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-100 text-[11px] font-semibold py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-3xs"
                  >
                    <Plus className="w-3.5 h-3.5" /> {showAddGuestForm ? 'Đóng' : 'Thêm'}
                  </button>
                </div>

                {/* Add Guest Manual Form */}
                {showAddGuestForm && (
                  <div className="p-4 border-b border-slate-100 bg-indigo-50/10 shrink-0 space-y-3">
                    <h4 className="text-xs font-bold text-indigo-600">Thêm khách đoàn thủ công</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="space-y-1">
                        <label className="block text-[9px] font-semibold text-slate-400 uppercase">Tên khách *</label>
                        <input 
                          type="text" 
                          value={gFormName} 
                          onChange={e => setGFormName(e.target.value)}
                          className="w-full rounded-md border border-slate-100 px-2 py-1 bg-white text-slate-800 text-xs"
                          placeholder="Họ tên"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[9px] font-semibold text-slate-400 uppercase">Điện thoại</label>
                        <input 
                          type="text" 
                          value={gFormPhone} 
                          onChange={e => setGFormPhone(e.target.value)}
                          className="w-full rounded-md border border-slate-100 px-2 py-1 bg-white text-slate-800 text-xs"
                          placeholder="SĐT"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[9px] font-semibold text-slate-400 uppercase">CCCD / Passport</label>
                        <input 
                          type="text" 
                          value={gFormIdentity} 
                          onChange={e => setGFormIdentity(e.target.value)}
                          className="w-full rounded-md border border-slate-100 px-2 py-1 bg-white text-slate-800 text-xs"
                          placeholder="CCCD"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[9px] font-semibold text-slate-400 uppercase">Quốc tịch</label>
                        <input 
                          type="text" 
                          value={gFormNationality} 
                          onChange={e => setGFormNationality(e.target.value)}
                          className="w-full rounded-md border border-slate-100 px-2 py-1 bg-white text-slate-800 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[9px] font-semibold text-slate-400 uppercase">Ngày sinh</label>
                        <input 
                          type="date" 
                          value={gFormBirthday} 
                          onChange={e => setGFormBirthday(e.target.value)}
                          className="w-full rounded-md border border-slate-100 px-2 py-1 bg-white text-slate-800 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[9px] font-semibold text-slate-400 uppercase">Giới tính</label>
                        <select 
                          value={gFormGender} 
                          onChange={e => setGFormGender(e.target.value)}
                          className="w-full rounded-md border border-slate-100 px-2 py-1 bg-white text-slate-800 text-xs focus:outline-none"
                        >
                          <option value="male">Nam</option>
                          <option value="female">Nữ</option>
                          <option value="other">Khác</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1 text-xs">
                      <label className="block text-[9px] font-semibold text-slate-400 uppercase">Ghi chú</label>
                      <input 
                        type="text" 
                        value={gFormNote} 
                        onChange={e => setGFormNote(e.target.value)}
                        className="w-full rounded-md border border-slate-100 px-2 py-1 bg-white text-slate-800 text-xs"
                        placeholder="Yêu cầu ăn uống, giường phụ..."
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button 
                        onClick={() => setShowAddGuestForm(false)}
                        className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button 
                        onClick={handleAddGroupGuest}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        Lưu khách
                      </button>
                    </div>
                  </div>
                )}

                {/* List Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {loadingGroupOccs ? (
                    <div className="py-12 flex justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" /></div>
                  ) : groupOccupants.length === 0 ? (
                    <div className="py-16 text-center border border-dashed border-slate-100 rounded-2xl bg-white p-6">
                      <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-500">Chưa có khách lưu trú nào trong đoàn</p>
                      <p className="text-[10px] text-slate-400 mt-1">Sử dụng nút 'Import CSV' hoặc 'Thêm' khách đoàn ở trên.</p>
                    </div>
                  ) : (
                    groupOccupants.map(occ => {
                      const isUnassigned = occ.resource_id === 'unassigned'
                      return (
                        <div key={occ.id} className="bg-white border border-slate-100 rounded-xl p-3.5 space-y-2.5 shadow-2xs hover:shadow-xs transition-shadow">
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-slate-800 text-xs">{occ.guest_name}</span>
                                {occ.guest_phone && <span className="text-slate-400 text-[10px] font-medium">({occ.guest_phone})</span>}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5 space-y-0.5 font-medium">
                                {occ.identity_card && <div>CCCD/Passport: {occ.identity_card}</div>}
                                {occ.nationality && <div>Quốc tịch: {occ.nationality} • Giới tính: {occ.gender === 'female' ? 'Nữ' : 'Nam'}</div>}
                                {occ.birthday && <div>Ngày sinh: {formatBirthdayAndAge(occ.birthday)}</div>}
                              </div>
                              {occ.note && (
                                <div className="text-[10px] text-indigo-600 mt-1 font-semibold flex items-center gap-1">
                                  <FileText className="w-3.5 h-3.5" /> {occ.note}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => handleDeleteGroupGuest(occ.id)}
                              className="text-slate-400 hover:text-red-600 p-1 hover:bg-red-50 rounded transition-colors cursor-pointer shrink-0"
                              title="Xóa khỏi đoàn"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs gap-3">
                            <div>
                              {isUnassigned ? (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-semibold bg-slate-50 border border-slate-100 text-slate-500 rounded">Chưa gán phòng</span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-semibold bg-indigo-50/50 border border-indigo-100 text-indigo-600 rounded">
                                  {getRoomName(occ.resource_id)}
                                </span>
                              )}
                            </div>

                            <div className="relative shrink-0">
                              {isUnassigned ? (
                                <button
                                  onClick={() => {
                                    setAssigningGuest(occ)
                                    setAssignRoomSearch('')
                                  }}
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[10px] px-2.5 py-1 rounded transition-colors cursor-pointer shadow-3xs"
                                >
                                  Gán phòng
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleUnassignGuest(occ.id)}
                                  className="text-slate-400 hover:text-red-500 p-1 hover:bg-red-50 rounded-full transition-colors cursor-pointer shrink-0"
                                  title="Bỏ gán phòng"
                                >
                                  <XCircle className="w-5 h-5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* CỘT PHẢI: DANH SÁCH PHÒNG ĐÃ ĐẶT */}
              <div className="w-full md:w-[55%] flex flex-col h-full bg-white overflow-hidden">
                <div className="px-5 py-3 bg-slate-100/70 border-b border-slate-100 shrink-0 text-xs font-semibold text-slate-700">
                  Sơ đồ Phòng ({selectedGroupResvs.length} phòng)
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {selectedGroupResvs.map(resv => {
                    const resvOccs = groupOccupants.filter(o => o.reservation_id === resv.id)
                    const capacity = getRoomCapacityNum(resv)
                    const isOverLimit = resvOccs.length > capacity

                    return (
                      <div key={resv.id} className={`border rounded-2xl p-4 transition-all shadow-3xs ${isOverLimit ? 'border-amber-200 bg-amber-50/10' : 'border-slate-100 bg-white'}`}>
                        {/* Room Info Header */}
                        <div className="flex justify-between items-start border-b border-slate-100 pb-2.5">
                          <div>
                            <h4 className="text-sm font-bold text-slate-800">
                              {getRoomName(resv.resource_id)}
                            </h4>
                            <div className="text-[10px] text-slate-400 mt-0.5 space-x-2 font-medium">
                              <span>Mã đặt phòng: #{resv.reservation_no}</span>
                              <span>•</span>
                              <span>Sức chứa chuẩn: <strong className="text-slate-600">{capacity} người</strong></span>
                            </div>
                          </div>
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${
                            isOverLimit 
                              ? 'bg-amber-100 border-amber-200 text-amber-800' 
                              : resvOccs.length === capacity 
                                ? 'bg-emerald-50 border-emerald-100 text-emerald-600' 
                                : 'bg-slate-50 border-slate-100 text-slate-500'
                          }`}>
                            Đã gán: {resvOccs.length}/{capacity}
                          </span>
                        </div>

                        {/* Room Occupants List */}
                        <div className="mt-3 space-y-2">
                          {resvOccs.length === 0 ? (
                            <p className="text-[11px] text-slate-400 text-center py-4 border border-dashed border-slate-100 rounded-xl bg-slate-50/20">Chưa gán khách ở phòng này.</p>
                          ) : (
                            <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden bg-slate-50/20">
                              {resvOccs.map(occ => (
                                <div key={occ.id} className="p-2.5 flex items-center justify-between text-xs bg-white">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-semibold text-slate-800">{occ.guest_name}</span>
                                      {occ.guest_phone && <span className="text-slate-400 font-medium text-[10px]">({occ.guest_phone})</span>}
                                    </div>
                                    <span className="text-[9px] text-slate-400">CCCD: {occ.identity_card || '-'} • Quốc tịch: {occ.nationality}</span>
                                  </div>
                                  <button
                                    onClick={() => handleUnassignGuest(occ.id)}
                                    className="text-slate-400 hover:text-red-500 p-1 hover:bg-red-50 rounded-full transition-colors cursor-pointer shrink-0"
                                    title="Bỏ gán khách khỏi phòng này"
                                  >
                                    <XCircle className="w-5 h-5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Over Capacity Warning Surcharge Alert */}
                        {isOverLimit && (
                          <div className="mt-3 bg-amber-50 border border-amber-100 text-amber-800 rounded-xl p-3 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div className="text-[11px] font-medium leading-relaxed">
                              <span className="font-bold">Cảnh báo:</span> Gán vượt quá sức chứa tiêu chuẩn (+{resvOccs.length - capacity} khách). Xem xét tính phụ thu phòng hoặc thêm phụ thu giường phụ (Extra bed) khi thanh toán checkout!
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="bg-slate-50 border-t border-slate-100 px-6 py-3.5 flex justify-end shrink-0">
              <button 
                onClick={() => setGroupRoomingModalOpen(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl px-5 py-2.5 text-xs font-bold shadow-3xs cursor-pointer"
              >
                Hoàn tất & Đóng lại
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-MODAL IMPORT CSV KHÁCH ĐOÀN */}
      {importModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 backdrop-blur-xs">
          <div className="mx-4 w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" /> Import danh sách khách từ CSV
              </h3>
              <button 
                onClick={() => setImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-colors cursor-pointer"
                title="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Template description */}
            <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-xl space-y-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-600">Mẫu định dạng cột (không dấu phẩy trong trường):</span>
                <button
                  onClick={handleDownloadTemplateCSV}
                  className="text-indigo-600 hover:text-indigo-750 font-bold flex items-center gap-1 cursor-pointer bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md"
                >
                  <Download className="w-3 h-3" /> Tải mẫu CSV
                </button>
              </div>
              <code className="block bg-slate-100 p-2 rounded text-[10px] select-all overflow-x-auto text-slate-600 font-mono">
                Họ và tên, Số điện thoại, Số CCCD, Quốc tịch, Ngày sinh (YYYY-MM-DD), Giới tính (Nam/Nữ), Ghi chú
              </code>
              <p className="text-slate-400">Copy nội dung danh sách từ Excel rồi dán trực tiếp vào khung văn bản dưới đây, hệ thống sẽ tự động phân tích và import.</p>
            </div>

            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder="Nguyễn Văn A, 0901234567, 079123456789, Việt Nam, 1995-05-15, Nam, Không cọc&#10;Trần Thị B, 0987654321, B1234567, Việt Nam, 1998-10-20, Nữ, Thêm giường"
              rows={6}
              className="w-full rounded-xl border border-slate-100 p-3 text-xs focus:outline-none focus:border-indigo-500 bg-white text-slate-800 font-mono shadow-3xs"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setImportModalOpen(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                onClick={() => handleImportCSV(importText)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2.5 text-xs font-bold shadow-md shadow-indigo-500/20 transition-all active:scale-95 cursor-pointer"
              >
                Import ngay
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL GÁN PHÒNG CHO KHÁCH ĐOÀN */}
      {assigningGuest && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 backdrop-blur-xs">
          <div className="mx-4 w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Building className="w-5 h-5 text-indigo-600" /> Gán phòng cho khách
              </h3>
              <button 
                onClick={() => setAssigningGuest(null)}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-colors cursor-pointer"
                title="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Guest info card */}
            <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 text-sm">{assigningGuest.guest_name}</span>
                {assigningGuest.guest_phone && (
                  <span className="text-slate-500 text-xs font-semibold">({assigningGuest.guest_phone})</span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 mt-1 font-medium">
                {assigningGuest.identity_card && <span>CCCD: {assigningGuest.identity_card}</span>}
                {assigningGuest.nationality && <span> • Quốc tịch: {assigningGuest.nationality}</span>}
                {assigningGuest.gender && <span> • Giới tính: {assigningGuest.gender === 'male' ? 'Nam' : 'Nữ'}</span>}
              </div>
            </div>

            {/* Search Input */}
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3" />
              <input
                type="text"
                placeholder="Tìm nhanh tên phòng hoặc mã đặt phòng..."
                value={assignRoomSearch}
                onChange={e => setAssignRoomSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500 bg-slate-50/50"
              />
              {assignRoomSearch && (
                <button
                  onClick={() => setAssignRoomSearch('')}
                  className="absolute right-3 p-1 rounded-full text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Rooms List */}
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
              {(() => {
                const query = assignRoomSearch.toLowerCase().trim()
                const filtered = selectedGroupResvs.filter(resv => {
                  const name = getRoomName(resv.resource_id).toLowerCase()
                  const no = resv.reservation_no.toLowerCase()
                  return name.includes(query) || no.includes(query)
                })

                if (filtered.length === 0) {
                  return (
                    <p className="text-xs text-slate-400 text-center py-8">
                      Không tìm thấy phòng nào khớp với "{assignRoomSearch}"
                    </p>
                  )
                }

                return filtered.map(resv => {
                  const occCount = groupOccupants.filter(o => o.reservation_id === resv.id).length
                  const capacity = getRoomCapacityNum(resv)
                  const isFull = occCount >= capacity
                  const roomName = getRoomName(resv.resource_id)

                  return (
                    <div
                      key={resv.id}
                      className="flex items-center justify-between p-2.5 hover:bg-slate-100 bg-slate-50/30 border border-slate-100 rounded-xl transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 text-xs">{roomName}</div>
                        <div className="text-[9px] text-slate-400 mt-0.5">Mã: #{resv.reservation_no}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                          isFull 
                            ? 'bg-red-50 border-red-100 text-red-500' 
                            : 'bg-slate-50 border-slate-100 text-slate-500'
                        }`}>
                          {occCount}/{capacity} {isFull ? 'Đầy' : 'Trống'}
                        </span>
                        <button
                          onClick={async () => {
                            await handleAssignGuest(assigningGuest.id, resv)
                            setAssigningGuest(null)
                          }}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-3xs active:scale-95"
                        >
                          Gán
                        </button>
                      </div>
                    </div>
                  )
                })
              })()}
            </div>

            {/* Footer */}
            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setAssigningGuest(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl px-4 py-2 text-xs font-semibold transition-all cursor-pointer"
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
