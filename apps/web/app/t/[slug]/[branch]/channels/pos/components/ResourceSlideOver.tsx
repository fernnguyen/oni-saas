'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CustomerSearch } from './CustomerSearch'
import { SlideProductSearch } from './SlideProductSearch'
import { getVerticalConfig, calculateHourlyBilling } from '@oni/core'
import { CheckoutModal } from './CheckoutModal'
import { CustomerCreateModal } from './CustomerCreateModal'
import { useConfirm } from '@/app/components/ui/ConfirmProvider'
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog'
import type { LocalCustomer, LocalProduct } from '@/lib/localDb/schema'
import type { CartItem } from '@/hooks/useCart'
import { VariantPickerModal } from './VariantPickerModal'
import { ModifierPickerModal } from './ModifierPickerModal'

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
  variant_label?: string
  modifiers?: string
  modifier_total?: string
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
  resourceTemplate?: import('@oni/core').ResourceTemplate
  allResources?: any[]
  onRefresh?: () => void
  autoPrintReceipt?: boolean
  permissions?: string[]
  hasActiveShift?: boolean
  isShiftEnabled?: boolean
  onOpenShiftModal?: () => void
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

const DEFAULT_TEMPLATE: import('@oni/core').ResourceTemplate = {
  type: 'room', label: 'Phòng', icon: '🛏',
  subTypes: [{ value: 'standard', label: 'Standard' }],
  actions: { checkIn: 'Nhận phòng', checkOut: 'Trả phòng', payAndClose: 'Thanh toán & Trả phòng' },
  sections: { guestRegistration: true, bookingSource: true, bedType: true, amenities: true, overnightRate: true, depositAmount: true, surfaceType: false, expectedReturn: true },
  metaLabels: { expectedReturn: 'Dự kiến trả phòng', sessionInfo: 'Thông tin thuê', tabServices: 'Phòng & Dịch vụ' },
}

function pushOfflineAction(orderId: string, action: any) {
  if (typeof window === 'undefined') return
  const queueKey = `offline_table_actions:${orderId}`
  const queueStr = localStorage.getItem(queueKey)
  const queue = queueStr ? JSON.parse(queueStr) : []

  // Optimization: If it's a DELETE on a tempId, filter out any ADD/UPDATE for that tempId
  if (action.type === 'DELETE' && action.itemId.startsWith('temp-')) {
    const filtered = queue.filter((act: any) => act.tempId !== action.itemId && act.itemId !== action.itemId)
    localStorage.setItem(queueKey, JSON.stringify(filtered))
    return
  }

  queue.push(action)
  localStorage.setItem(queueKey, JSON.stringify(queue))
}

