'use client'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { liveQuery } from 'dexie'
import { usePOSHydration } from '@/hooks/usePOSHydration'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { useCart, type CartItem } from '@/hooks/useCart'
import { useQuery } from '@tanstack/react-query'
import { useConfirm } from '@/app/components/ui/ConfirmProvider'
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog'
import { localDb, type LocalInventory, type LocalCustomer, type LocalOrder } from '@/lib/localDb/schema'
import { SyncWorker } from '@/lib/pos/syncWorker'
import { IconClipboard } from '@/app/components/layout/nav'
import { ProductGrid } from './components/ProductGrid'
import { CartPanel } from './components/CartPanel'
import { CheckoutModal } from './components/CheckoutModal'
import { SyncStatusBar } from './components/SyncStatusBar'
import { OrderHistoryPanel } from './components/OrderHistoryPanel'
import { CustomerCreateModal } from './components/CustomerCreateModal'
import QRNotificationCenter from './components/QRNotificationCenter'

interface Props {
  shopId: string
  branchId: string
  shopName: string
  userEmail: string
  backPath: string
  autoPrintReceipt: boolean
  mutePosSound: boolean
  permissions?: string[]
}

export interface OrderTab {
  id: string
  label: string
  items: CartItem[]
  customer: LocalCustomer | null
  discount_amount: number
  note: string
}

export type HeldCart = OrderTab

// Break out of DashboardShell padding, fill exactly the space below topbar (h-14 = 3.5rem)
const shellCls = '-mx-4 -my-4 md:-mx-6 md:-my-6 flex flex-col bg-slate-50 overflow-hidden'
const shellStyle = { height: 'calc(100dvh - 3.5rem)' } as const

