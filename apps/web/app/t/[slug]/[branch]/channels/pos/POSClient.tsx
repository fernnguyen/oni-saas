'use client'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { liveQuery } from 'dexie'
import { usePOSHydration } from '@/hooks/usePOSHydration'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { useCart, type CartItem } from '@/hooks/useCart'
import { useConfirm } from '@/app/components/ui/ConfirmProvider'
import { localDb, type LocalInventory, type LocalCustomer } from '@/lib/localDb/schema'
import { SyncWorker } from '@/lib/pos/syncWorker'
import { IconClipboard } from '@/app/components/layout/nav'
import { ProductGrid } from './components/ProductGrid'
import { CartPanel } from './components/CartPanel'
import { CheckoutModal } from './components/CheckoutModal'
import { SyncStatusBar } from './components/SyncStatusBar'
import { OrderHistoryPanel } from './components/OrderHistoryPanel'

interface Props {
  shopId: string
  branchId: string
  shopName: string
  userEmail: string
  backPath: string
}

export interface HeldCart {
  id: string
  label: string
  items: CartItem[]
  customer: LocalCustomer | null
  discount_amount: number
  note: string
}

// Break out of DashboardShell padding, fill exactly the space below topbar (h-14 = 3.5rem)
const shellCls = '-mx-4 -my-4 md:-mx-6 md:-my-6 flex flex-col bg-slate-50 overflow-hidden'
const shellStyle = { height: 'calc(100vh - 3.5rem)' } as const

