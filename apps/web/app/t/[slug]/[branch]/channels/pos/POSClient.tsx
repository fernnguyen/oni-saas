'use client'
import { useState } from 'react'
import { usePOSHydration } from '@/hooks/usePOSHydration'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { useCart } from '@/hooks/useCart'
import type { LocalCustomer } from '@/lib/localDb/schema'
import { ProductGrid } from './components/ProductGrid'
import { CartPanel } from './components/CartPanel'
import { CheckoutModal } from './components/CheckoutModal'

interface Props {
  shopId: string
  branchId: string
  shopName: string
  userEmail: string
  backPath: string
}

export function POSClient({ shopId, branchId, shopName, userEmail, backPath }: Props) {
  const { status, lastHydratedAt, refresh, isStale } = usePOSHydration(shopId, branchId)
  const isOnline = useNetworkStatus()
  const cart = useCart()
  const [customer, setCustomer] = useState<LocalCustomer | null>(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)

  // Full-screen loading only on first hydration (no prior data)
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

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-3">
          <a
            href={backPath}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="Về trang quản lý"
          >
            ←
          </a>
          <span className="font-semibold text-slate-900">{shopName}</span>
          <span className="text-slate-300">|</span>
          <span className="text-sm text-slate-500">POS</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Network status */}
          <div className="flex items-center gap-1.5 text-xs">
            <span
              className={[
                'h-2 w-2 rounded-full',
                isOnline ? 'bg-green-500' : 'bg-red-500',
              ].join(' ')}
            />
            <span className={isOnline ? 'text-green-600' : 'text-red-500'}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          {/* Sync indicator */}
          {status === 'loading' && (
            <span className="text-xs text-slate-400">Đang đồng bộ...</span>
          )}
          {isStale && status === 'ready' && isOnline && (
            <button
              onClick={refresh}
              className="text-xs text-[#0268FF] hover:underline"
            >
              Làm mới dữ liệu
            </button>
          )}

          <span className="text-xs text-slate-400">{userEmail}</span>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Product grid — left 3/5 */}
        <div className="flex-1 overflow-hidden border-r border-slate-200 bg-white">
          <ProductGrid branchId={branchId} onAddToCart={cart.addItem} />
        </div>

        {/* Cart panel — right 2/5, min 320px */}
        <div className="w-80 shrink-0 overflow-hidden xl:w-96">
          <CartPanel
            items={cart.items}
            subtotal={cart.subtotal}
            discount_amount={cart.discount_amount}
            total={cart.total}
            note={cart.note}
            customer={customer}
            onCustomerChange={setCustomer}
            onQtyChange={cart.setQty}
            onRemove={cart.removeItem}
            onDiscountChange={cart.setOrderDiscount}
            onNoteChange={cart.setNote}
            onCheckout={() => setCheckoutOpen(true)}
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
