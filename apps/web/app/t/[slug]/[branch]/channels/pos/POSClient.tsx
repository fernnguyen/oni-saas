'use client'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { usePOSHydration } from '@/hooks/usePOSHydration'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { useCart, type CartItem } from '@/hooks/useCart'
import type { LocalCustomer } from '@/lib/localDb/schema'
import { SyncWorker } from '@/lib/pos/syncWorker'
import { ProductGrid } from './components/ProductGrid'
import { CartPanel } from './components/CartPanel'
import { CheckoutModal } from './components/CheckoutModal'
import { SyncStatusBar } from './components/SyncStatusBar'

interface Props {
  shopId: string
  branchId: string
  shopName: string
  userEmail: string
  backPath: string
}

interface HeldCart {
  id: string
  label: string
  items: CartItem[]
  customer: LocalCustomer | null
  discount_amount: number
  note: string
}

export function POSClient({ shopId, branchId, shopName, userEmail, backPath }: Props) {
  const { status, lastHydratedAt, refresh } = usePOSHydration(shopId, branchId)
  const isOnline = useNetworkStatus()
  const cart = useCart()
  const [customer, setCustomer] = useState<LocalCustomer | null>(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([])
  const [showHeld, setShowHeld] = useState(false)
  const workerRef = useRef<SyncWorker | null>(null)

  // Start sync worker on mount, stop on unmount
  useEffect(() => {
    const worker = new SyncWorker(shopId)
    workerRef.current = worker
    void worker.start()
    return () => worker.stop()
  }, [shopId])

  // Flush pending queue whenever network comes back (hydration is handled by usePOSHydration)
  useEffect(() => {
    if (isOnline) workerRef.current?.flushAll()
  }, [isOnline])

  // No local data + no network → cannot start POS
  if (!lastHydratedAt && !isOnline) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
        <div className="text-4xl">📡</div>
        <p className="text-base font-semibold text-slate-800">Cần kết nối mạng lần đầu</p>
        <p className="max-w-xs text-sm text-slate-500">
          POS cần tải dữ liệu từ server khi sử dụng lần đầu. Vui lòng bật Wifi hoặc 4G rồi thử lại.
        </p>
        <button
          onClick={() => refresh()}
          className="rounded-xl bg-[#0268FF] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0256CC] transition-colors"
        >
          Thử lại
        </button>
      </div>
    )
  }

  // Full-screen loader only on first-ever hydration
  if (status === 'idle' || (status === 'loading' && !lastHydratedAt)) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[#0268FF] border-t-transparent" />
          <p className="text-sm text-slate-500">Đang tải dữ liệu POS...</p>
        </div>
      </div>
    )
  }

  function holdCurrentCart() {
    if (cart.items.length === 0) return
    const label = `Đơn ${heldCarts.length + 1}`
    setHeldCarts((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label,
        items: cart.items,
        customer,
        discount_amount: cart.discount_amount,
        note: cart.note,
      },
    ])
    cart.clear()
    setCustomer(null)
    toast.success(`Đã giữ "${label}"`)
  }

  function loadHeldCart(held: HeldCart) {
    // Save current cart back to held list if non-empty
    if (cart.items.length > 0) {
      const currentLabel = `Đơn ${heldCarts.length + 1}`
      setHeldCarts((prev) => [
        ...prev.filter((h) => h.id !== held.id),
        {
          id: crypto.randomUUID(),
          label: currentLabel,
          items: cart.items,
          customer,
          discount_amount: cart.discount_amount,
          note: cart.note,
        },
      ])
    } else {
      setHeldCarts((prev) => prev.filter((h) => h.id !== held.id))
    }

    cart.restore({ items: held.items, discount_amount: held.discount_amount, note: held.note })
    setCustomer(held.customer)
    setShowHeld(false)
    toast(`Đã tải "${held.label}"`)
  }

  function discardHeldCart(id: string) {
    setHeldCarts((prev) => prev.filter((h) => h.id !== id))
  }

  function clearCart() {
    cart.clear()
    setCustomer(null)
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <a
            href={backPath}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            title="Về trang quản lý"
          >
            ←
          </a>
          <span className="truncate font-semibold text-slate-900">{shopName}</span>
          <span className="text-slate-300 shrink-0">·</span>
          <span className="shrink-0 rounded bg-[#0268FF]/10 px-2 py-0.5 text-xs font-medium text-[#0268FF]">
            POS
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Held carts button */}
          {heldCarts.length > 0 && (
            <button
              onClick={() => setShowHeld((v) => !v)}
              className="relative rounded-lg border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100 transition-colors"
            >
              📋 {heldCarts.length} đơn giữ
            </button>
          )}

          {/* Sync button — always visible */}
          <button
            onClick={() => {
              if (!isOnline) { toast.error('Không có kết nối mạng'); return }
              refresh()
              workerRef.current?.flushAll()
            }}
            disabled={status === 'loading'}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            title="Đồng bộ dữ liệu mới nhất từ server"
          >
            <span className={status === 'loading' ? 'animate-spin' : ''}>⟳</span>
            {status === 'loading' ? 'Đang đồng bộ...' : 'Đồng bộ'}
          </button>

          {/* Network indicator */}
          <div className="flex items-center gap-1 text-xs">
            <span className={['h-2 w-2 rounded-full', isOnline ? 'bg-green-500' : 'bg-red-500'].join(' ')} />
            <span className={isOnline ? 'text-green-600' : 'text-red-500'}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          <span className="hidden text-xs text-slate-400 sm:block">{userEmail}</span>
        </div>
      </header>

      {/* Sync status bar */}
      <SyncStatusBar
        isOnline={isOnline}
        onRetryFailed={() => workerRef.current?.retryFailed()}
      />

      {/* Held carts dropdown */}
      {showHeld && heldCarts.length > 0 && (
        <div className="z-30 border-b border-orange-100 bg-orange-50 px-4 py-2">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="shrink-0 text-xs font-medium text-orange-700">Đơn đang giữ:</span>
            {heldCarts.map((h) => (
              <div key={h.id} className="flex shrink-0 items-center gap-1 rounded-lg border border-orange-200 bg-white px-2 py-1">
                <button
                  onClick={() => loadHeldCart(h)}
                  className="text-xs font-medium text-slate-700 hover:text-[#0268FF]"
                >
                  {h.label} ({h.items.length} sp)
                </button>
                <button
                  onClick={() => discardHeldCart(h.id)}
                  className="text-slate-300 hover:text-red-400 text-xs"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Product grid */}
        <div className="flex-1 overflow-hidden border-r border-slate-200 bg-white">
          <ProductGrid branchId={branchId} onAddToCart={cart.addItem} />
        </div>

        {/* Cart panel */}
        <div className="w-80 shrink-0 overflow-hidden xl:w-96">
          <CartPanel
            items={cart.items}
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

      {/* Checkout modal */}
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
        shopId={shopId}
        branchId={branchId}
        shopName={shopName}
        employeeId={userEmail}
      />
    </div>
  )
}
