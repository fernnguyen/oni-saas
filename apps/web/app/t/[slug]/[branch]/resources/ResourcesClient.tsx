'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { getVerticalConfig } from '@oni/core'
import { useConfirm } from '@/app/components/ui/ConfirmProvider'
import { DataTable, Column } from '@/app/components/ui/DataTable'
import { EmptyState } from '@/app/components/ui/EmptyState'
import dynamic from 'next/dynamic'

const MapEditor = dynamic(() => import('./components/MapEditor'), { ssr: false })


const UserIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
)

interface Resource {
  id: string
  resource_id?: string
  name: string
  type: string
  status: string
  current_order_id?: string
  zone: string
  capacity: string
  hourly_rate: string
  sort_order: string
  metadata?: string
  active?: string
}

interface Props {
  shopId: string
  industryType: string
}

const TYPE_LABELS: Record<string, string> = {
  table: 'Bàn',
  court: 'Sân',
  room: 'Phòng',
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  available: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500', label: 'Trống' },
  occupied:  { bg: 'bg-red-50',   text: 'text-red-700',   dot: 'bg-red-500',   label: 'Đang sử dụng' },
  cleaning:  { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Dọn dẹp' },
  reserved:  { bg: 'bg-blue-50',  text: 'text-blue-700',  dot: 'bg-blue-500',  label: 'Đã đặt' },
  maintenance: { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400', label: 'Tạm ngừng' },
  deleted:   { bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-300', label: 'Đã xóa' },
}

/** Display mask: 150000 → "150.000", stores raw number string */
function maskVND(raw: string): string {
  const num = raw.replace(/\D/g, '')
  return num ? Number(num).toLocaleString('vi-VN') : ''
}
function unmaskVND(masked: string): string {
  return masked.replace(/\D/g, '')
}

function RowActions({ r, onEdit, onDuplicate, onSuspend, onRestore, onStatusChange, onDelete }: { r: Resource, onEdit: () => void, onDuplicate: () => void, onSuspend: () => void, onRestore: () => void, onStatusChange: (s: string) => void, onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [coords, setCoords] = useState({ top: 0, right: 0 })

  function handleToggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      // Render dropdown below the button, aligning right edges
      setCoords({ top: rect.bottom + window.scrollY, right: window.innerWidth - rect.right })
    }
    setOpen(!open)
  }

  // Close when window resizes to prevent misalignment
  useEffect(() => {
    if (!open) return
    const handleResize = () => setOpen(false)
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleResize, true)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleResize, true)
    }
  }, [open])
  
  return (
    <div className="flex items-center justify-end gap-1.5">
      <button onClick={onEdit} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors whitespace-nowrap">
        Sửa
      </button>
      <button ref={buttonRef} onClick={handleToggle} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors whitespace-nowrap">
        Thao tác
        <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
          <div 
            className="absolute w-32 rounded-lg border border-slate-200 bg-white shadow-lg z-[101] py-1 flex flex-col items-stretch text-left"
            style={{ top: coords.top + 4, right: coords.right }}
          >
            {r.status === 'cleaning' && (
              <button onClick={() => { setOpen(false); onStatusChange('available') }} className="px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-50 text-left">✓ Sẵn sàng</button>
            )}
            {(r.status === 'deleted' || r.status === 'maintenance') ? (
              <button onClick={() => { setOpen(false); onRestore() }} className="px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 text-left">Khôi phục</button>
            ) : (
              <>
                <button onClick={() => { setOpen(false); onDuplicate() }} className="px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 text-left">Nhân bản</button>
                {r.status !== 'occupied' && (
                  <button onClick={() => { setOpen(false); onSuspend() }} className="px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 text-left">Tạm ngừng</button>
                )}
                {r.status !== 'occupied' && (
                  <button onClick={() => { setOpen(false); onDelete() }} className="px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 text-left">Xóa</button>
                )}
              </>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

export function ResourcesClient({ shopId, industryType }: Props) {
  const vertical = getVerticalConfig(industryType)
  const tpl = vertical.resourceTemplate
  const sec = tpl?.sections
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const confirm = useConfirm()
  const params = useParams()
  const branchSlug = params?.branch as string
  const slug = params?.slug as string

  const [filterStatus, setFilterStatus] = useState<'active' | 'maintenance' | 'deleted' | 'map'>('map')
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [shopSettings, setShopSettings] = useState<any>(null)

  // Management states
  const [mgmtDropdownOpen, setMgmtDropdownOpen] = useState(false)
  const [reorderModalOpen, setReorderModalOpen] = useState(false)
  const [editableZones, setEditableZones] = useState<string[]>([])
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  // Parse custom sorting order from settings
  const zoneOrder = useMemo(() => {
    if (!shopSettings?.resource_sub_types) return []
    try {
      const parsed = typeof shopSettings.resource_sub_types === 'string'
        ? JSON.parse(shopSettings.resource_sub_types)
        : shopSettings.resource_sub_types
      return parsed[`${industryType}_zone_order`] || []
    } catch {
      return []
    }
  }, [shopSettings, industryType])

  // Computed zones list with custom sorting
  const zonesList = useMemo(() => {
    const set = new Set<string>()
    resources.filter(r => r.status !== 'deleted').forEach(r => {
      set.add(r.zone || 'Chưa phân vùng')
    })
    const list = Array.from(set)
    
    list.sort((a, b) => {
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
    return list
  }, [resources, zoneOrder])

  // Select default zone
  useEffect(() => {
    if (filterStatus === 'map' && !selectedZone && zonesList.length > 0) {
      setSelectedZone(zonesList[0])
    }
  }, [filterStatus, selectedZone, zonesList])

  // Delete an entire zone/location
  async function handleDeleteZone() {
    if (!selectedZone || selectedZone === 'Chưa phân vùng') return
    const zoneResources = resources.filter(r => r.zone === selectedZone && r.status !== 'deleted')
    const ok = await confirm({
      title: `Xóa vị trí "${selectedZone}"?`,
      description: `Khu vực "${selectedZone}" sẽ bị xóa. Toàn bộ ${zoneResources.length} ${tpl?.label.toLowerCase() || 'bàn'} thuộc khu vực này sẽ được chuyển về "Chưa phân vùng".`,
      confirmLabel: 'Xóa vị trí',
      cancelLabel: 'Hủy',
      variant: 'danger',
    })
    if (!ok) return

    try {
      setLoading(true)
      const patchPromises = zoneResources.map(async (r) => {
        return fetch(`/api/shops/${shopId}/location-resources/${r.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zone: '' }),
        })
      })
      await Promise.all(patchPromises)
      toast.success(`Đã xóa vị trí "${selectedZone}" thành công`)
      await fetchResources()
      setSelectedZone('Chưa phân vùng')
    } catch {
      toast.error('Lỗi khi xóa vị trí')
    } finally {
      setLoading(false)
    }
  }

  // Rename a zone/location
  async function handleRenameZone(newName: string) {
    if (!selectedZone || selectedZone === 'Chưa phân vùng') return
    const trimmedNewName = newName.trim()
    if (!trimmedNewName) {
      toast.error('Tên vị trí không được để trống')
      return
    }
    if (trimmedNewName === selectedZone) {
      setRenameModalOpen(false)
      return
    }

    const exists = zonesList.some(z => z.toLowerCase() === trimmedNewName.toLowerCase() && z !== selectedZone)
    if (exists) {
      toast.error('Tên vị trí này đã tồn tại')
      return
    }

    const zoneResources = resources.filter(r => r.zone === selectedZone)

    try {
      setSaving(true)
      const patchPromises = zoneResources.map(async (r) => {
        return fetch(`/api/shops/${shopId}/location-resources/${r.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zone: trimmedNewName }),
        })
      })
      await Promise.all(patchPromises)

      const getRes = await fetch(`/api/shops/${shopId}/settings`)
      if (getRes.ok) {
        const currentSettings = await getRes.json()
        const parsed = currentSettings.resource_sub_types
          ? (typeof currentSettings.resource_sub_types === 'string'
             ? JSON.parse(currentSettings.resource_sub_types)
             : currentSettings.resource_sub_types)
          : {}

        const currentOrder = parsed[`${industryType}_zone_order`] || []
        if (currentOrder.includes(selectedZone)) {
          parsed[`${industryType}_zone_order`] = currentOrder.map((z: string) => z === selectedZone ? trimmedNewName : z)
          await fetch(`/api/shops/${shopId}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resource_sub_types: JSON.stringify(parsed) }),
          })
          await fetchSettings()
        }
      }

      toast.success(`Đã đổi tên vị trí thành "${trimmedNewName}"`)
      setSelectedZone(trimmedNewName)
      setRenameModalOpen(false)
      await fetchResources()
    } catch {
      toast.error('Lỗi khi đổi tên vị trí')
    } finally {
      setSaving(false)
    }
  }

  // Save new custom order of zones/locations
  async function handleSaveZoneOrder() {
    try {
      setSaving(true)
      const getRes = await fetch(`/api/shops/${shopId}/settings`)
      const currentSettings = await getRes.json()
      const parsed = currentSettings.resource_sub_types
        ? (typeof currentSettings.resource_sub_types === 'string'
           ? JSON.parse(currentSettings.resource_sub_types)
           : currentSettings.resource_sub_types)
        : {}
      
      parsed[`${industryType}_zone_order`] = editableZones

      await handleSaveSettings(parsed)
      toast.success('Đã cập nhật thứ tự vị trí thành công!')
      setReorderModalOpen(false)
    } catch {
      toast.error('Lỗi khi lưu thứ tự vị trí')
    } finally {
      setSaving(false)
    }
  }

  // Custom Settings
  const [customSubTypes, setCustomSubTypes] = useState<{value:string, label:string}[]>([])
  const [subTypeModalOpen, setSubTypeModalOpen] = useState(false)
  const combinedSubTypes = [...(tpl?.subTypes || []), ...customSubTypes]

  const [isCreatingNewZone, setIsCreatingNewZone] = useState(false)

  // Computed existing unique zones
  const activeExistingZones = useMemo<string[]>(() => {
    const set = new Set<string>()
    // Add zones from zoneOrder
    zoneOrder.forEach((z: string) => {
      if (z && z !== 'Chưa phân vùng') set.add(z)
    })
    // Add zones from current resources
    resources.filter(r => r.status !== 'deleted').forEach(r => {
      if (r.zone && r.zone !== 'Chưa phân vùng') {
        set.add(r.zone)
      }
    })
    return Array.from(set).sort((a, b) => {
      const idxA = zoneOrder.indexOf(a)
      const idxB = zoneOrder.indexOf(b)
      if (idxA !== -1 && idxB !== -1) return idxA - idxB
      if (idxA !== -1) return -1
      if (idxB !== -1) return 1
      return a.localeCompare(b, 'vi')
    })
  }, [resources, zoneOrder])

  // Form state
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState<string>(vertical.resourceType || 'table')
  const [formSubType, setFormSubType] = useState<string>(tpl?.subTypes?.[0]?.value || '')
  const [formZone, setFormZone] = useState('')
  const [formCapacity, setFormCapacity] = useState('')
  const [formHourlyRate, setFormHourlyRate] = useState('')
  // Lodging metadata
  const [formRoomClass, setFormRoomClass] = useState('')
  const [formBedType, setFormBedType] = useState('')
  const [formWeekendRate, setFormWeekendRate] = useState('')
  const [formOvernightRate, setFormOvernightRate] = useState('')
  const [formSurchargePct, setFormSurchargePct] = useState('')
  const [formCheckinTime, setFormCheckinTime] = useState('14:00')
  const [formCheckoutTime, setFormCheckoutTime] = useState('12:00')
  const [formDepositAmount, setFormDepositAmount] = useState('')
  const [formExtraBedFee, setFormExtraBedFee] = useState('')
  const [formAmenities, setFormAmenities] = useState<string[]>([])

  const fetchResources = useCallback(async () => {
    try {
      const res = await fetch(`/api/shops/${shopId}/location-resources?limit=500`)
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      setResources(json.data ?? [])
    } catch {
      toast.error('Không thể tải danh sách')
    } finally {
      setLoading(false)
    }
  }, [shopId])

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/shops/${shopId}/settings`)
      if (!res.ok) return
      const json = await res.json()
      setShopSettings(json)
      if (json.resource_sub_types) {
        const parsed = safeParseJSON(json.resource_sub_types)
        if (parsed[industryType]) {
          setCustomSubTypes(parsed[industryType])
        }
      }
    } catch {}
  }, [shopId, industryType])

  async function handleSaveSettings(updatedSubTypes: any) {
    const res = await fetch(`/api/shops/${shopId}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_sub_types: JSON.stringify(updatedSubTypes) }),
    })
    if (!res.ok) throw new Error('Save settings failed')
    await fetchSettings()
  }

  useEffect(() => { fetchResources(); fetchSettings() }, [fetchResources, fetchSettings])

  async function handleSaveCustomSubTypes(newList: {value:string, label:string}[]) {
    try {
      // 1. Fetch current settings first
      const getRes = await fetch(`/api/shops/${shopId}/settings`)
      const currentSettings = await getRes.json()
      const parsed = currentSettings.resource_sub_types ? safeParseJSON(currentSettings.resource_sub_types) : {}
      
      // 2. Update vertical
      parsed[industryType] = newList

      // 3. Save
      const res = await fetch(`/api/shops/${shopId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_sub_types: JSON.stringify(parsed) }),
      })
      if (!res.ok) throw new Error()
      setCustomSubTypes(newList)
      toast.success('Đã lưu cấu hình hạng')
    } catch {
      toast.error('Lỗi khi lưu cấu hình')
    }
  }

  function resetForm() {
    setFormName('')
    setFormType(vertical.resourceType || 'table')
    setFormSubType(tpl?.subTypes?.[0]?.value || '')
    setFormZone('')
    setFormCapacity('')
    setFormHourlyRate('')
    setFormRoomClass(''); setFormBedType(''); setFormWeekendRate('')
    setFormOvernightRate(''); setFormSurchargePct(''); setFormCheckinTime('14:00')
    setFormCheckoutTime('12:00'); setFormDepositAmount(''); setFormExtraBedFee('')
    setFormAmenities([])
    setCreating(false)
    setEditingId(null)
    setIsCreatingNewZone(false)
  }

  function startEdit(r: Resource) {
    setEditingId(r.id)
    setFormName(r.name)
    setFormType(r.type || 'table')
    setFormZone(r.zone || '')
    setFormCapacity(r.capacity || '')
    setFormHourlyRate(maskVND(r.hourly_rate || ''))
    const md = safeParseJSON(r.metadata)
    setFormSubType(md.sub_type || '')
    setFormRoomClass(md.room_class || ''); setFormBedType(md.bed_type || '')
    setFormWeekendRate(maskVND(md.weekend_rate || '')); setFormOvernightRate(maskVND(md.overnight_rate || ''))
    setFormSurchargePct(md.surcharge_pct?.toString() || ''); setFormCheckinTime(md.checkin_time || '14:00')
    setFormCheckoutTime(md.checkout_time || '12:00'); setFormDepositAmount(maskVND(md.deposit_amount || ''))
    setFormExtraBedFee(maskVND(md.extra_bed_fee || '')); setFormAmenities(md.amenities || [])
    setCreating(true)
    setIsCreatingNewZone(false)
  }

  function handleDuplicate(r: Resource) {
    resetForm()
    setFormName(`${r.name} (copy)`)
    setFormType(r.type || 'table')
    setFormZone(r.zone || '')
    setFormCapacity(r.capacity || '')
    setFormHourlyRate(maskVND(r.hourly_rate || ''))
    const md = safeParseJSON(r.metadata)
    setFormSubType(md.sub_type || '')
    setFormRoomClass(md.room_class || ''); setFormBedType(md.bed_type || '')
    setFormWeekendRate(maskVND(md.weekend_rate || '')); setFormOvernightRate(maskVND(md.overnight_rate || ''))
    setFormSurchargePct(md.surcharge_pct?.toString() || ''); setFormCheckinTime(md.checkin_time || '14:00')
    setFormCheckoutTime(md.checkout_time || '12:00'); setFormDepositAmount(maskVND(md.deposit_amount || ''))
    setFormExtraBedFee(maskVND(md.extra_bed_fee || '')); setFormAmenities(md.amenities || [])
    setCreating(true)
  }

  async function handleSave() {
    if (!formName.trim()) { toast.error('Tên không được trống'); return }

    // Warn if editing an occupied room's pricing
    if (editingId) {
      const editingResource = resources.find(r => r.id === editingId)
      if (editingResource?.status === 'occupied') {
        const oldRate = editingResource.hourly_rate || '0'
        const newRate = unmaskVND(formHourlyRate) || '0'
        if (oldRate !== newRate) {
          const ok = await confirm({
            title: 'Phòng đang sử dụng',
            description: `Thay đổi giá sẽ chỉ áp dụng cho phiên tiếp theo.\nGiá cũ: ${Number(oldRate).toLocaleString('vi-VN')}₫ → Mới: ${Number(newRate).toLocaleString('vi-VN')}₫\n\nTiếp tục?`
          })
          if (!ok) return
        }
      }
    }

    // Build metadata from extended fields
    const meta: Record<string, unknown> = {}
    if (formSubType) meta.sub_type = formSubType
    if (formRoomClass) meta.room_class = formRoomClass
    if (formBedType) meta.bed_type = formBedType
    if (formWeekendRate) meta.weekend_rate = unmaskVND(formWeekendRate)
    if (formOvernightRate) meta.overnight_rate = unmaskVND(formOvernightRate)
    if (formSurchargePct) meta.surcharge_pct = Number(formSurchargePct)
    if (formCheckinTime !== '14:00') meta.checkin_time = formCheckinTime
    if (formCheckoutTime !== '12:00') meta.checkout_time = formCheckoutTime
    if (formDepositAmount) meta.deposit_amount = unmaskVND(formDepositAmount)
    if (formExtraBedFee) meta.extra_bed_fee = unmaskVND(formExtraBedFee)
    if (formAmenities.length > 0) meta.amenities = formAmenities

    const payload: Record<string, string> = {
      name: formName.trim(),
      type: formType,
      zone: formZone.trim(),
      capacity: formCapacity,
      hourly_rate: unmaskVND(formHourlyRate),
      metadata: JSON.stringify(meta),
    }

    setSaving(true)
    try {
      if (editingId) {
        const res = await fetch(`/api/shops/${shopId}/location-resources/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error()
        toast.success(`Đã cập nhật ${formName}`)
      } else {
        const res = await fetch(`/api/shops/${shopId}/location-resources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error()
        toast.success(`Đã tạo ${formName}`)
      }
      resetForm()
      fetchResources()
    } catch {
      toast.error('Lỗi khi lưu')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(r: Resource) {
    const ok = await confirm({
      title: `Xóa "${r.name}"?`,
      description: `${r.name} sẽ bị ẩn khỏi danh sách. Dữ liệu lịch sử vẫn được giữ lại và có thể khôi phục sau.`,
      confirmLabel: 'Xóa',
      cancelLabel: 'Hủy',
      variant: 'danger',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/shops/${shopId}/location-resources/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'deleted' }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Đã xóa ${r.name}`)
      fetchResources()
    } catch {
      toast.error('Lỗi khi xóa')
    }
  }

  async function handleSuspend(r: Resource) {
    const ok = await confirm({
      title: `Tạm ngừng "${r.name}"?`,
      description: `${r.name} sẽ bị ẩn khỏi màn hình POS. Bạn có thể khôi phục lại bất cứ lúc nào.`,
      confirmLabel: 'Tạm ngừng',
      cancelLabel: 'Hủy',
      variant: 'danger',
    })
    if (!ok) return
    handleStatusChange(r, 'maintenance')
  }

  async function handleRestore(r: Resource) {
    const ok = await confirm({
      title: `Khôi phục "${r.name}"?`,
      description: `Vị trí này sẽ được đưa trở lại hoạt động bình thường trên màn hình POS.`,
      confirmLabel: 'Khôi phục',
      cancelLabel: 'Hủy',
    })
    if (!ok) return
    handleStatusChange(r, 'available')
  }

  async function handleStatusChange(r: Resource, newStatus: string) {
    try {
      const res = await fetch(`/api/shops/${shopId}/location-resources/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error()
      fetchResources()
    } catch {
      toast.error('Lỗi khi cập nhật trạng thái')
    }
  }

  const filteredResources = useMemo(() => {
    return resources.filter(r => {
      if (filterStatus === 'active') return !['deleted', 'maintenance'].includes(r.status)
      if (filterStatus === 'maintenance') return r.status === 'maintenance'
      if (filterStatus === 'deleted') return r.status === 'deleted'
      return true
    }).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
  }, [resources, filterStatus])

  const groupedResources = useMemo(() => {
    const map = new Map<string, Resource[]>()
    for (const r of filteredResources) {
      const z = r.zone?.trim() || 'Chưa phân vùng'
      if (!map.has(z)) map.set(z, [])
      map.get(z)!.push(r)
    }
    const zones = Array.from(map.keys()).sort((a, b) => {
      if (a === 'Chưa phân vùng') return 1
      if (b === 'Chưa phân vùng') return -1
      return a.localeCompare(b)
    })
    return zones.map(z => ({ zone: z, items: map.get(z)! }))
  }, [filteredResources])

  const typeLabel = TYPE_LABELS[formType] || formType

  const columns = useMemo<Column<Resource>[]>(() => [
    {
      key: 'name',
      label: `Tên ${tpl?.label || 'vị trí'}`,
      className: 'w-[25%]',
      render: (r) => {
        const isRoomType = r.type === 'room'
        return (
          <button onClick={() => startEdit(r)} className="flex items-center gap-2 font-bold text-slate-800 hover:text-primary transition-colors cursor-pointer text-left">
            <span className="text-lg">{tpl?.icon || (isRoomType ? '🛏️' : r.type === 'court' ? '🏸' : '🪑')}</span>
            <span>{r.name}</span>
          </button>
        )
      }
    },
    {
      key: 'capacity',
      label: 'Sức chứa',
      className: 'w-[25%]',
      render: (r) => r.capacity ? (
        <div className="flex items-center gap-1.5 text-slate-600">
          <UserIcon className="w-3.5 h-3.5 opacity-70" /> {r.capacity} người
        </div>
      ) : <span className="text-slate-400">-</span>
    },
    {
      key: 'price',
      label: 'Bảng giá',
      className: 'w-[20%]',
      render: (r) => {
        const rmd = safeParseJSON(r.metadata)
        const isRoomType = r.type === 'room'
        if (!r.hourly_rate && !rmd.overnight_rate) return <span className="text-slate-400">-</span>
        return (
          <div className="space-y-1 text-[11px] text-slate-600">
            {r.hourly_rate && Number(r.hourly_rate) > 0 && (
              <div className="flex items-center gap-1.5"><span>⏱️</span> <span className="font-semibold">{Number(r.hourly_rate).toLocaleString('vi-VN')}₫/h</span></div>
            )}
            {isRoomType && rmd.overnight_rate && (
              <div className="flex items-center gap-1.5"><span>🌙</span> <span className="font-semibold">{Number(rmd.overnight_rate).toLocaleString('vi-VN')}₫/đêm</span></div>
            )}
          </div>
        )
      }
    },
    {
      key: 'status',
      label: 'Trạng thái',
      className: 'w-[15%]',
      render: (r) => {
        const st = STATUS_STYLES[r.status] ?? STATUS_STYLES.available
        return (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${st.bg} ${st.text}`}>
            {st.label}
          </span>
        )
      }
    },
    {
      key: 'actions',
      label: 'Thao tác',
      align: 'right',
      className: 'w-[20%]',
      render: (r) => (
        <RowActions
          r={r}
          onEdit={() => startEdit(r)}
          onDuplicate={() => handleDuplicate(r)}
          onSuspend={() => handleSuspend(r)}
          onRestore={() => handleRestore(r)}
          onStatusChange={(s) => handleStatusChange(r, s)}
          onDelete={() => handleDelete(r)}
        />
      )
    }
  ], [tpl])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {vertical.icon} Quản lý {tpl?.label || vertical.resourceLabel || 'Vị trí'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Quản lý {(tpl?.label || 'vị trí').toLowerCase()} cho {vertical.label}. Tổng: {resources.length} vị trí
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/${branchSlug}/channels/pos`}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 text-slate-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </svg>
            Quay lại POS
          </Link>
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-dark transition-all"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Thêm {typeLabel}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setFilterStatus('active')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${filterStatus === 'active' ? 'bg-primary text-white shadow-sm font-semibold' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          Đang hoạt động
        </button>
        <button
          onClick={() => setFilterStatus('maintenance')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${filterStatus === 'maintenance' ? 'bg-slate-800 text-white shadow-sm font-semibold' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          Tạm ngừng
        </button>
        <button
          onClick={() => setFilterStatus('deleted')}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${filterStatus === 'deleted' ? 'bg-red-500 text-white shadow-sm font-semibold' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          Đã xóa
        </button>
        <button
          onClick={() => setFilterStatus('map')}
          className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            filterStatus === 'map'
              ? 'bg-primary text-white shadow-md font-bold shadow-primary/10 border border-primary'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <svg className="w-3.5 h-3.5 mr-1.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          Sơ đồ bàn
        </button>
      </div>

      {filterStatus === 'map' && zonesList.length > 0 && (
        <div className="flex justify-between items-center border-b border-slate-200 mb-6 gap-4 relative">
          <div className="flex overflow-x-auto scrollbar-hide select-none flex-1 -mb-[1px]">
            {zonesList.map((z) => (
              <button
                key={z}
                onClick={() => setSelectedZone(z)}
                className={[
                  'shrink-0 px-5 py-3 text-xs font-bold transition-all cursor-pointer border-b-2',
                  selectedZone === z
                    ? 'border-primary text-primary font-extrabold bg-slate-50/50 rounded-t-lg shadow-sm shadow-slate-100/50'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50/30 rounded-t-lg',
                ].join(' ')}
              >
                {z}
              </button>
            ))}
          </div>

          {/* Location Management Dropdown */}
          <div className="relative shrink-0 pb-1.5">
            <button
              onClick={() => setMgmtDropdownOpen(!mgmtDropdownOpen)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50 transition-all cursor-pointer whitespace-nowrap"
            >
              Quản lý
              <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {mgmtDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMgmtDropdownOpen(false)} />
                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-100 bg-white shadow-xl z-50 py-1.5 flex flex-col items-stretch text-left">
                  <button
                    onClick={() => {
                      setMgmtDropdownOpen(false)
                      setEditableZones(zonesList.filter(z => z !== 'Chưa phân vùng'))
                      setReorderModalOpen(true)
                    }}
                    className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 text-left transition-colors cursor-pointer"
                  >
                    <span>↕️</span> Sắp xếp lại vị trí
                  </button>
                  
                  {selectedZone && selectedZone !== 'Chưa phân vùng' ? (
                    <button
                      onClick={() => {
                        setMgmtDropdownOpen(false)
                        setRenameValue(selectedZone)
                        setRenameModalOpen(true)
                      }}
                      className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 text-left transition-colors cursor-pointer"
                    >
                      <span>✏️</span> Đổi tên vị trí
                    </button>
                  ) : (
                    <button
                      disabled
                      className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-slate-300 bg-slate-50/50 text-left cursor-not-allowed"
                      title="Không thể đổi tên khu vực mặc định"
                    >
                      <span>✏️</span> Đổi tên vị trí
                    </button>
                  )}

                  {selectedZone && selectedZone !== 'Chưa phân vùng' ? (
                    <button
                      onClick={() => {
                        setMgmtDropdownOpen(false)
                        handleDeleteZone()
                      }}
                      className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 text-left transition-colors cursor-pointer"
                    >
                      <span>🗑️</span> Xóa vị trí này
                    </button>
                  ) : (
                    <button
                      disabled
                      className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-slate-300 bg-slate-50/50 text-left cursor-not-allowed"
                      title="Không thể xóa khu vực mặc định"
                    >
                      <span>🗑️</span> Xóa vị trí này
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {filterStatus === 'map' ? (
        <MapEditor
          shopId={shopId}
          industryType={industryType}
          resources={resources}
          selectedZone={selectedZone}
          onSaveSuccess={() => {
            fetchResources()
          }}
          shopSettings={shopSettings}
          onSaveSettings={handleSaveSettings}
        />
      ) : loading ? (
        <div className="flex items-center justify-center py-20"><span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : groupedResources.length === 0 ? (
        <EmptyState title={`Chưa có ${typeLabel} nào`} description={`Bấm "Thêm ${typeLabel}" để bắt đầu.`} />
      ) : (
        <DataTable
          columns={columns}
          groupedData={groupedResources.map(g => ({
            key: g.zone,
            label: (
              <span className="uppercase tracking-wider">
                {g.zone}
                <span className="text-slate-400 text-xs font-normal normal-case ml-2">({g.items.length} {tpl?.label?.toLowerCase() || 'vị trí'})</span>
              </span>
            ),
            items: g.items
          }))}
          rowKey={(row) => row.id}
        />
      )}



      {/* SlideOver for Create/Edit */}
      {creating && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={resetForm} />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-900">{editingId ? `Sửa ${typeLabel}` : `Tạo ${typeLabel} mới`}</h2>
              <button onClick={resetForm} className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tên {typeLabel} *</label>
                  <input value={formName} onChange={e => setFormName(e.target.value)} placeholder={`Ví dụ: ${typeLabel} 1`} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>

                {/* Hạng bàn | Sức chứa Row */}
                {tpl && combinedSubTypes.length > 0 ? (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-slate-600">Hạng {tpl.label.toLowerCase()}</label>
                        <button onClick={() => setSubTypeModalOpen(true)} className="text-[10px] font-semibold text-primary hover:underline">Quản lý hạng</button>
                      </div>
                      <select value={formSubType} onChange={e => setFormSubType(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary">
                        <option value="">Chọn</option>
                        {combinedSubTypes.map(st => <option key={st.value} value={st.value}>{st.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Sức chứa</label>
                      <input value={formCapacity} onChange={e => setFormCapacity(e.target.value)} placeholder="Số người" type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary" />
                    </div>
                  </>
                ) : (
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Sức chứa</label>
                    <input value={formCapacity} onChange={e => setFormCapacity(e.target.value)} placeholder="Số người" type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary" />
                  </div>
                )}

                {/* Khu vực (Dropdown) hoặc tạo mới */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Khu vực</label>
                  {!isCreatingNewZone ? (
                    <div className="flex gap-2">
                      <select
                        value={formZone}
                        onChange={(e) => {
                          if (e.target.value === '__new__') {
                            setIsCreatingNewZone(true)
                            setFormZone('')
                          } else {
                            setFormZone(e.target.value)
                          }
                        }}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      >
                        <option value="">Chưa phân vùng</option>
                        {activeExistingZones.map(z => (
                          <option key={z} value={z}>{z}</option>
                        ))}
                        <option value="__new__" className="text-primary font-medium">+ Tạo vị trí mới...</option>
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex gap-2">
                        <input
                          value={formZone}
                          onChange={e => setFormZone(e.target.value)}
                          placeholder="Tên vị trí mới (ví dụ: Tầng 3)"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingNewZone(false)
                            setFormZone('')
                          }}
                          className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          Chọn có sẵn
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {vertical.features.hourly_billing && (
                  <div><label className="block text-xs font-medium text-slate-600 mb-1">Giá theo giờ (₫)</label>
                    <input value={formHourlyRate} onChange={e => setFormHourlyRate(maskVND(e.target.value))} placeholder="0" type="text" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-right focus:border-primary focus:ring-1 focus:ring-primary" /></div>
                )}
                {sec?.bedType && (
                  <div><label className="block text-xs font-medium text-slate-600 mb-1">Loại giường</label><select value={formBedType} onChange={e => setFormBedType(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"><option value="">Chọn</option><option value="single">Đơn</option><option value="double">Đôi</option><option value="twin">Twin</option><option value="king">King</option></select></div>
                )}
                {sec?.overnightRate && (
                  <>
                    <div><label className="block text-xs font-medium text-slate-600 mb-1">Giá qua đêm (₫)</label><input value={formOvernightRate} onChange={e => setFormOvernightRate(maskVND(e.target.value))} placeholder="0" type="text" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-right focus:border-primary focus:ring-1 focus:ring-primary" /></div>
                    <div><label className="block text-xs font-medium text-slate-600 mb-1">Giá cuối tuần (₫)</label><input value={formWeekendRate} onChange={e => setFormWeekendRate(maskVND(e.target.value))} placeholder="0" type="text" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-right focus:border-primary focus:ring-1 focus:ring-primary" /></div>
                    <div><label className="block text-xs font-medium text-slate-600 mb-1">Phụ thu (%)</label><input value={formSurchargePct} onChange={e => setFormSurchargePct(e.target.value)} placeholder="0" type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary" /></div>
                  </>
                )}
                {sec?.depositAmount && (
                  <>
                    <div><label className="block text-xs font-medium text-slate-600 mb-1">Tiền đặt cọc (₫)</label><input value={formDepositAmount} onChange={e => setFormDepositAmount(maskVND(e.target.value))} placeholder="0" type="text" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-right focus:border-primary focus:ring-1 focus:ring-primary" /></div>
                    <div><label className="block text-xs font-medium text-slate-600 mb-1">Phí giường phụ (₫)</label><input value={formExtraBedFee} onChange={e => setFormExtraBedFee(maskVND(e.target.value))} placeholder="0" type="text" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-right focus:border-primary focus:ring-1 focus:ring-primary" /></div>
                  </>
                )}
                {sec?.expectedReturn && (
                  <>
                    <div><label className="block text-xs font-medium text-slate-600 mb-1">Giờ nhận</label><input value={formCheckinTime} onChange={e => setFormCheckinTime(e.target.value)} type="time" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary" /></div>
                    <div><label className="block text-xs font-medium text-slate-600 mb-1">Giờ trả</label><input value={formCheckoutTime} onChange={e => setFormCheckoutTime(e.target.value)} type="time" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary" /></div>
                  </>
                )}
              </div>
              {sec?.amenities && (
                <div className="border-t border-slate-100 pt-4"><p className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Tiện nghi</p>
                  <div className="flex flex-wrap gap-2">
                    {['Điều hòa','Nước nóng','WiFi','TV','Tủ lạnh','Két sắt','Bồn tắm','Ban công','Cửa sổ'].map(a => (
                      <label key={a} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs cursor-pointer transition-colors ${formAmenities.includes(a)?'border-primary bg-primary/5 text-primary font-semibold':'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                        <input type="checkbox" className="sr-only" checked={formAmenities.includes(a)} onChange={() => setFormAmenities(p => p.includes(a)?p.filter(x=>x!==a):[...p,a])} />{a}
                      </label>))}
                  </div></div>
              )}
            </div>
            <div className="border-t border-slate-100 px-6 py-4 flex items-center gap-2">
              <button onClick={handleSave} disabled={saving} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                {saving ? 'Đang lưu...' : editingId ? 'Cập nhật' : 'Tạo mới'}
              </button>
              <button onClick={resetForm} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Hủy</button>
            </div>
          </div>
        </>
      )}
      {/* Manage SubTypes Modal */}
      {subTypeModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setSubTypeModalOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900">Tùy chỉnh hạng {tpl?.label.toLowerCase()}</h3>
              <button onClick={() => setSubTypeModalOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              <p className="text-xs text-slate-500 mb-2">Hệ thống ({tpl?.subTypes?.length || 0})</p>
              {tpl?.subTypes?.map(st => (
                <div key={st.value} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 text-sm text-slate-600 font-medium">
                  {st.label} <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full ml-auto">Mặc định</span>
                </div>
              ))}
              <p className="text-xs text-slate-500 mt-4 mb-2">Tùy chỉnh ({customSubTypes.length})</p>
              {customSubTypes.map((st, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input value={st.label} onChange={e => {
                    const clone = [...customSubTypes]
                    clone[idx].label = e.target.value
                    setCustomSubTypes(clone)
                  }} className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-primary focus:ring-1" />
                  <button onClick={() => {
                    const clone = customSubTypes.filter((_, i) => i !== idx)
                    setCustomSubTypes(clone)
                  }} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">×</button>
                </div>
              ))}
              <button onClick={() => setCustomSubTypes([...customSubTypes, { value: `custom_${Date.now()}`, label: 'Hạng mới' }])} className="w-full mt-2 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-500 hover:text-primary hover:border-primary bg-white">
                + Thêm hạng tùy chỉnh
              </button>
            </div>
            <div className="border-t border-slate-100 px-6 py-4">
              <button onClick={() => {
                handleSaveCustomSubTypes(customSubTypes.filter(st => st.label.trim()))
                setSubTypeModalOpen(false)
              }} className="w-full rounded-xl bg-primary py-2 text-sm font-semibold text-white hover:bg-primary-dark">Lưu thay đổi</button>
            </div>
          </div>
        </div>
      )}

      {/* Reorder Zones Modal */}
      {reorderModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setReorderModalOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-base font-bold text-slate-900">Sắp xếp thứ tự vị trí</h3>
              <button onClick={() => setReorderModalOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              <p className="text-xs text-slate-500 mb-3">
                Thay đổi thứ tự hiển thị của các khu vực trên thanh tab POS và Quản lý phòng/bàn.
              </p>
              
              <div className="space-y-2">
                {editableZones.map((z, idx) => (
                  <div key={z} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                    <span className="text-xs font-bold text-slate-700 truncate">{z}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        disabled={idx === 0}
                        onClick={() => {
                          const clone = [...editableZones]
                          const temp = clone[idx]
                          clone[idx] = clone[idx - 1]
                          clone[idx - 1] = temp
                          setEditableZones(clone)
                        }}
                        className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-650 disabled:opacity-30 disabled:hover:bg-white transition-all cursor-pointer font-bold"
                        title="Di chuyển lên"
                      >
                        ▲
                      </button>
                      <button
                        disabled={idx === editableZones.length - 1}
                        onClick={() => {
                          const clone = [...editableZones]
                          const temp = clone[idx]
                          clone[idx] = clone[idx + 1]
                          clone[idx + 1] = temp
                          setEditableZones(clone)
                        }}
                        className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-650 disabled:opacity-30 disabled:hover:bg-white transition-all cursor-pointer font-bold"
                        title="Di chuyển xuống"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="border-t border-slate-100 px-6 py-4 flex items-center gap-3">
              <button
                disabled={saving}
                onClick={handleSaveZoneOrder}
                className="flex-1 rounded-xl bg-primary hover:bg-primary-dark text-white font-semibold py-2 text-sm transition-colors flex items-center justify-center gap-1.5"
              >
                {saving ? 'Đang lưu...' : 'Lưu thứ tự'}
              </button>
              <button
                onClick={() => setReorderModalOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Zone Modal */}
      {renameModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setRenameModalOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-base font-bold text-slate-900">Đổi tên vị trí</h3>
              <button onClick={() => setRenameModalOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Tên vị trí cũ</label>
                <div className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 select-all">
                  {selectedZone}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Tên vị trí mới</label>
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder="Ví dụ: Tầng 2, Ngoài trời..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 placeholder:text-slate-400 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleRenameZone(renameValue)
                    }
                  }}
                />
              </div>
            </div>
            
            <div className="border-t border-slate-100 px-6 py-4 flex items-center gap-3">
              <button
                disabled={saving}
                onClick={() => handleRenameZone(renameValue)}
                className="flex-1 rounded-xl bg-primary hover:bg-primary-dark text-white font-semibold py-2.5 text-sm transition-colors flex items-center justify-center gap-1.5"
              >
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
              <button
                onClick={() => setRenameModalOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function safeParseJSON(str?: string): Record<string, any> {
  if (!str) return {}
  try { return JSON.parse(str) } catch { return {} }
}
