'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { 
  BedDouble, 
  Sparkles, 
  Check, 
  Wine, 
  AlertTriangle, 
  BrushCleaning, 
  CheckCircle,
  X,
  Clock,
  User,
  ListFilter,
  PieChart,
  Plus,
  Search,
  Settings,
  Warehouse,
  TrendingUp,
  RefreshCw,
  FileText,
  ChevronRight,
  UserCheck,
  MapPin,
  Info
} from 'lucide-react'

import { usePermissions } from '@/app/components/ui/PermissionGate'

interface RoomResource {
  id: string
  name: string
  type: string
  status: 'available' | 'occupied' | 'cleaning' | 'dirty'
  current_order_id?: string
  zone?: string
  hourly_rate?: string
  metadata?: string
  updated_at?: string
}

const getRoomIdleTime = (updatedAt?: string) => {
  if (!updatedAt) return '—'
  const updatedTime = new Date(updatedAt).getTime()
  const now = Date.now()
  const diffMs = now - updatedTime
  const diffMins = Math.max(0, Math.floor(diffMs / 60000))
  if (diffMins < 60) {
    return `${diffMins} phút`
  } else {
    const hours = Math.floor(diffMins / 60)
    const mins = diffMins % 60
    return `${hours}h ${mins}m`
  }
}

interface MinibarSetupItem {
  id: string
  product_id: string
  product_name?: string
  standard_qty: number
}

interface EmployeeItem {
  employee_id: string
  name: string
  employee_code: string
  role: string
  active: string
}

interface WarehouseItem {
  id: string
  name: string
  code: string
  type: string
  active: string
}

interface InventoryItem {
  product_id: string
  product_name: string
  sku: string
  stock_qty: string
  warehouse_id: string
}

interface HousekeepingLog {
  id: string
  resource_id: string
  employee_id: string
  employee_name: string
  status: 'cleaning' | 'clean_inspected' | 'completed'
  check_type?: string
  consumption_details?: string // JSON string
  started_at?: string
  completed_at?: string
  duration_mins?: string
  sla_status?: 'ontime' | 'overtime'
  note?: string
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
  const { hasPermission } = usePermissions()
  const isManager = hasPermission('housekeeping.manage')

  const [activeTab, setActiveTab] = useState<'rooms' | 'allocations' | 'logs'>('rooms')
  const [roomViewMode, setRoomViewMode] = useState<'grid' | 'list'>('grid')
  const [allocationViewMode, setAllocationViewMode] = useState<'list' | 'grid'>('list')
  
  // Data State
  const [rooms, setRooms] = useState<RoomResource[]>([])
  const [employees, setEmployees] = useState<EmployeeItem[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [allProducts, setAllProducts] = useState<any[]>([])
  const [logs, setLogs] = useState<HousekeepingLog[]>([])
  
  // Loading States
  const [loading, setLoading] = useState(true)
  const [logsLoading, setLogsLoading] = useState(false)
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [savingSetup, setSavingSetup] = useState(false)
  const [loadingSetup, setLoadingSetup] = useState(false)

  // Filtering States for Room Layout
  const [selectedZone, setSelectedZone] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')

  // Modals & Action States
  const [inspectRoom, setInspectRoom] = useState<RoomResource | null>(null)
  const [minibarSetup, setMinibarSetup] = useState<MinibarSetupItem[]>([])
  const [remainingCounts, setRemainingCounts] = useState<Record<string, number>>({})
  const [selectedInspectStaff, setSelectedInspectStaff] = useState<string>('')

  // Assign/Claim Modal State
  const [assignRoom, setAssignRoom] = useState<RoomResource | null>(null)
  const [selectedCleaner, setSelectedCleaner] = useState<string>('')
  const [cleanerType, setCleanerType] = useState<'claim' | 'assign'>('claim')

  // Minibar Setup/Config Modal States
  const [setupModalOpen, setSetupModalOpen] = useState(false)
  const [setupRoomId, setSetupRoomId] = useState('')
  const [setupProductId, setSetupProductId] = useState('')
  const [setupQty, setSetupQty] = useState(1)
  const [applyToAll, setApplyToAll] = useState(false)
  const [setupItems, setSetupItems] = useState<{ product_id: string; product_name: string; standard_qty: number }[]>([])

  // Tab 2: Allocations Dashboard States
  const [totalAllocations, setTotalAllocations] = useState<Record<string, { name: string; qty: number }>>({})
  const [allRoomAllocations, setAllRoomAllocations] = useState<Record<string, MinibarSetupItem[]>>({})
  const [allocationsLoading, setAllocationsLoading] = useState(false)
  const [hskpWarehouse, setHskpWarehouse] = useState<WarehouseItem | null>(null)
  const [hskpDeptStatus, setHskpDeptStatus] = useState<'no_dept' | 'no_wh' | 'ok'>('ok')
  const [targetDeptName, setTargetDeptName] = useState('')

  // SLA Settings & Claim Confirm States
  const [slaSettingsModalOpen, setSlaSettingsModalOpen] = useState(false)
  const [globalSla, setGlobalSla] = useState(30)
  const [roomSlaValue, setRoomSlaValue] = useState<number>(30)
  const [claimConfirmRoom, setClaimConfirmRoom] = useState<RoomResource | null>(null)

  // Fetch Rooms & Active Products
  const fetchRooms = async () => {
    try {
      const res = await fetch(`/api/shops/${shopId}/location-resources?limit=200&t=${Date.now()}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      const roomList = (json.data || []).filter((r: any) => r.type === 'room')
      setRooms(roomList)
      return roomList
    } catch {
      toast.error('Lỗi khi tải danh sách phòng dọn dẹp')
      return []
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

  const fetchEmployees = async () => {
    try {
      const res = await fetch(`/api/shops/${shopId}/employees?limit=200`)
      if (res.ok) {
        const json = await res.json()
        setEmployees((json.data || []).filter((e: any) => e.active === 'TRUE'))
      }
    } catch {}
  }

  const fetchWarehousesAndDepartment = async () => {
    try {
      const [whRes, deptRes] = await Promise.all([
        fetch(`/api/shops/${shopId}/warehouses?limit=200`),
        fetch(`/api/shops/${shopId}/departments?limit=200`)
      ])
      
      if (whRes.ok && deptRes.ok) {
        const whJson = await whRes.json()
        const deptJson = await deptRes.json()
        
        const whs = whJson.data || []
        const depts = deptJson.data || []
        setWarehouses(whs)
        
        // Find department named 'Buồng phòng' or 'Housekeeping' or 'Dọn phòng' (case-insensitive)
        const hskpDept = depts.find((d: any) => {
          const nameLower = (d.name || '').trim().toLowerCase()
          return nameLower.includes('buồng phòng') || nameLower.includes('housekeeping') || nameLower === 'dọn phòng'
        })
        
        if (!hskpDept) {
          setHskpWarehouse(null)
          setHskpDeptStatus('no_dept')
          setInventory([])
        } else {
          setTargetDeptName(hskpDept.name)
          if (!hskpDept.warehouse_id) {
            setHskpWarehouse(null)
            setHskpDeptStatus('no_wh')
            setInventory([])
          } else {
            const wh = whs.find((w: any) => w.id === hskpDept.warehouse_id)
            if (wh) {
              setHskpWarehouse(wh)
              setHskpDeptStatus('ok')
              fetchInventory(wh.id)
            } else {
              setHskpWarehouse(null)
              setHskpDeptStatus('no_wh')
              setInventory([])
            }
          }
        }
      }
    } catch (err) {
      console.error('Lỗi tải cấu hình kho/phòng ban:', err)
    }
  }

  const fetchInventory = async (warehouseId: string) => {
    setInventoryLoading(true)
    try {
      const res = await fetch(`/api/shops/${shopId}/inventory?warehouse_id=${warehouseId}&limit=200`)
      if (res.ok) {
        const json = await res.json()
        setInventory(json.data || [])
      }
    } catch {}
    setInventoryLoading(false)
  }

  const fetchLogs = async () => {
    setLogsLoading(true)
    try {
      const res = await fetch(`/api/shops/${shopId}/housekeeping/logs?limit=50&t=${Date.now()}`)
      if (res.ok) {
        const json = await res.json()
        setLogs(json.data || [])
      }
    } catch {}
    setLogsLoading(false)
  }

  const getRoomSlaMins = (room: RoomResource) => {
    if (room.metadata) {
      try {
        const meta = typeof room.metadata === 'string' ? JSON.parse(room.metadata) : room.metadata
        if (meta && meta.sla_mins) {
          const parsed = parseInt(String(meta.sla_mins), 10)
          if (!isNaN(parsed) && parsed > 0) return parsed
        }
      } catch {}
    }
    return globalSla
  }

  // Load basic data
  useEffect(() => {
    fetchRooms()
    fetchProducts()
    fetchEmployees()
    fetchWarehousesAndDepartment()
    fetchLogs()

    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('hskp_global_sla')
      if (stored) {
        const parsed = parseInt(stored, 10)
        if (!isNaN(parsed) && parsed > 0) {
          setGlobalSla(parsed)
        }
      }
    }
  }, [shopId])

  // Reload allocations data when allocations tab becomes active
  useEffect(() => {
    if (activeTab === 'allocations' && rooms.length > 0) {
      loadAllAllocations(rooms)
    }
  }, [activeTab, rooms])

  const loadAllAllocations = async (roomList: RoomResource[]) => {
    setAllocationsLoading(true)
    try {
      const promises = roomList.map(async (room) => {
        const res = await fetch(`/api/shops/${shopId}/housekeeping/minibar-setup?resource_id=${room.id}&t=${Date.now()}`)
        if (res.ok) {
          const json = await res.json()
          return { roomId: room.id, items: json.data || [] }
        }
        return { roomId: room.id, items: [] }
      })
      const results = await Promise.all(promises)
      
      const totals: Record<string, { name: string; qty: number }> = {}
      const roomAllocMap: Record<string, MinibarSetupItem[]> = {}
      
      for (const res of results) {
        // Map setups to include resolved product names for the grid card display
        const mappedItems = res.items.map((item: any) => {
          const prodId = item.product_id
          const prod = allProducts.find(p => p.id === prodId || p.product_id === prodId)
          return {
            ...item,
            product_name: prod?.name || `Sản phẩm ${prodId}`
          }
        })
        roomAllocMap[res.roomId] = mappedItems
        
        for (const item of mappedItems) {
          const prodId = item.product_id
          const qty = parseInt(String(item.standard_qty || '0'), 10)
          
          if (!totals[prodId]) {
            totals[prodId] = { name: item.product_name || `Sản phẩm ${prodId}`, qty: 0 }
          }
          totals[prodId].qty += qty
        }
      }
      
      setAllRoomAllocations(roomAllocMap)
      setTotalAllocations(totals)
    } catch (e) {
      console.error(e)
    }
    setAllocationsLoading(false)
  }



  // 1. Assign / Claim dọn phòng
  const handleOpenAssign = (room: RoomResource) => {
    setAssignRoom(room)
    setSelectedCleaner(employees[0]?.employee_id || '')
    setCleanerType('assign')
  }

  const handleClaimCleaningDirect = async (room: RoomResource) => {
    const loadToast = toast.loading('Đang ghi nhận nhận dọn phòng...')
    try {
      const res = await fetch(`/api/shops/${shopId}/housekeeping/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start_cleaning',
          resource_id: room.id,
          note: `Nhân viên tự nhận dọn dẹp phòng ${room.name}.`
        })
      })

