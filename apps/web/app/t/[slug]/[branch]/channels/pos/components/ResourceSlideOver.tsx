'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { CustomerSearch } from './CustomerSearch'
import { SlideProductSearch } from './SlideProductSearch'
import { CheckoutModal } from './CheckoutModal'
import { useConfirm } from '@/app/components/ui/ConfirmProvider'
import type { LocalCustomer, LocalProduct } from '@/lib/localDb/schema'

interface Resource {
  id: string
  name: string
  type: string
  zone: string
  capacity: string
  hourly_rate: string
  status: string
  current_order_id?: string
  metadata?: string
}

interface OrderItem {
  id?: string
  product_id: string
  product_name: string
  sku: string
  qty: string
  unit_price: string
  line_total: string
  discount_amount?: string
  cost_price?: string
}

interface OrderData {
  id: string
  order_no: string
  status: string
  customer_name: string
  customer_id: string
  total_amount: string
  paid_amount: string
  debt_amount: string
  metadata: string
  created_at: string
}

interface Props {
  open: boolean
  onClose: () => void
  resource: Resource
  shopId: string
  branchId: string
  shopName: string
  employeeId: string
  onCheckInSuccess: (orderId: string) => void
  onSessionClosed: () => void
}

import { fmtDateTimeVN } from './CheckoutModal'

function fmtVND(v: number | string | null | undefined) {
  return Number(v ?? 0).toLocaleString('vi-VN') + 'đ'
}

function fmtDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}p`
}

export function ResourceSlideOver({
  open, onClose, resource, shopId, branchId, shopName, employeeId,
  onCheckInSuccess, onSessionClosed
}: Props) {
  // --- Check-in State ---
  const [activeTab, setActiveTab] = useState<'general' | 'guests' | 'info'>('general')
  const [customer, setCustomer] = useState<LocalCustomer | null>(null)
  const [numGuests, setNumGuests] = useState('1')
  const [checkInTime, setCheckInTime] = useState(() => {
    const now = new Date()
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  })
  const [expectedCheckout, setExpectedCheckout] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [guests, setGuests] = useState<any[]>([{
    id: Date.now(), name: '', gender: '', dob: '', id_type: 'CCCD',
    id_number: '', expiry_date: '', nationality: 'Việt Nam', address: '', note: '', is_child: false
  }])

  // --- Occupied State ---
  const [bookingSource, setBookingSource] = useState('Khách lẻ (Walk-in)')
  const [installments, setInstallments] = useState<any[]>([])
  const [installmentAmount, setInstallmentAmount] = useState('')
  const [installmentMethod, setInstallmentMethod] = useState('cash')
  const [installmentNote, setInstallmentNote] = useState('')
  const [isPayingInstallment, setIsPayingInstallment] = useState(false)
  const [isUpdatingMeta, setIsUpdatingMeta] = useState(false)
  const confirm = useConfirm()
  const [order, setOrder] = useState<OrderData | null>(null)
  const [existingItems, setExistingItems] = useState<OrderItem[]>([])
  const [cartItems, setCartItems] = useState<OrderItem[]>([])
  const [loadingOrder, setLoadingOrder] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [customCheckoutTime, setCustomCheckoutTime] = useState<string>('')
  const [isEditingCheckout, setIsEditingCheckout] = useState(false)
  const [checkoutInput, setCheckoutInput] = useState('')
  const [savingItems, setSavingItems] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const meta = safeParse(resource.metadata)
  const isRoom = resource.type === 'room'
  const isOccupied = resource.status === 'occupied'

  const fetchingRef = useRef('')

  // --- Data Loading (Occupied) ---
  const fetchOrder = useCallback(async () => {
    if (!isOccupied || !resource.current_order_id) return
    if (fetchingRef.current === resource.current_order_id) return
    
    fetchingRef.current = resource.current_order_id
    setLoadingOrder(true)
    try {
      const orderId = resource.current_order_id
      const [orderRes, itemsRes, paymentsRes] = await Promise.all([
        fetch(`/api/shops/${shopId}/orders/${orderId}`),
        fetch(`/api/shops/${shopId}/order-items?order_id=${orderId}&limit=200`),
        fetch(`/api/shops/${shopId}/payments?order_id=${orderId}&limit=100`),
      ])
      if (orderRes.ok) {
        const oData = await orderRes.json()
        setOrder(oData)
        const meta = safeParse(oData.metadata)
        if (meta.guests) setGuests(meta.guests)
        if (meta.booking_source) setBookingSource(meta.booking_source)
        if (meta.note || oData.note) setNote(meta.note || oData.note || '')
        if (meta.expected_checkout) setExpectedCheckout(meta.expected_checkout)
      }
      if (itemsRes.ok) {
        const iData = await itemsRes.json()
        setExistingItems(iData.data || [])
      }
      if (paymentsRes.ok) {
        const pData = await paymentsRes.json()
        setInstallments(pData.data || [])
      }
    } catch {
      // ignore
    } finally {
      fetchingRef.current = ''
      setLoadingOrder(false)
    }
  }, [isOccupied, resource.current_order_id, shopId])

  // Reset state when opening a new resource
  useEffect(() => {
    if (open) {
      setActiveTab('general')
      setCustomer(null)
      setOrder(null)
      setExistingItems([])
      setCartItems([])
      fetchOrder()
      setCustomCheckoutTime('')
      setIsEditingCheckout(false)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [open, resource.id, fetchOrder])

  // Timer logic
  useEffect(() => {
    if (!order) return
    let checkInDate = new Date(order.created_at)
    if (orderMeta.check_in) {
      checkInDate = new Date(orderMeta.check_in)
    } else if (orderMeta.check_in_time) {
      const [hh, mm] = orderMeta.check_in_time.split(':').map(Number)
      checkInDate.setHours(hh, mm, 0, 0)
    } else {
      return
    }

    const updateTimer = () => {
      const nowTime = customCheckoutTime ? new Date(customCheckoutTime).getTime() : Date.now()
      const diff = Math.floor((nowTime - checkInDate.getTime()) / 1000)
      setElapsed(diff > 0 ? diff : 0)
    }
    updateTimer()
    timerRef.current = setInterval(updateTimer, 60000) // Update every minute
    return () => clearInterval(timerRef.current!)
  }, [order, customCheckoutTime])

  // Calculate Time Charge
  const hourlyRate = Number(resource.hourly_rate) || 0
  let billableHours = 0
  let timeCharge = 0
  if (hourlyRate > 0 && order) {
    const hours = elapsed / 3600
    billableHours = Math.ceil(hours)
    timeCharge = billableHours * hourlyRate
  }

  // --- Handlers ---
  function handleCustomerSelect(c: LocalCustomer | null) {
    setCustomer(c)
    if (c?.name) {
      setGuests(prev => {
        const newGuests = [...prev]
        if (!newGuests[0].name) newGuests[0].name = c.name
        return newGuests
      })
    }
  }

  async function handleCheckInSubmit() {
    setSaving(true)
    try {
      const customerName = customer?.name || 'Khách lẻ'
      const activeGuests = guests.filter(g => g.name && g.name.trim() !== '')

      const now = new Date()
      const [ch, cm] = checkInTime.split(':').map(Number)
      const checkInDate = new Date(now.setHours(ch, cm, 0, 0))

      const res = await fetch(`/api/shops/${shopId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'in_progress',
          customer_id: customer?.customer_id?.startsWith('virtual:') ? '' : (customer?.customer_id || ''),
          customer_name: customerName,
          branch_id: branchId,
          employee_id: employeeId,
          subtotal: '0',
          total_amount: '0',
          paid_amount: '0',
          metadata: JSON.stringify({
            resource_id: resource.id,
            resource_name: resource.name,
            check_in: checkInDate.toISOString(),
            num_guests: numGuests,
            expected_checkout: expectedCheckout,
            customer_phone: customer?.phone || '',
            guests: isRoom ? activeGuests : undefined,
            note: note,
          })
        }),
      })

      if (!res.ok) throw new Error('Lỗi tạo phiên')
      const createdOrder = await res.json()
      const orderId = createdOrder.id || createdOrder.order_id

      await fetch(`/api/shops/${shopId}/location-resources/${resource.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'occupied', current_order_id: orderId }),
      })

      toast.success(`Đã mở phiên cho ${resource.name}`)
      onCheckInSuccess(orderId)
    } catch (e: any) {
      toast.error(e.message || 'Lỗi')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateMetadata() {
    if (!order) return
    setIsUpdatingMeta(true)
    try {
      const meta = safeParse(order.metadata)
      const validGuests = guests.filter(g => g.name.trim() !== '')
      
      const newMeta = {
        ...meta,
        guests: isRoom ? validGuests : undefined,
        booking_source: bookingSource,
        expected_checkout: expectedCheckout,
        note: note,
      }
      
      const res = await fetch(`/api/shops/${shopId}/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          metadata: JSON.stringify(newMeta),
          note: note
        }),
      })

      if (!res.ok) throw new Error('Cập nhật thất bại')
      const updatedOrder = await res.json()
      setOrder(updatedOrder)
      toast.success('Đã lưu thông tin khách hàng')
    } catch (err) {
      console.error(err)
      toast.error('Lỗi khi lưu thông tin')
    } finally {
      setIsUpdatingMeta(false)
    }
  }

  async function handlePayInstallment() {
    if (!order) return
    const amt = Number(installmentAmount.replace(/\./g, ''))
    if (!amt || amt <= 0) {
      toast.error('Vui lòng nhập số tiền hợp lệ')
      return
    }
    
    const ok = await confirm({
      title: 'Xác nhận thu tiền',
      description: `Khoản thanh toán ${fmtVND(amt)} sẽ lập tức được ghi nhận vào Sổ Quỹ (phiếu thu ${fmtVND(amt)}). Bạn có chắc chắn?`,
      confirmLabel: 'Xác nhận thu',
      cancelLabel: 'Hủy'
    })
    if (!ok) return

    setIsPayingInstallment(true)
    try {
      const res = await fetch(`/api/shops/${shopId}/orders/${order.id}/pay-installment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: installmentMethod, amount: String(amt), note: installmentNote })
      })
      if (!res.ok) throw new Error('Thu tiền thất bại')
      const data = await res.json()
      setOrder(data.order)
      setInstallments([...installments, data.payment])
      setInstallmentAmount('')
      setInstallmentNote('')
      toast.success('Đã ghi nhận thu tiền vào Sổ quỹ')
    } catch (err) {
      console.error(err)
      toast.error('Lỗi khi lưu thanh toán')
    } finally {
      setIsPayingInstallment(false)
    }
  }

  function handleProductSelect(p: LocalProduct) {
    const unitPrice = Number(p.sell_price || 0)
    setCartItems(prev => {
      const existing = prev.find(i => i.product_id === p.product_id)
      if (existing) {
        return prev.map(i => i.product_id === p.product_id ? {
          ...i,
          qty: String(Number(i.qty) + 1),
          line_total: String((Number(i.qty) + 1) * unitPrice)
        } : i)
      }
      return [...prev, {
        product_id: p.product_id,
        product_name: p.name,
        sku: p.sku || '',
        qty: '1',
        unit_price: String(unitPrice),
        line_total: String(unitPrice),
        cost_price: String(Number(p.cost_price || 0)),
        discount_amount: '0'
      }]
    })
  }

  function updateCartQty(idx: number, delta: number) {
    setCartItems(prev => {
      const clone = [...prev]
      const currQty = Number(clone[idx].qty)
      const newQty = currQty + delta
      if (newQty <= 0) {
        clone.splice(idx, 1)
      } else {
        const p = clone[idx]
        const up = Number(p.unit_price)
        clone[idx] = { ...p, qty: String(newQty), line_total: String(newQty * up) }
      }
      return clone
    })
  }

  async function handleSaveCartItems() {
    if (cartItems.length === 0) return
    if (!order) return
    setSavingItems(true)
    try {
      const orderId = order.id
      for (const item of cartItems) {
        await fetch(`/api/shops/${shopId}/order-items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: orderId,
            order_no: order.order_no || '',
            line_no: String(existingItems.length + cartItems.indexOf(item) + 1),
            product_id: item.product_id,
            sku: item.sku,
            product_name: item.product_name,
            qty: String(item.qty),
            unit_price: String(item.unit_price),
            line_total: String(item.line_total),
            line_discount: String(item.discount_amount),
          }),
        })
      }
      toast.success(`Đã thêm ${cartItems.length} món`)
      setCartItems([])
      fetchOrder()
    } catch {
      toast.error('Lỗi khi thêm món')
    } finally {
      setSavingItems(false)
    }
  }

  async function handleCheckoutSuccess() {
    try {
      await fetch(`/api/shops/${shopId}/location-resources/${resource.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cleaning', current_order_id: '' }),
      })
    } catch {
      // ignore
    }
    setCheckoutOpen(false)
    onSessionClosed()
    onClose()
  }

  const buildCheckoutItems = () => {
    const items: any[] = [...existingItems, ...cartItems].map(it => ({
      product_id: it.product_id,
      product_name: it.product_name,
      sku: it.sku || '',
      qty: Number(it.qty),
      unit_price: Number(it.unit_price),
      cost_price: Number(it.cost_price ?? 0),
      discount_amount: Number(it.discount_amount ?? 0),
      line_total: Number(it.line_total),
    }))
    if (timeCharge > 0) {
      items.push({
        product_id: 'TIME_CHARGE',
        product_name: `Tiền giờ sử dụng (${fmtDuration(elapsed)})`,
        sku: 'TIME_CHARGE',
        qty: billableHours,
        unit_price: hourlyRate,
        cost_price: 0,
        discount_amount: 0,
        line_total: timeCharge,
      })
    }
    return items
  }

  const orderMeta = order ? safeParse(order.metadata) : null

  return (
    <>
      {/* Overlay */}
      <div
        className={[
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-300',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className={`fixed inset-y-0 right-0 z-50 w-full max-w-[800px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-lg ${isOccupied ? 'bg-red-50 text-red-500' : 'bg-primary/10 text-primary'}`}>
              {isRoom ? '🛏' : resource.type === 'court' ? '🏸' : '🍽'}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{resource.name}</h2>
              <div className="flex items-center gap-2 text-xs font-medium mt-0.5">
                <span className={isOccupied ? 'text-red-500' : 'text-emerald-500'}>
                  {isOccupied ? 'Đang sử dụng' : 'Đang trống'}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">{resource.zone || 'Chưa phân vùng'}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100 text-slate-400">✕</button>
        </div>

        {/* Content Area */}
        {!isOccupied && isRoom && (
          <div className="px-5 border-b border-slate-100 flex gap-6 shrink-0 bg-white">
            <button
              onClick={() => setActiveTab('general')}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'general' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Thông tin chung
            </button>
            <button
              onClick={() => setActiveTab('guests')}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'guests' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Khách lưu trú ({guests.filter(g => g.name.trim()).length || 0})
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto bg-slate-50/50">
          {!isOccupied ? (
            /* --- AVAILABLE STATE (CHECK-IN) --- */
            <div className="p-5 space-y-6">
              {(!isRoom || activeTab === 'general') && (
                <>
              {/* Customer */}
              <div>
                <p className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-wide">Người đại diện</p>
                <CustomerSearch selected={customer} onSelect={handleCustomerSelect} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Số người</label>
                  <input
                    value={numGuests} onChange={e => setNumGuests(e.target.value)}
                    type="number" min="1"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Giờ vào</label>
                  <input
                    value={checkInTime} onChange={e => setCheckInTime(e.target.value)}
                    type="time"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 bg-white"
                  />
                </div>
              </div>

              {/* Fee preview */}
              {(Number(resource.hourly_rate) > 0 || meta.overnight_rate) && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-xs text-blue-800">
                  <p className="font-semibold mb-2">Dự tính phí:</p>
                  <div className="space-y-1">
                    {Number(resource.hourly_rate) > 0 && <div className="flex justify-between"><span>Giá giờ:</span> <span>{Number(resource.hourly_rate).toLocaleString('vi-VN')}₫/h</span></div>}
                    {meta.overnight_rate && <div className="flex justify-between"><span>Qua đêm:</span> <span>{Number(meta.overnight_rate).toLocaleString('vi-VN')}₫</span></div>}
                  </div>
                </div>
              )}
                </>
              )}

              {isRoom && activeTab === 'guests' && (
                <div className="space-y-4">
                  {guests.map((g, idx) => (
                    <div key={g.id} className="rounded-xl border border-slate-200 bg-white p-4 relative shadow-sm">
                      <div className="absolute right-3 top-3">
                        {guests.length > 1 && (
                          <button onClick={() => setGuests(guests.filter(x => x.id !== g.id))} className="text-slate-400 hover:text-red-500 text-xs font-medium">✕ Xóa</button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 pr-8">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Họ và tên</label>
                          <input type="text" value={g.name} onChange={e => {
                            const newG = [...guests]; newG[idx].name = e.target.value; setGuests(newG);
                          }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" placeholder="Nhập tên khách..." />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Loại giấy tờ</label>
                          <select value={g.id_type} onChange={e => {
                            const newG = [...guests]; newG[idx].id_type = e.target.value; setGuests(newG);
                          }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white">
                            <option value="CCCD">CCCD/CMND</option>
                            <option value="Passport">Hộ chiếu</option>
                            <option value="Other">Khác</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Số giấy tờ</label>
                          <input type="text" value={g.id_number} onChange={e => {
                            const newG = [...guests]; newG[idx].id_number = e.target.value; setGuests(newG);
                          }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Ngày hết hạn</label>
                          <input type="date" value={g.expiry_date || ''} onChange={e => {
                            const newG = [...guests]; newG[idx].expiry_date = e.target.value; setGuests(newG);
                          }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Quốc tịch</label>
                          <input type="text" value={g.nationality} onChange={e => {
                            const newG = [...guests]; newG[idx].nationality = e.target.value; setGuests(newG);
                          }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Ngày sinh</label>
                          <input type="date" value={g.dob || ''} onChange={e => {
                            const newG = [...guests]; newG[idx].dob = e.target.value; setGuests(newG);
                          }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Giới tính</label>
                          <select value={g.gender || ''} onChange={e => {
                            const newG = [...guests]; newG[idx].gender = e.target.value; setGuests(newG);
                          }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white">
                            <option value="">-- Chọn --</option>
                            <option value="Nam">Nam</option>
                            <option value="Nữ">Nữ</option>
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Ghi chú</label>
                          <input type="text" value={g.note || ''} onChange={e => {
                            const newG = [...guests]; newG[idx].note = e.target.value; setGuests(newG);
                          }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" placeholder="Ghi chú thêm (địa chỉ, lưu ý...)" />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setGuests([...guests, { id: Date.now(), name: '', id_type: 'CCCD', id_number: '', expiry_date: '', nationality: 'Việt Nam', dob: '', gender: '', note: '' }])} className="w-full rounded-xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500 hover:border-primary hover:text-primary transition-colors bg-white">
                    + Thêm khách lưu trú
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* --- OCCUPIED STATE (MANAGE) --- */
            <div className="flex h-full flex-col">
              {/* Header Tabs */}
              <div className="flex items-center gap-6 border-b border-slate-100 px-5 pt-2 mb-4 shrink-0">
                <button
                  onClick={() => setActiveTab('general')}
                  className={`border-b-2 py-3 text-sm font-medium transition-colors ${activeTab === 'general' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  Phòng & Dịch vụ
                </button>
                {isRoom && (
                  <button
                    onClick={() => setActiveTab('guests')}
                    className={`border-b-2 py-3 text-sm font-medium transition-colors ${activeTab === 'guests' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    Khách lưu trú {guests.length > 0 ? `(${guests.length})` : ''}
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-5 pb-5">
                {loadingOrder ? (
                  <div className="flex justify-center p-10"><span className="text-slate-400 text-sm">Đang tải...</span></div>
                ) : (
                  <div className="space-y-6">
                    {activeTab === 'general' && (
                      <>
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-full">
                        {/* LEFT COLUMN: Summary + Payments */}
                        <div className="md:col-span-6 space-y-6 flex flex-col">
                          {/* Summary Card */}
                          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shrink-0">
                            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-3">
                              <div>
                                <p className="text-xs text-slate-500 mb-0.5">Khách hàng</p>
                                <p className="text-sm font-bold text-slate-900">
                                  {order?.customer_name || 'Khách lẻ'}
                                  {orderMeta?.customer_phone && <span className="font-normal text-slate-500 ml-1">({orderMeta.customer_phone})</span>}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-slate-500 mb-0.5">Đã sử dụng</p>
                                <p className="text-sm font-bold text-slate-900">{fmtDuration(elapsed)}</p>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs text-slate-600">
                                <span>Giờ vào:</span>
                                <span className="font-medium">{orderMeta?.check_in ? fmtDateTimeVN(new Date(orderMeta.check_in)) : '—'}</span>
                              </div>
                              <div className="flex items-center justify-between text-xs text-slate-600">
                                <span>{customCheckoutTime ? 'Giờ ra:' : 'Giờ ra (Hiện tại):'}</span>
                                {isEditingCheckout ? (
                                  <div className="flex items-center gap-2">
                                    <input 
                                      type="datetime-local" 
                                      value={checkoutInput}
                                      onChange={e => setCheckoutInput(e.target.value)}
                                      className="text-xs border border-slate-300 rounded px-1 py-0.5 outline-none"
                                    />
                                    <button onClick={() => { setCustomCheckoutTime(checkoutInput); setIsEditingCheckout(false); }} className="text-primary font-bold">OK</button>
                                  </div>
                                ) : (
                                  <button onClick={() => { 
                                    setCheckoutInput(customCheckoutTime || new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)); 
                                    setIsEditingCheckout(true); 
                                  }} className="font-medium border-b border-dotted border-slate-400 hover:text-primary transition-colors cursor-pointer">
                                    {customCheckoutTime ? fmtDateTimeVN(new Date(customCheckoutTime)) : fmtDateTimeVN(new Date())}
                                  </button>
                                )}
                              </div>
                            </div>
                            
                            {timeCharge > 0 && (
                              <div className="mt-3 pt-3 border-t border-dashed border-slate-200 flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-600">Tiền giờ ({billableHours}h)</span>
                                <span className="text-sm font-bold text-slate-900">{fmtVND(timeCharge)}</span>
                              </div>
                            )}
                          </div>

                          {/* Lịch sử thu tiền */}
                          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex-1 flex flex-col">
                            <div className="flex items-center justify-between mb-3">
                              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide">Lịch sử thanh toán</label>
                              <span className="text-xs font-medium text-slate-500">Tổng: <span className="font-bold text-slate-900">{fmtVND(installments.reduce((sum, p) => sum + Number(p.amount), 0))}</span></span>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto mb-3 min-h-[100px]">
                              {installments.length > 0 ? (
                                <div className="space-y-2">
                                  {installments.map((p, i) => {
                                    const mName = { cash: 'Tiền mặt', card: 'Thẻ', bank_transfer: 'CK', momo: 'MoMo', vnpay: 'VNPay', zalopay: 'ZaloPay' }[p.method as string] || p.method
                                    return (
                                      <div key={p.id || i} className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                                        <div>
                                          <p className="text-xs font-medium text-slate-700">{mName}</p>
                                          <p className="text-[10px] text-slate-400">{new Date(p.paid_at || Date.now()).toLocaleString('vi-VN')}</p>
                                          {p.note && <p className="text-[10px] text-slate-500 mt-0.5">Ghi chú: {p.note}</p>}
                                        </div>
                                        <p className="text-sm font-bold text-slate-900">{fmtVND(p.amount)}</p>
                                      </div>
                                    )
                                  })}
                                </div>
                              ) : (
                                <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-center h-full flex items-center justify-center">
                                  <p className="text-xs text-slate-400">Chưa có giao dịch</p>
                                </div>
                              )}
                            </div>

                            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 shrink-0">
                              <label className="block text-[10px] font-bold text-primary mb-1 uppercase tracking-wide">Thêm thanh toán</label>
                              <div className="flex bg-white rounded-md border border-primary/20 overflow-hidden mb-2">
                                <select value={installmentMethod} onChange={e => setInstallmentMethod(e.target.value)} className="bg-transparent text-sm border-r border-primary/20 px-2 py-1.5 focus:outline-none text-slate-700 w-1/3">
                                  <option value="cash">Tiền mặt</option>
                                  <option value="bank_transfer">Chuyển khoản</option>
                                  <option value="card">Thẻ/Quẹt máy</option>
                                  <option value="momo">MoMo</option>
                                  <option value="vnpay">VNPay</option>
                                  <option value="zalopay">ZaloPay</option>
                                </select>
                                <input 
                                  type="text" 
                                  placeholder="0"
                                  value={installmentAmount}
                                  onChange={e => {
                                    const val = e.target.value.replace(/\D/g, '')
                                    setInstallmentAmount(val ? Number(val).toLocaleString('vi-VN') : '')
                                  }}
                                  className="flex-1 w-full bg-transparent text-sm px-3 py-1.5 focus:outline-none text-right font-bold text-primary" 
                                />
                              </div>
                              <div className="flex gap-2">
                                <input 
                                  type="text" 
                                  placeholder="Ghi chú (tùy chọn)..."
                                  value={installmentNote}
                                  onChange={e => setInstallmentNote(e.target.value)}
                                  className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:border-primary bg-white" 
                                />
                                <button onClick={handlePayInstallment} disabled={isPayingInstallment || !installmentAmount} className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-dark transition-colors disabled:opacity-50 shrink-0">
                                  {isPayingInstallment ? 'Đang lưu...' : 'Thu'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* RIGHT COLUMN: Order Items */}
                        <div className="md:col-span-6 flex flex-col h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <p className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Sản phẩm/Dịch vụ</p>
                          
                          <div className="mb-4 shrink-0">
                            <SlideProductSearch onSelect={handleProductSelect} />
                          </div>

                          <div className="space-y-3 flex-1 overflow-y-auto">
                            {existingItems.length === 0 && cartItems.length === 0 && (
                              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
                                Chưa gọi món nào
                              </div>
                            )}

                            {/* Existing items */}
                            {existingItems.map((item, idx) => (
                              <div key={item.id || `ex-${idx}`} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 flex justify-between items-center opacity-80">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-slate-700 truncate">{item.product_name}</p>
                                  <p className="text-xs text-slate-500 mt-0.5">{item.qty} x {fmtVND(item.unit_price)}</p>
                                </div>
                                <span className="text-sm font-bold text-slate-700 shrink-0 ml-3">
                                  {fmtVND(item.line_total)}
                                </span>
                              </div>
                            ))}

                            {/* Cart items */}
                            {cartItems.map((item, idx) => (
                              <div key={`cart-${idx}`} className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex justify-between items-center shadow-sm">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-bold text-slate-900 truncate">{item.product_name}</p>
                                  <p className="text-xs text-primary mt-0.5 font-medium">{item.qty} x {fmtVND(item.unit_price)}</p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0 ml-3">
                                  <div className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-1 py-0.5">
                                    <button onClick={() => updateCartQty(idx, -1)} className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 font-medium">−</button>
                                    <span className="text-xs font-bold w-4 text-center">{item.qty}</span>
                                    <button onClick={() => updateCartQty(idx, 1)} className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 font-medium">+</button>
                                  </div>
                                  <span className="text-sm font-bold text-slate-900 w-16 text-right">
                                    {fmtVND(item.line_total)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Thông tin thuê — inline at bottom */}
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">Thông tin thuê</p>
                          <button onClick={handleUpdateMetadata} disabled={isUpdatingMeta} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50">
                            {isUpdatingMeta ? 'Đang lưu...' : 'Lưu thay đổi'}
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Dự kiến trả phòng</label>
                            <input type="datetime-local" value={expectedCheckout} onChange={(e) => setExpectedCheckout(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Kênh đặt phòng</label>
                            <select value={bookingSource} onChange={(e) => setBookingSource(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white">
                              <option value="Khách lẻ (Walk-in)">Khách lẻ (Walk-in)</option>
                              <option value="Facebook/Zalo">Facebook/Zalo</option>
                              <option value="Booking.com">Booking.com</option>
                              <option value="Agoda">Agoda</option>
                              <option value="Traveloka">Traveloka</option>
                              <option value="Khác">Khác</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Ghi chú thêm</label>
                            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" placeholder="Yêu cầu đặc biệt..." />
                          </div>
                        </div>
                      </div>
                      </>
                    )}

                    {activeTab === 'guests' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-slate-900">Danh sách khách lưu trú</p>
                          <button onClick={handleUpdateMetadata} disabled={isUpdatingMeta} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">
                            {isUpdatingMeta ? 'Đang lưu...' : 'Lưu thay đổi'}
                          </button>
                        </div>
                        <div className="space-y-4">
                          {guests.map((g, idx) => (
                            <div key={g.id || idx} className="rounded-xl border border-slate-200 bg-slate-50 p-4 relative group">
                              {guests.length > 1 && (
                                <button onClick={() => setGuests(guests.filter((_, i) => i !== idx))} className="absolute top-3 right-3 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium">
                                  Xóa
                                </button>
                              )}
                              <div className="flex items-center gap-2 mb-3">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">{idx + 1}</span>
                                <span className="text-sm font-semibold text-slate-700">Khách hàng {idx + 1}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2 pr-8">
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Họ và tên</label>
                                  <input type="text" value={g.name} onChange={e => {
                                    const newG = [...guests]; newG[idx].name = e.target.value; setGuests(newG);
                                  }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" placeholder="Nhập tên khách..." />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Loại giấy tờ</label>
                                  <select value={g.id_type} onChange={e => {
                                    const newG = [...guests]; newG[idx].id_type = e.target.value; setGuests(newG);
                                  }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white">
                                    <option value="CCCD">CCCD/CMND</option>
                                    <option value="Passport">Hộ chiếu</option>
                                    <option value="Other">Khác</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Số giấy tờ</label>
                                  <input type="text" value={g.id_number} onChange={e => {
                                    const newG = [...guests]; newG[idx].id_number = e.target.value; setGuests(newG);
                                  }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Ngày hết hạn</label>
                                  <input type="date" value={g.expiry_date || ''} onChange={e => {
                                    const newG = [...guests]; newG[idx].expiry_date = e.target.value; setGuests(newG);
                                  }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white" />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Quốc tịch</label>
                                  <input type="text" value={g.nationality} onChange={e => {
                                    const newG = [...guests]; newG[idx].nationality = e.target.value; setGuests(newG);
                                  }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Ngày sinh</label>
                                  <input type="date" value={g.dob || ''} onChange={e => {
                                    const newG = [...guests]; newG[idx].dob = e.target.value; setGuests(newG);
                                  }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white" />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Giới tính</label>
                                  <select value={g.gender || ''} onChange={e => {
                                    const newG = [...guests]; newG[idx].gender = e.target.value; setGuests(newG);
                                  }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white">
                                    <option value="">-- Chọn --</option>
                                    <option value="Nam">Nam</option>
                                    <option value="Nữ">Nữ</option>
                                  </select>
                                </div>
                                <div className="col-span-2">
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Ghi chú</label>
                                  <input type="text" value={g.note || ''} onChange={e => {
                                    const newG = [...guests]; newG[idx].note = e.target.value; setGuests(newG);
                                  }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" placeholder="Ghi chú thêm (địa chỉ, lưu ý...)" />
                                </div>
                              </div>
                            </div>
                          ))}
                          <button onClick={() => setGuests([...guests, { id: Date.now(), name: '', id_type: 'CCCD', id_number: '', expiry_date: '', nationality: 'Việt Nam', dob: '', gender: '', note: '' }])} className="w-full rounded-xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500 hover:border-primary hover:text-primary transition-colors bg-white">
                            + Thêm khách lưu trú
                          </button>
                        </div>
                      </div>
                    )}


                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-white shrink-0">
          {!isOccupied ? (
            <button
              onClick={handleCheckInSubmit}
              disabled={saving}
              className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-white shadow-sm hover:bg-primary-dark disabled:opacity-50 transition-all"
            >
              {saving ? 'Đang mở phiên...' : 'Mở phiên'}
            </button>
          ) : (
            <div className="flex gap-3">
              {cartItems.length > 0 ? (
                <button
                  onClick={handleSaveCartItems}
                  disabled={savingItems}
                  className="flex-1 rounded-xl bg-primary py-3.5 text-sm font-bold text-white shadow-sm hover:bg-primary-dark transition-colors disabled:opacity-50"
                >
                  {savingItems ? 'Đang lưu...' : `Lưu ${cartItems.length} món mới`}
                </button>
              ) : (
                <button
                  onClick={() => setCheckoutOpen(true)}
                  className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800 transition-all"
                >
                  Thanh toán & Trả {isRoom ? 'phòng' : 'bàn'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {checkoutOpen && order && (
        <CheckoutModal
          open={checkoutOpen}
          orderId={order.id}
          onClose={() => setCheckoutOpen(false)}
          onSuccess={handleCheckoutSuccess}
          customer={(order?.customer_name && order.customer_name !== 'Khách lẻ') ? { 
            customer_id: order.customer_id || '', 
            name: order.customer_name, 
            phone: orderMeta?.customer_phone || '' 
          } : null}
          metadata={orderMeta}
          items={buildCheckoutItems() as any}
          subtotal={buildCheckoutItems().reduce((a, b) => a + b.line_total, 0)}
          discount_amount={0}
          total={buildCheckoutItems().reduce((a, b) => a + b.line_total, 0)}
          orderPaidAmount={installments.reduce((sum, p) => sum + Number(p.amount || 0), 0)}
          note=""
          shopId={shopId}
          branchId={branchId}
          shopName={shopName}
          employeeId={employeeId}
          isOnline={true}
          autoPrintReceipt={false}
          customCheckoutTime={customCheckoutTime}
          hourlyRate={hourlyRate}
        />
      )}
    </>
  )
}

function safeParse(s?: string): Record<string, any> {
  if (!s) return {}
  try { return JSON.parse(s) } catch { return {} }
}
