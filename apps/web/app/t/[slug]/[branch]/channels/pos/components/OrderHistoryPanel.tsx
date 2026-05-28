'use client'
import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { localDb, type LocalOrder, type LocalOrderItem, type LocalPayment } from '@/lib/localDb/schema'
import { useQuery } from '@tanstack/react-query'
import { printBill } from '@/lib/pos/printBill'
import type { CartItem } from '@/hooks/useCart'
import type { LocalCustomer } from '@/lib/localDb/schema'
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog'
import { useConfirm } from '@/app/components/ui/ConfirmProvider'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
  shopName: string
  ordersPath: string
  shopId: string
  branchId: string
  onCopyToNewTab: (customer: LocalCustomer | null, items: CartItem[], discountAmount: number, note: string) => void
  onCancelAndEdit: (order: LocalOrder) => Promise<boolean>
}

const SYNC_LABELS: Record<string, { label: string; cls: string }> = {
  pending:  { label: 'Chờ thanh toán', cls: 'bg-yellow-100 text-yellow-750 font-bold' },
  syncing:  { label: 'Đang sync',  cls: 'bg-blue-100 text-blue-700' },
  done:     { label: 'Đã sync',    cls: 'bg-green-100 text-green-700' },
  failed:   { label: 'Lỗi sync',   cls: 'bg-red-100 text-red-600' },
  cancelled: { label: 'Đã hủy',     cls: 'bg-slate-100 text-slate-500 line-through' },
}

const METHOD_LABEL: Record<string, string> = {
  cash: 'Tiền mặt',
  card: 'Thẻ',
  bank_transfer: 'Chuyển khoản',
  momo: 'MoMo',
  vnpay: 'VNPay',
  zalopay: 'ZaloPay',
  debt: 'Ghi nợ',
  prepaid: 'Ví trả trước',
}

