'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { localDb, type LocalCustomer } from '@/lib/localDb/schema'
import { useQuery } from '@tanstack/react-query'

interface Props {
  open: boolean
  onClose: () => void
  shopId: string
  onSuccess: (customer: LocalCustomer) => void
}

export function CustomerCreateModal({ open, onClose, shopId, onSuccess }: Props) {
  const { data: settings } = useQuery({
    queryKey: ['settings', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/settings`)
      if (!res.ok) return {}
      return res.json()
    },
  })

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [customerCode, setCustomerCode] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [birthday, setBirthday] = useState('')
  const [customerType, setCustomerType] = useState('retail')
  const [debtAmount, setDebtAmount] = useState('0')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setName('')
      setPhone('')
      setCustomerCode('')
      setEmail('')
      setAddress('')
      setBirthday('')
      setCustomerType('retail')
      setDebtAmount('0')
      setNote('')
    }
  }, [open])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedPhone = phone.trim()

    if (!trimmedName) {
      toast.error('Vui lòng nhập tên khách hàng')
      return
    }
    if (!trimmedPhone) {
      toast.error('Vui lòng nhập số điện thoại')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: trimmedName,
        phone: trimmedPhone,
        customer_code: customerCode.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        birthday: birthday || undefined,
        customer_type: customerType,
        debt_amount: String(parseFloat(debtAmount.replace(/,/g, '')) || 0),
        note: note.trim() || undefined,
      }

      let createdCustomer: LocalCustomer | null = null

      if (navigator.onLine) {
        try {
          const res = await fetch(`/api/shops/${shopId}/customers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (res.ok) {
            const data = await res.json()
            createdCustomer = {
              customer_id: data.customer_id || data.id,
              name: data.name,
              phone: data.phone,
              email: data.email,
              customer_type: data.customer_type,
              debt_amount: parseFloat(data.debt_amount) || 0,
              last_seen_at: new Date().toISOString(),
            }
            toast.success(`Đã tạo và đồng bộ khách hàng: ${trimmedName}`)
          } else {
            const errData = await res.json().catch(() => ({}))
            console.error('Failed to create customer on server:', errData)
          }
        } catch (err) {
          console.error('Network error during customer creation:', err)
        }
      }

      // Offline fallback / local save
      if (!createdCustomer) {
        const localId = `virtual:temp-${Date.now()}`
        createdCustomer = {
          customer_id: localId,
          name: trimmedName,
          phone: trimmedPhone,
          email: email.trim() || undefined,
          customer_type: customerType,
          debt_amount: parseFloat(debtAmount) || 0,
          last_seen_at: new Date().toISOString(),
        }
        toast.info(`Đã tạo khách hàng cục bộ: ${trimmedName} (sẽ đồng bộ khi lên mạng)`)
      }

      // Add to Dexie DB so it's instantly searchable
      if (localDb) {
        await localDb.customers.put(createdCustomer)
      }

      onSuccess(createdCustomer)
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Lỗi khi lưu thông tin khách hàng')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100 transition-all scale-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div>
            <h2 className="text-base font-bold text-slate-800">Thêm Khách Hàng Mới</h2>
            <p className="text-xs text-slate-500">Tạo hồ sơ khách hàng đầy đủ thông tin</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Tên khách hàng */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Tên khách hàng <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nhập tên khách..."
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-white text-slate-800"
              />
            </div>

            {/* Số điện thoại */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Số điện thoại <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Nhập số điện thoại..."
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-white text-slate-800"
              />
            </div>

            {/* Mã khách hàng */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Mã khách hàng (tùy chọn)
              </label>
              <input
                type="text"
                value={customerCode}
                onChange={(e) => setCustomerCode(e.target.value)}
                placeholder="Mã tự động phát sinh..."
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-white text-slate-800"
              />
            </div>

            {/* Email */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@gmail.com..."
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-white text-slate-800"
              />
            </div>

            {/* Địa chỉ */}
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Địa chỉ
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Nhập địa chỉ của khách hàng..."
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-white text-slate-800"
              />
            </div>

            {/* Ngày sinh */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Ngày sinh
              </label>
              <input
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-white text-slate-800"
              />
            </div>

            {/* Nhóm khách hàng */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Nhóm khách hàng
              </label>
              <select
                value={customerType}
                onChange={(e) => setCustomerType(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-white text-slate-800"
              >
                <option value="retail">Bán lẻ (Mặc định)</option>
                <option value="wholesale">Sỉ (Mặc định)</option>
                <option value="vip">VIP (Mặc định)</option>
                <option value="staff">Nội bộ (Mặc định)</option>
                {settings?.has_crm_access && settings?.membership_tiers?.map((t: any) => {
                  const lowercaseName = (t.name || '').trim().toLowerCase()
                  const isLegacy = ['retail', 'wholesale', 'vip', 'staff'].includes(lowercaseName)
                  if (isLegacy) return null
                  return (
                    <option key={t.name} value={t.name}>
                      {t.name} (Chiết khấu {t.discount}%)
                    </option>
                  )
                })}
              </select>
            </div>

            {/* Dư nợ ban đầu */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Nợ ban đầu (nếu có)
              </label>
              <input
                type="text"
                value={debtAmount ? Number(debtAmount.replace(/\D/g, '')).toLocaleString('vi-VN') : ''}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '')
                  setDebtAmount(val || '0')
                }}
                placeholder="0đ"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-right font-medium focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-white text-slate-800"
              />
            </div>
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Ghi chú
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nhập ghi chú chi tiết về khách hàng..."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none bg-white text-slate-800 resize-none"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex gap-3 border-t border-slate-100 px-6 py-4 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-colors"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !name.trim() || !phone.trim()}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-white hover:bg-primary-dark disabled:opacity-40 transition-colors"
          >
            {saving && (
              <svg className="h-4 w-4 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {saving ? 'Đang lưu...' : 'Lưu khách hàng'}
          </button>
        </div>
      </div>
    </div>
  )
}