export function POSClient({ shopId, branchId, shopName, userEmail, backPath, autoPrintReceipt, mutePosSound, permissions = [] }: Props) {
  const { status, lastHydratedAt, refresh } = usePOSHydration(shopId, branchId)
  const isOnline = useNetworkStatus()
  const confirm = useConfirm()
  const [inventory, setInventory] = useState<Map<string, number>>(new Map())

  const { data: settings } = useQuery({
    queryKey: ['settings', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/settings`)
      if (!res.ok) return {}
      return res.json()
    },
    enabled: !!shopId,
  })

  const allowNegativeStock = settings?.allow_negative_stock ?? false
  const cart = useCart(inventory, branchId, allowNegativeStock)
  const [nearExpiryDays, setNearExpiryDays] = useState<number>(90)
  const [isNearExpiryModalOpen, setIsNearExpiryModalOpen] = useState(false)
  const [tempNearExpiryDays, setTempNearExpiryDays] = useState<string>('90')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('oni-near-expiry-days')
      if (stored) {
        setNearExpiryDays(Number(stored))
        setTempNearExpiryDays(stored)
      } else {
        localStorage.setItem('oni-near-expiry-days', '90')
        setTempNearExpiryDays('90')
      }
    }
  }, [])

  const handleConfigNearExpiry = () => {
    setTempNearExpiryDays(String(nearExpiryDays))
    setIsNearExpiryModalOpen(true)
  }

  const saveNearExpiryDays = () => {
    const days = parseInt(tempNearExpiryDays, 10)
    if (isNaN(days) || days <= 0) {
      toast.error('Số ngày không hợp lệ! Vui lòng nhập số nguyên dương.')
      return
    }
    localStorage.setItem('oni-near-expiry-days', String(days))
    setNearExpiryDays(days)
    setIsNearExpiryModalOpen(false)
    toast.success(`Đã cập nhật cấu hình cận date: ${days} ngày`)
  }
  const [customer, setCustomer] = useState<LocalCustomer | null>(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [activeCartItemId, setActiveCartItemId] = useState<string | null>(null)

  const prevItemsLengthRef = useRef(cart.items.length)
  useEffect(() => {
    if (cart.items.length > 0) {
      const lastItem = cart.items[cart.items.length - 1]
      if (cart.items.length > prevItemsLengthRef.current || !activeCartItemId) {
        setActiveCartItemId(lastItem.product_id)
      } else {
        const exists = cart.items.some((item) => item.product_id === activeCartItemId)
        if (!exists) {
          setActiveCartItemId(lastItem.product_id)
        }
      }
    } else {
      setActiveCartItemId(null)
    }
    prevItemsLengthRef.current = cart.items.length
  }, [cart.items, activeCartItemId])

  // ── Parallel Tabs & Storage System (Sprint 1) ───────────────────────
  const [tabs, setTabs] = useState<OrderTab[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('oni-pos-tabs')
      if (stored) {
        try {
          return JSON.parse(stored)
        } catch (e) { }
      }
    }
    return [{ id: 'default', label: 'Đơn hàng 1', items: [], customer: null, discount_amount: 0, note: '' }]
  })

  const [activeTabId, setActiveTabId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('oni-pos-active-tab-id')
      if (stored) return stored
    }
    return 'default'
  })

  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')

  const [customerModalOpen, setCustomerModalOpen] = useState(false)
  const [customerModalCallback, setCustomerModalCallback] = useState<((c: LocalCustomer) => void) | null>(null)

  const [cartSide, setCartSide] = useState<'left' | 'right'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('oni-pos-cart-side')
      if (stored === 'right') return 'right'
    }
    return 'left'
  })

  useEffect(() => {
    localStorage.setItem('oni-pos-cart-side', cartSide)
  }, [cartSide])

  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const maxVisible = isMobile ? 2 : 4
  let visibleTabs: OrderTab[] = []
  let overflowTabs: OrderTab[] = []

  if (tabs.length <= maxVisible) {
    visibleTabs = tabs
    overflowTabs = []
  } else {
    const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0]
    visibleTabs = [activeTab]
    const otherTabs = tabs.filter((t) => t.id !== activeTab.id)
    visibleTabs.push(...otherTabs.slice(0, maxVisible - 1))
    visibleTabs.sort((a, b) => tabs.findIndex(t => t.id === a.id) - tabs.findIndex(t => t.id === b.id))
    overflowTabs = tabs.filter((t) => !visibleTabs.some(vt => vt.id === t.id))
  }

  const isSwitchingTabRef = useRef(false)
  const isInitialRestoreRef = useRef(false)

  useEffect(() => {
    localStorage.setItem('oni-pos-tabs', JSON.stringify(tabs))
  }, [tabs])

  useEffect(() => {
    localStorage.setItem('oni-pos-active-tab-id', activeTabId)
  }, [activeTabId])

  // Mount-time restore from active tab
  useEffect(() => {
    if (!isInitialRestoreRef.current && tabs.length > 0) {
      const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0]
      if (activeTab) {
        isSwitchingTabRef.current = true
        setActiveTabId(activeTab.id)
        setCustomer(activeTab.customer)
        cart.restore({
          items: activeTab.items,
          discount_amount: activeTab.discount_amount,
          note: activeTab.note,
        })
        isInitialRestoreRef.current = true
        setTimeout(() => {
          isSwitchingTabRef.current = false
        }, 50)
      }
    }
  }, [tabs, activeTabId, cart])

  // Sync cart details into the active tab in tabs list
  useEffect(() => {
    if (isSwitchingTabRef.current) return
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabId
          ? {
            ...t,
            items: cart.items,
            customer,
            discount_amount: cart.discount_amount,
            note: cart.note,
          }
          : t
      )
    )
  }, [cart.items, customer, cart.discount_amount, cart.note, activeTabId])

  function switchTab(targetTabId: string) {
    const target = tabs.find((t) => t.id === targetTabId)
    if (!target) return
    isSwitchingTabRef.current = true
    setActiveTabId(targetTabId)
    setCustomer(target.customer)
    cart.restore({
      items: target.items,
      discount_amount: target.discount_amount,
      note: target.note,
    })
    setTimeout(() => {
      isSwitchingTabRef.current = false
    }, 50)
  }

  function addNewTab(label?: string) {
    const newId = crypto.randomUUID()
    const newLabel = label || `Đơn hàng ${tabs.length + 1}`
    const newTab: OrderTab = {
      id: newId,
      label: newLabel,
      items: [],
      customer: null,
      discount_amount: 0,
      note: '',
    }
    setTabs((prev) => [...prev, newTab])
    isSwitchingTabRef.current = true
    setActiveTabId(newId)
    setCustomer(null)
    cart.restore({ items: [], discount_amount: 0, note: '' })
    setTimeout(() => {
      isSwitchingTabRef.current = false
    }, 50)
  }

  async function closeTab(tabId: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation()

    if (tabs.length <= 1) {
      cart.clear()
      setCustomer(null)
      setTabs([{ id: 'default', label: 'Đơn hàng 1', items: [], customer: null, discount_amount: 0, note: '' }])
      setActiveTabId('default')
      return
    }

    const targetTab = tabs.find((t) => t.id === tabId)
    if (!targetTab) return

    if (targetTab.items.length > 0) {
      const ok = await confirm({
        title: 'Đóng đơn hàng?',
        description: `Đơn hàng "${targetTab.label}" có chứa sản phẩm chưa thanh toán. Bạn có chắc muốn đóng?`,
        confirmLabel: 'Đóng đơn',
        variant: 'danger',
      })
      if (!ok) return
    }

    const remainingTabs = tabs.filter((t) => t.id !== tabId)
    setTabs(remainingTabs)

    if (activeTabId === tabId) {
      const nextTab = remainingTabs[remainingTabs.length - 1]
      switchTab(nextTab.id)
    }
  }

  function startEditingTab(tabId: string, label: string) {
    setEditingTabId(tabId)
    setEditingLabel(label)
  }

  function finishEditingTab(tabId: string) {
    const trimmed = editingLabel.trim()
    if (trimmed) {
      setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, label: trimmed } : t)))
    }
    setEditingTabId(null)
  }

  function copyToNewTab(customer: LocalCustomer | null, items: CartItem[], discountAmount: number, note: string) {
    const newId = crypto.randomUUID()
    const label = `Sao chép ${tabs.length + 1}`
    const newTab: OrderTab = {
      id: newId,
      label,
      items,
      customer,
      discount_amount: discountAmount,
      note,
    }
    setTabs((prev) => [...prev, newTab])
    isSwitchingTabRef.current = true
    setActiveTabId(newId)
    setCustomer(customer)
    cart.restore({ items, discount_amount: discountAmount, note })
    setTimeout(() => {
      isSwitchingTabRef.current = false
    }, 50)
    toast.success(`Đã sao chép đơn thành "${label}"`)
  }

  async function cancelAndEditOrder(order: LocalOrder): Promise<boolean> {
    if (!permissions.includes('orders.delete')) {
      toast.error('Bạn không có quyền hủy đơn hàng này')
      return false
    }
    try {
      if (order.server_id) {
        if (!isOnline) {
          toast.error('Cần kết nối mạng để hủy đơn hàng đã đồng bộ')
          return false
        }
        const res = await fetch(`/api/shops/${shopId}/orders/${order.server_id}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Hủy & Sửa từ POS' })
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          toast.error(err.error || 'Hủy đơn trên server thất bại')
          return false
        }
      }

      await localDb.transaction('rw', [localDb.orders, localDb.orderItems, localDb.syncQueue, localDb.inventory], async () => {
        await localDb.orders.update(order.local_id, { status: 'cancelled' })
        if (order.sync_status === 'pending') {
          await localDb.syncQueue.where('local_order_id').equals(order.local_id).delete()
        }
        const items = await localDb.orderItems.where('order_local_id').equals(order.local_id).toArray()
        for (const item of items) {
          const inv = await localDb.inventory.where('[product_id+branch_id]').equals([item.product_id, branchId]).first()
          if (inv) {
            await localDb.inventory.put({
              ...inv,
              stock_qty: Number(inv.stock_qty) + (item.qty * (item.conversion_rate || 1))
            })
          }
        }
      })

      const orderItems = await localDb.orderItems.where('order_local_id').equals(order.local_id).toArray()
      const cartItems: CartItem[] = orderItems.map(it => ({
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

      copyToNewTab(orderCustomer, cartItems, order.discount_amount, order.note || '')
      toast.success('Đã hủy đơn hàng cũ và tải lại vào đơn mới để chỉnh sửa!')
      return true
    } catch (e) {
      console.error(e)
      toast.error('Lỗi khi hủy và sửa đơn')
      return false
    }
  }

  function openCustomerModalGlobal(callback?: (c: LocalCustomer) => void) {
    setCustomerModalCallback(() => callback || null)
    setCustomerModalOpen(true)
  }

  function handleCustomerCreatedGlobal(created: LocalCustomer) {
    if (customerModalCallback) {
      customerModalCallback(created)
    } else {
      setCustomer(created)
    }
    setCustomerModalCallback(null)
  }

  const [orderPanelOpen, setOrderPanelOpen] = useState(false)
  const workerRef = useRef<SyncWorker | null>(null)

  useEffect(() => {
    const sub = liveQuery(async () => {
      const invs = await localDb.inventory.toArray()
      const batches = await localDb.inventoryBatches.toArray()
      return { invs, batches }
    }).subscribe({
      next: ({ invs, batches }) => {
        const map = new Map<string, number>()

        // Group batch quantities for current branchId
        const batchStock = new Map<string, number>()
        const hasBatches = new Set<string>()
        batches.forEach((b) => {
          if (b.branch_id === branchId) {
            hasBatches.add(b.product_id)
            batchStock.set(b.product_id, (batchStock.get(b.product_id) ?? 0) + Number(b.stock_qty))
          }
        })

        // Map general stock or batch sum
        invs.forEach((r) => {
          if (r.branch_id === branchId) {
            if (hasBatches.has(r.product_id)) {
              map.set(r.product_id, batchStock.get(r.product_id) ?? 0)
            } else {
              map.set(r.product_id, Number(r.stock_qty))
            }
          }
        })

        // Fallback for batch-only items not in general inventory
        batchStock.forEach((qty, productId) => {
          if (!map.has(productId)) {
            map.set(productId, qty)
          }
        })

        setInventory(map)
      },
      error: (err) => {
        console.error('Failed to load local inventory liveQuery:', err)
      },
    })
    return () => sub.unsubscribe()
  }, [branchId])

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

  // Global POS Hotkeys (KiotViet standard)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Helper to check if user is typing in a text field
      const isTyping = () => {
        const activeEl = document.activeElement
        if (!activeEl) return false
        const tagName = activeEl.tagName.toLowerCase()
        return (
          tagName === 'input' ||
          tagName === 'textarea' ||
          activeEl.getAttribute('contenteditable') === 'true'
        )
      }

      // F3: Focus Product Search (Tìm sản phẩm)
      if (e.key === 'F3') {
        e.preventDefault()
        const input = (document.getElementById('pos-product-search-input') || document.getElementById('pos-mobile-product-search-input')) as HTMLInputElement | null
        if (input) {
          input.focus()
          input.select()
        }
      }

      // F4: Focus Customer Search (Tìm khách hàng)
      if (e.key === 'F4') {
        e.preventDefault()
        // If customer is selected, reset first to allow typing
        if (customer) {
          setCustomer(null)
          setTimeout(() => {
            const input = document.getElementById('pos-customer-search-input') as HTMLInputElement | null
            if (input) {
              input.focus()
              input.select()
            }
          }, 50)
        } else {
          const input = document.getElementById('pos-customer-search-input') as HTMLInputElement | null
          if (input) {
            input.focus()
            input.select()
          }
        }
      }

      // F9: Open Payment Modal
      if (e.key === 'F9') {
        if (!checkoutOpen && cart.items.length > 0) {
          e.preventDefault()
          setCheckoutOpen(true)
        }
      }

      // Ctrl + D: Clear Entire Cart
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        if (cart.items.length > 0) {
          clearCart()
        }
      }

      // Ctrl + P: Quick Invoice Print Override / Guidance
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        if (checkoutOpen) {
          toast.success('Đang thực hiện thanh toán và in hóa đơn...')
        } else if (cart.items.length > 0) {
          toast.info('Vui lòng nhấn F9 để mở bảng Thanh toán trước khi in hóa đơn!')
        } else {
          toast.info('Vui lòng thêm sản phẩm và thanh toán để in hóa đơn!')
        }
      }

      // Spacebar: Increase quantity of active/selected cart item by 1 (only when not typing)
      if (e.key === ' ' || e.code === 'Space') {
        if (!isTyping()) {
          e.preventDefault()
          if (activeCartItemId) {
            const item = cart.items.find((i) => i.product_id === activeCartItemId)
            if (item) {
              const stock = inventory.get(item.product_id)
              const atMax = stock !== undefined && item.qty >= stock
              if (!atMax) {
                cart.setQty(item.product_id, item.qty + 1)
                // play audio if not muted
                if (!mutePosSound) {
                  try {
                    const audio = new Audio('/beep.wav')
                    audio.play().catch(() => { })
                  } catch { }
                }
              } else {
                toast.error(`Sản phẩm "${item.product_name}" đã đạt giới hạn tồn kho!`)
              }
            }
          } else if (cart.items.length > 0) {
            // Default to the last item if none is active
            const item = cart.items[cart.items.length - 1]
            const stock = inventory.get(item.product_id)
            const atMax = stock !== undefined && item.qty >= stock
            if (!atMax) {
              cart.setQty(item.product_id, item.qty + 1)
              if (!mutePosSound) {
                try {
                  const audio = new Audio('/beep.wav')
                  audio.play().catch(() => { })
                } catch { }
              }
            }
          }
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [checkoutOpen, cart.items, activeCartItemId, inventory, mutePosSound, customer])

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
    addNewTab()
    toast.success('Đã lưu giữ đơn và mở tab mới')
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

  return (
    <div className={shellCls} style={shellStyle}>
      {/* POS toolbar — slim, POS-specific controls only */}
      <header className="flex flex-col md:flex-row md:h-11 h-auto shrink-0 items-stretch justify-between border-b border-slate-200 bg-white px-3 gap-y-1.5 md:gap-y-0 select-none relative z-20">
        {/* Left/Middle: Tabs */}
        <div className="order-2 md:order-1 flex items-end h-9 md:h-full min-w-0 flex-1 gap-1 overflow-visible">
          {/* Visible tabs list */}
          {visibleTabs.map((tab) => {
            const isActive = tab.id === activeTabId
            const isEditing = tab.id === editingTabId
            return (
              <div
                key={tab.id}
                onClick={() => !isActive && switchTab(tab.id)}
                className={[
                  'flex items-center gap-1.5 h-9 px-3.5 rounded-t-sm border text-sm shrink-0',
                  isActive
                    ? 'bg-gradient-to-b from-orange-50 to-white border-orange-100 border-b-white text-orange-600 font-medium relative z-10 top-[1px]'
                    : 'bg-slate-100/40 border-slate-200 border-b-transparent text-slate-600 hover:bg-slate-200/50 hover:text-slate-800 cursor-pointer -mb-[1px] transition-colors duration-150',
                ].join(' ')}
              >
                {isEditing ? (
                  <input
                    type="text"
                    value={editingLabel}
                    onChange={(e) => setEditingLabel(e.target.value)}
                    onBlur={() => finishEditingTab(tab.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') finishEditingTab(tab.id)
                      if (e.key === 'Escape') setEditingTabId(null)
                    }}
                    className={[
                      'w-20 bg-transparent border-b focus:outline-none py-0.5 text-sm font-medium',
                      isActive ? 'border-orange-300 text-orange-700' : 'border-primary text-slate-900'
                    ].join(' ')}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      startEditingTab(tab.id, tab.label)
                    }}
                    className="truncate max-w-[120px]"
                    title="Nhấp đúp chuột để đổi tên"
                  >
                    {tab.label}
                  </span>
                )}

                {/* Items count indicator */}
                {tab.items.length > 0 && (
                  <span className={[
                    'flex h-4 min-w-[16px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold transition-colors',
                    isActive ? 'bg-orange-100 text-orange-700' : 'bg-slate-200 text-slate-700'
                  ].join(' ')}>
                    {tab.items.reduce((acc, curr) => acc + curr.qty, 0)}
                  </span>
                )}

                {/* Close Tab button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id, e)
                  }}
                  className={[
                    'ml-1 rounded-full p-0.5 transition-colors shrink-0 cursor-pointer',
                    isActive ? 'text-orange-400 hover:bg-orange-100 hover:text-orange-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                  ].join(' ')}
                  title="Đóng đơn hàng"
                >
                  ✕
                </button>
              </div>
            )
          })}

          {/* Dropdown for overflow tabs */}
          {overflowTabs.length > 0 && (
            <div className="relative shrink-0" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className={[
                  'flex items-center gap-1.5 h-9 px-3 rounded-t-sm border text-sm shrink-0 -mb-[1px] cursor-pointer',
                  dropdownOpen || overflowTabs.some(t => t.id === activeTabId)
                    ? 'bg-gradient-to-b from-orange-50 to-white border-orange-100 border-b-white text-orange-600 font-medium relative z-10 shadow-sm top-[1px]'
                    : 'bg-slate-100/40 border-slate-200 border-b-transparent text-slate-600 hover:bg-slate-200/50 hover:text-slate-800 transition-colors duration-150'
                ].join(' ')}
              >
                <span>Khác ({overflowTabs.length})</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className={`w-3.5 h-3.5 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {dropdownOpen && (
                <div className="absolute left-0 top-full mt-0 w-56 rounded-b-xl border border-slate-200 bg-white shadow-lg py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  {overflowTabs.map((tab) => {
                    const qty = tab.items.reduce((acc, curr) => acc + curr.qty, 0)
                    return (
                      <div
                        key={tab.id}
                        onClick={() => {
                          switchTab(tab.id)
                          setDropdownOpen(false)
                        }}
                        className="flex items-center justify-between px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <span className="truncate font-medium flex-1 mr-2">{tab.label}</span>

                        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {qty > 0 && (
                            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">
                              {qty}
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              closeTab(tab.id, e)
                            }}
                            className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Add new tab button */}
          <button
            onClick={() => addNewTab()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-t-sm border border-slate-200 border-b-transparent bg-slate-100/40 text-slate-500 hover:bg-slate-200/50 hover:text-primary transition-colors duration-150 cursor-pointer -mb-[1px]"
            title="Tạo đơn hàng mới (Tab)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>

        {/* Right side controls */}
        <div className="order-1 md:order-2 flex flex-wrap items-center gap-1.5 shrink-0 py-1 md:py-1.5 self-stretch md:self-center justify-center md:justify-end">
          {/* Cart layout side switcher */}
          <button
            onClick={() => setCartSide(prev => prev === 'left' ? 'right' : 'left')}
            className="hidden md:flex items-center gap-1.5 rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
            title="Đổi vị trí thanh toán (Trái / Phải)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="h-3.5 w-3.5 shrink-0 text-slate-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M3 5.25h18c.414 0 .75.336.75.75v12c0 .414-.336.75-.75.75H3a.75.75 0 01-.75-.75V6c0-.414.336-.75.75-.75z" />
            </svg>
            <span>Giỏ hàng: <strong className="text-primary font-semibold">{cartSide === 'left' ? 'Trái' : 'Phải'}</strong></span>
          </button>

          <button
            onClick={handleConfigNearExpiry}
            className="flex items-center gap-1.5 rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
            title="Cấu hình số ngày cảnh báo cận date"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="h-3.5 w-3.5 shrink-0 text-orange-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <strong className="text-orange-600 font-semibold">{nearExpiryDays} ngày</strong>
          </button>

          <button
            onClick={() => setOrderPanelOpen(true)}
            className="relative flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
            title="Xem đơn hàng hôm nay"
          >
            <IconClipboard className="h-3.5 w-3.5 shrink-0" /> Đơn hàng
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
            {status === 'loading' ? (
              <svg className="h-3 w-3 animate-spin text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg
                className="h-3.5 w-3.5 shrink-0"
                xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            )}
            <span className="hidden sm:inline">{status === 'loading' ? 'Đang đồng bộ...' : 'Đồng bộ'}</span>
          </button>

          <QRNotificationCenter
            shopId={shopId}
            branchId={branchId}
            onAcceptRequest={refresh}
          />

          <SyncStatusBar
            isOnline={isOnline}
            onRetryFailed={() => workerRef.current?.retryFailed()}
            onRetryAll={() => workerRef.current?.retryAll()}
          />

          {/* Online/Offline Badge */}
          <div className="flex items-center gap-1.5 text-xs bg-slate-50 border-slate-200 px-2.5 py-1 rounded-full shrink-0 select-none">
            <span className={['h-2 w-2 rounded-full shrink-0', isOnline ? 'bg-green-500' : 'bg-red-500'].join(' ')} />
            <span className={['tracking-wide font-medium', isOnline ? 'text-green-600' : 'text-red-500'].join(' ')}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </header>

      {/* Main content — fills all remaining height */}
      <div className={['flex flex-1 overflow-hidden', cartSide === 'left' ? 'flex-row-reverse' : 'flex-row'].join(' ')}>
        {/* Product grid */}
        <div className={['hidden md:block flex-1 overflow-hidden bg-white',
          cartSide === 'left' ? 'border-l border-slate-200' : 'border-r border-slate-200'
        ].join(' ')}>
          <ProductGrid
            branchId={branchId}
            inventory={inventory}
            mutePosSound={mutePosSound}
            onAddToCart={cart.addItem}
            onAddToCartWithOptions={cart.addItemWithOptions}
            allowNegativeStock={allowNegativeStock}
          />
        </div>

        {/* Cart panel */}
        <div className="w-full md:w-72 shrink-0 overflow-hidden xl:w-80">
          <CartPanel
            items={cart.items}
            inventory={inventory}
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
            onHold={holdCurrentCart}
            onCheckout={() => setCheckoutOpen(true)}
            onClearCart={clearCart}
            onAddToCart={cart.addItem}
            onAddToCartWithOptions={cart.addItemWithOptions}
            mutePosSound={mutePosSound}
            activeItemId={activeCartItemId}
            onActiveItemChange={setActiveCartItemId}
            onOpenCustomerModal={() => openCustomerModalGlobal()}
          />
        </div>
      </div>

      <OrderHistoryPanel
        open={orderPanelOpen}
        onClose={() => setOrderPanelOpen(false)}
        shopName={shopName}
        ordersPath={`/t/${backPath.split('/')[1]}/${branchId}/orders`}
        shopId={shopId}
        onCopyToNewTab={copyToNewTab}
      />

      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onSuccess={() => {
          setCheckoutOpen(false)
          cart.clear()
          setCustomer(null)

          if (tabs.length > 1) {
            const remainingTabs = tabs.filter((t) => t.id !== activeTabId)
            const nextTab = remainingTabs[remainingTabs.length - 1]

            isSwitchingTabRef.current = true
            setActiveTabId(nextTab.id)
            setCustomer(nextTab.customer)
            cart.restore({
              items: nextTab.items,
              discount_amount: nextTab.discount_amount,
              note: nextTab.note,
            })
            setTabs(remainingTabs)

            setTimeout(() => {
              isSwitchingTabRef.current = false
            }, 50)
          } else {
            setTabs([{
              id: activeTabId,
              label: tabs[0]?.label || 'Đơn hàng 1',
              items: [],
              customer: null,
              discount_amount: 0,
              note: '',
            }])
          }
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
        isOnline={isOnline}
        autoPrintReceipt={autoPrintReceipt}
      />

      <ConfirmDialog
        open={isNearExpiryModalOpen}
        onClose={() => setIsNearExpiryModalOpen(false)}
        onConfirm={saveNearExpiryDays}
        title="Cấu hình Cận Date"
        confirmLabel="Lưu cấu hình"
        cancelLabel="Hủy"
      >
        {/* Input & Preset Chips */}
        <div className="flex flex-col gap-4 py-1">
          <p className="text-sm text-slate-500 leading-normal">
            Số ngày còn lại tối thiểu của Lô hàng để kích hoạt cảnh báo khi quét bán hàng.
          </p>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Số ngày cảnh báo</label>
            <div className="relative flex items-center">
              <input
                type="number"
                value={tempNearExpiryDays}
                onChange={(e) => setTempNearExpiryDays(e.target.value)}
                className="w-full text-center text-lg font-bold border border-slate-200 rounded-xl py-2 px-8 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-white text-slate-800"
                placeholder="Nhập số ngày"
                min="1"
                autoFocus
              />
              <span className="absolute right-3.5 text-sm font-semibold text-slate-400 pointer-events-none">ngày</span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Chọn nhanh</label>
            <div className="grid grid-cols-5 gap-1.5">
              {['30', '60', '90', '180', '365'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setTempNearExpiryDays(d)}
                  className={`text-xs font-semibold py-2 px-1 rounded-lg border transition-all active:scale-95 ${tempNearExpiryDays === d
                    ? 'bg-primary/10 border-primary text-primary shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                >
                  {d} ngày
                </button>
              ))}
            </div>
          </div>
        </div>
      </ConfirmDialog>

      <CustomerCreateModal
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        shopId={shopId}
        onSuccess={handleCustomerCreatedGlobal}
      />
    </div>
  )
}