function fmtVND(v: number | string | null | undefined) {
  return Number(v ?? 0).toLocaleString('vi-VN') + 'đ'
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function todayPrefix() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function OrderHistoryPanel({
  open,
  onClose,
  shopName,
  ordersPath,
  shopId,
  branchId,
  onCopyToNewTab,
  onCancelAndEdit,
}: Props) {
  const confirm = useConfirm()
  const [todayOrders, setTodayOrders] = useState<LocalOrder[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<LocalOrderItem[]>([])
  const [expandedPayments, setExpandedPayments] = useState<LocalPayment[]>([])
  const [reprintTarget, setReprintTarget] = useState<LocalOrder | null>(null)

  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)
  const [selectedFundIdForCorrection, setSelectedFundIdForCorrection] = useState('')
  const [initialFundId, setInitialFundId] = useState<string | null>(null)
  const [savingPaymentCorrection, setSavingPaymentCorrection] = useState(false)

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

  const { data: settings } = useQuery({
    queryKey: ['settings', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/settings`)
      if (!res.ok) return {}
      return res.json()
    },
    enabled: !!shopId && open,
  })

  useEffect(() => {
    const prefix = todayPrefix()
    const sub = liveQuery(() =>
      localDb.orders
        .where('created_at').startsWith(prefix)
        .reverse()
        .toArray()
    ).subscribe({
      next: setTodayOrders,
      error: () => {},
    })
    return () => sub.unsubscribe()
  }, [])

  async function toggleExpand(order: LocalOrder) {
    if (expandedId === order.local_id) {
      setExpandedId(null)
      setEditingPaymentId(null)
      return
    }
    const [items, payments] = await Promise.all([
      localDb.orderItems.where('order_local_id').equals(order.local_id).toArray(),
      localDb.payments.where('order_local_id').equals(order.local_id).toArray()
    ])
    setExpandedItems(items)
    setExpandedPayments(payments)
    setExpandedId(order.local_id)
    setEditingPaymentId(null)

    // Merge server payments to get accurate transaction notes and reference codes
    if (order.server_id) {
      try {
        const sPayRes = await fetch(`/api/shops/${shopId}/payments?order_id=${order.server_id}&limit=50`)
        if (sPayRes.ok) {
          const sPayData = await sPayRes.json()
          const sPayments = sPayData.data || []
          
          const mergedPayments = payments.map(p => {
            const match = sPayments.find((sp: any) => 
              sp.id === p.local_id || 
              sp.payment_id === p.local_id ||
              Math.abs(parseFloat(sp.amount || '0')) === Math.abs(p.amount)
            )
            if (match) {
              return {
                ...p,
                reference_no: match.reference_no || p.reference_no,
                note: match.note || p.note,
                method: match.method || p.method,
                fund_id: match.fund_id || p.fund_id
              }
            }
            return p
          })

          sPayments.forEach((sp: any) => {
            const exists = mergedPayments.some(p => 
              p.local_id === (sp.id || sp.payment_id) || 
              Math.abs(parseFloat(sp.amount || '0')) === Math.abs(parseFloat(sp.amount || '0')) && p.method === sp.method
            )
            if (!exists) {
              mergedPayments.push({
                local_id: sp.id || sp.payment_id,
                order_local_id: order.local_id,
                method: sp.method,
                amount: parseFloat(sp.amount || '0'),
                reference_no: sp.reference_no || '',
                note: sp.note || '',
                fund_id: sp.fund_id || ''
              })
            }
          })

          setExpandedPayments(mergedPayments)
        }
      } catch (e) {
        console.error('Failed to merge server payments:', e)
      }
    }
  }

  async function handleConfirmPaymentCorrection(p: LocalPayment) {
    const selectedFund = fundsList.find(f => f.id === selectedFundIdForCorrection)
    if (!selectedFund) {
      toast.error('Vui lòng chọn quỹ thanh toán hợp lệ')
      return
    }

    let newMethod = 'bank_transfer'
    if (selectedFund.type === 'cash') newMethod = 'cash'
    else if (selectedFund.type === 'wallet') newMethod = 'wallet'

    if (p.method === newMethod && (initialFundId === selectedFund.id || p.fund_id === selectedFund.id)) {
      toast.info('Phương thức thanh toán và quỹ nhận không thay đổi so với hiện tại')
      setEditingPaymentId(null)
      return
    }

    await confirm({
      title: 'Xác nhận đổi phương thức thanh toán',
      description: 'Hệ thống sẽ cập nhật lại phương thức thanh toán của đơn hàng này và đồng bộ về Sổ quỹ. Bạn có chắc chắn muốn tiếp tục?',
      confirmLabel: 'Đồng ý',
      cancelLabel: 'Bỏ qua',
      onConfirm: async () => {
        setSavingPaymentCorrection(true)
        try {
          const order = todayOrders.find(o => o.local_id === expandedId)

          // 1. Update server side first if already synced
          if (order && order.server_id) {
            let serverPaymentId = p.local_id
            try {
              const sPayRes = await fetch(`/api/shops/${shopId}/payments?order_id=${order.server_id}&limit=50`)
              if (sPayRes.ok) {
                const sPayData = await sPayRes.json()
                const sPayments = sPayData.data || []
                const matchingSPay = sPayments.find((sp: any) => sp.id === p.local_id || sp.payment_id === p.local_id) ||
                                     sPayments.find((sp: any) => Math.abs(parseFloat(sp.amount || '0')) === Math.abs(p.amount)) ||
                                     sPayments[0]
                if (matchingSPay) {
                  serverPaymentId = matchingSPay.id || matchingSPay.payment_id
                }
              }
            } catch (e) {
              console.error('Failed to map client payment to server payment:', e)
            }

            const res = await fetch(`/api/shops/${shopId}/payments/${serverPaymentId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ method: newMethod, fund_id: selectedFund.id })
            })
            if (!res.ok) {
              const err = await res.json().catch(() => ({}))
              throw new Error(err.error || 'Cập nhật dòng tiền trên server thất bại')
            }
          }

          // 2. Update local database payments only if server update succeeded
          await localDb.payments.update(p.local_id, { method: newMethod, fund_id: selectedFund.id })

          // 3. Update local db syncQueue if order is pending sync
          if (order && order.sync_status === 'pending') {
            const qItems = await localDb.syncQueue.toArray()
            const targetQ = qItems.find(q => q.local_order_id === order.local_id)
            if (targetQ) {
              const updatedPayments = targetQ.payload.payments.map((py: any) => {
                if (py.local_id === p.local_id) {
                  return { ...py, method: newMethod, fund_id: selectedFund.id }
                }
                return py
              })
              await localDb.syncQueue.update(targetQ.id!, {
                payload: { ...targetQ.payload, payments: updatedPayments }
              })
            }
          }

          // 4. Update component state
          setExpandedPayments(prev => prev.map(py => py.local_id === p.local_id ? { ...py, method: newMethod, fund_id: selectedFund.id } : py))
          setEditingPaymentId(null)
          toast.success('Đã cập nhật phương thức thanh toán thành công!')
        } catch (err: any) {
          console.error(err)
          toast.error(err.message || 'Lỗi khi cập nhật thanh toán')
          throw err
        } finally {
          setSavingPaymentCorrection(false)
        }
      }
    })
  }

  async function handleReprint(order: LocalOrder) {
    const items = await localDb.orderItems.where('order_local_id').equals(order.local_id).toArray()
    const payments = await localDb.payments.where('order_local_id').equals(order.local_id).toArray()
    
    // Update print count
    const newCount = (order.print_count || 0) + 1
    await localDb.orders.update(order.local_id, { print_count: newCount })
    
    await printBill({ order, items, payments, shopName, settings, printCount: newCount, shopId })
    
    // Fire and forget server update if order was synced
    if (order.server_id) {
      fetch(`/api/shops/${shopId}/orders/${order.server_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ print_count: String(newCount) })
      }).catch(console.error)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Drawer from right */}
      <div className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">Quản lý đơn hàng</h2>
            <a href={ordersPath} className="text-xs text-primary hover:underline shrink-0">Xem tất cả →</a>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="divide-y divide-slate-100">
            {todayOrders.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">Chưa có đơn hàng hôm nay</p>
            ) : (
              todayOrders.map((order) => {
                const sync = SYNC_LABELS[order.status === 'cancelled' ? 'cancelled' : order.sync_status] ?? SYNC_LABELS.pending
                const isExpanded = expandedId === order.local_id
                return (
                  <div key={order.local_id}>
                    <button
                      onClick={() => toggleExpand(order)}
                      className="flex w-full items-start justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-900">
                            {order.order_no ?? order.server_id ?? `LORD-${order.local_id.slice(-8).toUpperCase()}`}
                          </p>
                          <span className={['rounded px-1.5 py-0.5 text-[10px] font-medium', sync.cls].join(' ')}>
                            {sync.label}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {fmtTime(order.created_at)}
                          {order.customer_name && ` · ${order.customer_name}`}
                        </p>
                      </div>
                      <div className="ml-3 shrink-0 text-right">
                        <p className="text-sm font-semibold text-slate-900">
                          {fmtVND(order.total_amount)}
                        </p>
                        <p className="text-[10px] text-slate-400">{isExpanded ? '▲' : '▼'}</p>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                        <div className="space-y-1 text-xs">
                          {expandedItems.map((it) => (
                            <div key={it.local_id} className="flex justify-between text-slate-700">
                              <span>{it.product_name} × {it.qty}</span>
                              <span>{fmtVND(it.line_total)}</span>
                            </div>
                          ))}
                        </div>
                        {order.discount_amount > 0 && (
                          <div className="mt-2 flex justify-between text-xs text-orange-600">
                            <span>Giảm giá</span><span>−{fmtVND(order.discount_amount)}</span>
                          </div>
                        )}
                        {order.note && (
                          <p className="mt-2 text-xs italic text-slate-400">{order.note}</p>
                        )}

                        {expandedPayments.length > 0 && (
                          <div className="mt-3 border-t border-slate-200/60 pt-2.5 space-y-2">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Thanh toán</p>
                            {expandedPayments.map((p) => {
                              const isEditing = editingPaymentId === p.local_id
                              return (
                                <div key={p.local_id} className="flex flex-col gap-1.5 p-2 rounded-lg bg-white border border-slate-100 shadow-3xs">
                                  <div className="flex justify-between items-start text-xs text-slate-700">
                                    <div className="flex flex-col min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-semibold text-slate-800">
                                          {METHOD_LABEL[p.method] ?? p.method}
                                        </span>
                                        {order.status !== 'cancelled' && !isEditing && (
                                          <button
                                            onClick={async () => {
                                              setEditingPaymentId(p.local_id)
                                              let currentFundId = p.fund_id || ''
                                              if (order.server_id) {
                                                try {
                                                  const cbRes = await fetch(`/api/shops/${shopId}/cashbook?reference_id=${order.server_id}&limit=50`)
                                                  if (cbRes.ok) {
                                                    const cbData = await cbRes.json()
                                                    const cbList = cbData.data || []
                                                    const matchingCb = cbList.find((cb: any) => 
                                                      cb.method === p.method && 
                                                      Math.abs(parseFloat(cb.amount || '0')) === Math.abs(p.amount)
                                                    )
                                                    if (matchingCb?.fund_id) {
                                                      currentFundId = matchingCb.fund_id
                                                    }
                                                  }
                                                } catch (e) {
                                                  console.error('Failed to load current fund from cashbook:', e)
                                                }
                                              }
                                              setSelectedFundIdForCorrection(currentFundId)
                                              setInitialFundId(currentFundId)
                                            }}
                                            className="text-primary hover:underline text-[10px] font-bold"
                                          >
                                            đổi
                                          </button>
                                        )}
                                      </div>
                                      {p.reference_no && (
                                        <span className="text-[10px] font-mono text-slate-500 mt-0.5">
                                          Mã GD: {p.reference_no}
                                        </span>
                                      )}
                                      {p.note && (
                                        <p className="text-[10px] text-slate-400 mt-0.5 whitespace-pre-wrap break-all max-w-[260px]">
                                          Nội dung: {p.note}
                                        </p>
                                      )}
                                    </div>
                                    <span className="font-bold text-slate-900 shrink-0">{fmtVND(p.amount)}</span>
                                  </div>

                                  {isEditing && (
                                    <div className="mt-1.5 flex flex-col gap-2 p-2 rounded-md bg-slate-50 border border-slate-200/60">
                                      <div>
                                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Chọn Quỹ / Sổ Quỹ đích</label>
                                        <select
                                          value={selectedFundIdForCorrection}
                                          onChange={(e) => setSelectedFundIdForCorrection(e.target.value)}
                                          disabled={savingPaymentCorrection}
                                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-750 focus:border-primary focus:outline-none cursor-pointer disabled:opacity-50"
                                        >
                                          <option value="">-- Chọn quỹ nhận --</option>
                                          {fundsList.map((fund) => (
                                            <option key={fund.id} value={fund.id}>
                                              {fund.name} {fund.bank_name ? `(${fund.bank_name})` : ''} {fund.id === initialFundId ? ' (Hiện tại)' : ''}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="flex justify-end gap-1.5">
                                        <button
                                          onClick={() => setEditingPaymentId(null)}
                                          disabled={savingPaymentCorrection}
                                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-650 hover:bg-slate-50 disabled:opacity-50"
                                        >
                                          Hủy
                                        </button>
                                        <button
                                          onClick={() => handleConfirmPaymentCorrection(p)}
                                          disabled={savingPaymentCorrection || !selectedFundIdForCorrection}
                                          className="rounded-md bg-primary hover:bg-primary-dark px-2.5 py-1 text-[10px] font-bold text-white shadow-3xs disabled:opacity-50 flex items-center gap-1.5 active:scale-95 transition-all"
                                        >
                                          {savingPaymentCorrection ? (
                                            <>
                                              <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                              </svg>
                                              <span>Đang lưu...</span>
                                            </>
                                          ) : (
                                            'Lưu'
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}

                        <div className="my-3 border-t border-slate-200/60" />

                        {order.status === 'pending' && (
                          <button
                            onClick={async () => {
                              const ok = await onCancelAndEdit(order)
                              if (ok) {
                                onClose()
                              }
                            }}
                            className="w-full mb-2 flex items-center justify-center gap-1.5 rounded-lg bg-primary hover:bg-primary-dark text-white py-2 text-xs font-bold transition-colors cursor-pointer"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                            Thanh toán tiếp / Đổi phương thức
                          </button>
                        )}
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => {
                              const currentCount = parseInt(String(order.print_count || '0'), 10)
                              if (currentCount > 0) {
                                setReprintTarget(order)
                              } else {
                                handleReprint(order)
                              }
                            }}
                            className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs text-slate-600 hover:bg-white transition-colors"
                          >
                            In lại bill
                          </button>
                          <button
                            onClick={async () => {
                              const items = await localDb.orderItems.where('order_local_id').equals(order.local_id).toArray()
                              const cartItems: CartItem[] = items.map(it => ({
                                product_id: it.product_id,
                                product_name: it.product_name,
                                qty: it.qty,
                                unit_price: it.unit_price,
                                cost_price: it.cost_price,
                                discount_amount: it.discount_amount,
                                line_total: it.line_total,
                                variant_label: it.variant_label,
                                modifiers: it.modifiers ? JSON.parse(it.modifiers) : undefined,
                                modifier_total: it.modifier_total,
                                unit_id: it.unit_id,
                                unit_name: it.unit_name,
                                conversion_rate: it.conversion_rate
                              }))
                              let orderCustomer: LocalCustomer | null = null
                              if (order.customer_id) {
                                orderCustomer = await localDb.customers.get(order.customer_id) || null
                              }
                              onCopyToNewTab(orderCustomer, cartItems, order.discount_amount, order.note || '')
                              onClose()
                            }}
                            className="flex-1 rounded-lg border border-blue-200 bg-blue-50 py-1.5 text-xs text-blue-600 hover:bg-blue-100 hover:border-blue-300 transition-colors"
                          >
                            Sao chép đơn
                          </button>

                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
      
      <ConfirmDialog
        open={!!reprintTarget}
        title="In lại phiếu thanh toán"
        description={`Đơn hàng này đã được in. In lại sẽ ghi chú "(In lại lần ${parseInt(String(reprintTarget?.print_count || '0'), 10)})" trên phiếu. Bạn có muốn tiếp tục?`}
        confirmLabel="In lại"
        cancelLabel="Hủy"
        onConfirm={() => {
          if (reprintTarget) handleReprint(reprintTarget)
          setReprintTarget(null)
        }}
        onClose={() => setReprintTarget(null)}
      />


    </div>
  )
}
