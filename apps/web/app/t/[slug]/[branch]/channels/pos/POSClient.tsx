'use client'
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { liveQuery } from 'dexie'
import { usePOSHydration } from '@/hooks/usePOSHydration'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { useCart, type CartItem } from '@/hooks/useCart'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useConfirm } from '@/app/components/ui/ConfirmProvider'
import { format } from 'date-fns'
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
import { useShift } from '@/app/components/providers/ShiftProvider'
import { useNavMode } from '@/app/components/layout/NavModeContext'

interface Props {
  shopId: string
  branchId: string
  shopName: string
  userEmail: string
  backPath: string
  autoPrintReceipt?: boolean
  mutePosSound?: boolean
  permissions?: string[]
  isReadOnly?: boolean
  planCode?: string
  maxOrders?: number
  initialMonthOrdersCount?: number
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

export function POSClient({ shopId, branchId, shopName, userEmail, backPath, autoPrintReceipt, mutePosSound, permissions = [], isReadOnly = false, planCode, maxOrders, initialMonthOrdersCount = 0 }: Props) {
  const { checkShiftOrOpen } = useShift()
  const { isHorizontal } = useNavMode()
  // On mobile: topbar only (3.5rem). On desktop with horizontal nav: topbar (3.5rem) + NavHorizontal (2.5rem).
  const shellStyle = useMemo(() => ({
    height: isHorizontal ? 'calc(100dvh - 6rem)' : 'calc(100dvh - 3.5rem)',
  }), [isHorizontal])
  const { status, lastHydratedAt, refresh } = usePOSHydration(shopId, branchId)
  const isOnline = useNetworkStatus()
  const confirm = useConfirm()
  const [inventory, setInventory] = useState<Map<string, number>>(new Map())

  // Real-time synchronization for POS data via BroadcastChannel
  useEffect(() => {
    if (typeof window === 'undefined') return
    const bc = new BroadcastChannel('oni-pos-sync')
    const listener = (e: MessageEvent) => {
      if (e.data?.type === 'REFRESH_TABLE_MAP' && e.data?.shopId === shopId) {
        void refresh()
      }
    }
    bc.addEventListener('message', listener)
    return () => {
      bc.removeEventListener('message', listener)
      bc.close()
    }
  }, [shopId, refresh])

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
  const [resumingOrder, setResumingOrder] = useState<LocalOrder | null>(null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [activeCartItemId, setActiveCartItemId] = useState<string | null>(null)

  // --- SHIFT MANAGEMENT STATES & QUERIES ---
  const [shiftOpenModalOpen, setShiftOpenModalOpen] = useState(false)
  const [shiftCloseModalOpen, setShiftCloseModalOpen] = useState(false)

  const [currentMonthOrdersCount, setCurrentMonthOrdersCount] = useState(initialMonthOrdersCount)

  useEffect(() => {
    if (!localDb || !maxOrders || planCode !== 'plan_mini') return
    const sub = liveQuery(async () => {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      return await localDb.orders
        .where('created_at')
        .aboveOrEqual(startOfMonth)
        .count()
    }).subscribe({
      next: (count) => setCurrentMonthOrdersCount(Math.max(initialMonthOrdersCount, count)),
      error: (err) => console.error('Failed to count month orders:', err)
    })
    return () => sub.unsubscribe()
  }, [maxOrders, planCode, initialMonthOrdersCount])
  const [openingCashInput, setOpeningCashInput] = useState('0')
  const [actualCashInput, setActualCashInput] = useState('0')
  const [shiftNote, setShiftNote] = useState('')

  const [lastClosedShift, setLastClosedShift] = useState<Record<string, string> | null>(null)
  const [shiftSummaryModalOpen, setShiftSummaryModalOpen] = useState(false)
  const [hasDismissedShiftOpen, setHasDismissedShiftOpen] = useState(false)

  const isShiftEnabled = settings?.enable_shift_management ?? false

  const { data: openShiftData, isLoading: isOpenShiftLoading, refetch: refetchOpenShift } = useQuery({
    queryKey: ['open-shift', shopId, branchId, userEmail],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/shifts?status=open&branch_id=${branchId}&user_id=${userEmail}`)
      if (!res.ok) return { data: [] }
      return res.json() as Promise<{ data: Record<string, string>[], total: number }>
    },
    enabled: !!shopId && !!branchId && !!userEmail && isShiftEnabled,
  })

  const { data: allOpenShiftsData } = useQuery({
    queryKey: ['all-open-shifts', shopId, branchId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/shifts?status=open&branch_id=${branchId}`)
      if (!res.ok) return { data: [] }
      return res.json() as Promise<{ data: Record<string, string>[], total: number }>
    },
    enabled: !!shopId && !!branchId && isShiftEnabled,
  })

