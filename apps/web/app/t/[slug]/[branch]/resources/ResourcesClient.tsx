'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { getVerticalConfig } from '@oni/core'

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

export function ResourcesClient({ shopId, industryType }: Props) {
  const vertical = getVerticalConfig(industryType)
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState<string>(vertical.posLayout === 'table_map' ? 'table' : 'court')
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

  useEffect(() => { fetchResources() }, [fetchResources])

  function resetForm() {
    setFormName('')
    setFormType(vertical.posLayout === 'table_map' ? 'table' : 'court')
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
    setFormHourlyRate(r.hourly_rate || '')
    const md = safeParseJSON(r.metadata)
    setFormRoomClass(md.room_class || ''); setFormBedType(md.bed_type || '')
    setFormWeekendRate(md.weekend_rate || ''); setFormOvernightRate(md.overnight_rate || '')
    setFormSurchargePct(md.surcharge_pct?.toString() || ''); setFormCheckinTime(md.checkin_time || '14:00')
    setFormCheckoutTime(md.checkout_time || '12:00'); setFormDepositAmount(md.deposit_amount || '')
    setFormExtraBedFee(md.extra_bed_fee || ''); setFormAmenities(md.amenities || [])
    setCreating(true)
  }

  async function handleSave() {
    if (!formName.trim()) { toast.error('Tên không được trống'); return }

    // Build metadata from extended fields
    const meta: Record<string, unknown> = {}
    if (formRoomClass) meta.room_class = formRoomClass
    if (formBedType) meta.bed_type = formBedType
    if (formWeekendRate) meta.weekend_rate = formWeekendRate
    if (formOvernightRate) meta.overnight_rate = formOvernightRate
    if (formSurchargePct) meta.surcharge_pct = Number(formSurchargePct)
    if (formCheckinTime !== '14:00') meta.checkin_time = formCheckinTime
    if (formCheckoutTime !== '12:00') meta.checkout_time = formCheckoutTime
    if (formDepositAmount) meta.deposit_amount = formDepositAmount
    if (formExtraBedFee) meta.extra_bed_fee = formExtraBedFee
    if (formAmenities.length > 0) meta.amenities = formAmenities

    const payload: Record<string, string> = {
      name: formName.trim(),
      type: formType,
      zone: formZone.trim(),
      capacity: formCapacity,
      hourly_rate: formHourlyRate,
      metadata: JSON.stringify(meta),
    }

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
    }
  }

  async function handleDelete(r: Resource) {
    if (!confirm(`Xóa "${r.name}"?`)) return
    try {
      const res = await fetch(`/api/shops/${shopId}/location-resources/${r.id}`, { method: 'DELETE' })
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

  // Group by zone
  const zones = new Map<string, Resource[]>()
  for (const r of resources) {
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
            {vertical.icon} Quản lý {vertical.label === 'F&B' ? 'Bàn' : 'Vị trí'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Quản lý bàn, sân, phòng cho {vertical.label}. Tổng: {resources.length} vị trí
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

      {/* Create/Edit Form */}
      {creating && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">
            {editingId ? `Sửa ${typeLabel}` : `Tạo ${typeLabel} mới`}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tên *</label>
              <input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder={`Ví dụ: ${typeLabel} 1`}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Loại</label>
              <select
                value={formType}
                onChange={e => setFormType(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="table">Bàn</option>
                <option value="court">Sân</option>
                <option value="room">Phòng</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Khu vực / Vùng</label>
              <input
                value={formZone}
                onChange={e => setFormZone(e.target.value)}
                placeholder="VD: Tầng 1, Khu A"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Sức chứa</label>
              <input
                value={formCapacity}
                onChange={e => setFormCapacity(e.target.value)}
                placeholder="Số người"
                type="number"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            {vertical.features.hourly_billing && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Giá theo giờ (₫)</label>
                <input
                  value={formHourlyRate}
                  onChange={e => setFormHourlyRate(e.target.value)}
                  placeholder="0"
                  type="number"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            )}

            {/* ── Lodging-specific fields ── */}
            {(formType === 'room' || vertical.resourceType === 'room') && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Hạng phòng</label>
                  <select value={formRoomClass} onChange={e => setFormRoomClass(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary">
                    <option value="">Chọn hạng</option>
                    <option value="standard">Standard</option>
                    <option value="deluxe">Deluxe</option>
                    <option value="vip">VIP</option>
                    <option value="suite">Suite</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Loại giường</label>
                  <select value={formBedType} onChange={e => setFormBedType(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary">
                    <option value="">Chọn loại</option>
                    <option value="single">Đơn (Single)</option>
                    <option value="double">Đôi (Double)</option>
                    <option value="twin">Twin (2 giường)</option>
                    <option value="king">King</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Giá qua đêm (₫)</label>
                  <input value={formOvernightRate} onChange={e => setFormOvernightRate(e.target.value)} placeholder="0" type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Giá cuối tuần (₫)</label>
                  <input value={formWeekendRate} onChange={e => setFormWeekendRate(e.target.value)} placeholder="0" type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Phụ thu (%)</label>
                  <input value={formSurchargePct} onChange={e => setFormSurchargePct(e.target.value)} placeholder="0" type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tiền đặt cọc (₫)</label>
                  <input value={formDepositAmount} onChange={e => setFormDepositAmount(e.target.value)} placeholder="0" type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Phí giường phụ (₫)</label>
                  <input value={formExtraBedFee} onChange={e => setFormExtraBedFee(e.target.value)} placeholder="0" type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Giờ nhận phòng</label>
                  <input value={formCheckinTime} onChange={e => setFormCheckinTime(e.target.value)} type="time" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Giờ trả phòng</label>
                  <input value={formCheckoutTime} onChange={e => setFormCheckoutTime(e.target.value)} type="time" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-medium text-slate-600 mb-2">Tiện nghi</label>
                  <div className="flex flex-wrap gap-2">
                    {['Điều hòa', 'Nước nóng', 'WiFi', 'TV', 'Tủ lạnh', 'Két sắt', 'Bồn tắm', 'Ban công', 'Cửa sổ'].map(a => (
                      <label key={a} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs cursor-pointer transition-colors ${
                        formAmenities.includes(a) ? 'border-primary bg-primary/5 text-primary font-semibold' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}>
                        <input type="checkbox" className="sr-only" checked={formAmenities.includes(a)} onChange={() => setFormAmenities(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])} />
                        {a}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={handleSave}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition-colors"
            >
              {editingId ? 'Cập nhật' : 'Tạo mới'}
            </button>
            <button
              onClick={resetForm}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Resources Grid — grouped by zone */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : resources.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <div className="text-4xl mb-3">🏪</div>
          <p className="text-sm font-medium text-slate-600">Chưa có {typeLabel} nào</p>
          <p className="mt-1 text-xs text-slate-400">Bấm "Thêm {typeLabel}" để bắt đầu</p>
        </div>
      ) : (
        Array.from(zones.entries()).map(([zone, items]) => (
          <div key={zone}>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-slate-700">{zone}</h3>
              <span className="text-xs text-slate-400">{items.length} vị trí</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {items.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)).map(r => {
                const st = STATUS_STYLES[r.status] ?? STATUS_STYLES.available
                return (
                  <div
                    key={r.id}
                    className={`group relative rounded-2xl border-2 p-4 transition-all hover:shadow-md cursor-pointer ${
                      r.status === 'occupied'
                        ? 'border-red-200 bg-red-50/50'
                        : r.status === 'reserved'
                        ? 'border-blue-200 bg-blue-50/50'
                        : r.status === 'cleaning'
                        ? 'border-amber-200 bg-amber-50/50'
                        : 'border-slate-200 bg-white hover:border-primary/30'
                    }`}
                  >
                    {/* Status badge */}
                    <div className="flex items-center justify-between mb-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.bg} ${st.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                      <span className="text-[10px] text-slate-400">{TYPE_LABELS[r.type] || r.type}</span>
                    </div>

                    {/* Name */}
                    <p className="text-sm font-bold text-slate-800 truncate">{r.name}</p>

                    {/* Meta */}
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
                      {r.capacity && <span>👤 {r.capacity}</span>}
                      {r.hourly_rate && Number(r.hourly_rate) > 0 && (
                        <span>💰 {Number(r.hourly_rate).toLocaleString('vi-VN')}₫/h</span>
                      )}
                    </div>

                    {/* Quick action buttons (on hover) */}
                    <div className="absolute top-2 right-2 hidden group-hover:flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); startEdit(r) }}
                        className="rounded-md bg-white border border-slate-200 p-1 text-slate-400 hover:text-primary hover:border-primary/30 shadow-sm transition-colors"
                        title="Sửa"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(r) }}
                        className="rounded-md bg-white border border-slate-200 p-1 text-slate-400 hover:text-red-500 hover:border-red-200 shadow-sm transition-colors"
                        title="Xóa"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>

                    {/* Status quick-toggle */}
                    {r.status === 'occupied' && (
                      <button
                        onClick={() => handleStatusChange(r, 'cleaning')}
                        className="mt-2 w-full rounded-lg border border-amber-200 bg-amber-50 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                      >
                        Đánh dấu Dọn dẹp
                      </button>
                    )}
                    {r.status === 'cleaning' && (
                      <button
                        onClick={() => handleStatusChange(r, 'available')}
                        className="mt-2 w-full rounded-lg border border-green-200 bg-green-50 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
                      >
                        Sẵn sàng
                      </button>
                    )}
                    {r.status === 'reserved' && (
                      <button
                        onClick={() => handleStatusChange(r, 'occupied')}
                        className="mt-2 w-full rounded-lg border border-red-200 bg-red-50 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
                      >
                        Bắt đầu
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function safeParseJSON(str?: string): Record<string, any> {
  if (!str) return {}
  try { return JSON.parse(str) } catch { return {} }
}
