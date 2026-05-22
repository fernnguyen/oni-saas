'use client'
import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { localDb, type LocalOrder, type LocalOrderItem } from '@/lib/localDb/schema'
import { useQuery } from '@tanstack/react-query'
import { printBill } from '@/lib/pos/printBill'
import type { CartItem } from '@/hooks/useCart'
import type { LocalCustomer } from '@/lib/localDb/schema'
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog'

interface Props {
  open: boolean
  onClose: () => void
  shopName: string
  ordersPath: string
  shopId: string
  onCopyToNewTab: (customer: LocalCustomer | null, items: CartItem[], discountAmount: number, note: string) => void
}

const SYNC_LABELS: Record<string, { label: string; cls: string }> = {
  pending:  { label: 'Chờ sync',   cls: 'bg-yellow-100 text-yellow-700' },
  syncing:  { label: 'Đang sync',  cls: 'bg-blue-100 text-blue-700' },
  done:     { label: 'Đã sync',    cls: 'bg-green-100 text-green-700' },
  failed:   { label: 'Lỗi sync',   cls: 'bg-red-100 text-red-600' },
  cancelled: { label: 'Đã hủy',     cls: 'bg-slate-100 text-slate-500 line-through' },
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
  onCopyToNewTab,
}: Props) {
  const [todayOrders, setTodayOrders] = useState<LocalOrder[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<LocalOrderItem[]>([])
  const [reprintTarget, setReprintTarget] = useState<LocalOrder | null>(null)

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
      return
    }
    const items = await localDb.orderItems
      .where('order_local_id').equals(order.local_id)
      .toArray()
    setExpandedItems(items)
    setExpandedId(order.local_id)
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