export function ResourceSlideOver({
  open, onClose, resource, shopId, branchId, shopName, employeeId,
  onCheckInSuccess, onSessionClosed, resourceTemplate,
  allResources = [], onRefresh, autoPrintReceipt = false,
  permissions = [],
  hasActiveShift = false,
  isShiftEnabled = false,
  onOpenShiftModal,
}: Props) {
  const tpl = resourceTemplate ?? DEFAULT_TEMPLATE
  const sec = tpl.sections
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
  const [rentalType, setRentalType] = useState<'hourly' | 'overnight'>('hourly')
  const [customerCreateModalOpen, setCustomerCreateModalOpen] = useState(false)
  const [guests, setGuests] = useState<any[]>([{
    id: Date.now(), name: '', gender: '', dob: '', id_type: 'CCCD',
    id_number: '', expiry_date: '', nationality: 'Việt Nam', address: '', note: '', is_child: false
  }])
  const [expandedGuests, setExpandedGuests] = useState<Record<number, boolean>>({})

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
  const [loadingOrder, setLoadingOrder] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [customCheckoutTime, setCustomCheckoutTime] = useState<string>('')
  const [isEditingCheckout, setIsEditingCheckout] = useState(false)
  const [checkoutInput, setCheckoutInput] = useState('')

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // --- Operations State ---
  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [transferSearch, setTransferSearch] = useState('')
  const [splitModalOpen, setSplitModalOpen] = useState(false)
  const [mergeModalOpen, setMergeModalOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [splitSelectedItems, setSplitSelectedItems] = useState<Set<string>>(new Set())
  const [transferring, setTransferring] = useState(false)

  const [editCustomerModalOpen, setEditCustomerModalOpen] = useState(false)
  const [editCustomerValue, setEditCustomerValue] = useState<LocalCustomer | null>(null)
  const [updatingCustomer, setUpdatingCustomer] = useState(false)
  const [dirtyItems, setDirtyItems] = useState<Record<string, boolean>>({})
  const [savingDirty, setSavingDirty] = useState(false)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [confirmCancelResource, setConfirmCancelResource] = useState(false)
  const [cancellingOrder, setCancellingOrder] = useState(false)
  const [variantParent, setVariantParent] = useState<LocalProduct | null>(null)
  const [modifierProduct, setModifierProduct] = useState<LocalProduct | null>(null)
  const [refundAmountInput, setRefundAmountInput] = useState('')

  const { data: settings } = useQuery({
    queryKey: ['settings', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/settings`)
      if (!res.ok) return {}
      return res.json()
    },
    enabled: !!shopId && open,
  })

  const meta = safeParse(resource.metadata)
  const isRoom = resource.type === 'room'
  const isOccupied = resource.status === 'occupied' || resource.status === 'checking_out'
  const showGuests = sec.guestRegistration && !resource.id.startsWith('takeaway')

  const fetchingRef = useRef('')

  // --- Offline Sync Actions ---
  const syncOfflineActions = useCallback(async (orderId: string) => {
    const queueKey = `offline_table_actions:${orderId}`
    const queueStr = localStorage.getItem(queueKey)
    if (!queueStr) return

    let actions = JSON.parse(queueStr)
    if (actions.length === 0) return

    console.log(`Replaying ${actions.length} offline actions for order ${orderId}`)
    const remainingActions = []

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i]
      try {
        if (action.type === 'ADD') {
          const res = await fetch(`/api/shops/${shopId}/order-items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action.item)
          })
          if (!res.ok) throw new Error()
          const savedItem = await res.json()

          const tempId = action.tempId
          const serverId = savedItem.id
          for (let j = i + 1; j < actions.length; j++) {
            if (actions[j].itemId === tempId) {
              actions[j].itemId = serverId
            }
            if (actions[j].tempId === tempId) {
              actions[j].tempId = serverId
            }
          }

          setExistingItems(prev => prev.map(item => item.id === tempId ? savedItem : item))
        } else if (action.type === 'UPDATE') {
          const res = await fetch(`/api/shops/${shopId}/order-items/${action.itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qty: action.qty, line_total: action.line_total })
          })
          if (!res.ok) throw new Error()
        } else if (action.type === 'DELETE') {
          if (!action.itemId.startsWith('temp-')) {
            const res = await fetch(`/api/shops/${shopId}/order-items/${action.itemId}`, {
              method: 'DELETE'
            })
            if (!res.ok) throw new Error()
          }
        }
      } catch (err) {
        console.error('Failed to sync action', action, err)
        remainingActions.push(action)
      }
    }

    if (remainingActions.length > 0) {
      localStorage.setItem(queueKey, JSON.stringify(remainingActions))
    } else {
      localStorage.removeItem(queueKey)
      toast.success("Đã đồng bộ thành công các món đặt tạm khi offline lên máy chủ!")
    }
  }, [shopId])

  // --- Data Loading (Occupied) ---
  const fetchOrder = useCallback(async () => {
    if (!isOccupied || !resource.current_order_id) return
    if (fetchingRef.current === resource.current_order_id) return

    fetchingRef.current = resource.current_order_id
    setLoadingOrder(true)
    const orderId = resource.current_order_id

    let oData = null
    let items: OrderItem[] = []
    let payments: any[] = []
    let isOffline = false

    try {
      // Replay offline actions before fetching
      const queueKey = `offline_table_actions:${orderId}`
      const queueStr = localStorage.getItem(queueKey)
      if (queueStr && JSON.parse(queueStr).length > 0) {
        await syncOfflineActions(orderId)
      }

      const [orderRes, itemsRes, paymentsRes] = await Promise.all([
        fetch(`/api/shops/${shopId}/orders/${orderId}`),
        fetch(`/api/shops/${shopId}/order-items?order_id=${orderId}&limit=200&t=${Date.now()}`),
        fetch(`/api/shops/${shopId}/payments?order_id=${orderId}&limit=100`),
      ])

      if (orderRes.ok) {
        oData = await orderRes.json()
        localStorage.setItem(`table_order:${orderId}`, JSON.stringify(oData))
      }
      if (itemsRes.ok) {
        const iData = await itemsRes.json()
        items = iData.data || []
        localStorage.setItem(`table_order_items:${orderId}`, JSON.stringify(items))
      }
      if (paymentsRes.ok) {
        const pData = await paymentsRes.json()
        payments = pData.data || []
        localStorage.setItem(`table_order_payments:${orderId}`, JSON.stringify(payments))
      }
    } catch (err) {
      isOffline = true
      console.warn('Offline mode or network error, falling back to local cache', err)
      const cachedOrder = localStorage.getItem(`table_order:${orderId}`)
      const cachedItems = localStorage.getItem(`table_order_items:${orderId}`)
      const cachedPayments = localStorage.getItem(`table_order_payments:${orderId}`)

      if (cachedOrder) oData = JSON.parse(cachedOrder)
      if (cachedItems) items = JSON.parse(cachedItems)
      if (cachedPayments) payments = JSON.parse(cachedPayments)
    } finally {
      setLoadingOrder(false)
    }

    if (oData) {
      setOrder(oData)
      const meta = safeParse(oData.metadata)
      if (meta.guests_list || meta.guests) setGuests(meta.guests_list || meta.guests)
      if (meta.booking_source) setBookingSource(meta.booking_source)
      if (meta.note || oData.note) setNote(meta.note || oData.note || '')
      if (meta.expected_checkout) setExpectedCheckout(meta.expected_checkout)
    }
    setExistingItems(items)
    setInstallments(payments)

    if (isOffline) {
      toast.warning("Mất kết nối mạng. Dữ liệu bàn được lấy từ bộ nhớ tạm cục bộ.")
    }
  }, [isOccupied, resource.current_order_id, shopId, syncOfflineActions])

  const handleManualRefresh = useCallback(async () => {
    // 1. Làm mới danh sách phòng phía ngoài
    onRefresh?.()
    
    // 2. Tải lại chi tiết đơn hàng nếu phòng/bàn đang được sử dụng
    if (isOccupied && resource.current_order_id) {
      fetchingRef.current = ''
      await fetchOrder()
    }
    toast.success('Đã làm mới dữ liệu')
  }, [onRefresh, isOccupied, resource.current_order_id, fetchOrder])

  const lastOpenedRef = useRef<{ id: string; open: boolean }>({ id: '', open: false })

  // Reset state when opening a new resource
  useEffect(() => {
    const justOpened = open && (!lastOpenedRef.current.open || lastOpenedRef.current.id !== resource.id)
    lastOpenedRef.current = { id: resource.id, open }

    if (justOpened) {
      setActiveTab('general')
      setCustomer(null)
      setOrder(null)
      setExistingItems([])
      setGuests([{
        id: Date.now(), name: '', gender: '', dob: '', id_type: 'CCCD',
        id_number: '', expiry_date: '', nationality: 'Việt Nam', address: '', note: '', is_child: false
      }])
      setExpandedGuests({})
      setBookingSource('Khách lẻ (Walk-in)')
      setExpectedCheckout('')
      setNote('')
      setNumGuests('1')
      setRentalType('hourly')
      setCustomerCreateModalOpen(false)
      const now = new Date()
      setCheckInTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`)

      fetchingRef.current = ''
      fetchOrder()
      setCustomCheckoutTime('')
      setIsEditingCheckout(false)
    } else if (!open) {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [open, resource.id, fetchOrder])

  // Timer logic
  useEffect(() => {
    if (!order) return
    let checkInDate = new Date(order.created_at)
    const orderMeta = safeParse(order.metadata)
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

  // Online / network restore background sync
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleOnline = () => {
      if (open && isOccupied && resource.current_order_id) {
        fetchingRef.current = ''
        fetchOrder()
      }
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [open, isOccupied, resource.current_order_id, fetchOrder])

  const orderMeta = order ? safeParse(order.metadata) : null

  // Calculate Time Charge
  const hourlyRate = Number(resource.hourly_rate) || 0
  const activeRentalType = orderMeta?.rental_type || 'hourly'
  let billableHours = 0
  let timeCharge = 0
  let durationLabel = fmtDuration(elapsed)
  let detailsLabel = ''

  if (order) {
    if (activeRentalType === 'overnight') {
      const overnightRate = Number(orderMeta?.overnight_rate) || Number(safeParse(resource.metadata).overnight_rate) || 0
      billableHours = 1
      timeCharge = overnightRate
      durationLabel = 'Qua đêm'
      detailsLabel = 'Trọn gói qua đêm'
    } else if (hourlyRate > 0) {
      let checkInDate = new Date(order.created_at)
      if (orderMeta?.check_in) {
        checkInDate = new Date(orderMeta.check_in)
      } else if (orderMeta?.check_in_time) {
        const [hh, mm] = orderMeta.check_in_time.split(':').map(Number)
        checkInDate.setHours(hh, mm, 0, 0)
      }

      const pricingResult = calculateHourlyBilling({
        checkIn: checkInDate,
        checkOut: customCheckoutTime ? new Date(customCheckoutTime) : new Date(),
        standardRate: hourlyRate,
        config: orderMeta?.advanced_pricing || safeParse(resource.metadata).advanced_pricing
      })

      billableHours = pricingResult.billableQty
      timeCharge = pricingResult.totalAmount
      durationLabel = pricingResult.durationLabel
      detailsLabel = pricingResult.detailsLabel
    }
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

      const resourceMeta = safeParse(resource.metadata)
      const advPricing = resourceMeta.advanced_pricing

      const checkInMeta = {
        resource_id: resource.id,
        resource_name: resource.name,
        check_in: checkInDate.toISOString(),
        num_guests: numGuests,
        expected_checkout: expectedCheckout,
        customer_phone: customer?.phone || '',
        guests: showGuests ? activeGuests : undefined,
        guests_list: showGuests ? activeGuests : undefined,
        note: note,
        advanced_pricing: advPricing,
        rental_type: rentalType,
        overnight_rate: resourceMeta.overnight_rate,
        weekend_rate: resourceMeta.weekend_rate,
        room_class: resourceMeta.room_class,
        bed_type: resourceMeta.bed_type,
      }

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
          metadata: JSON.stringify(checkInMeta)
        }),
      })

      if (!res.ok) throw new Error('Lỗi tạo phiên')
      const createdOrder = await res.json()
      const orderId = createdOrder.id || createdOrder.order_id

      await fetch(`/api/shops/${shopId}/location-resources/${resource.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'occupied',
          current_order_id: orderId,
          metadata: JSON.stringify(checkInMeta)
        }),
      })

      // Bypass double loading by seeding state
      fetchingRef.current = orderId
      setOrder({
        ...createdOrder,
        metadata: JSON.stringify(checkInMeta)
      })
      setExistingItems([])
      setInstallments([])

      toast.success(`${tpl.actions.checkIn}: ${resource.name}`)
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
        guests: showGuests ? validGuests : undefined,
        guests_list: showGuests ? validGuests : undefined,
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

      try {
        await fetch(`/api/shops/${shopId}/location-resources/${resource.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metadata: JSON.stringify(newMeta)
          })
        })
      } catch (err) {
        console.warn('Lỗi đồng bộ metadata vị trí:', err)
      }

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

  function getSig(i: any) {
    const l = i.variant_label || ''
    const m = typeof i.modifiers === 'string' ? i.modifiers : JSON.stringify(i.modifiers || [])
    return `${i.product_id}|${l}|${m}`
  }

  async function handleAddCartItem(item: CartItem) {
    if (!order) {
      toast.error('Vui lòng Bắt đầu sử dụng (mở bàn) trước khi gọi món')
      return
    }

    const unitPrice = Number(item.unit_price) + (item.modifier_total || 0)
    const sig = getSig(item)

    const existingInDb = existingItems.find(i => getSig(i) === sig)
    if (existingInDb) {
      const newQty = Number(existingInDb.qty) + item.qty
      const newLineTotal = newQty * unitPrice

      const updatedItems = existingItems.map(i => getSig(i) === sig ? {
        ...i,
        qty: String(newQty),
        line_total: String(newLineTotal)
      } : i)

      setExistingItems(updatedItems)

      try {
        const res = await fetch(`/api/shops/${shopId}/order-items/${existingInDb.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qty: String(newQty), line_total: String(newLineTotal) })
        })
        if (!res.ok) throw new Error()

        toast.success(`Đã cập nhật: ${item.product_name} (x${newQty})`)
        localStorage.setItem(`table_order_items:${order.id}`, JSON.stringify(updatedItems))
      } catch (err) {
        pushOfflineAction(order.id, { type: 'UPDATE', itemId: existingInDb.id, qty: String(newQty), line_total: String(newLineTotal) })
        toast.warning(`Mất kết nối. Đã lưu tạm số lượng mới (x${newQty}) cho ${item.product_name} trên thiết bị này.`)
        localStorage.setItem(`table_order_items:${order.id}`, JSON.stringify(updatedItems))
      }
      return
    }

    // Auto-save new item immediately
    const tempId = `temp-${Date.now()}`
    const newItem = {
      order_id: order.id,
      order_no: order.order_no || '',
      line_no: String(existingItems.length + 1),
      product_id: item.product_id,
      sku: item.sku || '',
      product_name: item.product_name,
      qty: String(item.qty),
      unit_price: String(item.unit_price),
      line_total: String(unitPrice * item.qty),
      line_discount: '0',
      variant_label: item.variant_label || '',
      modifiers: typeof item.modifiers === 'string' ? item.modifiers : JSON.stringify(item.modifiers || []),
      modifier_total: String(item.modifier_total || 0)
    }

    const updatedItems = [...existingItems, { ...newItem, id: tempId }]
    setExistingItems(updatedItems)

    try {
      const res = await fetch(`/api/shops/${shopId}/order-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem)
      })
      if (!res.ok) throw new Error()

      const savedItem = await res.json()
      const finalizedItems = updatedItems.map(i => i.id === tempId ? savedItem : i)
      setExistingItems(finalizedItems)
      toast.success(`Đã thêm ${item.product_name}`)
      localStorage.setItem(`table_order_items:${order.id}`, JSON.stringify(finalizedItems))
    } catch {
      pushOfflineAction(order.id, { type: 'ADD', tempId, item: newItem })
      toast.warning(`Mất kết nối. Đã lưu tạm ${item.product_name} trên thiết bị này.`)
      localStorage.setItem(`table_order_items:${order.id}`, JSON.stringify(updatedItems))
    }
  }

  async function handleProductSelect(p: LocalProduct) {
    const type = (p as any).product_type ?? 'simple'
    if (type === 'variant_parent') {
      setVariantParent(p)
      return
    }
    if (type === 'modifier') {
      setModifierProduct(p)
      return
    }
    handleAddCartItem({
      product_id: p.product_id,
      product_name: p.name,
      sku: p.sku || '',
      qty: 1,
      unit_price: Number(p.sell_price || 0),
      cost_price: Number(p.cost_price || 0),
      discount_amount: 0,
      line_total: Number(p.sell_price || 0),
    })
  }

  async function handleAdjustExistingQty(idx: number, delta: number) {
    if (!order) return
    const clone = [...existingItems]
    const currQty = Number(clone[idx].qty)
    const newQty = currQty + delta

    if (newQty <= 0) {
      setConfirmDeleteId(clone[idx].id!)
      return
    }

    const p = clone[idx]
    const up = Number(p.unit_price)
    const newLineTotal = newQty * up
    clone[idx] = { ...p, qty: String(newQty), line_total: String(newLineTotal) }
    setExistingItems(clone)
    localStorage.setItem(`table_order_items:${order.id}`, JSON.stringify(clone))

    try {
      const res = await fetch(`/api/shops/${shopId}/order-items/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qty: String(newQty), line_total: String(newLineTotal) })
      })
      if (!res.ok) throw new Error()
      toast.success(`Đã cập nhật: ${p.product_name} (x${newQty})`)

      const itemsRes = await fetch(`/api/shops/${shopId}/order-items?order_id=${order.id}&limit=200&t=${Date.now()}`)
      if (itemsRes.ok) {
        const iData = await itemsRes.json()
        setExistingItems(iData.data || [])
        localStorage.setItem(`table_order_items:${order.id}`, JSON.stringify(iData.data || []))
      }
    } catch {
      pushOfflineAction(order.id, { type: 'UPDATE', itemId: p.id, qty: String(newQty), line_total: String(newLineTotal) })
      toast.warning(`Mất kết nối. Đã lưu tạm số lượng mới (x${newQty}) cho ${p.product_name} trên thiết bị này.`)
    }
  }



  async function handleSaveDirtyItems() {
    if (!order) return
    const dirtyIds = Object.keys(dirtyItems)
    if (dirtyIds.length === 0) return
    setSavingDirty(true)
    try {
      for (const id of dirtyIds) {
        const item = existingItems.find(i => i.id === id)
        if (item) {
          if (Number(item.qty) <= 0) {
            await fetch(`/api/shops/${shopId}/order-items/${id}`, { method: 'DELETE' })
          } else {
            await fetch(`/api/shops/${shopId}/order-items/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ qty: String(item.qty), line_total: String(item.line_total) })
            })
          }
        }
      }
      toast.success('Đã cập nhật số lượng')
      setDirtyItems({})
      const itemsRes = await fetch(`/api/shops/${shopId}/order-items?order_id=${order.id}&limit=200&t=${Date.now()}`)
      if (itemsRes.ok) {
        const iData = await itemsRes.json()
        setExistingItems(iData.data || [])
      }
    } catch {
      toast.error('Lỗi khi lưu cập nhật')
    } finally {
      setSavingDirty(false)
    }
  }
  async function handleCancelOrder() {
    if (!order) return
    if (!permissions.includes('orders.delete')) {
      toast.error('Bạn không có quyền hủy đơn hàng')
      return
    }
    setCancellingOrder(true)
    try {
      const payload: any = { reason: `Hủy ${tpl.label.toLowerCase()} chưa thanh toán` }
      if (refundAmountInput) {
        payload.refund_amount = refundAmountInput.replace(/\D/g, '')
      }

      const res = await fetch(`/api/shops/${shopId}/orders/${order.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || `Lỗi khi hủy ${tpl.label.toLowerCase()}`)
      }

      if (!resource.id.startsWith('takeaway')) {
        try {
          await fetch(`/api/shops/${shopId}/location-resources/${resource.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'available', current_order_id: '' }),
          })
        } catch (err) {
          console.error('Lỗi khi giải phóng bàn:', err)
        }
      }

      toast.success(`Đã hủy ${tpl.label.toLowerCase()}`)
      setConfirmCancelResource(false)
      onSessionClosed()
      if (onRefresh) onRefresh()
      onClose()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setCancellingOrder(false)
    }
  }



  async function handleDeleteExistingItem(itemId: string) {
    if (!order) return
    setDeletingItemId(itemId)

    const updatedItems = existingItems.filter(i => i.id !== itemId)
    setExistingItems(updatedItems)
    localStorage.setItem(`table_order_items:${order.id}`, JSON.stringify(updatedItems))

    setDirtyItems(prev => {
      const newD = { ...prev }
      delete newD[itemId]
      return newD
    })

    try {
      if (itemId.startsWith('temp-')) {
        pushOfflineAction(order.id, { type: 'DELETE', itemId })
        toast.success('Đã xóa món đặt tạm')
      } else {
        const res = await fetch(`/api/shops/${shopId}/order-items/${itemId}`, { method: 'DELETE' })
        if (!res.ok) throw new Error()
        toast.success('Đã xóa món')
      }
    } catch {
      pushOfflineAction(order.id, { type: 'DELETE', itemId })
      toast.warning('Mất kết nối. Đã xóa món tạm thời trên thiết bị này.')
    } finally {
      setDeletingItemId(null)
      setConfirmDeleteId(null)
    }
  }

  async function handlePayAndCloseClick() {
    if (!order) return
    if (isShiftEnabled && !hasActiveShift) {
      toast.error('Vui lòng mở ca làm việc trước khi thanh toán!')
      onOpenShiftModal?.()
      return
    }
    const queueKey = `offline_table_actions:${order.id}`
    const queueStr = localStorage.getItem(queueKey)
    if (queueStr) {
      const actions = JSON.parse(queueStr)
      if (actions.length > 0) {
        toast.info("Đang đồng bộ các món đã gọi trước khi thanh toán...")
        try {
          await syncOfflineActions(order.id)
          const remainingStr = localStorage.getItem(queueKey)
          if (remainingStr && JSON.parse(remainingStr).length > 0) {
            toast.error("Không thể đồng bộ toàn bộ món ăn lên hệ thống. Vui lòng kiểm tra kết nối mạng trước khi thanh toán.")
            return
          }
        } catch {
          toast.error("Không thể đồng bộ lên hệ thống. Vui lòng kiểm tra kết nối mạng trước khi thanh toán.")
          return
        }
      }
    }
    setCheckoutOpen(true)
  }

  async function handleCheckoutSuccess() {
    if (!resource.id.startsWith('takeaway')) {
      try {
        await fetch(`/api/shops/${shopId}/location-resources/${resource.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: settings?.skip_cleaning_process ? 'available' : 'dirty', current_order_id: '' }),
        })
      } catch {
        // ignore
      }
    }
    setCheckoutOpen(false)
    onSessionClosed()
    onClose()
  }

  async function handleRequestCheckout() {
    if (!order) return
    const nowStr = new Date().toISOString()
    const currentMeta = orderMeta || {}
    currentMeta.actual_checkout_requested_at = nowStr
    
    try {
      // 1. Update order metadata
      const orderRes = await fetch(`/api/shops/${shopId}/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadata: JSON.stringify(currentMeta)
        })
      })
      
      if (orderRes.ok) {
        // 2. Update resource status to checking_out
        await fetch(`/api/shops/${shopId}/location-resources/${resource.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'checking_out' }),
        })
        toast.success('Đã khóa giờ tính tiền & báo kiểm phòng!')
        fetchOrder()
        onRefresh?.()
      } else {
        toast.error('Lỗi khi khóa giờ checkout')
      }
    } catch {
      toast.error('Lỗi kết nối khi khóa giờ checkout')
    }
  }

  async function handleTransfer(targetId: string) {
    if (!order || !resource.current_order_id) return
    const targetResource = allResources.find(r => r.id === targetId)
    const confirmed = await confirm({
      title: 'Xác nhận chuyển',
      description: `Bạn có chắc chắn muốn chuyển sang ${targetResource?.name}?`,
      variant: 'default',
    })
    if (!confirmed) return

    setTransferring(true)
    try {
      // 1. Release current resource
      await fetch(`/api/shops/${shopId}/location-resources/${resource.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: settings?.skip_cleaning_process ? 'available' : 'dirty', current_order_id: '' }),
      })
      // 2. Occupy target resource
      await fetch(`/api/shops/${shopId}/location-resources/${targetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'occupied', current_order_id: order.id }),
      })
      // 3. Update order metadata
      const newOrderMeta = { ...(safeParse(order.metadata)), resource_id: targetId, resource_name: targetResource?.name }
      const res = await fetch(`/api/shops/${shopId}/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: JSON.stringify(newOrderMeta) }),
      })
      if (!res.ok) throw new Error()

      toast.success(`Đã chuyển sang ${targetResource?.name}`)
      setTransferModalOpen(false)
      fetchingRef.current = ''
      onRefresh?.()
      onClose()
    } catch {
      toast.error('Lỗi khi chuyển')
    } finally {
      setTransferring(false)
    }
  }

  async function handleSplit(targetId: string) {
    if (!order || !resource.current_order_id) return
    if (splitSelectedItems.size === 0) { toast.error('Vui lòng chọn ít nhất 1 món để tách'); return }
    setTransferring(true)
    const targetResource = allResources.find(r => r.id === targetId)

    // Separate items
    const remainingItems = existingItems.filter(it => !splitSelectedItems.has(it.id!))
    const itemsToMove = existingItems.filter(it => splitSelectedItems.has(it.id!))

    try {
      // 1. Update old order (sync-batch)
      const oldSubtotal = remainingItems.reduce((acc, it) => acc + Number(it.line_total), 0)
      await fetch(`/api/shops/${shopId}/orders/sync-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order: { ...order, subtotal: String(oldSubtotal), total_amount: String(oldSubtotal) },
          items: remainingItems,
          payments: [] // keep payments as is
        })
      })

      // 2. Create new order
      const newOrderMeta = {
        resource_id: targetId,
        resource_name: targetResource?.name,
        check_in: new Date().toISOString()
      }
      const newSubtotal = itemsToMove.reduce((acc, it) => acc + Number(it.line_total), 0)

      const createRes = await fetch(`/api/shops/${shopId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'in_progress',
          customer_name: order.customer_name || 'Khách lẻ',
          branch_id: branchId,
          employee_id: employeeId,
          subtotal: String(newSubtotal),
          total_amount: String(newSubtotal),
          paid_amount: '0',
          metadata: JSON.stringify(newOrderMeta)
        })
      })
      const newOrder = await createRes.json()

      // 3. Add items to new order
      for (const item of itemsToMove) {
        await fetch(`/api/shops/${shopId}/order-items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: newOrder.id,
            order_no: newOrder.order_no || '',
            product_id: item.product_id,
            sku: item.sku,
            product_name: item.product_name,
            qty: String(item.qty),
            unit_price: String(item.unit_price),
            line_total: String(item.line_total),
          })
        })
      }

      // 4. Occupy target resource
      await fetch(`/api/shops/${shopId}/location-resources/${targetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'occupied', current_order_id: newOrder.id }),
      })

      toast.success(`Đã tách sang ${targetResource?.name}`)
      setSplitModalOpen(false)
      setSplitSelectedItems(new Set())
      fetchingRef.current = ''
      fetchOrder()
      onRefresh?.()
    } catch {
      toast.error('Lỗi khi tách')
    } finally {
      setTransferring(false)
    }
  }

  async function handleMerge(sourceId: string) {
    if (!order || !resource.current_order_id) return
    setTransferring(true)
    const sourceResource = allResources.find(r => r.id === sourceId)
    if (!sourceResource?.current_order_id) return

    try {
      // 1. Fetch source order items
      const itemsRes = await fetch(`/api/shops/${shopId}/order-items?order_id=${sourceResource.current_order_id}&limit=200&t=${Date.now()}`)
      if (!itemsRes.ok) throw new Error()
      const itemsJson = await itemsRes.json()
      const sourceItems = itemsJson.data || []

      // 2. Add source items to current order
      const combinedItems = [...existingItems]
      for (const item of sourceItems) {
        const payload = {
          order_id: order.id,
          order_no: order.order_no || '',
          product_id: item.product_id,
          sku: item.sku,
          product_name: item.product_name,
          qty: String(item.qty),
          unit_price: String(item.unit_price),
          line_total: String(item.line_total),
        }
        await fetch(`/api/shops/${shopId}/order-items`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        })
        combinedItems.push(payload as any)
      }

      // 3. Update current order totals
      const newSubtotal = combinedItems.reduce((acc, it) => acc + Number(it.line_total), 0)
      const mergeRes = await fetch(`/api/shops/${shopId}/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtotal: String(newSubtotal), total_amount: String(newSubtotal) })
      })
      if (!mergeRes.ok) throw new Error()

      // 4. Cancel source order
      await fetch(`/api/shops/${shopId}/orders/${sourceResource.current_order_id}/cancel`, { method: 'POST' })

      // 5. Release source resource
      await fetch(`/api/shops/${shopId}/location-resources/${sourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: settings?.skip_cleaning_process ? 'available' : 'dirty', current_order_id: '' }),
      })

      toast.success(`Đã gộp từ ${sourceResource.name}`)
      setMergeModalOpen(false)
      fetchingRef.current = ''
      fetchOrder()
      onRefresh?.()
    } catch {
      toast.error('Lỗi khi gộp')
    } finally {
      setTransferring(false)
    }
  }

  async function handleUpdateCustomer() {
    if (!order) return
    setUpdatingCustomer(true)
    try {
      const newMeta = { ...orderMeta, customer_phone: editCustomerValue?.phone || '' }
      const res = await fetch(`/api/shops/${shopId}/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: editCustomerValue?.customer_id?.startsWith('virtual:') ? '' : (editCustomerValue?.customer_id || ''),
          customer_name: editCustomerValue?.name || 'Khách lẻ',
          metadata: JSON.stringify(newMeta)
        })
      })
      if (!res.ok) throw new Error()

      toast.success('Đã cập nhật khách hàng')
      setEditCustomerModalOpen(false)
      fetchingRef.current = ''
      fetchOrder()
      onRefresh?.()
    } catch {
      toast.error('Lỗi khi cập nhật')
    } finally {
      setUpdatingCustomer(false)
    }
  }

  const buildCheckoutItems = () => {
    const items: any[] = [...existingItems].map(it => {
      let parsedModifiers = (it as any).modifiers
      if (typeof parsedModifiers === 'string' && parsedModifiers.startsWith('[')) {
        try {
          parsedModifiers = JSON.parse(parsedModifiers)
        } catch {
          parsedModifiers = []
        }
      }
      return {
        product_id: it.product_id,
        product_name: it.product_name,
        sku: it.sku || '',
        qty: Number(it.qty),
        unit_price: Number(it.unit_price),
        cost_price: Number(it.cost_price ?? 0),
        discount_amount: Number(it.discount_amount ?? 0),
        line_total: Number(it.line_total),
        variant_label: (it as any).variant_label,
        modifiers: parsedModifiers,
        modifier_total: Number((it as any).modifier_total ?? 0),
      }
    })
    if (timeCharge > 0) {
      items.push({
        product_id: 'TIME_CHARGE',
        product_name: activeRentalType === 'overnight' ? 'Tiền phòng (Qua đêm)' : `Tiền giờ sử dụng (${durationLabel})`,
        sku: 'TIME_CHARGE',
        qty: 1,
        unit_price: timeCharge,
        cost_price: 0,
        discount_amount: 0,
        line_total: timeCharge,
      })
    }
    return items
  }

  return (
    <>
      {/* Overlay */}
      <div
        className={[
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 !m-0',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`fixed inset-y-0 right-0 z-50 w-full max-w-[800px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out !m-0 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-lg ${isOccupied ? 'bg-red-50 text-red-500' : 'bg-primary/10 text-primary'}`}>
              {resource.id.startsWith('takeaway') ? '🛍' : tpl.icon}
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
          <div className="flex items-center gap-2">
            {!isOccupied && !resource.id.startsWith('takeaway') && (resource.status === 'available' || resource.status === 'inspected') && (
              <button
                onClick={async () => {
                  try {
                    await fetch(`/api/shops/${shopId}/location-resources/${resource.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: 'dirty', current_order_id: '' }),
                    })
                    toast.success(`Đã báo bẩn phòng ${resource.name}`)
                    onRefresh?.()
                    onClose()
                  } catch {
                    toast.error('Lỗi khi cập nhật trạng thái phòng')
                  }
                }}
                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100 transition-colors shadow-sm"
              >
                Báo bẩn (Dirty)
              </button>
            )}
            {isOccupied && !resource.id.startsWith('takeaway') && (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  Thao tác
                  <svg className={`w-3 h-3 transition-transform ${menuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40 !m-0" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1.5 w-44 rounded-xl border border-slate-100 bg-white shadow-xl z-50 overflow-hidden py-1">
                      <button
                        onClick={() => { setTransferModalOpen(true); setMenuOpen(false) }}
                        className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <span className="text-base leading-none">🔄</span> Chuyển {tpl.label.toLowerCase()}
                      </button>
                      <button
                        onClick={() => { setSplitModalOpen(true); setMenuOpen(false) }}
                        className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <span className="text-base leading-none">✂️</span> Tách {tpl.label.toLowerCase()}
                      </button>
                      <button
                        onClick={() => { setMergeModalOpen(true); setMenuOpen(false) }}
                        className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <span className="text-base leading-none">🔗</span> Gộp {tpl.label.toLowerCase()}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <button
              onClick={handleManualRefresh}
              className={`rounded-xl p-2 hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors ${(loadingOrder || saving) ? 'animate-spin' : ''}`}
              title="Làm mới dữ liệu"
              disabled={loadingOrder || saving}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
            <button onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100 text-slate-400">✕</button>
          </div>
        </div>

        {/* Content Area */}
        {!isOccupied && showGuests && (
          <div className="px-5 border-b border-slate-100 flex gap-6 shrink-0 bg-white">
            <button
              onClick={() => setActiveTab('general')}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'general' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
            >
              Thông tin chung
            </button>
            <button
              onClick={() => setActiveTab('guests')}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'guests' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
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
              {(!showGuests || activeTab === 'general') && (
                <>
                  {/* Customer */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">Khách hàng</p>
                      {(!customer || customer.customer_id === 'C-DEFAULT-RETAIL') && (
                        <span className="text-xs text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded">Mặc định: Khách lẻ</span>
                      )}
                    </div>
                    <CustomerSearch shopId={shopId} selected={customer} onSelect={handleCustomerSelect} onOpenCustomerModal={() => setCustomerCreateModalOpen(true)} />
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

                  {/* Rental Type Segment Toggle */}
                  {meta.overnight_rate && (
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide">Hình thức thuê</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setRentalType('hourly')}
                          className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center ${rentalType === 'hourly'
                            ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                            : 'border-slate-200 text-slate-500 bg-white hover:border-slate-300'
                            }`}
                        >
                          ⏱️ Theo giờ
                        </button>
                        <button
                          type="button"
                          onClick={() => setRentalType('overnight')}
                          className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center ${rentalType === 'overnight'
                            ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                            : 'border-slate-200 text-slate-500 bg-white hover:border-slate-300'
                            }`}
                        >
                          🌙 Qua đêm ({Number(meta.overnight_rate).toLocaleString('vi-VN')}₫)
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Fee preview */}
                  {(rentalType === 'hourly' ? (Number(resource.hourly_rate) > 0 || meta.advanced_pricing?.enabled) : !!meta.overnight_rate) && (
                    <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs text-blue-800 space-y-2.5">
                      <p className="font-bold text-[11px] uppercase tracking-wide text-blue-900">
                        {rentalType === 'hourly' ? '⏱️ DỰ TÍNH PHÍ THEO GIỜ:' : '🌙 DỰ TÍNH PHÍ QUA ĐÊM:'}
                      </p>

                      {rentalType === 'hourly' ? (
                        <div className="space-y-2.5">
                          <div className="space-y-1.5 border-b border-blue-100/50 pb-2">
                            {meta.advanced_pricing?.enabled ? (
                              <>
                                <div className="flex justify-between">
                                  <span className="font-medium">Block đầu ({meta.advanced_pricing.base_hours}h):</span>
                                  <span className="font-bold text-blue-900">{Number(meta.advanced_pricing.base_price).toLocaleString('vi-VN')}₫</span>
                                </div>
                                {meta.advanced_pricing.next_hourly_rate && (
                                  <div className="flex justify-between">
                                    <span className="font-medium">Giờ tiếp theo mặc định:</span>
                                    <span className="font-bold text-blue-900">{Number(meta.advanced_pricing.next_hourly_rate).toLocaleString('vi-VN')}₫/h</span>
                                  </div>
                                )}
                                {Number(meta.advanced_pricing.grace_minutes) > 0 && (
                                  <div className="flex justify-between text-blue-700/80 italic text-[11px]">
                                    <span>Thời gian quá giờ cho phép (Grace):</span>
                                    <span>{meta.advanced_pricing.grace_minutes} phút</span>
                                  </div>
                                )}
                              </>
                            ) : (
                              Number(resource.hourly_rate) > 0 && (
                                <div className="flex justify-between">
                                  <span className="font-medium">Giá theo giờ phẳng:</span>
                                  <span className="font-bold text-blue-900">{Number(resource.hourly_rate).toLocaleString('vi-VN')}₫/h</span>
                                </div>
                              )
                            )}
                          </div>

                          {meta.advanced_pricing?.enabled && meta.advanced_pricing.progressive_rates && Object.keys(meta.advanced_pricing.progressive_rates).length > 0 && (
                            <div className="space-y-2">
                              <p className="font-semibold text-blue-800 text-[10px] uppercase tracking-wider">Bảng giá lũy tiến giờ tiếp theo</p>
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {Object.entries(meta.advanced_pricing.progressive_rates)
                                  .sort((a, b) => Number(a[0]) - Number(b[0]))
                                  .map(([hour, rate]) => (
                                    <div
                                      key={hour}
                                      className="inline-flex items-center gap-1 bg-blue-100/60 text-blue-800 rounded-lg px-2.5 py-1 font-medium text-[11px] border border-blue-200/40"
                                    >
                                      <span>Giờ thứ {hour}:</span>
                                      <span className="font-bold text-blue-900">{Number(rate).toLocaleString('vi-VN')}₫</span>
                                    </div>
                                  ))
                                }
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        meta.overnight_rate && (
                          <div className="flex justify-between py-1">
                            <span className="font-medium">Giá thuê qua đêm:</span>
                            <span className="font-bold text-blue-900">{Number(meta.overnight_rate).toLocaleString('vi-VN')}₫/đêm</span>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </>
              )}

              {showGuests && activeTab === 'guests' && (
                <div className="space-y-4">
                  {guests.map((g, idx) => {
                    const isExpanded = expandedGuests[idx] !== undefined ? expandedGuests[idx] : (!g.name && !g.id_number)
                    if (!isExpanded) {
                      return (
                        <div key={g.id} className="flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-650">{idx + 1}</span>
                            <span className="text-sm font-semibold text-slate-800 truncate">
                              {g.name || 'Chưa nhập tên'} <span className="text-xs font-normal text-slate-500">({g.id_type || 'CCCD'}: {g.id_number || 'Chưa nhập'})</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-auto pl-4">
                            <button
                              type="button"
                              onClick={() => setExpandedGuests(prev => ({ ...prev, [idx]: true }))}
                              className="text-xs font-bold text-primary hover:text-primary-dark transition-colors cursor-pointer"
                            >
                              Sửa
                            </button>
                            <span className="text-slate-300 text-xs select-none">|</span>
                            <button
                              type="button"
                              onClick={() => {
                                setGuests(guests.filter((_, i) => i !== idx))
                                setExpandedGuests(prev => {
                                  const next = { ...prev }
                                  delete next[idx]
                                  return next
                                })
                              }}
                              className="text-xs font-bold text-red-500 hover:text-red-750 transition-colors cursor-pointer"
                            >
                              Xóa
                            </button>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div key={g.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 relative shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{idx + 1}</span>
                            <span className="text-sm font-semibold text-slate-800">Thông tin khách hàng {idx + 1}</span>
                          </div>
                          <div className="flex items-center gap-3 ml-auto">
                            {g.name && (
                              <button
                                type="button"
                                onClick={() => setExpandedGuests(prev => ({ ...prev, [idx]: false }))}
                                className="text-xs font-bold text-slate-500 hover:text-slate-705 transition-colors cursor-pointer"
                              >
                                Thu gọn
                              </button>
                            )}
                            {g.name && <span className="text-slate-300 text-xs select-none">|</span>}
                            <button
                              type="button"
                              onClick={() => {
                                setGuests(guests.filter((_, i) => i !== idx))
                                setExpandedGuests(prev => {
                                  const next = { ...prev }
                                  delete next[idx]
                                  return next
                                })
                              }}
                              className="text-xs font-bold text-red-500 hover:text-red-755 transition-colors cursor-pointer"
                            >
                              Xóa
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-slate-600 mb-1">Họ và tên</label>
                            <input type="text" value={g.name} onChange={e => {
                              const newG = [...guests]; newG[idx].name = e.target.value; setGuests(newG);
                            }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white text-slate-800" placeholder="Nhập tên khách..." />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Loại giấy tờ</label>
                            <select value={g.id_type} onChange={e => {
                              const newG = [...guests]; newG[idx].id_type = e.target.value; setGuests(newG);
                            }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white text-slate-800">
                              <option value="CCCD">CCCD/CMND</option>
                              <option value="Passport">Hộ chiếu</option>
                              <option value="Other">Khác</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Số giấy tờ</label>
                            <input type="text" value={g.id_number} onChange={e => {
                              const newG = [...guests]; newG[idx].id_number = e.target.value; setGuests(newG);
                            }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white text-slate-800" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Ngày hết hạn</label>
                            <input type="date" value={g.expiry_date || ''} onChange={e => {
                              const newG = [...guests]; newG[idx].expiry_date = e.target.value; setGuests(newG);
                            }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white text-slate-800" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Quốc tịch</label>
                            <input type="text" value={g.nationality} onChange={e => {
                              const newG = [...guests]; newG[idx].nationality = e.target.value; setGuests(newG);
                            }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white text-slate-800" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Ngày sinh</label>
                            <input type="date" value={g.dob || ''} onChange={e => {
                              const newG = [...guests]; newG[idx].dob = e.target.value; setGuests(newG);
                            }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white text-slate-800" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Giới tính</label>
                            <select value={g.gender || ''} onChange={e => {
                              const newG = [...guests]; newG[idx].gender = e.target.value; setGuests(newG);
                            }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white text-slate-800">
                              <option value="">-- Chọn --</option>
                              <option value="Nam">Nam</option>
                              <option value="Nữ">Nữ</option>
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-slate-600 mb-1">Ghi chú</label>
                            <input type="text" value={g.note || ''} onChange={e => {
                              const newG = [...guests]; newG[idx].note = e.target.value; setGuests(newG);
                            }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white text-slate-800" placeholder="Ghi chú thêm (địa chỉ, lưu ý...)" />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <button onClick={() => setGuests([...guests, { id: Date.now(), name: '', id_type: 'CCCD', id_number: '', expiry_date: '', nationality: 'Việt Nam', dob: '', gender: '', address: '', note: '' }])} className="w-full rounded-xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500 hover:border-primary hover:text-primary transition-colors bg-white">
                    + Thêm khách lưu trú
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* --- OCCUPIED STATE (MANAGE) --- */
            <div className="flex h-full flex-col">
              {/* Header Tabs */}
              {showGuests && (
                <div className="flex items-center gap-6 border-b border-slate-100 px-5 pt-2 mb-4 shrink-0">
                  <button
                    onClick={() => setActiveTab('general')}
                    className={`border-b-2 py-3 text-sm font-medium transition-colors ${activeTab === 'general' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    {tpl.metaLabels.tabServices}
                  </button>
                  <button
                    onClick={() => setActiveTab('guests')}
                    className={`border-b-2 py-3 text-sm font-medium transition-colors ${activeTab === 'guests' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    Khách lưu trú {guests.length > 0 ? `(${guests.length})` : ''}
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-5 pb-5">
                <div className="space-y-6">
                  {activeTab === 'general' && (
                    <>
                      <div className="flex flex-col gap-6">

                        {/* TOP SECTION: Grid 2 columns */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Khách hàng */}
                          <div className={['rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-center', resource.id.startsWith('takeaway') ? 'col-span-2' : ''].join(' ')}>
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                  <p className="text-xs text-slate-500">Khách hàng</p>
                                  <button
                                    onClick={() => {
                                      setEditCustomerValue((order?.customer_name && order.customer_name !== 'Khách lẻ') ? {
                                        customer_id: order.customer_id || '',
                                        name: order.customer_name,
                                        phone: orderMeta?.customer_phone || ''
                                      } : null)
                                      setEditCustomerModalOpen(true)
                                    }}
                                    className="text-[10px] font-semibold text-primary hover:underline"
                                  >
                                    Thay đổi
                                  </button>
                                </div>
                                {loadingOrder ? (
                                  <div className="h-5 w-32 bg-slate-200 rounded animate-pulse mt-1" />
                                ) : (
                                  <p className="text-sm font-bold text-slate-900">
                                    {order?.customer_name || 'Khách lẻ'}
                                    {orderMeta?.customer_phone && <span className="font-normal text-slate-500 ml-1">({orderMeta.customer_phone})</span>}
                                  </p>
                                )}
                              </div>
                              {!resource.id.startsWith('takeaway') && (
                                <div className="text-right">
                                  <p className="text-xs text-slate-500 mb-0.5">Đã sử dụng</p>
                                  {loadingOrder ? (
                                    <div className="h-5 w-16 bg-slate-200 rounded animate-pulse ml-auto" />
                                  ) : (
                                    <p className="text-sm font-bold text-slate-900">{fmtDuration(elapsed)}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          {/* Giờ vào ra */}
                          {!resource.id.startsWith('takeaway') && (
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-center">
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
                                  <span className="text-xs font-medium text-slate-600">Tiền giờ ({detailsLabel || `${billableHours}h`})</span>
                                  <span className="text-sm font-bold text-slate-900">{fmtVND(timeCharge)}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* RIGHT COLUMN: Order Items */}
                        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <p className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Sản phẩm/Dịch vụ</p>

                          <div className="mb-4 shrink-0">
                            <SlideProductSearch onSelect={handleProductSelect} />
                          </div>

                          <div className="space-y-3 flex-1 overflow-y-auto">
                            {loadingOrder && (
                              <div className="space-y-2">
                                <div className="h-16 w-full bg-slate-100 rounded-xl animate-pulse" />
                                <div className="h-16 w-full bg-slate-100 rounded-xl animate-pulse" />
                              </div>
                            )}
                            {!loadingOrder && existingItems.length === 0 && (
                              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
                                Chưa gọi món nào
                              </div>
                            )}

                            {/* Existing items */}
                            {existingItems.map((item, idx) => (
                              <div key={item.id || `ex-${idx}`} className={`rounded-xl border p-3 flex justify-between items-center transition-colors ${dirtyItems[item.id!] ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-100'}`}>
                                <div className="min-w-0 flex-1 flex items-center gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-900 truncate leading-tight">{item.product_name}</p>
                                    {/* Variant label */}
                                    {(item as any).variant_label && !((item as any).modifiers?.length > 2) && (
                                      <p className="text-[11px] text-violet-600 font-medium truncate mt-0.5">{(item as any).variant_label}</p>
                                    )}
                                    {/* Modifier summary */}
                                    {typeof (item as any).modifiers === 'string' && (item as any).modifiers.startsWith('[') && JSON.parse((item as any).modifiers).length > 0 && (
                                      <p className="text-[11px] text-amber-600 truncate mt-0.5">
                                        {JSON.parse((item as any).modifiers).map((m: any) => m.option).join(' · ')}
                                        {Number((item as any).modifier_total) > 0 && (
                                          <span className="ml-1 text-emerald-600 font-medium">
                                            +{Number((item as any).modifier_total).toLocaleString('vi-VN')}đ
                                          </span>
                                        )}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => handleAdjustExistingQty(idx, -1)} className="w-6 h-6 flex items-center justify-center rounded-md bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors">
                                      -
                                    </button>
                                    <input
                                      type="text"
                                      value={item.qty}
                                      onChange={e => {
                                        const val = e.target.value.replace(/\D/g, '')
                                        const newQty = val ? Number(val) : 0
                                        setExistingItems(prev => {
                                          const clone = [...prev]
                                          const p = clone[idx]
                                          clone[idx] = { ...p, qty: String(newQty), line_total: String(newQty * Number(p.unit_price)) }
                                          return clone
                                        })
                                        setDirtyItems(d => ({ ...d, [item.id!]: true }))
                                      }}
                                      className="w-10 text-center text-sm font-bold bg-white border border-slate-200 rounded px-1 focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                                    />
                                    <button onClick={() => handleAdjustExistingQty(idx, 1)} className="w-6 h-6 flex items-center justify-center rounded-md bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors">
                                      +
                                    </button>
                                  </div>
                                </div>
                                <div className="flex items-center shrink-0 ml-4 gap-3">
                                  <span className="text-sm font-bold text-slate-700 w-24 text-right">
                                    {fmtVND(item.line_total)}
                                  </span>
                                  <button onClick={() => setConfirmDeleteId(item.id!)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-100 hover:text-red-600 text-slate-400 transition-colors">
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ))}
                            {Object.keys(dirtyItems).length > 0 && (
                              <button
                                onClick={handleSaveDirtyItems}
                                disabled={savingDirty}
                                className="w-full rounded-xl bg-orange-500 p-3 text-sm font-bold text-white hover:bg-orange-600 transition-colors disabled:opacity-50 shadow-sm"
                              >
                                {savingDirty ? 'Đang lưu...' : `Lưu cập nhật (${Object.keys(dirtyItems).length} món)`}
                              </button>
                            )}


                            {/* Auto-saved items end */}

                            <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between sticky bottom-0 bg-white">
                              <span className="font-bold text-slate-800 text-xs uppercase tracking-wide">Tổng tiền tạm tính</span>
                              <span className="text-base font-bold text-primary">
                                {fmtVND(existingItems.reduce((acc, item) => acc + Number(item.line_total), 0) + timeCharge)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Lịch sử thu tiền */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col">
                          <div className="flex items-center justify-between mb-3">
                            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide">Lịch sử thanh toán</label>
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-medium text-slate-500">Tổng: <span className="font-bold text-slate-900">{fmtVND(installments.reduce((sum, p) => sum + Number(p.amount), 0))}</span></span>
                              <button onClick={() => setShowPaymentForm(!showPaymentForm)} className="text-xs font-bold text-primary hover:underline">
                                {showPaymentForm ? 'Đóng' : '+ Thêm thanh toán'}
                              </button>
                            </div>
                          </div>

                          <div className="flex-1 overflow-y-auto min-h-[50px] max-h-[200px]">
                            {loadingOrder ? (
                              <div className="space-y-2">
                                <div className="h-12 w-full bg-slate-100 rounded-lg animate-pulse" />
                              </div>
                            ) : installments.length > 0 ? (
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

                          {showPaymentForm && (
                            <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 shrink-0">
                              <label className="block text-[10px] font-bold text-primary mb-1 uppercase tracking-wide">Thêm thanh toán mới</label>
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
                          )}
                        </div>

                        {/* Ghi chú đơn hàng */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-center justify-between mb-3">
                            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide">Ghi chú đơn hàng</label>
                            <button onClick={handleUpdateMetadata} disabled={isUpdatingMeta} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50">
                              {isUpdatingMeta ? 'Đang lưu...' : 'Lưu ghi chú'}
                            </button>
                          </div>
                          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white text-slate-800" placeholder="Yêu cầu đặc biệt, chú thích..." />
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
                        {guests.map((g, idx) => {
                          const isExpanded = expandedGuests[idx] !== undefined ? expandedGuests[idx] : (!g.name && !g.id_number)
                          if (!isExpanded) {
                            return (
                              <div key={g.id || idx} className="flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-650">{idx + 1}</span>
                                  <span className="text-sm font-semibold text-slate-800 truncate">
                                    {g.name || 'Chưa nhập tên'} <span className="text-xs font-normal text-slate-500">({g.id_type || 'CCCD'}: {g.id_number || 'Chưa nhập'})</span>
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 shrink-0 ml-auto pl-4">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedGuests(prev => ({ ...prev, [idx]: true }))}
                                    className="text-xs font-bold text-primary hover:text-primary-dark transition-colors cursor-pointer"
                                  >
                                    Sửa
                                  </button>
                                  <span className="text-slate-300 text-xs select-none">|</span>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const ok = await confirm({
                                        title: 'Xóa khách lưu trú',
                                        description: 'Bạn có chắc chắn muốn xóa khách lưu trú này?',
                                        variant: 'danger',
                                      })
                                      if (!ok) return
                                      setGuests(guests.filter((_, i) => i !== idx))
                                      setExpandedGuests(prev => {
                                        const next = { ...prev }
                                        delete next[idx]
                                        return next
                                      })
                                    }}
                                    className="text-xs font-bold text-red-500 hover:text-red-750 transition-colors cursor-pointer"
                                  >
                                    Xóa
                                  </button>
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div key={g.id || idx} className="rounded-xl border border-slate-200 bg-slate-50 p-4 relative shadow-sm">
                              <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{idx + 1}</span>
                                  <span className="text-sm font-semibold text-slate-800">Thông tin khách hàng {idx + 1}</span>
                                </div>
                                <div className="flex items-center gap-3 ml-auto">
                                  {g.name && (
                                    <button
                                      type="button"
                                      onClick={() => setExpandedGuests(prev => ({ ...prev, [idx]: false }))}
                                      className="text-xs font-bold text-slate-500 hover:text-slate-705 transition-colors cursor-pointer"
                                    >
                                      Thu gọn
                                    </button>
                                  )}
                                  {g.name && <span className="text-slate-300 text-xs select-none">|</span>}
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const ok = await confirm({
                                        title: 'Xóa khách lưu trú',
                                        description: 'Bạn có chắc chắn muốn xóa khách lưu trú này?',
                                        variant: 'danger',
                                      })
                                      if (!ok) return
                                      setGuests(guests.filter((_, i) => i !== idx))
                                      setExpandedGuests(prev => {
                                        const next = { ...prev }
                                        delete next[idx]
                                        return next
                                      })
                                    }}
                                    className="text-xs font-bold text-red-500 hover:text-red-755 transition-colors cursor-pointer"
                                  >
                                    Xóa
                                  </button>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Họ và tên</label>
                                  <input type="text" value={g.name} onChange={e => {
                                    const newG = [...guests]; newG[idx].name = e.target.value; setGuests(newG);
                                  }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white text-slate-800" placeholder="Nhập tên khách..." />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Loại giấy tờ</label>
                                  <select value={g.id_type} onChange={e => {
                                    const newG = [...guests]; newG[idx].id_type = e.target.value; setGuests(newG);
                                  }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white text-slate-800">
                                    <option value="CCCD">CCCD/CMND</option>
                                    <option value="Passport">Hộ chiếu</option>
                                    <option value="Other">Khác</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Số giấy tờ</label>
                                  <input type="text" value={g.id_number} onChange={e => {
                                    const newG = [...guests]; newG[idx].id_number = e.target.value; setGuests(newG);
                                  }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white text-slate-800" />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Ngày hết hạn</label>
                                  <input type="date" value={g.expiry_date || ''} onChange={e => {
                                    const newG = [...guests]; newG[idx].expiry_date = e.target.value; setGuests(newG);
                                  }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white text-slate-800" />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Quốc tịch</label>
                                  <input type="text" value={g.nationality} onChange={e => {
                                    const newG = [...guests]; newG[idx].nationality = e.target.value; setGuests(newG);
                                  }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white text-slate-800" />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Ngày sinh</label>
                                  <input type="date" value={g.dob || ''} onChange={e => {
                                    const newG = [...guests]; newG[idx].dob = e.target.value; setGuests(newG);
                                  }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white text-slate-800" />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Giới tính</label>
                                  <select value={g.gender || ''} onChange={e => {
                                    const newG = [...guests]; newG[idx].gender = e.target.value; setGuests(newG);
                                  }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white text-slate-800">
                                    <option value="">-- Chọn --</option>
                                    <option value="Nam">Nam</option>
                                    <option value="Nữ">Nữ</option>
                                  </select>
                                </div>
                                <div className="col-span-2">
                                  <label className="block text-xs font-medium text-slate-605 mb-1">Địa chỉ</label>
                                  <input type="text" value={g.address || ''} onChange={e => {
                                    const newG = [...guests]; newG[idx].address = e.target.value; setGuests(newG);
                                  }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white text-slate-800" placeholder="Nhập địa chỉ..." />
                                </div>
                                <div className="col-span-2">
                                  <label className="block text-xs font-medium text-slate-650 mb-1">Ghi chú</label>
                                  <input type="text" value={g.note || ''} onChange={e => {
                                    const newG = [...guests]; newG[idx].note = e.target.value; setGuests(newG);
                                  }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white text-slate-800" placeholder="Ghi chú thêm (lưu ý...)" />
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        <button onClick={() => setGuests([...guests, { id: Date.now(), name: '', id_type: 'CCCD', id_number: '', expiry_date: '', nationality: 'Việt Nam', dob: '', gender: '', address: '', note: '' }])} className="w-full rounded-xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500 hover:border-primary hover:text-primary transition-colors bg-white">
                          + Thêm khách lưu trú
                        </button>
                      </div>
                    </div>
                  )}


                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-white shrink-0">
          {!isOccupied ? (
            (() => {
              const housekeepingMode = settings?.housekeeping_workflow_mode || 'SIMPLE'
              const needsInspection = housekeepingMode === 'ENTERPRISE' && resource.type === 'room'
              const isReady = !needsInspection || resource.status === 'inspected'
              
              return (
                <div className="flex flex-col gap-2 w-full">
                  {!isReady && (
                    <p className="text-xs font-semibold text-rose-600 text-center bg-rose-50 py-2.5 rounded-xl border border-rose-100 mb-1">
                      Chế độ Enterprise: Phòng cần được nghiệm thu (Inspected) trước khi nhận phòng!
                    </p>
                  )}
                  <button
                    onClick={handleCheckInSubmit}
                    disabled={saving || !isReady}
                    className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-white shadow-sm hover:bg-primary-dark disabled:opacity-50 transition-all"
                  >
                    {saving ? `Đang ${tpl.actions.checkIn.toLowerCase()}...` : tpl.actions.checkIn}
                  </button>
                </div>
              )
            })()
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="flex gap-3 w-full">
                  {resource.status === 'occupied' && !resource.id.startsWith('takeaway') && (
                    <button
                      onClick={handleRequestCheckout}
                      className="rounded-xl bg-amber-500 hover:bg-amber-600 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition-all"
                    >
                      Khóa giờ & Kiểm phòng
                    </button>
                  )}
                  <button
                    onClick={handlePayAndCloseClick}
                    className="flex-1 rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800 transition-all"
                  >
                    {resource.id.startsWith('takeaway') ? 'Thanh toán' : tpl.actions.payAndClose}
                  </button>
                  {permissions.includes('orders.delete') && (
                    <button
                      onClick={() => {
                        setRefundAmountInput(order?.paid_amount ? Number(order.paid_amount).toLocaleString('vi-VN') : '')
                        setConfirmCancelResource(true)
                      }}
                      className="shrink-0 px-5 rounded-xl bg-red-50 text-red-600 border border-red-200 py-3.5 text-sm font-bold hover:bg-red-100 transition-colors"
                    >
                      {resource.id.startsWith('takeaway') ? 'Hủy đơn' : `Hủy ${tpl.label.toLowerCase()}`}
                    </button>
                  )}
                </div>
              </div>
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
          onMinimize={() => {
            setCheckoutOpen(false)
            onClose()
          }}
          customer={(order?.customer_name && order.customer_name !== 'Khách lẻ') ? {
            customer_id: order.customer_id || '',
            name: order.customer_name,
            phone: orderMeta?.customer_phone || ''
          } : null}
          onCustomerChange={handleCustomerSelect}
          metadata={orderMeta || undefined}
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
          autoPrintReceipt={autoPrintReceipt}
          customCheckoutTime={customCheckoutTime}
          hourlyRate={hourlyRate}
          isAccommodation={isRoom}
        />
      )}
      {/* Resource Picker Modal for Transfer */}
      {transferModalOpen && (() => {
        const availableResources = allResources.filter(r => r.status === 'available')
        const filteredResources = availableResources.filter(r => r.name.toLowerCase().includes(transferSearch.toLowerCase()) || r.zone?.toLowerCase().includes(transferSearch.toLowerCase()))
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[85vh]">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
                <h3 className="text-lg font-bold text-slate-900">Chọn {tpl.label.toLowerCase()} chuyển đến</h3>
                <button onClick={() => { setTransferModalOpen(false); setTransferSearch('') }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="px-6 py-3 border-b border-slate-100">
                <input
                  type="text"
                  placeholder="Tìm kiếm theo tên hoặc khu vực..."
                  value={transferSearch}
                  onChange={e => setTransferSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {availableResources.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-sm">Không có {tpl.label.toLowerCase()} nào đang trống</div>
                ) : filteredResources.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-sm">Không tìm thấy kết quả phù hợp</div>
                ) : (
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-medium">Tên</th>
                          <th className="px-4 py-3 font-medium">Khu vực</th>
                          <th className="px-4 py-3 font-medium">Sức chứa</th>
                          <th className="px-4 py-3 font-medium text-right">Giá theo giờ</th>
                          <th className="px-4 py-3 font-medium text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredResources.map(r => (
                          <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-800">{r.name}</div>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{r.zone || '-'}</td>
                            <td className="px-4 py-3 text-slate-600">{r.capacity ? `${r.capacity} người` : '-'}</td>
                            <td className="px-4 py-3 text-slate-600 text-right">{r.hourly_rate ? `${Number(r.hourly_rate).toLocaleString('vi-VN')}₫` : '-'}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => handleTransfer(r.id)}
                                disabled={transferring}
                                className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
                              >
                                Chuyển đến
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Split Modal */}
      {splitModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
              <h3 className="text-lg font-bold text-slate-900">Tách {tpl.label.toLowerCase()}</h3>
              <button onClick={() => { setSplitModalOpen(false); setSplitSelectedItems(new Set()) }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-800 mb-2">1. Chọn món cần tách ({splitSelectedItems.size}/{existingItems.length})</p>
                {existingItems.length === 0 ? <p className="text-xs text-slate-500">Chưa có món nào</p> : (
                  <div className="space-y-1">
                    {existingItems.map(it => (
                      <label key={it.id} className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-100">
                        <input
                          type="checkbox"
                          checked={splitSelectedItems.has(it.id!)}
                          onChange={(e) => {
                            const newSet = new Set(splitSelectedItems)
                            if (e.target.checked) newSet.add(it.id!)
                            else newSet.delete(it.id!)
                            setSplitSelectedItems(newSet)
                          }}
                          className="rounded text-primary focus:ring-primary h-4 w-4"
                        />
                        <span className="text-sm flex-1">{it.product_name}</span>
                        <span className="text-sm text-slate-500">x{it.qty}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-slate-100 pt-4">
                <p className="text-sm font-semibold text-slate-800 mb-2">2. Chọn {tpl.label.toLowerCase()} đích</p>
                {allResources.filter(r => r.status === 'available').length === 0 ? (
                  <div className="text-xs text-slate-500">Không có {tpl.label.toLowerCase()} nào đang trống</div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {allResources.filter(r => r.status === 'available').map(r => (
                      <button
                        key={r.id}
                        onClick={() => handleSplit(r.id)}
                        disabled={transferring || splitSelectedItems.size === 0}
                        className="flex flex-col items-start p-2 border border-slate-200 rounded-lg hover:border-primary hover:bg-primary/5 transition-all text-left disabled:opacity-50"
                      >
                        <span className="font-semibold text-slate-800 text-sm">{r.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Merge Modal */}
      {mergeModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
              <h3 className="text-lg font-bold text-slate-900">Gộp từ {tpl.label.toLowerCase()} khác</h3>
              <button onClick={() => setMergeModalOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4 bg-blue-50 border-b border-blue-100">
              <p className="text-xs text-blue-700">Tất cả món từ {tpl.label.toLowerCase()} được chọn sẽ chuyển sang <b>{resource.name}</b>. {tpl.label} gốc sẽ được trả trống.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {allResources.filter(r => r.status === 'occupied' && r.id !== resource.id).length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">Không có {tpl.label.toLowerCase()} nào khác đang dùng</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {allResources.filter(r => r.status === 'occupied' && r.id !== resource.id).map(r => (
                    <button
                      key={r.id}
                      onClick={() => handleMerge(r.id)}
                      disabled={transferring}
                      className="flex flex-col items-start p-3 border border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left disabled:opacity-50"
                    >
                      <span className="font-semibold text-slate-800">{r.name}</span>
                      <span className="text-xs text-slate-500 mt-1">{r.zone || 'Chưa phân vùng'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {editCustomerModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
              <h3 className="text-lg font-bold text-slate-900">Cập nhật Khách hàng</h3>
              <button onClick={() => setEditCustomerModalOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <CustomerSearch shopId={shopId} selected={editCustomerValue} onSelect={setEditCustomerValue} />

              <div className="pt-2">
                <button
                  onClick={() => setEditCustomerValue(null)}
                  className="w-full rounded-xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 hover:border-slate-400 hover:bg-slate-50 transition-colors"
                >
                  Gán Khách lẻ (Mặc định)
                </button>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex gap-3">
              <button onClick={() => setEditCustomerModalOpen(false)} className="flex-1 rounded-xl bg-white border border-slate-200 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">Hủy</button>
              <button onClick={handleUpdateCustomer} disabled={updatingCustomer} className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors">
                {updatingCustomer ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={async () => {
          if (!confirmDeleteId) return
          await handleDeleteExistingItem(confirmDeleteId)
        }}
        title="Xóa món"
        description="Bạn có chắc chắn muốn xóa món này khỏi hóa đơn?"
        variant="danger"
        loading={!!deletingItemId}
      />

      <ConfirmDialog
        open={confirmCancelResource}
        onClose={() => setConfirmCancelResource(false)}
        onConfirm={handleCancelOrder}
        title={resource.id.startsWith('takeaway') ? 'Hủy đơn' : `Hủy ${tpl.label.toLowerCase()}`}
        description={resource.id.startsWith('takeaway') ? 'Bạn có chắc chắn muốn hủy đơn hàng này không?' : `Bạn có chắc chắn muốn hủy ${tpl.label.toLowerCase()} này không? Các món đã gọi sẽ được hoàn lại kho và ${tpl.label.toLowerCase()} sẽ trở về trạng thái trống.`}
        variant="danger"
        loading={cancellingOrder}
      >
        {Number(order?.paid_amount || 0) > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Hoàn trả tiền cọc / thanh toán trước (Tối đa: {Number(order?.paid_amount || 0).toLocaleString('vi-VN')}đ)
            </label>
            <input
              type="text"
              value={refundAmountInput}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '')
                const numVal = val ? Number(val) : 0
                const max = Number(order?.paid_amount || 0)
                if (numVal > max) {
                  setRefundAmountInput(max.toLocaleString('vi-VN'))
                } else {
                  setRefundAmountInput(numVal.toLocaleString('vi-VN'))
                }
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary bg-white font-medium"
            />
            <p className="mt-1 text-xs text-slate-500">Mặc định hệ thống sẽ tự động hoàn 100% qua phiếu chi Sổ quỹ. Nếu phạt cọc, vui lòng sửa lại số tiền hoàn này.</p>
          </div>
        )}
      </ConfirmDialog>
      {/* Variant & Modifier Pickers */}
      {variantParent && (
        <VariantPickerModal
          parentProduct={variantParent}
          open={!!variantParent}
          onClose={() => setVariantParent(null)}
          onSelect={handleAddCartItem}
        />
      )}
      {modifierProduct && (
        <ModifierPickerModal
          product={modifierProduct}
          open={!!modifierProduct}
          onClose={() => setModifierProduct(null)}
          onConfirm={handleAddCartItem}
        />
      )}
      <CustomerCreateModal
        open={customerCreateModalOpen}
        onClose={() => setCustomerCreateModalOpen(false)}
        shopId={shopId}
        onSuccess={(created) => {
          setCustomer(created)
          setCustomerCreateModalOpen(false)
          toast.success(`Đã thêm khách hàng: ${created.name}`)
        }}
      />
    </>
  )
}

function safeParse(s?: string): Record<string, any> {
  if (!s) return {}
  try { return JSON.parse(s) } catch { return {} }
}
