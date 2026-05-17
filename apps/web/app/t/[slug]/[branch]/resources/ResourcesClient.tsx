'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { getVerticalConfig } from '@oni/core'
import { useConfirm } from '@/app/components/ui/ConfirmProvider'

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
}

/** Display mask: 150000 → "150.000", stores raw number string */
function maskVND(raw: string): string {
  const num = raw.replace(/\D/g, '')
  return num ? Number(num).toLocaleString('vi-VN') : ''
}
function unmaskVND(masked: string): string {
  return masked.replace(/\D/g, '')
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

  // Custom Settings
  const [customSubTypes, setCustomSubTypes] = useState<{value:string, label:string}[]>([])
  const [subTypeModalOpen, setSubTypeModalOpen] = useState(false)
  const combinedSubTypes = [...(tpl?.subTypes || []), ...customSubTypes]

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
      if (json.resource_sub_types) {
        const parsed = safeParseJSON(json.resource_sub_types)
        if (parsed[vertical.id]) {
          setCustomSubTypes(parsed[vertical.id])
        }
      }
    } catch {}
  }, [shopId, vertical.id])

  useEffect(() => { fetchResources(); fetchSettings() }, [fetchResources, fetchSettings])

  async function handleSaveCustomSubTypes(newList: {value:string, label:string}[]) {
    try {
      // 1. Fetch current settings first
      const getRes = await fetch(`/api/shops/${shopId}/settings`)
      const currentSettings = await getRes.json()
      const parsed = currentSettings.resource_sub_types ? safeParseJSON(currentSettings.resource_sub_types) : {}
      
      // 2. Update vertical
      parsed[vertical.id] = newList

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
          const ok = confirm(`Phòng đang sử dụng! Thay đổi giá sẽ chỉ áp dụng cho phiên tiếp theo.\nGiá cũ: ${Number(oldRate).toLocaleString('vi-VN')}₫ → Mới: ${Number(newRate).toLocaleString('vi-VN')}₫\n\nTiếp tục?`)
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

  // Group by zone (filter out deleted)
  const zones = new Map<string, Resource[]>()
  for (const r of resources) {
    if (r.status === 'deleted') continue
    const zone = r.zone || 'Chưa phân vùng'
    if (!zones.has(zone)) zones.set(zone, [])
    zones.get(zone)!.push(r)
  }

  const typeLabel = TYPE_LABELS[formType] || formType

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
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Thêm {typeLabel}
          </button>
        )}
      </div>

      {/* Resources Grid — grouped by zone */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : resources.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <div className="text-4xl mb-3">🏪</div>
          <p className="text-sm font-medium text-slate-600">Chưa có {typeLabel} nào</p>
          <p className="mt-1 text-xs text-slate-400">Bấm &quot;Thêm {typeLabel}&quot; để bắt đầu</p>
        </div>
      ) : (
        Array.from(zones.entries()).map(([zone, zoneItems]) => (
          <div key={zone}>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-slate-700">{zone}</h3>
              <span className="text-xs text-slate-400">{zoneItems.length} vị trí</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {zoneItems.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)).map(r => {
                const st = STATUS_STYLES[r.status] ?? STATUS_STYLES.available
                const rmd = safeParseJSON(r.metadata)
                const isRoomType = r.type === 'room'
                return (
                  <div key={r.id} onClick={() => startEdit(r)} className={`group relative rounded-2xl border p-4 transition-all hover:shadow-lg cursor-pointer overflow-hidden ${
                    r.status === 'occupied' ? 'border-red-300 bg-gradient-to-br from-red-50 to-rose-50 shadow-sm'
                    : r.status === 'reserved' ? 'border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-sm'
                    : r.status === 'cleaning' ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 shadow-sm'
                    : 'border-slate-200 bg-gradient-to-br from-white to-slate-50 hover:border-primary/40'
                  }`}>
                    <div className={`absolute top-0 left-0 right-0 h-1 ${
                      r.status === 'occupied' ? 'bg-gradient-to-r from-red-400 to-rose-500'
                      : r.status === 'reserved' ? 'bg-gradient-to-r from-blue-400 to-indigo-500'
                      : r.status === 'cleaning' ? 'bg-gradient-to-r from-amber-400 to-yellow-500'
                      : 'bg-gradient-to-r from-green-400 to-emerald-500'
                    }`} />
                    <div className="flex items-start justify-between mb-2 mt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-lg">{tpl?.icon || (isRoomType ? '🛏️' : r.type === 'court' ? '🏸' : '🪑')}</span>
                        <p className="text-sm font-bold text-slate-800 truncate">{r.name}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.bg} ${st.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                    </div>
                    <div className="space-y-1 text-[11px] text-slate-500">
                      {r.capacity && <div className="flex items-center gap-1"><span>👤</span>{r.capacity} người</div>}
                      {r.hourly_rate && Number(r.hourly_rate) > 0 && (
                        <div className="flex items-center gap-1"><span>⏱️</span><span className="font-semibold text-slate-700">{Number(r.hourly_rate).toLocaleString('vi-VN')}₫/h</span></div>
                      )}
                      {isRoomType && rmd.overnight_rate && (
                        <div className="flex items-center gap-1"><span>🌙</span><span className="font-semibold text-slate-700">{Number(rmd.overnight_rate).toLocaleString('vi-VN')}₫/đêm</span></div>
                      )}
                      {rmd.sub_type && (
                        <div className="flex items-center gap-1"><span>⭐</span><span className="capitalize">{combinedSubTypes.find(s => s.value === rmd.sub_type)?.label || rmd.sub_type}</span></div>
                      )}
                      {!rmd.sub_type && isRoomType && rmd.room_class && (
                        <div className="flex items-center gap-1"><span>⭐</span><span className="capitalize">{rmd.room_class}</span></div>
                      )}
                    </div>
                    {isRoomType && rmd.amenities?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {rmd.amenities.slice(0, 3).map((a: string) => (
                          <span key={a} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">{a}</span>
                        ))}
                        {rmd.amenities.length > 3 && <span className="text-[9px] text-slate-400">+{rmd.amenities.length - 3}</span>}
                      </div>
                    )}
                    <div className="absolute top-2 right-2 hidden group-hover:flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); handleDuplicate(r) }} className="rounded-md bg-white border border-slate-200 p-1 text-slate-400 hover:text-blue-500 hover:border-blue-200 shadow-sm" title="Nhân bản">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); startEdit(r) }} className="rounded-md bg-white border border-slate-200 p-1 text-slate-400 hover:text-primary hover:border-primary/30 shadow-sm" title="Sửa">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      {r.status !== 'occupied' && (
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(r) }} className="rounded-md bg-white border border-slate-200 p-1 text-slate-400 hover:text-red-500 hover:border-red-200 shadow-sm" title="Xóa">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                    </div>
                    {r.status === 'cleaning' && (
                      <button onClick={() => handleStatusChange(r, 'available')} className="mt-3 w-full rounded-lg border border-green-200 bg-green-50 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors">✓ Sẵn sàng</button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
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
                <div className="col-span-2"><label className="block text-xs font-medium text-slate-600 mb-1">Tên *</label>
                  <input value={formName} onChange={e => setFormName(e.target.value)} placeholder={`Ví dụ: ${typeLabel} 1`} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary" /></div>
                {tpl && combinedSubTypes.length > 0 && (
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
                )}
                <div><label className="block text-xs font-medium text-slate-600 mb-1">Khu vực</label>
                  <input value={formZone} onChange={e => setFormZone(e.target.value)} placeholder="Tầng 1" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary" /></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1">Sức chứa</label>
                  <input value={formCapacity} onChange={e => setFormCapacity(e.target.value)} placeholder="Số người" type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary" /></div>
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
    </div>
  )
}

function safeParseJSON(str?: string): Record<string, any> {
  if (!str) return {}
  try { return JSON.parse(str) } catch { return {} }
}