      if (!res.ok) throw new Error()

      toast.success(`Đã nhận dọn phòng ${room.name}!`)
      fetchRooms()
      fetchLogs()
    } catch (err) {
      toast.error('Lỗi khi nhận dọn phòng')
    } finally {
      toast.dismiss(loadToast)
    }
  }

  const handleStartCleaning = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assignRoom) return

    setSubmitting(true)
    const loadToast = toast.loading('Đang ghi nhận bắt đầu dọn phòng...')

    try {
      const selectedEmp = employees.find(emp => emp.employee_id === selectedCleaner)
      const payload = {
        action: 'start_cleaning',
        resource_id: assignRoom.id,
        employee_id: selectedCleaner,
        employee_name: selectedEmp?.name || 'Nhân viên buồng phòng',
        note: `Bắt đầu dọn dẹp phòng ${assignRoom.name}.`
      }

      const res = await fetch(`/api/shops/${shopId}/housekeeping/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) throw new Error('Không thể chuyển trạng thái phòng')

      toast.success(`Đã bắt đầu tính giờ dọn phòng ${assignRoom.name}!`)
      setAssignRoom(null)
      fetchRooms()
      fetchLogs()
    } catch (err) {
      toast.error('Lỗi khi bắt đầu dọn phòng')
    } finally {
      setSubmitting(false)
      toast.dismiss(loadToast)
    }
  }

  // 2. Hoàn tất dọn phòng (SLA Calculation)
  const handleMarkClean = async (roomId: string, roomName: string) => {
    const loadToast = toast.loading(`Đang tính toán SLA và báo sạch cho phòng ${roomName}...`)
    try {
      const res = await fetch(`/api/shops/${shopId}/housekeeping/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'finish_cleaning',
          resource_id: roomId,
          global_sla: globalSla,
          note: `Đã dọn xong phòng ${roomName}, sẵn sàng đón khách.`
        })
      })

      if (!res.ok) throw new Error()
      const json = await res.json()
      const log = json.log

      if (log && log.duration_mins) {
        const minutes = parseInt(log.duration_mins, 10)
        const isOntime = log.sla_status === 'ontime'
        toast.success(
          `Phòng ${roomName} đã sạch sẵn sàng! Dọn dẹp mất ${minutes} phút - ${
            isOntime ? 'Đạt SLA xuất sắc!' : 'Quá hạn SLA.'
          }`
        )
      } else {
        toast.success(`Phòng ${roomName} đã sạch sẵn sàng!`)
      }

      fetchRooms()
      fetchLogs()
    } catch {
      toast.error('Lỗi khi hoàn tất dọn dẹp')
    } finally {
      toast.dismiss(loadToast)
    }
  }

  // 3. Kiểm Minibar
  const handleOpenInspection = async (room: RoomResource) => {
    setInspectRoom(room)
    setLoadingSetup(true)
    setMinibarSetup([])
    setRemainingCounts({})
    setSelectedInspectStaff(employees[0]?.employee_id || '')
    
    try {
      const res = await fetch(`/api/shops/${shopId}/housekeeping/minibar-setup?resource_id=${room.id}&t=${Date.now()}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      const items = json.data || []
      
      const resolvedItems = []
      for (const item of items) {
        const standardQty = parseInt(String(item.standard_qty || '0'), 10)
        
        const prod = allProducts.find(p => p.id === item.product_id || p.product_id === item.product_id)
        const productName = prod?.name || 'Sản phẩm ' + item.product_id

        resolvedItems.push({
          id: item.id,
          product_id: item.product_id,
          product_name: productName,
          standard_qty: standardQty
        })

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

      const staff = employees.find(emp => emp.employee_id === selectedInspectStaff)

      const res = await fetch(`/api/shops/${shopId}/housekeeping/report-consumption`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_id: inspectRoom.id,
          items: formattedItems,
          employee_id: selectedInspectStaff,
          employee_name: staff?.name || 'Nhân viên buồng phòng'
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Lỗi kiểm phòng')
      }

      const result = await res.json()
      const totalFee = result.totalAddedFee || 0
      
      if (totalFee > 0) {
        toast.success(`Khớp phòng thành công! Đã thêm ${totalFee.toLocaleString('vi-VN')}₫ vào hóa đơn của ${inspectRoom.name}.`)
      } else {
        toast.success(`Khớp phòng sạch sẽ! Không phát sinh tiêu hao minibar.`)
      }

      setInspectRoom(null)
      fetchRooms()
      fetchLogs()
      if (hskpWarehouse) fetchInventory(hskpWarehouse.id) // update inventory
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi gửi kết quả kiểm phòng')
    } finally {
      setSubmitting(false)
      toast.dismiss(loadToast)
    }
  }

  // 4. Custom setup allocation
  const handleAddSetupItem = () => {
    if (!setupProductId) return
    const prod = allProducts.find(p => p.id === setupProductId || p.product_id === setupProductId)
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

      // Save SLA if customizing a specific room
      if (!applyToAll && setupRoomId) {
        const currentRoom = rooms.find(r => r.id === setupRoomId)
        let currentMeta: Record<string, any> = {}
        if (currentRoom?.metadata) {
          try {
            currentMeta = typeof currentRoom.metadata === 'string' ? JSON.parse(currentRoom.metadata) : currentRoom.metadata
          } catch {}
        }
        currentMeta.sla_mins = String(roomSlaValue)
        
        await fetch(`/api/shops/${shopId}/location-resources/${setupRoomId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metadata: JSON.stringify(currentMeta)
          })
        })
      }

      toast.success(applyToAll 
        ? `Đã cấu hình định mức cho tất cả ${rooms.length} phòng thành công!` 
        : `Đã cấu hình định mức cho phòng ${rooms.find(r => r.id === setupRoomId)?.name || ''} thành công!`
      )
      setSetupModalOpen(false)
      setSetupItems([])
      setSetupProductId('')
      setSetupQty(1)
      setApplyToAll(false)
      fetchRooms() // refresh rooms
    } catch {
      toast.error('Lỗi khi cấu hình định mức Minibar')
    } finally {
      setSavingSetup(false)
      toast.dismiss(loadToast)
    }
  }

  // Pre-load specific room allocation to customize
  const handleOpenRoomCustomAllocation = async (room: RoomResource) => {
    setSetupRoomId(room.id)
    setApplyToAll(false)
    setSetupModalOpen(true)
    setSetupItems([])

    // Load existing SLA from room metadata
    let existingSla = globalSla
    if (room.metadata) {
      try {
        const meta = typeof room.metadata === 'string' ? JSON.parse(room.metadata) : room.metadata
        if (meta && meta.sla_mins) {
          const parsed = parseInt(String(meta.sla_mins), 10)
          if (!isNaN(parsed) && parsed > 0) {
            existingSla = parsed
          }
        }
      } catch {}
    }
    setRoomSlaValue(existingSla)
    
    // Fetch existing minibar setup for this room
    const loadToast = toast.loading('Đang tải cấu hình phòng...')
    try {
      const res = await fetch(`/api/shops/${shopId}/housekeeping/minibar-setup?resource_id=${room.id}&t=${Date.now()}`)
      if (res.ok) {
        const json = await res.json()
        const items = json.data || []
        const mapped = items.map((it: any) => {
          const prod = allProducts.find(p => p.id === it.product_id || p.product_id === it.product_id)
          return {
            product_id: it.product_id,
            product_name: prod?.name || `Sản phẩm ${it.product_id}`,
            standard_qty: parseInt(String(it.standard_qty || '0'), 10)
          }
        })
        setSetupItems(mapped)
      }
    } catch {}
    toast.dismiss(loadToast)
  }

  // Filters rooms list
  const filteredRooms = useMemo(() => {
    return rooms.filter(room => {
      const matchesZone = selectedZone === 'all' || room.zone === selectedZone
      const matchesStatus = selectedStatus === 'all' || room.status === selectedStatus
      return matchesZone && matchesStatus
    })
  }, [rooms, selectedZone, selectedStatus])

  // Group rooms by zone/floor for the matrix list view in Tab 2
  const groupedRoomsByZone = useMemo(() => {
    const map: Record<string, RoomResource[]> = {}
    rooms.forEach(r => {
      const zone = r.zone || 'Khu vực khác'
      if (!map[zone]) map[zone] = []
      map[zone].push(r)
    })
    return map
  }, [rooms])

  // Get distinct floors/zones
  const zonesList = useMemo(() => {
    const zones = new Set<string>()
    rooms.forEach(r => { if (r.zone) zones.add(r.zone) })
    return Array.from(zones).sort()
  }, [rooms])

  // Tab 3: SLA Analytics
  const slaStats = useMemo(() => {
    const cleanLogs = logs.filter(l => l.status === 'completed' && l.duration_mins)
    const totalCleans = cleanLogs.length
    
    if (totalCleans === 0) {
      return { totalCleans: 0, complianceRate: 100, avgDuration: 0, totalRevenue: 0 }
    }

    const ontimeCleans = cleanLogs.filter(l => l.sla_status === 'ontime').length
    const complianceRate = Math.round((ontimeCleans / totalCleans) * 100)
    
    const sumDuration = cleanLogs.reduce((acc, curr) => acc + parseInt(curr.duration_mins || '0', 10), 0)
    const avgDuration = Math.round(sumDuration / totalCleans)

    // Calculate total minibar revenue in today logs
    let totalRevenue = 0
    logs.forEach(l => {
      if (l.status === 'clean_inspected' && l.consumption_details) {
        try {
          const details = JSON.parse(l.consumption_details)
          details.forEach((d: any) => {
            totalRevenue += (d.consumed_qty || 0) * (d.unit_price || 0)
          })
        } catch {}
      }
    })

    return { totalCleans, complianceRate, avgDuration, totalRevenue }
  }, [logs])

  // Dynamic products list for the dynamic multi-column allocation table
  const activeProducts = useMemo(() => {
    const prods: Record<string, string> = {}
    Object.values(allRoomAllocations).forEach(items => {
      items.forEach(item => {
        const prodId = item.product_id
        const prod = allProducts.find(p => p.id === prodId || p.product_id === prodId)
        prods[prodId] = prod?.name || `Sản phẩm ${prodId}`
      })
    })
    return Object.entries(prods).map(([id, name]) => ({ id, name }))
  }, [allRoomAllocations, allProducts])

  return (
    <div className="space-y-4">
      
      {/* Premium Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 pb-3 border-b border-slate-100">
        <div className="flex flex-col gap-0.5">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Vận hành</div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <BrushCleaning className="w-5 h-5 text-primary" /> Buồng phòng & Minibar
          </h1>
          <p className="text-xs text-slate-400">
            Quản lý live status dọn phòng, SLA nhân viên, định lượng minibar và đối chiếu tồn kho
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setSlaSettingsModalOpen(true)}
            className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2 text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Clock className="w-4 h-4 text-slate-500" /> Cài đặt SLA hệ thống
          </button>
          <button
            type="button"
            onClick={() => {
              setSetupRoomId('')
              setSetupItems([])
              setApplyToAll(true)
              setSetupModalOpen(true)
            }}
            className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 text-xs font-bold shadow-sm transition-colors cursor-pointer"
          >
            Cài đặt định mức minibar chung
          </button>
        </div>
      </div>

      {/* Modern Tab Selector */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit text-xs font-bold shadow-2xs select-none">
        <button
          onClick={() => setActiveTab('rooms')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer ${
            activeTab === 'rooms' 
              ? 'bg-white text-slate-900 shadow-2xs' 
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <BedDouble className="w-4 h-4" /> Sơ đồ vận hành
        </button>
        <button
          onClick={() => setActiveTab('allocations')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer ${
            activeTab === 'allocations' 
              ? 'bg-white text-slate-900 shadow-2xs' 
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Warehouse className="w-4 h-4" /> Quản lý định lượng & Kho
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer ${
            activeTab === 'logs' 
              ? 'bg-white text-slate-900 shadow-2xs' 
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Clock className="w-4 h-4" /> Nhật ký & Hiệu suất SLA
        </button>
      </div>

      {/* TAB 1: ROOMS OPERATIONS MAP */}
      {activeTab === 'rooms' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-100 p-4 rounded-2xl shadow-3xs shrink-0">
            <div className="flex flex-wrap items-center gap-3">
              {/* Floor Zone Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Tầng/Khu:</span>
                <select
                  value={selectedZone}
                  onChange={e => setSelectedZone(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold outline-none bg-slate-50 text-slate-700"
                >
                  <option value="all">Tất cả khu vực</option>
                  {zonesList.map(z => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Trạng thái:</span>
                <select
                  value={selectedStatus}
                  onChange={e => setSelectedStatus(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold outline-none bg-slate-50 text-slate-700"
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="available">Sẵn sàng (Available)</option>
                  <option value="occupied">Có khách (Occupied)</option>
                  <option value="cleaning">Đang dọn (Cleaning)</option>
                  <option value="dirty">Chưa dọn (Dirty)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {/* View Mode Toggle */}
              <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-2xs">
                <button
                  onClick={() => setRoomViewMode('grid')}
                  className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    roomViewMode === 'grid' ? 'bg-slate-100 text-slate-800 shadow-2xs' : 'text-slate-400 hover:text-slate-650'
                  }`}
                  title="Dạng lưới (Grid)"
                >
                  Lưới
                </button>
                <button
                  onClick={() => setRoomViewMode('list')}
                  className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    roomViewMode === 'list' ? 'bg-slate-100 text-slate-800 shadow-2xs' : 'text-slate-400 hover:text-slate-650'
                  }`}
                  title="Dạng danh sách (List)"
                >
                  Bảng
                </button>
              </div>

              <div className="text-[11px] font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                Tổng: <span className="text-slate-900 font-bold">{filteredRooms.length} phòng</span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="min-h-[250px] flex items-center justify-center bg-white rounded-2xl border border-slate-100 shadow-3xs">
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-bold text-slate-400">Đang tải sơ đồ phòng buồng...</span>
              </div>
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="min-h-[200px] flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-100 shadow-3xs text-center p-6">
              <BedDouble className="w-10 h-10 text-slate-300 mb-2" />
              <span className="text-xs font-bold text-slate-500">Không tìm thấy phòng nào phù hợp bộ lọc</span>
            </div>
          ) : roomViewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredRooms.map(room => {
                const isOccupied = room.status === 'occupied'
                const isCleaning = room.status === 'cleaning'
                const isDirty = room.status === 'dirty'
                const isAvailable = room.status === 'available'
                
                const activeLog = logs.find(l => l.resource_id === room.id && l.status === 'cleaning')

                return (
                  <div 
                    key={room.id}
                    onClick={() => {
                      if (isManager && (isDirty || isAvailable)) {
                        handleOpenAssign(room)
                      }
                    }}
                    className={`group relative rounded-2xl border p-4 flex flex-col justify-between transition-all duration-150 hover:shadow-md overflow-hidden ${
                      (isManager && (isDirty || isAvailable)) ? 'cursor-pointer' : ''
                    } ${
                      isOccupied ? 'border-red-300 bg-red-50/60 shadow-sm hover:border-red-400 hover:bg-red-50/80'
                      : (isCleaning || isDirty) ? 'border-amber-300 bg-amber-50/60 shadow-sm hover:border-amber-400 hover:bg-amber-50/85'
                      : 'border-slate-200 bg-gradient-to-br from-white to-slate-50 hover:border-green-400 hover:bg-green-50/30'
                    }`}
                  >
                    {/* Top status indicator line */}
                    <div className={`absolute top-0 left-0 right-0 h-1 ${
                      isOccupied ? 'bg-gradient-to-r from-red-400 to-rose-500'
                      : (isCleaning || isDirty) ? 'bg-gradient-to-r from-amber-400 to-yellow-500'
                      : 'bg-gradient-to-r from-green-400 to-emerald-500'
                    }`} />

                    {/* Room ID and Floor */}
                    <div className="flex items-start justify-between mb-2 mt-1">
                      <div>
                        <p className="text-base font-bold text-slate-800 leading-tight">{room.name}</p>
                        {room.zone && (
                          <span className="text-[10px] font-semibold text-slate-400 uppercase mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" /> {room.zone}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* SLA active indicator */}
                    {isCleaning && activeLog && (
                      <div className="mb-3 flex items-center gap-1.5 bg-amber-100/50 border border-amber-200/20 rounded-xl px-2.5 py-1 text-[10px] text-amber-700 font-bold">
                        <Clock className="w-3.5 h-3.5 animate-spin" />
                        <div className="flex-1">
                          <div>Đang dọn dẹp</div>
                          <div className="text-slate-400 text-[8px] mt-0.5 font-medium">Bắt đầu: {activeLog.started_at?.split('T')[1].slice(0,5)}</div>
                        </div>
                      </div>
                    )}

                    {/* Waiting time indicator for dirty rooms */}
                    {isDirty && (
                      <div className="mb-3 flex items-center gap-1.5 bg-rose-50 border border-rose-250/20 rounded-xl px-2.5 py-1 text-[10px] text-rose-700 font-bold">
                        <Clock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <div className="flex-1">
                          <div>Chờ dọn dẹp</div>
                          <div className="text-slate-400 text-[8px] mt-0.5 font-medium">Đã chờ: {getRoomIdleTime(room.updated_at)}</div>
                        </div>
                      </div>
                    )}

                    {/* Styled status block matching MapViewer/TableMapPOS exactly */}
                    <div className={`mt-auto w-full rounded-lg px-2 py-1.5 text-center transition-colors ${
                      isCleaning || isDirty ? 'bg-amber-100/60 text-amber-700'
                      : isOccupied ? 'bg-red-100/50 text-red-700'
                      : 'bg-green-50 text-green-600'
                    }`}>
                      <p className="text-[12px] font-bold flex items-center justify-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          isOccupied ? 'bg-red-500'
                          : (isCleaning || isDirty) ? 'bg-amber-500 animate-pulse'
                          : 'bg-green-500'
                        }`} />
                        {isOccupied ? 'Đang sử dụng'
                         : isCleaning ? 'Đang dọn'
                         : isDirty ? 'Chưa dọn (Dirty)'
                         : 'Trống'}
                      </p>
                    </div>

                    {/* Quick actions panel */}
                    <div className="mt-3 flex flex-col gap-1 w-full pt-3 border-t border-slate-100/80">
                      {isOccupied && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenInspection(room); }}
                          className="w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-xl transition-colors flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                        >
                          <Wine className="w-3.5 h-3.5" /> Kiểm Minibar
                        </button>
                      )}
                      
                      {isDirty && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setClaimConfirmRoom(room); }}
                          className="w-full py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          <BrushCleaning className="w-4 h-4" /> Bắt đầu dọn dẹp
                        </button>
                      )}

                      {isCleaning && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMarkClean(room.id, room.name); }}
                          className="w-full py-1.5 bg-emerald-655 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-xl transition-colors flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" /> Báo sạch
                        </button>
                      )}

                      {isAvailable && (
                        <div className="flex gap-1.5 w-full">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenRoomCustomAllocation(room); }}
                            className="flex-1 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-650 text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                          >
                            Định mức
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setClaimConfirmRoom(room); }}
                            className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
                          >
                            <BrushCleaning className="w-3.5 h-3.5" /> Bắt đầu dọn dẹp
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            // Room List View (Standard table)
            <div className="bg-white border border-slate-100 rounded-2xl shadow-3xs overflow-hidden">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-slate-400 font-semibold text-[10px] uppercase tracking-wider">
                    <th className="p-3 pl-6">Tên phòng</th>
                    <th className="p-3">Trạng thái</th>
                    <th className="p-3">Nhân viên phụ trách</th>
                    <th className="p-3">Tiến độ SLA</th>
                    <th className="p-3 text-right pr-6">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {Object.entries(groupedRoomsByZone).map(([zone, roomList]) => {
                    // Apply Zone Filter (Floor/Zone dropdown selection)
                    if (selectedZone !== 'all' && zone !== selectedZone) return null

                    // Filter rooms within this zone based on selected status filter
                    const filteredZoneRooms = roomList.filter(room => {
                      return selectedStatus === 'all' || room.status === selectedStatus
                    })

                    if (filteredZoneRooms.length === 0) return null

                    return (
                      <React.Fragment key={zone}>
                        {/* Floor/Zone divider row */}
                        <tr className="bg-slate-100/60 border-y border-slate-200/50 font-bold text-slate-750">
                          <td colSpan={5} className="p-2.5 text-xs text-left pl-4">
                            <span className="flex items-center gap-1.5 font-bold">
                              <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" /> {zone} ({filteredZoneRooms.length} phòng)
                            </span>
                          </td>
                        </tr>

                        {/* Room list inside this Floor/Zone */}
                        {filteredZoneRooms.map(room => {
                          const isOccupied = room.status === 'occupied'
                          const isCleaning = room.status === 'cleaning'
                          const isDirty = room.status === 'dirty'
                          const isAvailable = room.status === 'available'
                          
                          const activeLog = logs.find(l => l.resource_id === room.id && l.status === 'cleaning')

                          return (
                            <tr 
                              key={room.id}
                              onClick={() => {
                                if (isManager && (isDirty || isAvailable)) {
                                  handleOpenAssign(room)
                                }
                              }}
                              className={`hover:bg-slate-50/50 ${
                                (isManager && (isDirty || isAvailable)) ? 'cursor-pointer' : ''
                              }`}
                            >
                              <td className="p-3 text-slate-900 font-bold text-sm pl-8">
                                <span className={(isManager && (isDirty || isAvailable)) ? 'hover:text-primary transition-colors' : ''}>
                                  {room.name}
                                </span>
                              </td>
                              <td className="p-3">
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                  isOccupied ? 'bg-red-50 text-red-700'
                                  : (isCleaning || isDirty) ? 'bg-amber-50 text-amber-700'
                                  : 'bg-green-50 text-green-600'
                                }`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${
                                    isOccupied ? 'bg-red-500'
                                    : (isCleaning || isDirty) ? 'bg-amber-500 animate-pulse'
                                    : 'bg-green-500'
                                  }`} />
                                  {isOccupied ? 'Đang sử dụng'
                                   : isCleaning ? 'Đang dọn'
                                   : isDirty ? 'Chưa dọn (Dirty)'
                                   : 'Trống'}
                                </span>
                              </td>
                              <td className="p-3">
                                {activeLog ? (
                                  <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                                    {activeLog.employee_name}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="p-3">
                                {isDirty ? (
                                  <span className="text-rose-600 flex items-center gap-1 font-bold">
                                    <Clock className="w-3.5 h-3.5 text-rose-500 shrink-0" /> Chờ dọn: {getRoomIdleTime(room.updated_at)}
                                  </span>
                                ) : isCleaning && activeLog ? (
                                  <span className="text-amber-600 flex items-center gap-1 font-bold">
                                    <Clock className="w-3.5 h-3.5 animate-spin" /> Đang dọn dẹp
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="p-3 text-right pr-6" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1.5">
                                  {isOccupied && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleOpenInspection(room); }}
                                      className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                                    >
                                      Kiểm Minibar
                                    </button>
                                  )}
                                  {isDirty && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setClaimConfirmRoom(room); }}
                                      className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                                    >
                                      <BrushCleaning className="w-3.5 h-3.5" /> Bắt đầu dọn dẹp
                                    </button>
                                  )}
                                  {isCleaning && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleMarkClean(room.id, room.name); }}
                                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                                    >
                                      Báo sạch
                                    </button>
                                  )}
                                  {isAvailable && (
                                    <>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleOpenRoomCustomAllocation(room); }}
                                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-650 text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                                      >
                                        Định mức
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setClaimConfirmRoom(room); }}
                                        className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                                      >
                                        <BrushCleaning className="w-3.5 h-3.5" /> Bắt đầu dọn dẹp
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ALLOCATIONS & WAREHOUSES */}
      {activeTab === 'allocations' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Housekeeping Warehouse Overview */}
            <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-3xs space-y-3 shrink-0">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 border-b border-slate-50 pb-2">
                <Warehouse className="w-4 h-4 text-primary" /> Bộ phận kho buồng phòng
              </h3>
              
              {hskpDeptStatus === 'no_dept' ? (
                <div className="p-4 border border-dashed border-red-200 rounded-2xl bg-red-50/30 text-center space-y-3">
                  <AlertTriangle className="w-6 h-6 text-red-500 mx-auto animate-pulse" />
                  <div>
                    <h4 className="text-xs font-bold text-red-800">Chưa tạo Phòng ban Buồng phòng!</h4>
                    <p className="text-[10px] text-red-600 mt-1 leading-normal">
                      Hệ thống không tìm thấy phòng ban nào có tên là <strong>"Buồng phòng"</strong> hoặc <strong>"Housekeeping"</strong>. Vui lòng qua trang Thiết lập phòng ban để tạo phòng ban này.
                    </p>
                  </div>
                  <a
                    href={`/t/${slug}/${branch}/settings/departments`}
                    className="w-full inline-block py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl text-center transition-colors cursor-pointer"
                  >
                    Thiết lập Phòng ban
                  </a>
                </div>
              ) : hskpDeptStatus === 'no_wh' ? (
                <div className="p-4 border border-dashed border-amber-250 rounded-2xl bg-amber-50/30 text-center space-y-3">
                  <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto animate-pulse" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-800">Chưa liên kết Kho cho bộ phận!</h4>
                    <p className="text-[10px] text-amber-700 mt-1 leading-normal">
                      Phòng ban <strong>"{targetDeptName}"</strong> chưa được liên kết với Kho vật tư nào để đối soát tiêu hao minibar/tài sản.
                    </p>
                  </div>
                  <a
                    href={`/t/${slug}/${branch}/settings/departments`}
                    className="w-full inline-block py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl text-center transition-colors cursor-pointer"
                  >
                    Đi đến liên kết Kho
                  </a>
                </div>
              ) : !hskpWarehouse ? (
                <div className="p-4 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 text-center space-y-3">
                  <AlertTriangle className="w-6 h-6 text-slate-400 mx-auto animate-pulse" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Không tìm thấy Kho của bộ phận!</h4>
                    <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                      Kho hàng được liên kết với bộ phận dọn phòng đã bị xóa hoặc không hợp lệ.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[9px] text-slate-450 font-bold uppercase tracking-wider block">Kho hoạt động:</span>
                      <span className="text-xs font-bold text-slate-800">{hskpWarehouse.name}</span>
                    </div>
                    <span className="text-[10px] font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-650">
                      {hskpWarehouse.code}
                    </span>
                  </div>

                  <div className="border border-slate-50 rounded-xl p-3 bg-slate-50/30 space-y-2 max-h-[180px] overflow-y-auto">
                    <p className="text-[9px] font-bold text-slate-455 uppercase tracking-wider">Tồn kho thực tế bộ phận ({inventory.length}):</p>
                    {inventoryLoading ? (
                      <div className="py-4 text-center text-xs text-slate-400">Đang tải tồn kho...</div>
                    ) : inventory.length === 0 ? (
                      <div className="py-4 text-center text-xs text-slate-400 italic">Kho trống (0 sản phẩm)</div>
                    ) : (
                      <div className="space-y-1">
                        {inventory.map(inv => (
                          <div key={inv.product_id} className="flex justify-between items-center bg-white border border-slate-100/50 p-2 rounded-xl text-xs">
                            <span className="font-semibold text-slate-700 truncate max-w-[150px]">{inv.product_name}</span>
                            <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                              SL: {Number(inv.stock_qty || 0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Total Allocation Comparison */}
            <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-3xs space-y-3 lg:col-span-2">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 border-b border-slate-50 pb-2">
                <PieChart className="w-4 h-4 text-primary" /> Đối chiếu định lượng tổng & thiếu hụt
              </h3>

              {allocationsLoading ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-bold text-slate-450">Đang tính toán định lượng tổng...</span>
                </div>
              ) : Object.keys(totalAllocations).length === 0 ? (
                <div className="py-8 border border-dashed border-slate-200 rounded-2xl text-center text-xs text-slate-400">
                  Chưa có sản phẩm minibar nào được cài đặt định mức mặc định.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider text-[9px]">
                          <th className="py-2">Sản phẩm</th>
                          <th className="py-2 text-center">Định lượng tổng</th>
                          <th className="py-2 text-center">Tồn kho bộ phận</th>
                          <th className="py-2 text-right">Thiếu hụt cần bù</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 font-bold text-slate-700">
                        {Object.entries(totalAllocations).map(([prodId, val]) => {
                          const stockItem = inventory.find(inv => inv.product_id === prodId)
                          const stockQty = parseFloat(stockItem?.stock_qty || '0')
                          const shortage = Math.max(0, val.qty - stockQty)
                          
                          return (
                            <tr key={prodId} className="hover:bg-slate-50/50">
                              <td className="py-2.5 font-semibold text-slate-800">{val.name}</td>
                              <td className="py-2.5 text-center text-slate-900 bg-slate-50/50 w-28">{val.qty}</td>
                              <td className="py-2.5 text-center w-28">{stockQty}</td>
                              <td className="py-2.5 text-right w-32">
                                {shortage > 0 ? (
                                  <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded text-[11px] font-bold">
                                    Thiếu {shortage}
                                  </span>
                                ) : (
                                  <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[11px] font-bold">
                                    Đầy đủ
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* List of allocations per room (Grouped by Floor/Zone) */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-3xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-50 pb-2">
              <h3 className="text-sm font-semibold text-slate-800">
                Định mức chi tiết từng phòng
              </h3>
              
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-2xs">
                  <button
                    onClick={() => setAllocationViewMode('list')}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      allocationViewMode === 'list' ? 'bg-slate-100 text-slate-800 shadow-2xs' : 'text-slate-400 hover:text-slate-650'
                    }`}
                  >
                    Bảng
                  </button>
                  <button
                    onClick={() => setAllocationViewMode('grid')}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      allocationViewMode === 'grid' ? 'bg-slate-100 text-slate-800 shadow-2xs' : 'text-slate-400 hover:text-slate-650'
                    }`}
                  >
                    Lưới
                  </button>
                </div>
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-bold">{rooms.length} phòng</span>
              </div>
            </div>
            
            {allocationViewMode === 'list' ? (
              // Grouped Row Table (Zones are separators, products are columns)
              allocationsLoading ? (
                <div className="py-12 flex justify-center items-center">
                  <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : activeProducts.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400 italic">Chưa có định lượng sản phẩm nào được thiết lập.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-slate-400 font-semibold text-[10px] uppercase tracking-wider">
                        <th className="p-3">Phòng</th>
                        {activeProducts.map(p => (
                          <th key={p.id} className="p-3 text-center">{p.name}</th>
                        ))}
                        <th className="p-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-105 font-semibold text-slate-700">
                      {Object.entries(groupedRoomsByZone).map(([zone, roomList]) => {
                        // Apply Zone Filter (Floor/Zone dropdown selection)
                        if (selectedZone !== 'all' && zone !== selectedZone) return null

                        return (
                          <React.Fragment key={zone}>
                            {/* Floor/Zone divider row */}
                            <tr className="bg-slate-100/60 border-y border-slate-200/50 font-bold text-slate-750">
                              <td colSpan={2 + activeProducts.length} className="p-2.5 text-xs text-left pl-4">
                                <span className="flex items-center gap-1.5 font-bold">
                                  <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" /> {zone} ({roomList.length} phòng)
                                </span>
                              </td>
                            </tr>
                            
                            {/* Rooms list in this Floor/Zone */}
                            {roomList.map(room => {
                              const roomSetup = allRoomAllocations[room.id] || []
                              return (
                                <tr key={room.id} className="hover:bg-slate-50/50 border-b border-slate-100/40">
                                  <td className="p-3 text-slate-900 font-bold text-sm pl-6">{room.name}</td>
                                  {activeProducts.map(p => {
                                    const item = roomSetup.find(it => it.product_id === p.id)
                                    const qty = item ? parseInt(String(item.standard_qty || '0'), 10) : 0
                                    return (
                                      <td key={p.id} className="p-3 text-center">
                                        {qty > 0 ? (
                                          <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-800 font-bold">
                                            {qty}
                                          </span>
                                        ) : (
                                          <span className="text-slate-300">—</span>
                                        )}
                                      </td>
                                    )
                                  })}
                                  <td className="p-3 text-right">
                                    <button
                                      onClick={() => handleOpenRoomCustomAllocation(room)}
                                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-slate-800 transition-colors cursor-pointer"
                                    >
                                      Sửa
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              // Grid cards view
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {rooms.map(room => {
                  const roomSetup = allRoomAllocations[room.id] || []
                  return (
                    <div key={room.id} className="border border-slate-100 rounded-2xl p-4 shadow-3xs flex flex-col justify-between hover:border-primary transition-colors">
                      <div>
                        <div className="flex justify-between items-start mb-2 pb-2 border-b border-slate-50">
                          <span className="font-bold text-slate-900 text-sm">{room.name}</span>
                          <span className="text-[10px] font-semibold text-slate-450 uppercase">{room.zone || 'Khu vực khác'}</span>
                        </div>

                        {allocationsLoading ? (
                          <div className="py-2 text-xs text-slate-455 font-medium">Đang tải...</div>
                        ) : roomSetup.length === 0 ? (
                          <div className="py-2 text-xs text-slate-400 italic">Chưa được cấu hình định mức</div>
                        ) : (
                          <div className="space-y-1 mt-1">
                            {roomSetup.map(item => (
                              <div key={item.id} className="flex justify-between items-center text-xs font-semibold text-slate-600">
                                <span>• {item.product_name}</span>
                                <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">SL: {item.standard_qty}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => handleOpenRoomCustomAllocation(room)}
                        className="w-full mt-4 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-655 text-[10px] font-bold rounded-xl transition-colors cursor-pointer"
                      >
                        Tùy biến định mức
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: LOGS & SLA ANALYTICS */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          {/* SLA Performance Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Total Cleans */}
            <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-3xs flex items-center gap-3.5">
              <div className="p-3 bg-primary/10 rounded-xl text-primary shrink-0">
                <BrushCleaning className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Tổng lượt dọn</span>
                <span className="text-lg font-black text-slate-900">{slaStats.totalCleans} lượt</span>
              </div>
            </div>

            {/* SLA Compliance */}
            <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-3xs flex items-center gap-3.5">
              <div className={`p-3 rounded-xl shrink-0 ${
                slaStats.complianceRate >= 80 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
              }`}>
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Tỉ lệ đạt SLA</span>
                <span className="text-lg font-black text-slate-900">{slaStats.complianceRate}%</span>
              </div>
            </div>

            {/* Average Duration */}
            <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-3xs flex items-center gap-3.5">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Thời gian TB / Phòng</span>
                <span className="text-lg font-black text-slate-900">{slaStats.avgDuration} phút</span>
              </div>
            </div>

            {/* Minibar Consumption Revenue */}
            <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-3xs flex items-center gap-3.5">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                <Wine className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Doanh thu Minibar</span>
                <span className="text-lg font-black text-slate-900">
                  {slaStats.totalRevenue.toLocaleString('vi-VN')}₫
                </span>
              </div>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-3xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-slate-800">Nhật ký hoạt động chi tiết</h3>
              <button 
                onClick={fetchLogs} 
                disabled={logsLoading}
                className="p-1.5 text-slate-455 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${logsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {logsLoading ? (
              <div className="py-12 flex justify-center items-center">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : logs.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-450 font-medium">Chưa có nhật ký hoạt động nào.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-slate-400 font-semibold uppercase tracking-wider text-[9px]">
                      <th className="p-3">Thời gian</th>
                      <th className="p-3">Phòng</th>
                      <th className="p-3">Nhân viên thực hiện</th>
                      <th className="p-3">Trạng thái / Nghiệp vụ</th>
                      <th className="p-3">Hiệu suất SLA</th>
                      <th className="p-3">Chi tiết tiêu hao & Bù đồ</th>
                      <th className="p-3">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-semibold">
                    {logs.map(log => {
                      const roomObj = rooms.find(r => r.id === log.resource_id)
                      const isCompleted = log.status === 'completed'
                      const isInspected = log.status === 'clean_inspected'
                      
                      let consItems: any[] = []
                      if (log.consumption_details) {
                        try {
                          consItems = JSON.parse(log.consumption_details)
                        } catch {}
                      }

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/50">
                          <td className="p-3 text-slate-455 font-medium">
                            {log.started_at ? (
                              <div>{new Date(log.started_at + 'Z').toLocaleString('vi-VN', { hour12: false }).split(' ')[1]}</div>
                            ) : (
                              '--'
                            )}
                            <div className="text-[8px] mt-0.5 text-slate-400 font-normal">
                              {log.started_at ? new Date(log.started_at + 'Z').toLocaleDateString('vi-VN') : ''}
                            </div>
                          </td>
                          <td className="p-3 font-bold text-slate-900">{roomObj?.name || 'Phòng khác'}</td>
                          <td className="p-3">
                            <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-bold text-[11px]">
                              <User className="w-3 h-3 text-slate-455" /> {log.employee_name}
                            </span>
                          </td>
                          <td className="p-3">
                            {isCompleted ? (
                              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px] font-bold">Dọn dẹp hoàn tất</span>
                            ) : isInspected ? (
                              <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px] font-bold">Kiểm Minibar</span>
                            ) : (
                              <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[11px] font-bold animate-pulse">Đang dọn dẹp</span>
                            )}
                          </td>
                          <td className="p-3">
                            {isCompleted && log.duration_mins ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-slate-800">{log.duration_mins} phút</span>
                                <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase ${
                                  log.sla_status === 'ontime' ? 'text-emerald-600' : 'text-rose-500'
                                }`}>
                                  <span className={`h-1 w-1 rounded-full ${
                                    log.sla_status === 'ontime' ? 'bg-emerald-500' : 'bg-rose-500'
                                  }`} />
                                  {log.sla_status === 'ontime' ? 'Đạt SLA' : 'Quá hạn'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            {consItems.length > 0 ? (
                              <div className="flex flex-wrap gap-1 max-w-[200px]">
                                {consItems.map((item: any, idx) => (
                                  <span key={idx} className="bg-rose-50 border border-rose-100/50 text-[10px] text-rose-700 px-1.5 py-0.5 rounded font-bold">
                                    {item.product_name} x {item.consumed_qty}
                                  </span>
                                ))}
                              </div>
                            ) : isInspected ? (
                              <span className="text-slate-400 italic">Không có tiêu hao</span>
                            ) : (
                              <span className="text-slate-400">--</span>
                            )}
                          </td>
                          <td className="p-3 text-slate-500 font-medium max-w-[200px] truncate" title={log.note}>
                            {log.note || '--'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SlideOver / Modal to Assign or Claim Cleaning */}
      {assignRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 animate-in fade-in duration-200">
          <div 
            className="fixed inset-0 cursor-pointer"
            onClick={() => !submitting && setAssignRoom(null)}
          />
          <form onSubmit={handleStartCleaning} className="relative bg-white rounded-3xl max-w-sm w-full shadow-2xl p-6 border border-slate-100 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                <BrushCleaning className="w-5 h-5 text-primary" /> Phân công dọn dẹp
              </h3>
              <button 
                type="button" 
                disabled={submitting} 
                onClick={() => setAssignRoom(null)} 
                className="text-slate-400 hover:text-slate-600 p-1 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-semibold">
              <div className="bg-slate-50/50 p-4 border border-slate-100 rounded-2xl text-slate-700">
                <div className="text-[10px] text-slate-400 uppercase block mb-0.5">Phòng dọn dẹp:</div>
                <div className="text-base font-bold text-slate-900">{assignRoom.name}</div>
                {assignRoom.zone && <div className="text-[10px] text-slate-500 mt-1">Khu vực: {assignRoom.zone}</div>}
              </div>

              {/* Select Cleaner */}
              <div>
                <label className="block text-slate-700 font-bold mb-1.5">
                  Chọn nhân viên phân công *
                </label>
                <select
                  required
                  value={selectedCleaner}
                  onChange={e => setSelectedCleaner(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-primary bg-white text-slate-700"
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {employees.map(emp => (
                    <option key={emp.employee_id} value={emp.employee_id}>
                      {emp.name} ({emp.employee_code || 'NV'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-primary/10 border border-primary/20 p-3.5 rounded-2xl text-primary font-medium leading-relaxed flex items-start gap-2">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>Đồng hồ đếm thời gian SLA sẽ được kích hoạt ngay khi bạn bấm Xác nhận phân công.</span>
              </div>
            </div>

            <div className="flex gap-2 pt-3.5 border-t border-slate-100">
              <button 
                type="button" 
                disabled={submitting} 
                onClick={() => setAssignRoom(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
              >
                Hủy bỏ
              </button>
              <button 
                type="submit" 
                disabled={submitting || !selectedCleaner}
                className="flex-1 py-3 bg-primary hover:bg-primary/95 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-primary/20 flex items-center justify-center gap-1.5"
              >
                <UserCheck className="w-4 h-4 text-white" /> Bắt đầu dọn dẹp
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Minibar Count / Inspections SlideOver */}
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
              
              {/* Select Employee checking */}
              <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-2">
                <label className="block text-xs font-bold text-slate-550 uppercase tracking-wider">Nhân viên kiểm phòng:</label>
                <select
                  required
                  value={selectedInspectStaff}
                  onChange={e => setSelectedInspectStaff(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold outline-none focus:border-primary bg-slate-50 text-slate-700"
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {employees.map(emp => (
                    <option key={emp.employee_id} value={emp.employee_id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </div>

              {loadingSetup ? (
                <div className="py-12 flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-semibold text-slate-450">Đang tải định mức minibar...</span>
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
                            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-655 font-extrabold flex items-center justify-center transition-colors active:scale-90"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-sm font-black text-slate-800">
                            {remaining}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAdjustCount(item.product_id, 1, item.standard_qty)}
                            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-655 font-extrabold flex items-center justify-center transition-colors active:scale-90"
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
                disabled={submitting || minibarSetup.length === 0 || !selectedInspectStaff}
                onClick={handleSubmitInspection}
                className="flex-1 py-3 bg-primary hover:bg-primary/95 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" /> {submitting ? 'Đang gửi...' : 'Xác nhận & Bù đồ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Minibar Setup Modal */}
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
                <Wine className="w-5 h-5 text-primary" /> 
                {applyToAll ? 'Cài đặt định mức chung' : `Tùy biến định mức: ${rooms.find(r => r.id === setupRoomId)?.name}`}
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

            <div className="space-y-4 text-xs text-slate-655">
              
              {applyToAll && (
                <div className="flex items-center gap-2 py-1 select-none">
                  <input
                    type="checkbox"
                    id="applyToAll"
                    disabled={true}
                    checked={true}
                    className="rounded border-slate-300 text-primary h-4 w-4 cursor-default"
                  />
                  <label htmlFor="applyToAll" className="font-semibold text-slate-700 cursor-default">
                    Áp dụng cấu hình này cho tất cả {rooms.length} phòng
                  </label>
                </div>
              )}

              {!applyToAll && !setupRoomId && (
                <div>
                  <label className="block font-bold mb-1.5">Chọn phòng buồng *</label>
                  <select
                    required={!applyToAll}
                    disabled={savingSetup}
                    value={setupRoomId}
                    onChange={e => setSetupRoomId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary bg-white text-slate-750 font-bold"
                  >
                    <option value="">-- Chọn phòng --</option>
                    {rooms.map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.zone || 'Khu vực khác'})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* SLA Settings for specific room */}
              {!applyToAll && setupRoomId && (
                <div className="border border-slate-100 rounded-2xl p-3.5 bg-slate-50/50 space-y-2">
                  <label className="block font-bold mb-1 text-slate-700">Thời gian dọn dẹp tối đa (SLA phòng - phút) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    disabled={savingSetup}
                    value={roomSlaValue}
                    onChange={e => setRoomSlaValue(Math.max(1, parseInt(e.target.value) || 30))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-primary bg-white font-bold text-slate-750"
                    placeholder="Mặc định: 30 phút"
                  />
                  <p className="text-[10px] text-slate-400 font-medium">Cấu hình SLA dọn dẹp riêng cho phòng này.</p>
                </div>
              )}

              {/* Add setup item card */}
              <div className="border border-slate-100 rounded-2xl p-3.5 bg-slate-50/50 space-y-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Thêm sản phẩm định mức:</p>
                <div className="space-y-3">
                  <div>
                    <label className="block font-bold mb-1">Chọn sản phẩm (Minibar hoặc Tài sản bồi thường) *</label>
                    <select
                      disabled={savingSetup}
                      value={setupProductId}
                      onChange={e => setSetupProductId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-primary bg-white font-semibold text-slate-700"
                    >
                      <option value="">-- Chọn sản phẩm --</option>
                      {allProducts.map(p => {
                        const typeLabel = p.item_class === 'room_asset' 
                          ? 'Tài sản' 
                          : p.item_class === 'minibar' 
                            ? 'Minibar' 
                            : 'Dịch vụ'
                        return (
                          <option key={p.id} value={p.id}>
                            {p.name} ({typeLabel}) - {Number(p.sell_price || 0).toLocaleString('vi-VN')}₫
                          </option>
                        )
                      })}
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block font-bold mb-1">Số lượng định mức *</label>
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
                      className="mt-4 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 text-white text-[11px] font-bold rounded-xl transition-all cursor-pointer"
                    >
                      + Thêm vào danh sách
                    </button>
                  </div>
                </div>
              </div>

              {/* Product list preview */}
              {setupItems.length > 0 && (
                <div className="border border-slate-100 rounded-2xl bg-white p-3 space-y-2 max-h-[160px] overflow-y-auto shadow-2xs">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Danh sách sản phẩm định mức ({setupItems.length}):</p>
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

      {/* Global SLA Settings Modal */}
      {slaSettingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 animate-in fade-in duration-200">
          <div 
            className="fixed inset-0 cursor-pointer"
            onClick={() => setSlaSettingsModalOpen(false)}
          />
          <div className="relative bg-white rounded-3xl max-w-sm w-full shadow-2xl p-6 border border-slate-100 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                <Clock className="w-5 h-5 text-primary" /> Cài đặt SLA hệ thống
              </h3>
              <button 
                type="button" 
                onClick={() => setSlaSettingsModalOpen(false)} 
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 font-bold mb-1.5">Thời gian SLA mặc định (phút) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={globalSla}
                  onChange={e => setGlobalSla(Math.max(1, parseInt(e.target.value) || 30))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold outline-none focus:border-primary bg-white text-slate-750"
                  placeholder="Ví dụ: 30"
                />
                <p className="text-[10px] text-slate-400 font-medium mt-1">Thời gian này sẽ được dùng làm SLA dọn dẹp mặc định cho tất cả các phòng.</p>
              </div>

              <div className="bg-primary/10 border border-primary/20 p-3.5 rounded-2xl text-primary font-medium leading-relaxed flex items-start gap-2">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>Thay đổi cài đặt này sẽ được áp dụng cho toàn bộ các lượt dọn dẹp mới bắt đầu từ thời điểm này.</span>
              </div>
            </div>

            <div className="flex gap-2 pt-3.5 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setSlaSettingsModalOpen(false)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
              >
                Đóng
              </button>
              <button 
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('hskp_global_sla', String(globalSla))
                    toast.success('Đã lưu cấu hình SLA hệ thống thành công!')
                    setSlaSettingsModalOpen(false)
                  }
                }}
                className="flex-1 py-3 bg-primary hover:bg-primary/95 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-primary/20 flex items-center justify-center gap-1.5"
              >
                Lưu cài đặt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SLA Claim Confirmation Dialog */}
      {claimConfirmRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 animate-in fade-in duration-200">
          <div 
            className="fixed inset-0 cursor-pointer"
            onClick={() => setClaimConfirmRoom(null)}
          />
          <div className="relative bg-white rounded-3xl max-w-sm w-full shadow-2xl p-6 border border-slate-100 space-y-4 animate-in zoom-in-95 duration-200 text-center">
            <div className="mx-auto w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center text-amber-500 mb-2">
              <Clock className="w-6 h-6 animate-pulse" />
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">Bắt đầu dọn dẹp phòng?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Bạn đang thực hiện nhận dọn dẹp phòng <strong className="text-slate-800">{claimConfirmRoom.name}</strong>.
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl text-left space-y-2 text-xs">
              <p className="font-bold text-amber-800 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" /> Cảnh báo kích hoạt SLA
              </p>
              <p className="text-slate-600 font-medium leading-relaxed">
                Đồng hồ đếm thời gian hiệu suất dọn dẹp sẽ bắt đầu chạy ngay lập tức. SLA quy định cho phòng này là:
              </p>
              <div className="text-center font-black text-sm text-amber-700 bg-white border border-amber-200/50 py-1.5 rounded-xl">
                {getRoomSlaMins(claimConfirmRoom)} phút
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button 
                type="button" 
                onClick={() => setClaimConfirmRoom(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
              >
                Hủy bỏ
              </button>
              <button 
                type="button"
                onClick={() => {
                  handleClaimCleaningDirect(claimConfirmRoom)
                  setClaimConfirmRoom(null)
                }}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-200 flex items-center justify-center gap-1.5"
              >
                Nhận dọn dẹp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
