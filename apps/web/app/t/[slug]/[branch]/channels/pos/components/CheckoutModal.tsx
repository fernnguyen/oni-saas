'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import {
  localDb,
  type LocalCustomer,
  type LocalOrder,
  type LocalOrderItem,
  type LocalPayment,
  type SyncQueueItem,
} from '@/lib/localDb/schema'
import { broadcastOrderCreated } from '@/lib/localDb/tabSync'
import { printBill } from '@/lib/pos/printBill'
import type { CartItem } from '@/hooks/useCart'
import { CustomerSearch } from './CustomerSearch'
import { useQuery } from '@tanstack/react-query'
import { calculateHourlyBilling } from '@oni/core'
import { VietQRPreview } from '@/app/components/ui/VietQRPreview'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  onMinimize?: () => void
  items: CartItem[]
  subtotal: number
  discount_amount: number
  total: number
  note: string
  customer: LocalCustomer | null
  onCustomerChange: (c: LocalCustomer | null) => void
  shopId: string
  branchId: string
  shopName: string
  employeeId: string
  isOnline: boolean
  autoPrintReceipt: boolean
  orderId?: string
  metadata?: Record<string, any>
  orderPaidAmount?: number
  customCheckoutTime?: string
  hourlyRate?: number
}

const METHODS = [
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'card', label: 'Thẻ' },
  { value: 'bank_transfer', label: 'Chuyển khoản' },
  { value: 'momo', label: 'MoMo' },
  { value: 'vnpay', label: 'VNPay' },
  { value: 'zalopay', label: 'ZaloPay' },
  { value: 'prepaid', label: 'Ví trả trước' },
  { value: 'debt', label: 'Ghi nợ' },
]

interface PaymentRow {
  id: string
  method: string
  amount: string
  fund_id?: string
}

function fmtVND(v: number | string | null | undefined) {
  return Number(v ?? 0).toLocaleString('vi-VN') + 'đ'
}