export function POSClient({ shopId, branchId, shopName, userEmail, backPath }: Props) {
  const { status, lastHydratedAt, refresh } = usePOSHydration(shopId, branchId)
  const isOnline = useNetworkStatus()
  const confirm = useConfirm()
  const [inventory, setInventory] = useState<Map<string, number>>(new Map())
  const cart = useCart(inventory)
  const [customer, setCustomer] = useState<LocalCustomer | null>(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([])
  const [orderPanelOpen, setOrderPanelOpen] = useState(false)
  const cartHydratedRef = useRef(false)
  const workerRef = useRef<SyncWorker | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('oni-held-carts')
      if (stored) setHeldCarts(JSON.parse(stored))
    } catch {}
    cartHydratedRef.current = true
  }, [])

  useEffect(() => {
    if (!cartHydratedRef.current) return
    localStorage.setItem('oni-held-carts', JSON.stringify(heldCarts))
  }, [heldCarts])

  useEffect(() => {
    const sub = liveQuery(() => localDb.inventory.toArray()).subscribe({
      next: (rows: LocalInventory[]) => {
        const map = new Map<string, number>()
        rows.forEach((r) => map.set(r.product_id, (map.get(r.product_id) ?? 0) + Number(r.stock_qty)))
        setInventory(map)
      },
      error: () => {},
    })
    return () => sub.unsubscribe()
  }, [])

  useEffect(() => {
    const worker = new SyncWorker(shopId)
    worker.setNotifyCallback(({ name, action }) => {
      toast.success(
        action === 'created'
          ? `Đã lưu khách hàng mới: ${name}`
          : `Đã cập nhật khách hàng: ${name}`
      )
    })
    workerRef.current = worker
    void worker.start()
    return () => worker.stop()
  }, [shopId])

  useEffect(() => {
    if (isOnline) workerRef.current?.flushAll()
  }, [isOnline])

  if (!lastHydratedAt && !isOnline) {
    return (
      <div className={shellCls} style={shellStyle}>
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="text-4xl">📡</div>
          <p className="text-base font-semibold text-slate-800">Cần kết nối mạng lần đầu</p>
          <p className="max-w-xs text-sm text-slate-500">
            POS cần tải dữ liệu từ server khi sử dụng lần đầu. Vui lòng bật Wifi hoặc 4G rồi thử lại.
          </p>
          <button
            onClick={() => refresh()}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark transition-colors"
          >
            Thử lại
          </button>
        </div>
      </div>
    )
  }

  if (status === 'idle' || (status === 'loading' && !lastHydratedAt)) {
    return (
      <div className={shellCls} style={shellStyle}>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-slate-500">Đang tải dữ liệu POS...</p>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'error' && !lastHydratedAt) {
    return (
      <div className={shellCls} style={shellStyle}>
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="text-4xl">⚠️</div>
          <p className="text-base font-semibold text-slate-800">Lỗi kết nối dữ liệu</p>
          <p className="max-w-xs text-sm text-slate-500">
            Không thể lấy dữ liệu sản phẩm. Vui lòng kiểm tra lại thiết lập kết nối dữ liệu (Google Sheet hoặc Database) trong Cài đặt Tổ chức.
          </p>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => refresh()}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Thử lại
            </button>
            <a
              href={`/t/${backPath.split('/')[1]}/settings`}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark transition-colors inline-block"
            >
              Đi tới Cài đặt
            </a>
          </div>
        </div>
      </div>
    )
  }

  function holdCurrentCart() {
    if (cart.items.length === 0) return
    const label = `Đơn ${heldCarts.length + 1}`
    setHeldCarts((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label, items: cart.items, customer, discount_amount: cart.discount_amount, note: cart.note },
    ])
    cart.clear()
    setCustomer(null)
    toast.success(`Đã giữ "${label}"`)
  }

  function loadHeldCart(held: HeldCart) {
    if (cart.items.length > 0) {
      const currentLabel = `Đơn ${heldCarts.length + 1}`
      setHeldCarts((prev) => [
        ...prev.filter((h) => h.id !== held.id),
        { id: crypto.randomUUID(), label: currentLabel, items: cart.items, customer, discount_amount: cart.discount_amount, note: cart.note },
      ])
    } else {
      setHeldCarts((prev) => prev.filter((h) => h.id !== held.id))
    }
    cart.restore({ items: held.items, discount_amount: held.discount_amount, note: held.note })
    setCustomer(held.customer)
    toast(`Đã tải "${held.label}"`)
  }

  function discardHeldCart(id: string) {
    setHeldCarts((prev) => prev.filter((h) => h.id !== id))
  }

  async function clearCart() {
    const totalQty = cart.items.reduce((s, i) => s + i.qty, 0)
    const ok = await confirm({
      title: 'Xóa giỏ hàng?',
      description: `Bỏ ${cart.items.length} sản phẩm (${totalQty} đv) ra khỏi đơn.`,
      confirmLabel: 'Xóa giỏ',
      variant: 'danger',
    })
    if (!ok) return
    cart.clear()
    setCustomer(null)
    toast.success(`Đã xóa giỏ hàng (${totalQty} sản phẩm)`)
  }

  const headerBadge = heldCarts.length

  return (
    <div className={shellCls} style={shellStyle}>
      {/* POS toolbar — slim, POS-specific controls only */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <a
            href={backPath}
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors text-sm leading-none"
            title="Về trang quản lý"
          >
            ←
          </a>
          <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            POS
          </span>
          <span className="hidden truncate text-xs font-medium text-slate-500 sm:block">{shopName}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setOrderPanelOpen(true)}
            className="relative flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
            title="Đơn đang giữ và đơn hôm nay"
          >
            <IconClipboard className="h-3.5 w-3.5 shrink-0" /> Đơn hàng
            {headerBadge > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                {headerBadge}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              if (!isOnline) { toast.error('Không có kết nối mạng'); return }
              refresh()
              workerRef.current?.flushAll()
            }}
            disabled={status === 'loading'}
            className="flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            title="Đồng bộ dữ liệu mới nhất từ server"
          >
            <span className={status === 'loading' ? 'animate-spin inline-block' : ''}>⟳</span>
            <span className="hidden sm:inline">{status === 'loading' ? 'Đồng bộ...' : 'Đồng bộ'}</span>
          </button>

          <div className="flex items-center gap-1 text-xs">
            <span className={['h-2 w-2 rounded-full shrink-0', isOnline ? 'bg-green-500' : 'bg-red-500'].join(' ')} />
            <span className={['hidden sm:inline', isOnline ? 'text-green-600' : 'text-red-500'].join(' ')}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </header>

      {/* Sync status banner */}
      <SyncStatusBar
        isOnline={isOnline}
        onRetryFailed={() => workerRef.current?.retryFailed()}
        onRetryAll={() => workerRef.current?.retryAll()}
      />

      {/* Main content — fills all remaining height */}
      <div className="flex flex-1 overflow-hidden">
        {/* Product grid */}
        <div className="flex-1 overflow-hidden border-r border-slate-200 bg-white">
          <ProductGrid branchId={branchId} inventory={inventory} onAddToCart={cart.addItem} />
        </div>

        {/* Cart panel */}
        <div className="w-72 shrink-0 overflow-hidden xl:w-80">
          <CartPanel
            items={cart.items}
            inventory={inventory}
            subtotal={cart.subtotal}
            discount_amount={cart.discount_amount}
            total={cart.total}
            note={cart.note}
            customer={customer}
            heldCount={heldCarts.length}
            onCustomerChange={setCustomer}
            onQtyChange={cart.setQty}
            onRemove={cart.removeItem}
            onDiscountChange={cart.setOrderDiscount}
            onNoteChange={cart.setNote}
            onHold={holdCurrentCart}
            onCheckout={() => setCheckoutOpen(true)}
            onClearCart={clearCart}
          />
        </div>
      </div>

      <OrderHistoryPanel
        open={orderPanelOpen}
        onClose={() => setOrderPanelOpen(false)}
        heldCarts={heldCarts}
        onLoadHeld={loadHeldCart}
        onDiscardHeld={discardHeldCart}
        shopName={shopName}
        ordersPath={`${backPath}/orders`}
      />

      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onSuccess={() => {
          setCheckoutOpen(false)
          cart.clear()
          setCustomer(null)
        }}
        items={cart.items}
        subtotal={cart.subtotal}
        discount_amount={cart.discount_amount}
        total={cart.total}
        note={cart.note}
        customer={customer}
        onCustomerChange={setCustomer}
        shopId={shopId}
        branchId={branchId}
        shopName={shopName}
        employeeId={userEmail}
      />
    </div>
  )
}
