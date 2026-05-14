'use client'
import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { localDb, type LocalOrder, type LocalOrderItem } from '@/lib/localDb/schema'
import { useQuery } from '@tanstack/react-query'
import { printBill } from '@/lib/pos/printBill'
import type { CartItem } from '@/hooks/useCart'
import type { LocalCustomer } from '@/lib/localDb/schema'
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog'

interface HeldCart {
  id: string
  label: string
  items: CartItem[]
  customer: LocalCustomer | null
  discount_amount: number
  note: string
}

interface Props {
  open: boolean
  onClose: () => void
  heldCarts: HeldCart[]
  onLoadHeld: (held: HeldCart) => void
  onDiscardHeld: (id: string) => void
  shopName: string
  ordersPath: string
  shopId: string
}

const SYNC_LABELS: Record<string, { label: string; cls: string }> = {
  pending:  { label: 'Chờ sync',   cls: 'bg-yellow-100 text-yellow-700' },
  syncing:  { label: 'Đang sync',  cls: 'bg-blue-100 text-blue-700' },
  done:     { label: 'Đã sync',    cls: 'bg-green-100 text-green-700' },
  failed:   { label: 'Lỗi sync',   cls: 'bg-red-100 text-red-600' },
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

export function OrderHistoryPanel({ open, onClose, heldCarts, onLoadHeld, onDiscardHeld, shopName, ordersPath, shopId }: Props) {
  const [tab, setTab] = useState<'held' | 'today'>('held')
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

  // Switch to "today" tab when panel opens if no held carts
  useEffect(() => {
    if (open && heldCarts.length === 0) setTab('today')
  }, [open, heldCarts.length])

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

        {/* Tabs */}
        <div className="flex shrink-0 border-b border-slate-100">
          <button
            onClick={() => setTab('held')}
            className={[
              'flex-1 py-2.5 text-xs font-medium transition-colors',
              tab === 'held'
                ? 'border-b-2 border-primary text-primary'
                : 'text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            Đang giữ
            {heldCarts.length > 0 && (
              <span className="ml-1.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700">
                {heldCarts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('today')}
            className={[
              'flex-1 py-2.5 text-xs font-medium transition-colors',
              tab === 'today'
                ? 'border-b-2 border-primary text-primary'
                : 'text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            Đơn hôm nay
            {todayOrders.length > 0 && (
              <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                {todayOrders.length}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Held carts tab ── */}
          {tab === 'held' && (
            <div className="divide-y divide-slate-100">
              {heldCarts.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">Không có đơn đang giữ</p>
              ) : (
                heldCarts.map((h) => (
                  <div key={h.id} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{h.label}</p>
                      <p className="text-xs text-slate-500">
                        {h.items.length} sản phẩm
                        {h.customer && ` · ${h.customer.name}`}
                        {h.discount_amount > 0 && ` · giảm ${fmtVND(h.discount_amount)}`}
                      </p>
                      <p className="text-xs font-semibold text-primary">
                        {fmtVND(h.items.reduce((s, i) => s + Number(i.line_total), 0) - Number(h.discount_amount))}
                      </p>
                    </div>
                    <div className="ml-3 flex shrink-0 gap-2">
                      <button
                        onClick={() => { onLoadHeld(h); onClose() }}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark transition-colors"
                      >
                        Tải
                      </button>
                      <button
                        onClick={() => onDiscardHeld(h.id)}
                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-400 hover:border-red-200 hover:text-red-400 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Today's orders tab ── */}
          {tab === 'today' && (
            <div className="divide-y divide-slate-100">
              {todayOrders.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">Chưa có đơn hàng hôm nay</p>
              ) : (
                todayOrders.map((order) => {
                  const sync = SYNC_LABELS[order.sync_status] ?? SYNC_LABELS.pending
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
                              {order.server_id ?? order.local_id.slice(0, 8) + '…'}
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
                          <button
                            onClick={() => {
                              const currentCount = parseInt(String(order.print_count || '0'), 10)
                              if (currentCount > 0) {
                                setReprintTarget(order)
                              } else {
                                handleReprint(order)
                              }
                            }}
                            className="mt-3 w-full rounded-lg border border-slate-200 py-1.5 text-xs text-slate-600 hover:bg-white transition-colors"
                          >
                            In lại bill
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
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