export function MemberTierBadge({ label, color }: { label: string; color?: string }) {
  const c = (color || 'slate').toLowerCase()
  let classes = 'bg-slate-100 text-slate-600 border border-slate-200/50 shadow-none font-medium'

  const TYPE_LABEL_MAP: Record<string, string> = {
    retail: 'Bán lẻ',
    wholesale: 'Khách sỉ',
    vip: 'VIP',
    staff: 'Nội bộ'
  }
  const displayLabel = TYPE_LABEL_MAP[label.toLowerCase()] || label
  const isRetail = label.trim().toLowerCase() === 'retail' || displayLabel === 'Bán lẻ'

  if (isRetail) {
    classes = 'bg-slate-100 text-slate-500 border border-slate-200/60 shadow-none font-medium'
  } else {
    if (c === 'emerald') classes = 'bg-gradient-to-r from-emerald-500 to-teal-650 text-white border border-emerald-400/30 shadow-xs'
    else if (c === 'sapphire') classes = 'bg-gradient-to-r from-blue-600 to-indigo-650 text-white border border-blue-500/30 shadow-xs'
    else if (c === 'amethyst') classes = 'bg-gradient-to-r from-purple-500 to-fuchsia-650 text-white border border-purple-400/30 shadow-xs'
    else if (c === 'ruby') classes = 'bg-gradient-to-r from-rose-500 to-red-600 text-white border border-rose-400/30 shadow-xs'
    else if (c === 'amber') classes = 'bg-gradient-to-r from-amber-500 to-orange-600 text-white border border-amber-400/30 shadow-xs'
    else if (c === 'rose') classes = 'bg-gradient-to-r from-pink-500 to-rose-500 text-white border border-pink-400/30 shadow-xs'
    else if (c === 'cyan') classes = 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white border border-cyan-400/30 shadow-xs'
    else if (c === 'indigo') classes = 'bg-gradient-to-r from-indigo-500 to-violet-650 text-white border border-indigo-400/30 shadow-xs'
    else if (c === 'slate') classes = 'bg-gradient-to-r from-slate-500 to-slate-700 text-white border border-slate-400/30 shadow-xs'
    else if (c === 'gold') classes = 'bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 text-white border border-yellow-400/35 shadow-sm'
    else if (c === 'silver') classes = 'bg-gradient-to-r from-slate-200 via-slate-350 to-zinc-500 text-slate-800 border border-slate-300/40 shadow-xs'
    else if (c === 'bronze') classes = 'bg-gradient-to-r from-orange-400 via-amber-700 to-orange-700 text-white border border-orange-500/30 shadow-xs'
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold leading-relaxed ${classes}`}>
      {displayLabel}
    </span>
  )
}

export function fmtDateTimeVN(d: Date) {
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  const dd = d.getDate().toString().padStart(2, '0')
  const mo = (d.getMonth() + 1).toString().padStart(2, '0')
  return `${hh}:${mm} ${dd}/${mo}`
}

function nextId() {
  return String(Date.now() + Math.random())
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success(`Đã sao chép ${label.toLowerCase()}`)
  }
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">{label}</p>
        <p className="font-semibold text-slate-800 truncate mt-0.5">{value}</p>
      </div>
      <button
        onClick={handleCopy}
        className="ml-2 shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
      >
        {copied ? (
          <svg className="h-4 w-4 text-emerald-500 animate-in zoom-in" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          </svg>
        )}
      </button>
    </div>
  )
}

export function CheckoutModal({
  open,
  onClose,
  onSuccess,
  onMinimize,
  items,
  subtotal,
  discount_amount,
  total,
  note,
  customer,
  onCustomerChange,
  shopId,
  branchId,
  shopName,
  employeeId,
  isOnline,
  autoPrintReceipt,
  orderId,
  metadata,
  orderPaidAmount = 0,
  customCheckoutTime,
  hourlyRate = 0,
}: Props) {
  const [localCustomer, setLocalCustomer] = useState(customer)
  const [payments, setPayments] = useState<PaymentRow[]>([
    { id: nextId(), method: 'cash', amount: String(total - discount_amount - orderPaidAmount) },
  ])
  const [saving, setSaving] = useState(false)
  const [localRentalType, setLocalRentalType] = useState<'hourly' | 'overnight'>(() => {
    return metadata?.rental_type || 'hourly'
  })
  const [localNote, setLocalNote] = useState(note)
  const [localDiscount, setLocalDiscount] = useState(discount_amount)
  const [isEditingDiscount, setIsEditingDiscount] = useState(false)
  const [discountInput, setDiscountInput] = useState(String(discount_amount))
  const [localCheckoutTime, setLocalCheckoutTime] = useState('')
  const [isEditingCheckout, setIsEditingCheckout] = useState(false)
  const [checkoutInput, setCheckoutInput] = useState('')

  const [showQrGate, setShowQrGate] = useState(false)
  const [pollingActive, setPollingActive] = useState(false)
  const [waitingOrderId, setWaitingOrderId] = useState<string | null>(null)
  const [waitingOrderNo, setWaitingOrderNo] = useState<string>('')

  const createdLocalOrderRef = useRef<any>(null)
  const createdLocalItemsRef = useRef<any>(null)
  const createdLocalPaymentsRef = useRef<any>(null)

  const bankTransferAmt = useMemo(() => {
    return payments
      .filter((p) => p.method === 'bank_transfer')
      .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  }, [payments])

  const debtAmount = useMemo(() => {
    return payments
      .filter((p) => p.method === 'debt')
      .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  }, [payments])

  // Recalculate time charge when checkout time or rental type changes
  const computedItems = useMemo(() => {
    if (localRentalType === 'overnight') {
      const overnightRate = Number(metadata?.overnight_rate) || Number(hourlyRate) || 0
      return items.map(item => {
        if (item.product_id === 'TIME_CHARGE') {
          return {
            ...item,
            product_name: 'Tiền phòng (Qua đêm)',
            qty: 1,
            unit_price: overnightRate,
            line_total: overnightRate,
          }
        }
        return item
      })
    }

    if (!metadata?.check_in || hourlyRate <= 0) return items
    const checkInDate = new Date(metadata.check_in)
    const effectiveCheckout = localCheckoutTime ? new Date(localCheckoutTime) : (customCheckoutTime ? new Date(customCheckoutTime) : new Date())

    const pricingResult = calculateHourlyBilling({
      checkIn: checkInDate,
      checkOut: effectiveCheckout,
      standardRate: hourlyRate,
      config: metadata.advanced_pricing
    })

    const newBillableHours = pricingResult.billableQty
    const newTimeCharge = pricingResult.totalAmount

    return items.map(item => {
      if (item.product_id === 'TIME_CHARGE') {
        return {
          ...item,
          qty: 1,
          unit_price: newTimeCharge,
          line_total: newTimeCharge,
          product_name: `Tiền giờ sử dụng (${pricingResult.durationLabel})`
        }
      }
      return item
    })
  }, [items, localCheckoutTime, customCheckoutTime, metadata, hourlyRate, localRentalType])

  const computedSubtotal = computedItems.reduce((s, it) => s + (it.line_total || 0), 0)

  const { data: settings } = useQuery({
    queryKey: ['settings', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/settings`)
      if (!res.ok) return {}
      return res.json()
    },
    enabled: !!shopId,
  })

  // Lấy danh sách quỹ thanh toán để lựa chọn tự động/thủ công tại POS
  const { data: fundsData } = useQuery({
    queryKey: ['payment-funds', shopId, branchId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/payment-funds?branch_id=${branchId}&active=TRUE`)
      if (!res.ok) return []
      const json = await res.json()
      return (json.data || []) as Record<string, string>[]
    },
    enabled: !!shopId && !!branchId && open,
  })
  const fundsList = fundsData || []

  const qrPayment = payments.find((p) => p.method === 'bank_transfer')
  const qrFund = fundsList.find((f) => f.id === qrPayment?.fund_id) || 
                 fundsList.find((f) => f.type === 'bank' && f.is_default === 'TRUE') || 
                 fundsList.find((f) => f.type === 'bank')

  const activeBankCode = qrFund?.bank_name || settings?.bank_code || ''
  const activeBankAccountNumber = qrFund?.account_number || settings?.bank_account_number || ''
  const activeBankAccountName = settings?.bank_account_name || ''

  const getAutoMatchedFund = (method: string, list: Record<string, string>[]) => {
    if (list.length === 0) return undefined

    let type = 'bank'
    if (method === 'cash') type = 'cash'
    else if (['momo', 'zalopay', 'vnpay', 'wallet'].includes(method)) type = 'wallet'

    const typedFunds = list.filter(f => f.type === type)
    if (typedFunds.length === 0) {
      const bankFunds = list.filter(f => f.type === 'bank')
      if (bankFunds.length > 0) return bankFunds.find(f => f.is_default === 'TRUE') || bankFunds[0]
      return list.find(f => f.is_default === 'TRUE') || list[0]
    }

    return typedFunds.find(f => f.is_default === 'TRUE') || typedFunds[0]
  }

  const [pointsRedeemed, setPointsRedeemed] = useState('0')

  const tierDiscountPct = useMemo(() => {
    if (!settings?.has_crm_access) return 0
    if (!localCustomer || settings?.tier_reward_type !== 'discount_bill') return 0
    const type = (localCustomer.customer_type || '').trim().toLowerCase()

    // Check dynamic membership tiers
    const tiers = settings?.membership_tiers || []
    if (tiers.length > 0) {
      const activeTier = tiers.find((t: any) => (t.name || '').trim().toLowerCase() === type)
      if (activeTier) return Number(activeTier.discount ?? 0)
    }

    // Fallback to legacy hardcoded levels
    if (type === 'gold' || type === 'vàng') return Number(settings?.tier_gold_discount ?? 10)
    if (type === 'silver' || type === 'bạc') return Number(settings?.tier_silver_discount ?? 5)
    if (type === 'bronze' || type === 'đồng') return Number(settings?.tier_bronze_discount ?? 2)
    return 0
  }, [localCustomer, settings])

  const customerTierColor = useMemo(() => {
    if (!localCustomer || !settings?.membership_tiers) return 'slate'
    const type = (localCustomer.customer_type || '').trim().toLowerCase()
    const activeTier = settings.membership_tiers.find((t: any) => (t.name || '').trim().toLowerCase() === type)
    return activeTier?.color || 'slate'
  }, [localCustomer, settings])

  const tierDiscountAmount = useMemo(() => {
    return Math.floor((computedSubtotal - localDiscount) * (tierDiscountPct / 100))
  }, [computedSubtotal, localDiscount, tierDiscountPct])

  const totalAfterDiscounts = useMemo(() => {
    return Math.max(0, computedSubtotal - localDiscount - tierDiscountAmount)
  }, [computedSubtotal, localDiscount, tierDiscountAmount])

  const maxPointsRedeemable = useMemo(() => {
    if (!settings?.has_crm_access || !localCustomer) return 0
    const pts = Math.floor(Number(localCustomer.loyalty_points || 0))
    const costToMoney = Number(settings?.loyalty_point_to_money || 1000)
    if (costToMoney <= 0) return 0
    return Math.min(pts, Math.floor(totalAfterDiscounts / costToMoney))
  }, [localCustomer, totalAfterDiscounts, settings])

  const redemptionValue = useMemo(() => {
    if (!settings?.has_crm_access) return 0
    return Number(pointsRedeemed) * Number(settings?.loyalty_point_to_money || 1000)
  }, [pointsRedeemed, settings])

  const finalTotal = useMemo(() => {
    return Math.max(0, totalAfterDiscounts - redemptionValue)
  }, [totalAfterDiscounts, redemptionValue])

  const earnedPoints = useMemo(() => {
    if (!settings?.has_crm_access || !localCustomer || settings?.loyalty_points_enabled === false) return 0
    const moneyToPoint = Number(settings?.loyalty_money_to_point || 100000)
    if (moneyToPoint <= 0) return 0
    return Math.floor(finalTotal / moneyToPoint)
  }, [localCustomer, finalTotal, settings])

  useEffect(() => {
    if (open) {
      setLocalCustomer(customer)
      setLocalDiscount(discount_amount)
      setDiscountInput(String(discount_amount))
      setPointsRedeemed('0')
      setLocalNote(note)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Hydrate selected customer details in real-time when online to fetch latest loyalty_points and prepaid_balance
  async function refreshCustomerDetails() {
    if (!localCustomer || !isOnline || localCustomer.customer_id.startsWith('virtual:')) return null
    try {
      const res = await fetch(`/api/shops/${shopId}/customers/${localCustomer.customer_id}`)
      if (res.ok) {
        const data = await res.json()
        const parsed = {
          ...data,
          customer_id: String(data.id || data.customer_id),
          debt_amount: data.debt_amount != null ? parseFloat(String(data.debt_amount)) || 0 : 0,
          credit_limit: data.credit_limit != null ? parseFloat(String(data.credit_limit)) || 0 : 0,
          loyalty_points: data.loyalty_points != null ? parseFloat(String(data.loyalty_points)) || 0 : 0,
          prepaid_balance: data.prepaid_balance != null ? parseFloat(String(data.prepaid_balance)) || 0 : 0,
        }
        setLocalCustomer(parsed)
        if (localDb) {
          await localDb.customers.put(parsed)
        }
        onCustomerChange(parsed)
        return parsed
      }
    } catch (e) {
      console.error('Failed to sync customer details:', e)
    }
    return null
  }

  useEffect(() => {
    if (open && localCustomer && isOnline && !localCustomer.customer_id.startsWith('virtual:')) {
      void refreshCustomerDetails()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, localCustomer?.customer_id, isOnline, shopId])

  // When checkout time, rental type, or finalTotal changes → recalculate payment
  useEffect(() => {
    const newRemaining = Math.max(0, finalTotal - orderPaidAmount)
    const autoFund = getAutoMatchedFund('cash', fundsList)
    setPayments([{ id: nextId(), method: 'cash', amount: String(newRemaining), fund_id: autoFund?.id || '' }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localCheckoutTime, localRentalType, finalTotal, fundsList.length])

  const overPaid = Math.max(0, orderPaidAmount - finalTotal)
  const remainingTotal = Math.max(0, finalTotal - orderPaidAmount)
  const totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const remaining = remainingTotal - totalPaid
  const cashRows = payments.filter((p) => p.method === 'cash')
  const cashChange = overPaid + cashRows.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0) - (remainingTotal - payments.filter((p) => p.method !== 'cash').reduce((s, p) => s + (parseFloat(p.amount) || 0), 0))

  function updatePayment(id: string, field: 'method' | 'amount' | 'fund_id', value: string) {
    setPayments((prev) => prev.map((p) => {
      if (p.id === id) {
        const updated = { ...p, [field]: value }
        if (field === 'method') {
          const autoFund = getAutoMatchedFund(value, fundsList)
          updated.fund_id = autoFund?.id || ''
        }
        return updated
      }
      return p
    }))
    if (field === 'method' && value === 'prepaid') {
      void refreshCustomerDetails()
    }
  }

  function removePayment(id: string) {
    setPayments((prev) => prev.filter((p) => p.id !== id))
  }

  function addPayment() {
    const usedMethods = new Set(payments.map((p) => p.method))
    const nextMethod = METHODS.find((m) => !usedMethods.has(m.value))
    if (!nextMethod) return
    const leftover = Math.max(0, remaining)
    const autoFund = getAutoMatchedFund(nextMethod.value, fundsList)
    setPayments((prev) => [...prev, { id: nextId(), method: nextMethod.value, amount: leftover > 0 ? String(leftover) : '', fund_id: autoFund?.id || '' }])
    if (nextMethod.value === 'prepaid') {
      void refreshCustomerDetails()
    }
  }

  function distributeRemaining() {
    setPayments((prev) => {
      if (prev.length === 0) return prev
      const othersPaid = prev.slice(0, -1).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
      return prev.map((p, i) =>
        i === prev.length - 1 ? { ...p, amount: String(Math.max(0, remainingTotal - othersPaid)) } : p
      )
    })
  }

  function applyDiscount() {
    let d = parseFloat(discountInput.replace(/,/g, ''))
    if (isNaN(d)) d = 0
    if (d > subtotal) d = subtotal
    setLocalDiscount(d)
    setDiscountInput(String(d))
    setIsEditingDiscount(false)
    const newTotal = Math.max(0, subtotal - d)
    setPayments([{ id: nextId(), method: 'cash', amount: String(newTotal) }])
  }

  function playSuccessSound() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext || (window as any).AudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(523.25, ctx.currentTime) // C5
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      osc.start()
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15) // E5
      osc.stop(ctx.currentTime + 0.35)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    if (!pollingActive || !isOnline || !waitingOrderId) return

    let isSubscribed = true
    let timerId: any

    const poll = async () => {
      const serverId = createdLocalOrderRef.current?.server_id
      if (!serverId) {
        if (isSubscribed) {
          timerId = setTimeout(poll, 2000)
        }
        return
      }

      try {
        const res = await fetch(`/api/shops/${shopId}/orders/${serverId}`)
        if (res.ok && isSubscribed) {
          const data = await res.json()
          if (data.status === 'completed') {
            playSuccessSound()
            toast.success('Thanh toán chuyển khoản VietQR tự động thành công!')
            
            const bankPayment = {
              local_id: crypto.randomUUID(),
              order_local_id: waitingOrderId,
              method: 'bank_transfer',
              amount: bankTransferAmt,
              reference_no: data.reference_no || 'SEPAY',
              note: 'Tự động đối soát SEPay',
            }

            await localDb.transaction('rw', [localDb.orders, localDb.payments], async () => {
              await localDb.orders.update(waitingOrderId, {
                status: 'completed',
                paid_amount: finalTotal,
                sync_status: 'done'
              })
              await localDb.payments.add(bankPayment)
            })

            if (createdLocalOrderRef.current) {
              broadcastOrderCreated({
                ...createdLocalOrderRef.current,
                status: 'completed',
                paid_amount: finalTotal,
                sync_status: 'done'
              })
            }

            if (autoPrintReceipt) {
              try {
                const orderToPrint = {
                  ...createdLocalOrderRef.current,
                  status: 'completed',
                  paid_amount: finalTotal,
                }
                const paymentsToPrint = [
                  ...createdLocalPaymentsRef.current,
                  bankPayment
                ]
                await printBill({
                  order: orderToPrint,
                  items: createdLocalItemsRef.current,
                  payments: paymentsToPrint,
                  shopName,
                  settings: {
                    ...settings,
                    bank_code: activeBankCode,
                    bank_account_number: activeBankAccountNumber,
                    bank_account_name: activeBankAccountName,
                  },
                  printCount: 1,
                  shopId
                })
              } catch (printErr) {
                console.error('Auto print failed:', printErr)
              }
            }

            setPollingActive(false)
            setShowQrGate(false)
            onSuccess()
            return
          }
        }
      } catch (err) {
        console.error('Failed to poll order status:', err)
      }

      if (isSubscribed) {
        timerId = setTimeout(poll, 2000)
      }
    }

    poll()

    return () => {
      isSubscribed = false
      clearTimeout(timerId)
    }
  }, [pollingActive, isOnline, waitingOrderId, shopId, finalTotal, bankTransferAmt, autoPrintReceipt, shopName, settings, onSuccess])

  async function handleConfirmManual() {
    setSaving(true)
    const bankPayment = {
      local_id: crypto.randomUUID(),
      order_local_id: waitingOrderId!,
      method: 'bank_transfer',
      amount: bankTransferAmt,
      reference_no: 'MANUAL',
      note: 'Xác nhận thủ công tại POS',
    }

    if (isOnline && createdLocalOrderRef.current?.server_id) {
      try {
        const orderServerId = createdLocalOrderRef.current.server_id
        await fetch(`/api/shops/${shopId}/orders/${orderServerId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'completed',
            paid_amount: String(finalTotal),
            debt_amount: String(debtAmount)
          })
        })

        const pFunds = fundsList.filter((f) => f.type === 'bank')
        const targetFundId = pFunds.find((f) => f.is_default === 'TRUE')?.id || pFunds[0]?.id || ''
        
        await fetch(`/api/shops/${shopId}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: orderServerId,
            order_no: waitingOrderNo,
            method: 'bank_transfer',
            amount: String(bankTransferAmt),
            reference_no: 'MANUAL',
            note: 'Xác nhận thủ công tại POS',
          })
        })

        await fetch(`/api/shops/${shopId}/cashbook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'receipt',
            amount: bankTransferAmt,
            method: 'bank_transfer',
            category: 'sales',
            reference_id: orderServerId,
            reference_name: localCustomer?.name || 'Khách lẻ',
            note: `Thanh toán chuyển khoản thủ công cho đơn hàng ${waitingOrderNo}`,
            employee_id: employeeId,
            branch_id: branchId,
            fund_id: targetFundId
          })
        })
      } catch (apiErr) {
        console.error('Manual confirmation online update failed:', apiErr)
      }
    }

    try {
      await localDb.transaction('rw', [localDb.orders, localDb.payments, localDb.syncQueue], async () => {
        await localDb.orders.update(waitingOrderId!, {
          status: 'completed',
          paid_amount: finalTotal,
          sync_status: isOnline ? 'done' : 'pending'
        })
        await localDb.payments.add(bankPayment)

        if (!isOnline) {
          const qItems = await localDb.syncQueue.toArray()
          const qItem = qItems.find((item) => item.local_order_id === waitingOrderId)
          if (qItem) {
            const payload = qItem.payload
            payload.order.status = 'completed'
            payload.order.paid_amount = finalTotal
            payload.payments.push({
              local_id: bankPayment.local_id,
              order_local_id: waitingOrderId!,
              method: 'bank_transfer',
              amount: bankTransferAmt,
              reference_no: 'MANUAL',
              note: 'Xác nhận thủ công tại POS',
            })
            await localDb.syncQueue.update(qItem.id!, { payload })
          }
        }
      })

      playSuccessSound()
      toast.success('Xác nhận thanh toán thủ công thành công!')

      if (createdLocalOrderRef.current) {
        broadcastOrderCreated({
          ...createdLocalOrderRef.current,
          status: 'completed',
          paid_amount: finalTotal,
          sync_status: isOnline ? 'done' : 'pending'
        })
      }

      if (autoPrintReceipt) {
        try {
          const orderToPrint = {
            ...createdLocalOrderRef.current,
            status: 'completed',
            paid_amount: finalTotal,
          }
          const paymentsToPrint = [
            ...createdLocalPaymentsRef.current,
            bankPayment
          ]
          await printBill({
            order: orderToPrint,
            items: createdLocalItemsRef.current,
            payments: paymentsToPrint,
            shopName,
            settings: {
              ...settings,
              bank_code: activeBankCode,
              bank_account_number: activeBankAccountNumber,
              bank_account_name: activeBankAccountName,
            },
            printCount: 1,
            shopId
          })
        } catch (err) {
          console.error('Print failed:', err)
        }
      }

      setPollingActive(false)
      setShowQrGate(false)
      onSuccess()
    } catch (err) {
      console.error(err)
      toast.error('Xác nhận thủ công thất bại')
    } finally {
      setSaving(false)
    }
  }

  async function handlePrintTemp() {
    const tempOrder = {
      ...createdLocalOrderRef.current,
      status: 'pending',
      note: `(PHIẾU TẠM TÍNH) ${localNote || ''}`
    }
    const printPayments = [
      ...createdLocalPaymentsRef.current,
      {
        method: 'bank_transfer',
        amount: bankTransferAmt,
        note: 'Chờ chuyển khoản'
      }
    ]
    try {
      await printBill({
        order: tempOrder,
        items: createdLocalItemsRef.current,
        payments: printPayments,
        shopName,
        settings: {
          ...settings,
          bank_code: activeBankCode,
          bank_account_number: activeBankAccountNumber,
          bank_account_name: activeBankAccountName,
        },
        printCount: 1,
        shopId
      })
      toast.success('Đã gửi lệnh in phiếu tạm tính!')
    } catch (err) {
      console.error(err)
      toast.error('In phiếu tạm tính thất bại')
    }
  }

  async function handleCancelQr() {
    const isOk = window.confirm('Bạn có chắc chắn muốn hủy đơn hàng này không? Việc hủy sẽ xóa đơn hàng và khôi phục số lượng tồn kho sản phẩm.')
    if (!isOk) return

    setSaving(true)
    if (isOnline && createdLocalOrderRef.current?.server_id) {
      try {
        await fetch(`/api/shops/${shopId}/orders/${createdLocalOrderRef.current.server_id}`, {
          method: 'DELETE'
        })
      } catch (err) {
        console.error('Delete order from server failed:', err)
      }
    }

    try {
      await localDb.transaction('rw', [localDb.orders, localDb.orderItems, localDb.payments, localDb.syncQueue, localDb.inventory, localDb.inventoryBatches], async () => {
        await localDb.orders.delete(waitingOrderId!)
        await localDb.orderItems.where('order_local_id').equals(waitingOrderId!).delete()
        await localDb.payments.where('order_local_id').equals(waitingOrderId!).delete()
        const qItems = await localDb.syncQueue.toArray()
        const targetQ = qItems.find((item) => item.local_order_id === waitingOrderId)
        if (targetQ) {
          await localDb.syncQueue.delete(targetQ.id!)
        }

        // Restore inventory locally
        for (const item of computedItems) {
          const inv = await localDb.inventory
            .where('[product_id+branch_id]')
            .equals([item.product_id, branchId])
            .first()
          if (inv) {
            await localDb.inventory.put({
              ...inv,
              stock_qty: Number(inv.stock_qty) + (item.qty * (item.conversion_rate || 1))
            })
          }
        }
      })

      toast.info('Đã hủy hóa đơn chờ thanh toán!')
      setPollingActive(false)
      setShowQrGate(false)
    } catch (err) {
      console.error(err)
      toast.error('Hủy hóa đơn thất bại')
    } finally {
      setSaving(false)
    }
  }

  function handleMinimizeQr() {
    setPollingActive(false)
    setShowQrGate(false)
    toast.success(`Đã lưu tạm hóa đơn ${waitingOrderNo || ''} thành công!`);
    if (onMinimize) {
      onMinimize()
    } else {
      onSuccess()
    }
  }

  async function handleSubmit(options?: { bypassQr?: boolean }) {
    if (items.length === 0) return
    if (totalPaid < remainingTotal) {
      toast.error(`Còn thiếu ${fmtVND(remainingTotal - totalPaid)}`)
      return
    }

    const hasDebt = payments.some((p) => p.method === 'debt' && parseFloat(p.amount) > 0)
    if (hasDebt && !localCustomer) {
      toast.error('Phương thức Ghi nợ yêu cầu phải chọn Khách hàng')
      return
    }

    const prepaidSpent = payments
      .filter((p) => p.method === 'prepaid')
      .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
    if (prepaidSpent > 0) {
      if (!localCustomer) {
        toast.error('Phương thức Ví trả trước yêu cầu phải chọn Khách hàng')
        return
      }
      const customerPrepaid = Number(localCustomer.prepaid_balance || 0)
      if (prepaidSpent > customerPrepaid) {
        toast.error(`Số dư Ví trả trước của khách chỉ còn ${fmtVND(customerPrepaid)}, không đủ để thanh toán ${fmtVND(prepaidSpent)}`)
        return
      }
    }

    const isWaitingForQr = bankTransferAmt > 0 && !options?.bypassQr
    setSaving(true)
    try {
      const debtAmount = payments
        .filter((p) => p.method === 'debt')
        .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
      const actualPaid = Math.max(0, finalTotal - debtAmount)

      const local_id = crypto.randomUUID()
      const now = new Date().toISOString()

      const orderItems: LocalOrderItem[] = computedItems.map((item) => ({
        local_id: crypto.randomUUID(),
        order_local_id: local_id,
        product_id: item.product_id,
        product_name: item.product_name,
        sku: item.sku,
        qty: item.qty,
        unit_price: item.unit_price,
        cost_price: item.cost_price,
        discount_amount: item.discount_amount,
        line_total: item.line_total,
        variant_label: item.variant_label,
        modifiers: typeof item.modifiers === 'object' ? JSON.stringify(item.modifiers) : item.modifiers,
        modifier_total: item.modifier_total,
        unit_id: item.unit_id,
        unit_name: item.unit_name,
        conversion_rate: item.conversion_rate,
      }))

      const actualPayments = payments.filter((p) => parseFloat(p.amount) > 0)
      const nonQrPayments = isWaitingForQr ? actualPayments.filter((p) => p.method !== 'bank_transfer') : actualPayments

      const localPayments: any[] = nonQrPayments.map((p) => {
        let fundType = 'bank'
        if (p.method === 'cash') fundType = 'cash'
        else if (['momo', 'zalopay', 'vnpay', 'wallet'].includes(p.method)) fundType = 'wallet'

        const matching = fundsList.filter((f) => f.type === fundType)
        const resolvedFundId = p.fund_id || matching.find((f) => f.is_default === 'TRUE')?.id || matching[0]?.id || ''

        const payLocalId = crypto.randomUUID()
        return {
          id: payLocalId,
          local_id: payLocalId,
          order_local_id: local_id,
          method: p.method,
          amount: parseFloat(p.amount),
          reference_no: '',
          note: '',
          fund_id: resolvedFundId,
        }
      })

      if (cashChange > 0) {
        const changeLocalId = crypto.randomUUID()
        localPayments.push({
          id: changeLocalId,
          local_id: changeLocalId,
          order_local_id: local_id,
          method: 'cash',
          amount: -cashChange,
          reference_no: '',
          note: 'Tiền thừa trả khách',
        })
      }

      const order: LocalOrder = {
        local_id,
        sync_status: 'pending',
        customer_id: localCustomer?.customer_id?.startsWith('virtual:') ? undefined : localCustomer?.customer_id,
        customer_name: localCustomer?.name,
        branch_id: branchId,
        employee_id: employeeId,
        subtotal: computedSubtotal,
        discount_amount: localDiscount + tierDiscountAmount,
        tax_amount: 0,
        total_amount: finalTotal,
        paid_amount: isWaitingForQr ? actualPaid - bankTransferAmt : actualPaid,
        debt_amount: debtAmount,
        points_earned: earnedPoints,
        points_redeemed: Number(pointsRedeemed),
        note: localNote,
        created_at: now,
        status: isWaitingForQr ? 'pending' : 'completed',
        print_count: autoPrintReceipt ? (isWaitingForQr ? 0 : 1) : 0,
        items: orderItems,
      }

      if (metadata) {
        order.metadata = JSON.stringify({
          ...metadata,
          check_out: localCheckoutTime || customCheckoutTime || new Date().toISOString(),
          rental_type: localRentalType
        })
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { items: _embedded, ...orderWithoutItems } = order

      const orderData: any = { ...orderWithoutItems }

      const syncPayload = {
        order: orderData,
        items: orderItems,
        payments: localPayments,
        stockMovements: computedItems.map((item) => ({
          type: 'sale_out',
          product_id: item.product_id,
          qty: -item.qty * (item.conversion_rate || 1),
          branch_id: branchId,
          reference_no: local_id,
        })).filter(m => m.product_id !== 'TIME_CHARGE'),
        customer: localCustomer ? { name: localCustomer.name, phone: localCustomer.phone } : undefined,
      }

      let isSuccessDirect = false
      let serverId = undefined
      let serverOrderNo = undefined

      if (isOnline) {
        try {
          const res = await fetch(`/api/shops/${shopId}/orders/sync-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              local_order_id: local_id,
              server_order_id: orderId,
              ...syncPayload,
              stock_movements: syncPayload.stockMovements
            }),
          })
          if (res.ok) {
            const data = await res.json()
            isSuccessDirect = true
            serverId = data.order_id
            serverOrderNo = data.order_no
          }
        } catch (e) {
          console.error('Direct sync failed, falling back to queue:', e)
        }
      }

      if (isSuccessDirect) {
        order.sync_status = 'done'
        order.server_id = serverId
        order.order_no = serverOrderNo
      } else {
        order.sync_status = 'pending'
      }

      const syncItem: SyncQueueItem = {
        status: 'pending',
        entity: 'order',
        payload: syncPayload,
        local_order_id: local_id,
        retry_count: 0,
        created_at: now,
      }

      await localDb.transaction(
        'rw',
        [localDb.orders, localDb.orderItems, localDb.payments, localDb.syncQueue, localDb.inventory, localDb.inventoryBatches],
        async () => {
          await localDb.orders.add(order)
          await localDb.orderItems.bulkAdd(orderItems)
          await localDb.payments.bulkAdd(localPayments)

          if (!isSuccessDirect) {
            await localDb.syncQueue.add(syncItem)
          }

          for (const item of items) {
            const inv = await localDb.inventory
              .where('[product_id+branch_id]')
              .equals([item.product_id, branchId])
              .first()
            if (inv) {
              await localDb.inventory.put({
                ...inv,
                stock_qty: settings?.allow_negative_stock
                  ? Number(inv.stock_qty) - (item.qty * (item.conversion_rate || 1))
                  : Math.max(0, Number(inv.stock_qty) - (item.qty * (item.conversion_rate || 1))),
              })
            }

            const batches = await localDb.inventoryBatches
              .where('[product_id+branch_id]')
              .equals([item.product_id, branchId])
              .toArray()

            if (batches && batches.length > 0) {
              const activeBatches = batches.filter((b) => Number(b.stock_qty) > 0)
              activeBatches.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))

              let remainingToSubtract = item.qty * (item.conversion_rate || 1)
              for (const b of activeBatches) {
                if (remainingToSubtract <= 0) break
                const deduct = Math.min(Number(b.stock_qty), remainingToSubtract)
                await localDb.inventoryBatches.update(b.id, {
                  stock_qty: Math.max(0, Number(b.stock_qty) - deduct)
                })
                remainingToSubtract -= deduct
              }
            }
          }
        }
      )

      broadcastOrderCreated(order)

      if (isWaitingForQr) {
        createdLocalOrderRef.current = order
        createdLocalItemsRef.current = orderItems
        createdLocalPaymentsRef.current = localPayments
        setWaitingOrderId(local_id)
        setWaitingOrderNo(serverOrderNo || local_id.slice(0, 8).toUpperCase())
        setShowQrGate(true)
        setPollingActive(true)
        setSaving(false)
        toast.success('Đã khởi tạo đơn hàng! Đang chờ thanh toán chuyển khoản...')
        return
      }

      toast.success(isSuccessDirect ? 'Tạo mới đơn hàng thành công!' : 'Tạo mới đơn hàng thành công (chờ đồng bộ)')
      onSuccess()

      if (autoPrintReceipt) {
        try {
          await printBill({
            order,
            items: orderItems,
            payments: localPayments,
            shopName,
            settings: {
              ...settings,
              bank_code: activeBankCode,
              bank_account_number: activeBankAccountNumber,
              bank_account_name: activeBankAccountName,
            },
            printCount: 1,
            shopId
          })
        } catch (err) {
          console.error('Print failed:', err)
        }
      }
    } catch (err) {
      console.error(err)
      toast.error('Tạo đơn thất bại')
    } finally {
      if (!isWaitingForQr) {
        setSaving(false)
      }
    }
  }

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (!showQrGate) onClose()
      }
      if ((e.key === 'Enter') && (e.ctrlKey || e.metaKey)) {
        if (!showQrGate) handleSubmit({ bypassQr: true })
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payments, items, showQrGate])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={showQrGate ? undefined : onClose} />

      <div className="relative z-10 w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 shrink-0">
          <h2 className="text-base font-semibold text-slate-900">
            {showQrGate ? 'Cổng thanh toán VietQR' : 'Thanh toán đơn hàng'}
          </h2>
          {!showQrGate && (
            <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">✕</button>
          )}
        </div>

        {showQrGate ? (
          <div className="flex flex-col flex-1 min-h-0 bg-slate-50 rounded-b-2xl overflow-y-auto">
            <div className="p-5 flex-1 flex flex-col items-center justify-center space-y-4">
              
              {/* Dynamic VietQR display */}
              <div className="relative group p-4 bg-white rounded-2xl shadow-sm border border-slate-100/80 max-w-[240px] w-full flex flex-col items-center animate-in zoom-in duration-305">
                <div className="absolute -inset-1.5 rounded-3xl bg-gradient-to-tr from-emerald-400 to-primary opacity-20 blur-xs group-hover:opacity-30 transition duration-500 animate-pulse"></div>
                <VietQRPreview
                  bankCode={activeBankCode}
                  accountNumber={activeBankAccountNumber}
                  accountName={activeBankAccountName}
                  amount={bankTransferAmt}
                  addInfo={waitingOrderNo}
                  template={settings?.qr_template || 'compact2'}
                  className="relative z-10 w-full border border-slate-100"
                />
                <div className="mt-2 text-center relative z-10">
                  <p className="text-[10px] font-bold text-slate-400 tracking-wide uppercase">Số tiền QR</p>
                  <p className="text-sm font-extrabold text-primary">{fmtVND(bankTransferAmt)}</p>
                </div>
              </div>

              {/* Status Listening Indicator */}
              <div className="w-full max-w-sm rounded-2xl border border-blue-100 bg-blue-50/60 p-3.5 flex items-center gap-3 shadow-2xs">
                <div className="relative flex h-3.5 w-3.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-blue-500"></span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-blue-950 truncate">Đang chờ thanh toán tự động...</p>
                  <p className="text-[10px] text-blue-700/80 font-medium leading-relaxed mt-0.5">
                    Hệ thống đang quét biến động số dư VietQR mỗi 2 giây.
                  </p>
                </div>
              </div>

              {/* Copy fields grid */}
              <div className="w-full max-w-sm grid grid-cols-2 gap-2.5">
                <div className="col-span-2">
                  <CopyField label="Tên chủ tài khoản" value={activeBankAccountName} />
                </div>
                <CopyField label="Số tài khoản" value={activeBankAccountNumber} />
                <CopyField label="Nội dung chuyển khoản" value={waitingOrderNo} />
              </div>

            </div>

            {/* Sticky Actions Footer */}
            <div className="bg-white border-t border-slate-100 p-4 shrink-0 flex flex-col gap-2 rounded-b-2xl">
              <button
                type="button"
                onClick={handleConfirmManual}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-3 text-sm shadow-sm hover:shadow-md active:scale-[0.99] transition-all cursor-pointer"
              >
                {saving ? (
                  <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                Xác nhận đã nhận tiền (Thủ công)
              </button>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={handlePrintTemp}
                  disabled={saving}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-655 font-bold py-2 text-[10px] transition-colors cursor-pointer"
                >
                  <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-3a2 2 0 00-2-2H9a2 2 0 00-2 2v3a2 2 0 002 2zm5-14V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  In tạm tính
                </button>
                <button
                  type="button"
                  onClick={handleMinimizeQr}
                  disabled={saving}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/40 hover:bg-blue-50 text-blue-700 font-bold py-2 text-[10px] transition-colors cursor-pointer"
                >
                  <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                  </svg>
                  Thu nhỏ & Lưu
                </button>
                <button
                  type="button"
                  onClick={handleCancelQr}
                  disabled={saving}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-red-200 hover:bg-red-50 text-red-600 font-bold py-2 text-[10px] transition-colors cursor-pointer"
                >
                  <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Huỷ đơn hàng
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 space-y-3 overflow-y-auto">
              {/* Customer */}
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500">KHÁCH HÀNG</p>
                  <p className="text-xs text-slate-600 font-medium">
                    {localCustomer ? (
                      <span className="flex items-center gap-1.5 justify-end">
                        <span>{localCustomer.name}</span>
                        {localCustomer.phone && <span className="text-slate-400 font-normal">({localCustomer.phone})</span>}
                        {localCustomer.customer_type && (
                          <MemberTierBadge label={localCustomer.customer_type} color={customerTierColor} />
                        )}
                      </span>
                    ) : (
                      'Khách lẻ'
                    )}
                  </p>
                </div>
                <CustomerSearch selected={localCustomer} onSelect={setLocalCustomer} />
              </div>

              {/* Prepaid Wallet inline suggest banner */}
              {localCustomer && Number(localCustomer.prepaid_balance || 0) > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-xs text-emerald-800 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="text-base shrink-0">💳</span>
                    <span className="whitespace-normal leading-normal">
                      Khách có <strong>{Number(localCustomer.prepaid_balance).toLocaleString('vi-VN')}đ</strong> ví trả trước. Bạn có muốn dùng không?
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const balance = Number(localCustomer.prepaid_balance || 0)
                      setPayments(() => {
                        const payAmount = Math.min(balance, finalTotal)
                        const rows = [{ id: nextId(), method: 'prepaid', amount: String(payAmount) }]
                        const remaining = finalTotal - payAmount
                        if (remaining > 0) {
                          rows.push({ id: nextId(), method: 'cash', amount: String(remaining) })
                        }
                        return rows
                      })
                    }}
                    className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1.5 font-bold text-white hover:bg-emerald-700 active:scale-95 transition-all shadow-sm cursor-pointer"
                  >
                    Sử dụng
                  </button>
                </div>
              )}

              {/* Resource Info */}
              {metadata?.check_in && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-sm space-y-1.5 mb-4">
                  {metadata.overnight_rate && (
                    <div className="pb-2 mb-2 border-b border-blue-100/50 flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold text-slate-500 tracking-wide uppercase">Hình thức tính tiền</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setLocalRentalType('hourly')}
                          className={`flex-1 py-1.5 px-2.5 rounded-lg border text-xs font-bold transition-all text-center ${localRentalType === 'hourly'
                            ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                            : 'border-slate-300 text-slate-500 bg-white hover:border-slate-350 hover:bg-slate-50'
                            }`}
                        >
                          ⏱️ Theo giờ
                        </button>
                        <button
                          type="button"
                          onClick={() => setLocalRentalType('overnight')}
                          className={`flex-1 py-1.5 px-2.5 rounded-lg border text-xs font-bold transition-all text-center ${localRentalType === 'overnight'
                            ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                            : 'border-slate-300 text-slate-500 bg-white hover:border-slate-350 hover:bg-slate-50'
                            }`}
                        >
                          🌙 Qua đêm ({Number(metadata.overnight_rate).toLocaleString('vi-VN')}₫)
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-600">Giờ vào:</span>
                    <span className="font-medium text-slate-900">{fmtDateTimeVN(new Date(metadata.check_in))}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-slate-600">{localCheckoutTime || customCheckoutTime ? 'Giờ ra:' : 'Giờ ra (Hiện tại):'}</span>
                    {isEditingCheckout ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="datetime-local"
                          value={checkoutInput}
                          onChange={e => setCheckoutInput(e.target.value)}
                          className="text-xs border border-slate-300 rounded px-1 py-0.5 outline-none"
                        />
                        <button onClick={() => {
                          const checkInDate = new Date(metadata.check_in)
                          const selectedDate = new Date(checkoutInput)
                          if (selectedDate < checkInDate) {
                            import('sonner').then(({ toast }) => toast.error('Giờ ra không được nhỏ hơn giờ vào!'))
                            return
                          }
                          setLocalCheckoutTime(checkoutInput)
                          setIsEditingCheckout(false)
                        }} className="text-primary font-bold">OK</button>
                      </div>
                    ) : (
                      <button onClick={() => {
                        setCheckoutInput(localCheckoutTime || customCheckoutTime || new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                        setIsEditingCheckout(true);
                      }} className="font-medium text-slate-900 border-b border-dotted border-slate-400 hover:text-primary transition-colors cursor-pointer">
                        {localCheckoutTime || customCheckoutTime ? fmtDateTimeVN(new Date((localCheckoutTime || customCheckoutTime) as string)) : fmtDateTimeVN(new Date())}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Order summary */}
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="max-h-[260px] overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                  {computedItems.map((item, idx) => (
                    <div key={`${item.product_id}-${idx}`} className="flex flex-col py-1.5 border-b border-slate-200/40 last:border-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-800 font-medium text-sm leading-tight">
                          {item.product_name}
                          <span className="text-slate-400 text-xs font-normal ml-1.5 whitespace-nowrap">× {item.qty}</span>
                        </span>
                        <span className="text-slate-950 font-bold text-sm shrink-0">{fmtVND(item.line_total)}</span>
                      </div>
                      {/* Variant or Modifier details underneath */}
                      {(item.variant_label || (item.modifiers && item.modifiers.length > 0)) && (
                        <div className="pl-2 mt-0.5 text-[10px] text-slate-500 space-y-0.5">
                          {item.variant_label && !item.modifiers?.length && (
                            <span className="text-violet-600 font-semibold block">{item.variant_label}</span>
                          )}
                          {item.modifiers && item.modifiers.length > 0 && (
                            <div className="text-amber-600 font-semibold block">
                              <span>{item.modifiers.map(m => m.option).join(' · ')}</span>
                              {(item.modifier_total ?? 0) > 0 && (
                                <span className="ml-1 text-emerald-600 font-bold">+{item.modifier_total?.toLocaleString('vi-VN')}đ</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 space-y-2 border-t border-slate-200 pt-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Giảm giá:</span>
                    {isEditingDiscount ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          autoFocus
                          value={discountInput}
                          onChange={(e) => setDiscountInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') applyDiscount()
                            if (e.key === 'Escape') setIsEditingDiscount(false)
                          }}
                          className="w-24 text-right border-b border-slate-300 outline-none text-slate-800 bg-transparent font-medium"
                        />
                        <button onClick={applyDiscount} className="text-primary text-xs font-semibold">OK</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setIsEditingDiscount(true)}
                        className="font-medium text-slate-800 border-b border-dotted border-slate-400 hover:text-primary transition-colors cursor-pointer"
                      >
                        {localDiscount > 0 ? `-${fmtVND(localDiscount)}` : '0đ'}
                      </button>
                    )}
                  </div>

                  {tierDiscountAmount > 0 && (
                    <div className="flex justify-between font-medium text-slate-600 text-sm mt-1">
                      <span className="flex items-center gap-1.5">
                        <span>Ưu đãi hạng</span>
                        <MemberTierBadge label={localCustomer?.customer_type || ''} color={customerTierColor} />
                        <span>(-{tierDiscountPct}%):</span>
                      </span>
                      <span className="text-emerald-600">-{fmtVND(tierDiscountAmount)}</span>
                    </div>
                  )}

                  {settings?.has_crm_access && settings?.loyalty_points_enabled !== false && localCustomer && (
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex flex-col">
                        <span className="text-slate-500">Tiêu điểm (Có: {Math.floor(Number(localCustomer.loyalty_points || 0))}đ):</span>
                        {!isOnline && <span className="text-[10px] text-orange-500 font-medium">(Chỉ khả dụng khi online)</span>}
                      </div>
                      {isOnline ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max={maxPointsRedeemable}
                            value={pointsRedeemed}
                            onChange={(e) => {
                              const val = Math.min(maxPointsRedeemable, Math.max(0, parseInt(e.target.value) || 0))
                              setPointsRedeemed(String(val))
                            }}
                            className="w-16 text-right border border-slate-200 rounded px-1.5 py-0.5 outline-none text-slate-800 bg-transparent text-xs"
                          />
                          <span className="text-slate-400 text-xs">= -{fmtVND(redemptionValue)}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </div>
                  )}

                  {settings?.has_crm_access && settings?.loyalty_points_enabled !== false && localCustomer && earnedPoints > 0 && (
                    <div className="flex justify-between font-medium text-slate-600 text-xs mt-1 border-t border-slate-100 pt-1">
                      <span>Tích lũy nhận thêm:</span>
                      <span className="text-blue-600">+{earnedPoints} điểm</span>
                    </div>
                  )}

                  <div className="flex justify-between font-bold text-slate-900 text-base border-t border-dashed border-slate-200 pt-2">
                    <span>Tổng cộng:</span>
                    <span className={orderPaidAmount > 0 ? "text-slate-900" : "text-primary"}>{fmtVND(finalTotal)}</span>
                  </div>
                  {orderPaidAmount > 0 && (
                    <div className="flex justify-between font-medium text-slate-600 text-sm mt-1">
                      <span>Đã thu:</span>
                      <span className="text-green-600">-{fmtVND(orderPaidAmount)}</span>
                    </div>
                  )}
                  {overPaid > 0 && (
                    <div className="flex justify-between font-bold text-red-600 text-sm mt-1 border-t border-red-100 pt-1">
                      <span>Tiền thừa trả khách:</span>
                      <span>{fmtVND(overPaid)}</span>
                    </div>
                  )}
                  {orderPaidAmount > 0 && overPaid === 0 && (
                    <div className="flex justify-between font-bold text-slate-700 text-sm border-t border-slate-200 pt-2 mt-2">
                      <span>Cần thanh toán:</span>
                      <span className="text-primary">{fmtVND(remainingTotal)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Note */}
              <input
                type="text"
                value={localNote}
                onChange={(e) => setLocalNote(e.target.value)}
                placeholder="Ghi chú đơn hàng..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-primary focus:outline-none"
              />

              {/* Payments */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500">PHƯƠNG THỨC THANH TOÁN</p>
                  <button
                    onClick={addPayment}
                    disabled={payments.length >= METHODS.length}
                    className="text-xs text-primary hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    + Thêm
                  </button>
                </div>

                {payments.map((p, idx) => {
                  const isPrepaid = p.method === 'prepaid'
                  const isDebt = p.method === 'debt'

                  let fundType = 'bank'
                  if (p.method === 'cash') fundType = 'cash'
                  else if (['momo', 'zalopay', 'vnpay', 'wallet'].includes(p.method)) fundType = 'wallet'

                  const matchingFunds = fundsList.filter((f) => f.type === fundType)
                  const selectedFundObj = fundsList.find((f) => f.id === p.fund_id) || matchingFunds[0]

                  return (
                    <div key={p.id} className="space-y-1.5">
                      <div className="flex gap-2">
                        <select
                          value={p.method}
                          onChange={(e) => updatePayment(p.id, 'method', e.target.value)}
                          className="w-32 shrink-0 rounded-lg border border-slate-200 px-2 py-2 text-sm focus:border-primary focus:outline-none"
                        >
                          {METHODS.filter(
                            (m) => m.value === p.method || !payments.some((other) => other.id !== p.id && other.method === m.value)
                          ).map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>

                        {/* Lựa chọn Quỹ cụ thể nếu có từ 2 quỹ trở lên cùng loại */}
                        {matchingFunds.length > 1 && (
                          <select
                            value={p.fund_id || selectedFundObj?.id || ''}
                            onChange={(e) => updatePayment(p.id, 'fund_id', e.target.value)}
                            className="w-36 shrink-0 rounded-lg border border-orange-200 bg-orange-50/20 px-2 py-2 text-xs font-semibold text-orange-850 focus:border-primary focus:outline-none cursor-pointer"
                          >
                            {matchingFunds.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        )}
                        <div className="relative flex-1">
                          <input
                            type="text"
                            value={p.amount ? Number(String(p.amount).replace(/\D/g, '')).toLocaleString('vi-VN') : ''}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '')
                              updatePayment(p.id, 'amount', val)
                            }}
                            placeholder="0"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-sm focus:border-primary focus:outline-none"
                          />
                          {idx === payments.length - 1 && remaining > 0 && (
                            <button
                              onClick={distributeRemaining}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-primary hover:underline"
                              title="Điền số tiền còn thiếu"
                            >
                              Điền
                            </button>
                          )}
                        </div>
                        {payments.length > 1 && (
                          <button
                            onClick={() => removePayment(p.id)}
                            className="shrink-0 rounded-lg border border-slate-200 px-2 text-slate-400 hover:border-red-200 hover:text-red-400"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Label chỉ dẫn rõ ràng dòng tiền sẽ được đưa vào quỹ nào */}
                      {selectedFundObj && p.method !== 'debt' && p.method !== 'prepaid' && (
                        <div className="w-full flex items-center gap-2 rounded-lg bg-orange-50/50 border border-orange-100/60 px-3 py-1.5 text-xs text-orange-850 animate-in fade-in slide-in-from-top-1 duration-200">
                          <svg className="h-3.5 w-3.5 text-orange-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 12h15" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <span className="text-slate-500 font-medium">Dòng tiền sẽ được đưa vào quỹ: </span>
                            <strong className="text-orange-950 font-bold">{selectedFundObj.name}</strong>
                            {selectedFundObj.bank_name && (
                              <span className="text-[10px] text-orange-600 font-medium ml-1">({selectedFundObj.bank_name})</span>
                            )}
                          </div>
                        </div>
                      )}

                      {isPrepaid && (
                        <div className="flex justify-between items-center text-xs px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-semibold border border-emerald-100">
                          <span>Số dư ví trả trước khả dụng:</span>
                          <span>
                            {localCustomer ? `${fmtVND(Number(localCustomer.prepaid_balance || 0))}` : 'Khách lẻ (0đ)'}
                          </span>
                        </div>
                      )}
                      {isDebt && (
                        <div className="flex justify-between items-center text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 font-semibold border border-red-100">
                          <span>Nợ hiện tại / Hạn mức nợ:</span>
                          <span>
                            {localCustomer ? `${fmtVND(Number(localCustomer.debt_amount || 0))} / ${fmtVND(Number(localCustomer.credit_limit || 0))}` : 'Khách lẻ (Không nợ)'}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Summary rows */}
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Số tiền nhận:</span>
                    <span className={remaining > 0 ? 'font-medium text-red-500' : 'font-medium text-green-600'}>
                      {fmtVND(totalPaid)}
                      {remaining > 0 && (
                        <span className="ml-2 text-xs">còn thiếu {fmtVND(remaining)}</span>
                      )}
                    </span>
                  </div>
                  {remaining < 0 && cashRows.length > 0 && cashChange > 0 && (
                    <div className="flex items-center justify-between border-t border-slate-200 pt-1">
                      <span className="text-slate-500">Trả lại tiền thừa:</span>
                      <span className="font-semibold text-red-500">{fmtVND(cashChange)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col sm:flex-row gap-3 border-t border-slate-100 px-5 py-4">
              <button
                onClick={onClose}
                disabled={saving}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-650 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                Đóng
              </button>

              <div className="flex-1 flex flex-col sm:flex-row gap-3">
                {/* Green button: Lưu & xác nhận (Đã thu) */}
                <button
                  onClick={() => handleSubmit({ bypassQr: true })}
                  disabled={saving || items.length === 0 || remaining > 0}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2.5 px-4 text-sm font-bold text-white shadow-xs disabled:opacity-40 transition-all active:scale-98"
                >
                  <svg className="h-4.5 w-4.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Lưu & xác nhận
                </button>

                {/* Primary brand yellow button: Lưu & chờ thanh toán */}
                {bankTransferAmt > 0 && (
                  <button
                    onClick={() => handleSubmit({ bypassQr: false })}
                    disabled={saving || items.length === 0 || remaining > 0}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary-dark py-2.5 px-4 text-sm font-bold text-white shadow-xs disabled:opacity-40 transition-all active:scale-98 animate-in fade-in slide-in-from-right-1 duration-200"
                  >
                    Lưu & chờ thanh toán
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