  const { data: employeesData } = useQuery({
    queryKey: ['employees', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/employees`)
      if (!res.ok) return []
      const json = await res.json()
      return (Array.isArray(json) ? json : json.data || []) as Record<string, string>[]
    },
    enabled: !!shopId && isShiftEnabled,
  })

  const otherOpenShifts = allOpenShiftsData?.data?.filter(s => s.user_id !== userEmail) || []

  const getEmployeeName = (email: string) => {
    const list = Array.isArray(employeesData) ? employeesData : (employeesData as any)?.data || []
    const emp = list.find((e: any) => e.email === email)
    return emp ? emp.name : email.split('@')[0]
  }

  const activeShift = openShiftData?.data?.[0] || null
  const hasActiveShift = !!activeShift

  // Auto-open Shift Open Modal if enabled but no active shift
  useEffect(() => {
    if (isShiftEnabled && !isOpenShiftLoading && !hasActiveShift && !hasDismissedShiftOpen) {
      checkShiftOrOpen(() => {})
      setHasDismissedShiftOpen(true)
    }
  }, [isShiftEnabled, isOpenShiftLoading, hasActiveShift, hasDismissedShiftOpen])

  const openShiftMutation = useMutation({
    mutationFn: async (payload: { branch_id: string; opening_cash: number }) => {
      const res = await fetch(`/api/shops/${shopId}/shifts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Mở ca thất bại')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Mở ca làm việc thành công!')
      setShiftOpenModalOpen(false)
      refetchOpenShift()
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const closeShiftMutation = useMutation({
    mutationFn: async (payload: { actual_closing_cash: number; note: string }) => {
      const res = await fetch(`/api/shops/${shopId}/shifts/${activeShift?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Chốt ca thất bại')
      }
      return res.json() as Promise<Record<string, string>>
    },
    onSuccess: (data) => {
      toast.success('Chốt ca thành công!')
      setShiftCloseModalOpen(false)
      setLastClosedShift(data)
      setShiftSummaryModalOpen(true)
      refetchOpenShift()
    },
    onError: (err: Error) => toast.error(err.message)
  })

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
  const tabsStorageKey = `oni-pos-tabs:${shopId}:${branchId}`
  const activeTabStorageKey = `oni-pos-active-tab-id:${shopId}:${branchId}`
  const [tabs, setTabs] = useState<OrderTab[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(tabsStorageKey)
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
      const stored = localStorage.getItem(activeTabStorageKey)
      if (stored) return stored
    }
    return 'default'
  })

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) || tabs[0], [tabs, activeTabId])
  const customer = activeTab ? activeTab.customer : null

  const setCustomer = useCallback((cust: LocalCustomer | null) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              customer: cust,
            }
          : t
      )
    )
  }, [activeTabId])

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
    localStorage.setItem(tabsStorageKey, JSON.stringify(tabs))
  }, [tabs, tabsStorageKey])

  useEffect(() => {
    localStorage.setItem(activeTabStorageKey, activeTabId)
  }, [activeTabId, activeTabStorageKey])

  // Mount-time restore from active tab
  useEffect(() => {
    if (!isInitialRestoreRef.current && tabs.length > 0) {
      const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0]
      if (activeTab) {
        isSwitchingTabRef.current = true
        setActiveTabId(activeTab.id)
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
            discount_amount: cart.discount_amount,
            note: cart.note,
          }
          : t
      )
    )
  }, [cart.items, cart.discount_amount, cart.note, activeTabId])

  function switchTab(targetTabId: string) {
    const target = tabs.find((t) => t.id === targetTabId)
    if (!target) return
    isSwitchingTabRef.current = true
    setActiveTabId(targetTabId)
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
    cart.restore({ items: [], discount_amount: 0, note: '' })
    setTimeout(() => {
      isSwitchingTabRef.current = false
    }, 50)
  }

  async function closeTab(tabId: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation()

    if (tabs.length <= 1) {
      cart.clear()
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
    cart.restore({ items, discount_amount: discountAmount, note })
    setTimeout(() => {
      isSwitchingTabRef.current = false
    }, 50)
    toast.success(`Đã sao chép đơn thành "${label}"`)
  }

  function handleCheckoutClose() {
    setCheckoutOpen(false)
    setResumingOrder(null)
    cart.clear()

    if (tabs.length > 1) {
      const remainingTabs = tabs.filter((t) => t.id !== activeTabId)
      const nextTab = remainingTabs[remainingTabs.length - 1]

      isSwitchingTabRef.current = true
      setActiveTabId(nextTab.id)
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
  }

  function handleCheckoutCancel() {
    if (resumingOrder) {
      handleCheckoutClose()
    } else {
      setCheckoutOpen(false)
    }
  }

  async function handleResumeCheckout(order: LocalOrder) {
    try {
      const items = await localDb.orderItems.where('order_local_id').equals(order.local_id).toArray()
      const cartItems: CartItem[] = await Promise.all(items.map(async it => {
        let taxRate = it.tax_rate
        let taxGroup = it.tax_group
        if (!taxRate || taxRate === '0') {
          try {
            const product = await localDb.products.get(it.product_id)
            if (product) {
              taxRate = product.tax_rate
              taxGroup = taxGroup || product.tax_group
              if ((!taxRate || taxRate === '0') && product.category_id) {
                const category = await localDb.categories.get(product.category_id)
                if (category) {
                  taxRate = category.tax_rate
                  taxGroup = taxGroup || category.tax_group
                }
              }
            }
          } catch (err) {
            console.error('Failed to resolve fallback tax for resumed item:', err)
          }
        }
        return {
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
          conversion_rate: it.conversion_rate,
          tax_rate: taxRate || '0',
          tax_group: taxGroup || ''
        }
      }))

      let orderCustomer: LocalCustomer | null = null
      if (order.customer_id) {
        orderCustomer = await localDb.customers.get(order.customer_id) || null
      }

      const tempTabId = crypto.randomUUID()
      const orderNo = order.order_no || order.local_id.slice(0, 8).toUpperCase()
      const label = `Thanh toán ${orderNo}`
      
      const newTab: OrderTab = {
        id: tempTabId,
        label,
        items: cartItems,
        customer: orderCustomer,
        discount_amount: order.discount_amount,
        note: order.note || '',
      }

      setTabs((prev) => [...prev, newTab])
      isSwitchingTabRef.current = true
      setActiveTabId(tempTabId)
      setCustomer(orderCustomer)
      cart.restore({
        items: cartItems,
        discount_amount: order.discount_amount,
        note: order.note || '',
      })
      setResumingOrder(order)
      
      setTimeout(() => {
        isSwitchingTabRef.current = false
        setCheckoutOpen(true)
      }, 50)

    } catch (e) {
      console.error('Failed to resume checkout:', e)
      toast.error('Lỗi khi tải thông tin đơn hàng để thanh toán tiếp')
    }
  }

  async function cancelAndEditOrder(order: LocalOrder): Promise<boolean> {
    if (!permissions.includes('orders.delete')) {
      toast.error('Bạn không có quyền hủy đơn hàng này')
      return false
    }
    const isOk = await confirm({
      title: 'Xác nhận điều chỉnh đơn hàng',
      description: 'Hệ thống sẽ hủy đơn hàng hiện tại (hoàn lại tồn kho) và tạo một giỏ hàng mới để bạn thay đổi mặt hàng. Bạn có chắc chắn muốn tiếp tục?',
      confirmLabel: 'Đồng ý',
      cancelLabel: 'Bỏ qua'
    })
    if (!isOk) return false

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
          const qItems = await localDb.syncQueue.toArray()
          const targetQ = qItems.find((item) => item.local_order_id === order.local_id)
          if (targetQ) {
            await localDb.syncQueue.delete(targetQ.id!)
          }
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
      const cartItems: CartItem[] = await Promise.all(orderItems.map(async it => {
        let taxRate = it.tax_rate
        let taxGroup = it.tax_group
        if (!taxRate || taxRate === '0') {
          try {
            const product = await localDb.products.get(it.product_id)
            if (product) {
              taxRate = product.tax_rate
              taxGroup = taxGroup || product.tax_group
              if ((!taxRate || taxRate === '0') && product.category_id) {
                const category = await localDb.categories.get(product.category_id)
                if (category) {
                  taxRate = category.tax_rate
                  taxGroup = taxGroup || category.tax_group
                }
              }
            }
          } catch (err) {
            console.error('Failed to resolve fallback tax for cancelled item:', err)
          }
        }
        return {
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
          conversion_rate: it.conversion_rate,
          tax_rate: taxRate || '0',
          tax_group: taxGroup || ''
        }
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
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0)
  const workerRef = useRef<SyncWorker | null>(null)

  useEffect(() => {
    if (!localDb) return
    const sub = liveQuery(async () => {
      return await localDb.orders
        .where('status')
        .equals('pending')
        .count()
    }).subscribe({
      next: setPendingOrdersCount,
      error: (err) => console.error('Failed to load pending orders count:', err)
    })
    return () => sub.unsubscribe()
  }, [])

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
        batches.forEach((b) => {
          if (b.branch_id === branchId) {
            batchStock.set(b.product_id, (batchStock.get(b.product_id) ?? 0) + Number(b.stock_qty))
          }
        })

        // Sum general stock across all warehouses in the branch
        const generalStock = new Map<string, number>()
        invs.forEach((r) => {
          if (r.branch_id === branchId) {
            generalStock.set(r.product_id, (generalStock.get(r.product_id) ?? 0) + Number(r.stock_qty))
          }
        })

        // Map general stock or batch sum
        generalStock.forEach((qty, productId) => {
          const batchQty = batchStock.get(productId) || 0
          map.set(productId, Math.max(qty, batchQty))
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
          if (maxOrders && currentMonthOrdersCount >= maxOrders && planCode === 'plan_mini') {
            toast.error(`Đã đạt giới hạn ${maxOrders} đơn/tháng. Vui lòng nâng cấp gói để tiếp tục bán hàng.`)
            return
          }
          checkShiftOrOpen(() => {
            setCheckoutOpen(true)
          })
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
  }, [checkoutOpen, cart.items, activeCartItemId, inventory, mutePosSound, customer, maxOrders, currentMonthOrdersCount, planCode])

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
      <header className="flex flex-col md:flex-row md:h-11 h-auto shrink-0 items-stretch justify-between border-b border-slate-200 bg-white px-3 gap-y-1.5 md:gap-y-0 select-none relative z-[5]">
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
            <IconClipboard className="h-3.5 w-3.5 shrink-0" />
            <span>Đơn hàng</span>
            {pendingOrdersCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow-sm ring-1 ring-white animate-in zoom-in-50 duration-200">
                {pendingOrdersCount}
              </span>
            )}
          </button>

          {isShiftEnabled && hasActiveShift && (
            <button
              onClick={() => {
                setActualCashInput('0')
                setShiftNote('')
                setShiftCloseModalOpen(true)
              }}
              className="flex items-center gap-1.5 rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors animate-in fade-in cursor-pointer"
              title="Chốt ca và đếm két tiền"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="h-3.5 w-3.5 shrink-0 text-rose-600">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>Chốt ca</span>
            </button>
          )}

          {isShiftEnabled && !hasActiveShift && (
            <button
              onClick={() => {
                checkShiftOrOpen(() => {})
              }}
              className="flex items-center gap-1.5 rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors animate-pulse cursor-pointer shrink-0"
              title="Mở ca làm việc mới"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="h-3.5 w-3.5 shrink-0 text-amber-600">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
              </svg>
              <span>Mở ca</span>
            </button>
          )}

          <button
            onClick={() => {
              if (!isOnline) { toast.error('Không có kết nối mạng'); return }
              refresh()
              workerRef.current?.flushAll()
            }}
            disabled={status === 'loading'}
            className="flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors shrink-0"
            title="Đồng bộ dữ liệu mới nhất từ server"
          >
            {status === 'loading' ? (
              <svg className="h-3 w-3 animate-spin text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg
                className="h-3.5 w-3.5 shrink-0 text-slate-500"
                xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            )}
            <span className="hidden sm:inline">{status === 'loading' ? 'Đang đồng bộ...' : 'Đồng bộ'}</span>
            <span className={['h-2 w-2 rounded-full shrink-0 ml-0.5', isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'].join(' ')} title={isOnline ? 'Online' : 'Offline'} />
          </button>

          <SyncStatusBar
            isOnline={isOnline}
            onRetryFailed={() => workerRef.current?.retryFailed()}
            onRetryAll={() => workerRef.current?.retryAll()}
          />
        </div>
      </header>

      {isShiftEnabled && otherOpenShifts.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200/80 px-4 py-2 flex items-center justify-between text-[11px] text-amber-800 animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span>
              🔔 <strong>Nhắc nhở:</strong> Nhân viên <strong className="font-bold text-amber-950">{getEmployeeName(otherOpenShifts[0].user_id)}</strong> ({otherOpenShifts[0].user_id}) đang có ca trùng hoạt động chưa chốt tại chi nhánh này (mở lúc {new Date(otherOpenShifts[0].opened_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}).
            </span>
          </div>
          <span className="text-[10px] text-amber-600 font-medium hidden md:inline">
            Vui lòng chắc chắn các phiên làm việc và bàn giao két được đối soát độc lập, tránh chồng chéo dòng tiền!
          </span>
        </div>
      )}

      {/* Main content — fills all remaining height */}
      <div className={['flex flex-1 overflow-hidden relative', cartSide === 'left' ? 'flex-row-reverse' : 'flex-row'].join(' ')}>
        
        {isReadOnly && (
          <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
            <div className="text-5xl mb-4">🔒</div>
            <p className="text-xl font-bold text-slate-800 mb-2">Tài khoản đã hết hạn dịch vụ</p>
            <p className="text-sm text-slate-600 max-w-md mb-6 leading-relaxed">
              Tính năng bán hàng tại quầy (POS) hiện đang bị giới hạn. Vui lòng tiến hành gia hạn gói dịch vụ để tiếp tục kinh doanh và đồng bộ dữ liệu.
            </p>
            <a href={`/t/${backPath.split('/')[1]}/settings`} className="rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold text-white hover:bg-orange-600 transition-colors shadow-orange-500/20 shadow-lg">
              Đi tới Quản lý Gói & Gia hạn
            </a>
          </div>
        )}

        {/* Product grid */}
        <div className={['hidden md:block flex-1 overflow-hidden bg-white',
          cartSide === 'left' ? 'border-l border-slate-200' : 'border-r border-slate-200'
        ].join(' ')}>
          <ProductGrid
            branchId={branchId}
            inventory={inventory}
            mutePosSound={mutePosSound ?? false}
            planCode={planCode}
            onAddToCart={cart.addItem}
            onAddToCartWithOptions={cart.addItemWithOptions}
            allowNegativeStock={allowNegativeStock ?? false}
          />
        </div>

        {/* Cart panel */}
        <div className="w-full md:w-80 shrink-0 overflow-hidden xl:w-96">
          <CartPanel
            shopId={shopId}
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
            onItemPriceAndDiscountChange={cart.setItemPriceAndDiscount}
            onNoteChange={cart.setNote}
            onHold={holdCurrentCart}
            onCheckout={() => {
              if (maxOrders && currentMonthOrdersCount >= maxOrders && planCode === 'plan_mini') {
                toast.error(`Đã đạt giới hạn ${maxOrders} đơn/tháng. Vui lòng nâng cấp gói để tiếp tục bán hàng.`)
                return
              }
              checkShiftOrOpen(() => {
                setCheckoutOpen(true)
              })
            }}
            onClearCart={clearCart}
            onAddToCart={cart.addItem}
            onAddToCartWithOptions={cart.addItemWithOptions}
            mutePosSound={mutePosSound ?? false}
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
        branchId={branchId}
        onCopyToNewTab={copyToNewTab}
        onResumeCheckout={handleResumeCheckout}
        onCancelAndEdit={cancelAndEditOrder}
      />

      <CheckoutModal
        open={checkoutOpen}
        onClose={handleCheckoutCancel}
        onSuccess={handleCheckoutClose}
        onMinimize={handleCheckoutClose}
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
        autoPrintReceipt={autoPrintReceipt ?? false}
        existingOrder={resumingOrder}
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

      {/* DIALOG 1: MỞ CA LÀM VIỆC (SHIFT OPEN) - DISABLED locally in favor of global ShiftProvider */}
      <ConfirmDialog
        open={false}
        onClose={() => {
          setShiftOpenModalOpen(false)
          setHasDismissedShiftOpen(true)
        }}
        onConfirm={() => openShiftMutation.mutate({ branch_id: branchId, opening_cash: Number(openingCashInput) || 0 })}
        title="Mở ca làm việc POS"
        confirmLabel={openShiftMutation.isPending ? 'Đang mở ca...' : 'Xác nhận Mở ca'}
        cancelLabel="Để sau"
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="text-center bg-indigo-50 p-4 rounded-2xl border border-indigo-100/50 space-y-1">
            <div className="text-3xl">🏦</div>
            <h3 className="text-sm font-bold text-slate-800">Yêu cầu mở ca làm việc</h3>
            <p className="text-xs text-slate-500 leading-normal">
              Hệ thống đang bật chế độ Quản lý ca. Nhân viên cần khai báo số tiền mặt hiện có trong két trước khi thanh toán hóa đơn.
            </p>
          </div>

          {otherOpenShifts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-3 text-xs text-amber-800 space-y-1 animate-in fade-in slide-in-from-top-1 duration-300">
              <div className="flex items-center gap-1.5 font-bold text-amber-900">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-600">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <span>Chú ý: Phát sinh ca trùng lặp!</span>
              </div>
              <p className="leading-relaxed">
                Nhân viên <strong className="font-semibold text-amber-950">{getEmployeeName(otherOpenShifts[0].user_id)}</strong> ({otherOpenShifts[0].user_id}) hiện đang trong một ca làm việc chưa chốt tại chi nhánh này (mở từ {new Date(otherOpenShifts[0].opened_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}).
              </p>
              <p className="text-[10px] text-amber-600/90 italic pt-1 leading-normal border-t border-amber-200/40">
                * Vui lòng nhắc nhở nhân viên trên thực hiện chốt ca bàn giao trước để đảm bảo tính tách bạch và tránh nhầm lẫn két tiền!
              </p>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Số tiền mặt đầu ca</label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={openingCashInput ? Number(openingCashInput).toLocaleString('vi-VN') : ''}
                onChange={(e) => setOpeningCashInput(e.target.value.replace(/\D/g, ''))}
                className="w-full text-center text-xl font-extrabold border border-slate-200 rounded-xl py-2.5 px-8 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white text-slate-800"
                placeholder="Nhập số tiền mặt đầu ca"
                autoFocus
              />
              <span className="absolute right-4 text-sm font-semibold text-slate-400">đ</span>
            </div>
          </div>
        </div>
      </ConfirmDialog>

      {/* DIALOG 2: CHỐT CA LÀM VIỆC (SHIFT CLOSE) */}
      <ConfirmDialog
        open={shiftCloseModalOpen}
        onClose={() => setShiftCloseModalOpen(false)}
        onConfirm={() => closeShiftMutation.mutate({ actual_closing_cash: Number(actualCashInput) || 0, note: shiftNote })}
        title="Chốt ca làm việc & Bàn giao"
        confirmLabel={closeShiftMutation.isPending ? 'Đang chốt ca...' : 'Xác nhận Chốt ca'}
        cancelLabel="Hủy"
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="text-center bg-rose-50 p-4 rounded-2xl border border-rose-100/50 space-y-1">
            <div className="text-3xl">🔐</div>
            <h3 className="text-sm font-bold text-slate-800">Chốt két & Đóng ca</h3>
            <p className="text-xs text-slate-500 leading-normal">
              Nhân viên đếm và khai báo toàn bộ số tiền mặt thực tế đang có trong két két tiền lúc đóng ca. Phiếu chốt ca sẽ bị khóa sau khi gửi.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Tổng tiền mặt đếm thực tế</label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={actualCashInput ? Number(actualCashInput).toLocaleString('vi-VN') : ''}
                onChange={(e) => setActualCashInput(e.target.value.replace(/\D/g, ''))}
                className="w-full text-center text-xl font-extrabold border border-slate-200 rounded-xl py-2.5 px-8 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 bg-white text-slate-800"
                placeholder="Đếm tiền mặt trong két..."
                autoFocus
              />
              <span className="absolute right-4 text-sm font-semibold text-slate-400">đ</span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Ghi chú giải trình (nếu có)</label>
            <textarea
              value={shiftNote}
              onChange={(e) => setShiftNote(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none resize-none bg-white text-slate-800 shadow-sm"
              placeholder="Lý do chênh lệch tiền mặt, bàn giao đặc biệt..."
            />
          </div>
        </div>
      </ConfirmDialog>

      {/* DIALOG 3: XEM KẾT QUẢ CHỐT CA (SHIFT SUMMARY) */}
      <ConfirmDialog
        open={shiftSummaryModalOpen}
        onClose={() => setShiftSummaryModalOpen(false)}
        onConfirm={() => setShiftSummaryModalOpen(false)}
        title="Báo cáo kết quả Chốt ca"
        confirmLabel="Đã hiểu"
        cancelLabel=""
      >
        {lastClosedShift && (
          <div className="space-y-4 py-1 text-slate-800">
            <div className="text-center bg-gradient-to-r from-orange-500 to-amber-600 text-white p-5 rounded-2xl space-y-1 shadow-md">
              <p className="text-xs text-orange-100 uppercase tracking-wider font-semibold">Trạng thái ca</p>
              <h3 className="text-xl font-black text-white">CA ĐÃ ĐÓNG THÀNH CÔNG</h3>
              <p className="text-[10px] text-orange-200">
                Thời gian chốt: {format(new Date(), 'HH:mm - dd/MM/yyyy')}
              </p>
            </div>

            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Tiền mặt đầu ca:</span>
                <span className="font-bold">{Number(lastClosedShift.opening_cash || 0).toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Tiền mặt hệ thống tính toán (Expected):</span>
                <span className="font-bold">{Number(lastClosedShift.expected_closing_cash || 0).toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="flex justify-between items-center text-xs border-t border-slate-200/60 pt-2">
                <span className="text-slate-500 font-medium">Tiền mặt đếm thực tế (Actual):</span>
                <span className="font-bold text-orange-600">{Number(lastClosedShift.actual_closing_cash || 0).toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="flex justify-between items-center text-xs border-t border-slate-200 pt-2">
                <span className="text-slate-500 font-bold">Chênh lệch tiền mặt (Variance):</span>
                <span className={`font-black ${Number(lastClosedShift.cash_variance || 0) < 0 ? 'text-rose-600' : Number(lastClosedShift.cash_variance || 0) > 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                  {Number(lastClosedShift.cash_variance || 0) > 0 ? '+' : ''}
                  {Number(lastClosedShift.cash_variance || 0).toLocaleString('vi-VN')}đ
                </span>
              </div>
            </div>

            {lastClosedShift.non_cash_revenue && (
              <div className="border border-slate-200 rounded-2xl p-4 space-y-2.5 bg-slate-50/40">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Doanh thu không tiền mặt khác</h4>
                {(() => {
                  try {
                    const nonCash = JSON.parse(lastClosedShift.non_cash_revenue)
                    return (
                      <div className="space-y-2.5 pt-3">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-500 font-medium">Chuyển khoản:</span>
                          <span className="font-bold">{Number(nonCash.bank_transfer || 0).toLocaleString('vi-VN')}đ</span>
                        </div>
                        <div className="flex justify-between items-center text-xs border-t border-slate-200/50 pt-2">
                          <span className="text-slate-500 font-medium">Quẹt thẻ (POS):</span>
                          <span className="font-bold">{Number(nonCash.card || 0).toLocaleString('vi-VN')}đ</span>
                        </div>
                        <div className="flex justify-between items-center text-xs border-t border-slate-200/50 pt-2">
                          <span className="text-slate-500 font-medium">Ví điện tử:</span>
                          <span className="font-bold">{Number(nonCash.momo || 0).toLocaleString('vi-VN')}đ</span>
                        </div>
                      </div>
                    )
                  } catch { return null }
                })()}
              </div>
            )}

            {lastClosedShift.note && (
              <div className="space-y-1 px-1">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Giải trình của nhân viên:</span>
                <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 italic leading-relaxed">
                  "{lastClosedShift.note}"
                </p>
              </div>
            )}
          </div>
        )}
      </ConfirmDialog>
    </div>
  )
}
