'use client'
import { useCallback, useReducer, useRef } from 'react'
import { toast } from 'sonner'
import { localDb, type LocalProduct } from '@/lib/localDb/schema'
import { allowsProductNegativeStock } from '@oni/core'

export interface CartItem {
  product_id: string
  product_name: string
  sku?: string
  unit_price: number
  original_price?: number
  cost_price: number
  qty: number
  discount_amount: number
  line_total: number
  tax_rate?: string
  tax_group?: string
  // ── Variant / Modifier context (Sprint 4) ───────────────────────────────────────────
  variant_label?: string       // "Size L" — denormalized for display
  modifiers?: SelectedModifier[] // [{group,option,price_adj}]
  modifier_total?: number      // sum of price_adj
  // ── Unit Conversion ──────────────────────────────────────────────
  unit_id?: string
  unit_name?: string
  conversion_rate?: number
  image_url?: string  // product thumbnail for display
  /** Product-level "bán âm" (quick-create inventory_policy) — cart-only, not sent to checkout */
  allow_negative_stock?: boolean
}

/**
 * Identity of a cart line. The same product can sit on several lines: one per unit
 * (Lon / Thùng), per variant label, or per modifier set.
 */
export function cartLineKey(item: Pick<CartItem, 'product_id' | 'unit_id' | 'variant_label' | 'modifiers'>): string {
  const sig = item.variant_label || JSON.stringify(item.modifiers || [])
  return `${item.product_id}|${item.unit_id ?? ''}|${sig}`
}

/**
 * Line operations accept a cartLineKey (always contains "|") or, for backward
 * compatibility, a bare product_id (old behaviour: every line of that product).
 */
function matchLine(item: CartItem, key: string): boolean {
  return key.includes('|') ? cartLineKey(item) === key : item.product_id === key
}

/** Stock is kept in base units; a "Thùng 24" line consumes qty × 24. */
export function baseQty(item: Pick<CartItem, 'qty' | 'conversion_rate'>): number {
  return Number(item.qty) * (Number(item.conversion_rate) || 1)
}

/** Base units of `productId` already in the cart, optionally skipping one line. */
export function baseQtyInCart(items: CartItem[], productId: string, exceptKey?: string): number {
  return items.reduce(
    (s, i) => (i.product_id === productId && (!exceptKey || cartLineKey(i) !== exceptKey) ? s + baseQty(i) : s),
    0
  )
}

/**
 * Highest qty this line may reach given the base-unit stock shared with the other
 * lines of the same product. `undefined` = no limit (unknown stock / negative allowed).
 */
export function maxQtyForLine(
  items: CartItem[],
  item: CartItem,
  stock: number | undefined,
  allowNegativeStock = false
): number | undefined {
  if (allowNegativeStock || item.allow_negative_stock || stock === undefined) return undefined
  const rate = Number(item.conversion_rate) || 1
  const others = baseQtyInCart(items, item.product_id, cartLineKey(item))
  // rate 1 keeps the original un-floored cap (fractional stock, e.g. kg goods)
  return rate === 1 ? stock - others : Math.floor((stock - others) / rate)
}

// A single modifier option selected by cashier
export interface SelectedModifier {
  group: string    // e.g. "Topping"
  option: string   // e.g. "Full topping"
  price_adj: number // e.g. 8000 (positive = add price)
}

type CartState = {
  items: CartItem[]
  discount_amount: number
  note: string
}

type CartAction =
  | { type: 'ADD_ITEM'; product: LocalProduct }
  | { type: 'ADD_ITEM_WITH_OPTS'; item: CartItem }  // for variant/modifier products
  | { type: 'REMOVE_ITEM'; key: string }
  | { type: 'SET_QTY'; key: string; qty: number }
  | { type: 'SET_ITEM_DISCOUNT'; key: string; discount: number }
  | { type: 'SET_ITEM_PRICE_AND_DISCOUNT'; key: string; unit_price: number; discount_amount: number }
  | { type: 'SET_ORDER_DISCOUNT'; discount: number }
  | { type: 'SET_NOTE'; note: string }
  | { type: 'RESTORE'; state: CartState }
  | { type: 'CLEAR' }

// line_total = (unit_price - discount_amount + modifier_total) * qty
function lineTotal(item: CartItem): number {
  const modTotal = item.modifier_total ?? 0
  return Math.max(0, Number(item.unit_price) + modTotal - Number(item.discount_amount)) * Number(item.qty)
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const uId = (action.product as any).unit_id
      const key = cartLineKey({ product_id: action.product.product_id, unit_id: uId })
      const existing = state.items.find((i) => cartLineKey(i) === key)
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            cartLineKey(i) === key
              ? { ...i, qty: i.qty + 1, line_total: lineTotal({ ...i, qty: i.qty + 1 }) }
              : i
          ),
        }
      }
      const newItem: CartItem = {
        product_id: action.product.product_id,
        product_name: action.product.name,
        sku: action.product.sku,
        unit_price: Number(action.product.sell_price),
        original_price: Number(action.product.sell_price),
        cost_price: Number(action.product.cost_price),
        qty: 1,
        discount_amount: 0,
        line_total: Number(action.product.sell_price),
        unit_id: (action.product as any).unit_id,
        unit_name: (action.product as any).unit_name,
        conversion_rate: (action.product as any).conversion_rate,
        tax_rate: action.product.tax_rate,
        tax_group: action.product.tax_group,
        image_url: action.product.image_url,
        allow_negative_stock: allowsProductNegativeStock(action.product as any) || undefined,
      }
      return { ...state, items: [...state.items, newItem] }
    }
    case 'ADD_ITEM_WITH_OPTS': {
      // For variant/modifier: use composite key (product_id + variant_label + modifiers signature)
      // so same base product with different variants can coexist in cart
      const key = cartLineKey(action.item)
      const existingIdx = state.items.findIndex((i) => cartLineKey(i) === key)
      if (existingIdx >= 0) {
        const updated = state.items.map((it, idx) =>
          idx === existingIdx
            ? { ...it, qty: it.qty + 1, line_total: lineTotal({ ...it, qty: it.qty + 1 }) }
            : it
        )
        return { ...state, items: updated }
      }
      return { ...state, items: [...state.items, action.item] }
    }
    case 'REMOVE_ITEM': {
      const newItems = state.items.filter((i) => !matchLine(i, action.key))
      const newSubtotal = newItems.reduce((s, i) => s + Number(i.line_total), 0)
      return { ...state, items: newItems, discount_amount: Math.min(state.discount_amount, newSubtotal) }
    }
    case 'SET_QTY': {
      if (action.qty <= 0) {
        const newItems = state.items.filter((i) => !matchLine(i, action.key))
        const newSubtotal = newItems.reduce((s, i) => s + Number(i.line_total), 0)
        return { ...state, items: newItems, discount_amount: Math.min(state.discount_amount, newSubtotal) }
      }
      const newItems = state.items.map((i) =>
        matchLine(i, action.key)
          ? { ...i, qty: action.qty, line_total: lineTotal({ ...i, qty: action.qty }) }
          : i
      )
      const newSubtotal = newItems.reduce((s, i) => s + Number(i.line_total), 0)
      return { ...state, items: newItems, discount_amount: Math.min(state.discount_amount, newSubtotal) }
    }
    case 'SET_ITEM_DISCOUNT':
      return {
        ...state,
        items: state.items.map((i) =>
          matchLine(i, action.key)
            ? { ...i, discount_amount: action.discount, line_total: lineTotal({ ...i, discount_amount: action.discount }) }
            : i
        ),
      }
    case 'SET_ITEM_PRICE_AND_DISCOUNT':
      return {
        ...state,
        items: state.items.map((i) =>
          matchLine(i, action.key)
            ? { ...i, unit_price: action.unit_price, discount_amount: action.discount_amount, line_total: lineTotal({ ...i, unit_price: action.unit_price, discount_amount: action.discount_amount }) }
            : i
        ),
      }
    case 'SET_ORDER_DISCOUNT':
      return { ...state, discount_amount: action.discount }
    case 'SET_NOTE':
      return { ...state, note: action.note }
    case 'RESTORE':
      return action.state
    case 'CLEAR':
      return { items: [], discount_amount: 0, note: '' }
    default:
      return state
  }
}

export function useCart(inventory?: Map<string, number>, branchId?: string, allowNegativeStock = false) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], discount_amount: 0, note: '' })

  const inventoryRef = useRef(inventory)
  inventoryRef.current = inventory
  const stateRef = useRef(state)
  stateRef.current = state

  const subtotal = state.items.reduce((s, i) => s + Number(i.line_total), 0)
  const total = Math.max(0, subtotal - Number(state.discount_amount))

  const checkNearExpiryBatches = useCallback(async (productId: string, productName: string) => {
    if (!branchId || typeof window === 'undefined') return

    try {
      // 1. Fetch threshold configuration from localStorage (default to 90 days)
      const thresholdDays = Number(localStorage.getItem('oni-near-expiry-days') || '90')

      // 2. Query active batches for this product in current branch with stock > 0
      const batches = await localDb.inventoryBatches
        .where('[product_id+branch_id]')
        .equals([productId, branchId])
        .toArray()

      const activeBatches = batches.filter((b) => Number(b.stock_qty) > 0)
      if (activeBatches.length === 0) return

      // 3. Sort by expiry date ascending (earliest expiry first)
      activeBatches.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))

      // 4. Find the batch with earliest expiry date
      const earliestBatch = activeBatches[0]

      // 5. Calculate if it is near expiry
      const expiryDateObj = new Date(earliestBatch.expiry_date)
      const today = new Date()
      // Reset hours to compare pure dates
      expiryDateObj.setHours(0, 0, 0, 0)
      today.setHours(0, 0, 0, 0)

      const diffTime = expiryDateObj.getTime() - today.getTime()
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

      if (diffDays <= thresholdDays) {
        // Trigger non-blocking toast warning
        const formattedExpiry = new Date(earliestBatch.expiry_date).toLocaleDateString('vi-VN')
        toast.warning(
          `Sản phẩm cận date đang còn tồn kho!`,
          {
            description: `Sản phẩm "${productName}" đang có Lô "${earliestBatch.batch_no}" sắp hết hạn (HSD: ${formattedExpiry}, còn tồn: ${earliestBatch.stock_qty}). Vui lòng ưu tiên bán lô này trước!`,
            duration: 10000,
          }
        )
      }
    } catch (err) {
      console.error('Error checking near expiry batches:', err)
    }
  }, [branchId])

  const addItem = useCallback(async (product: LocalProduct) => {
    if (!allowNegativeStock && !allowsProductNegativeStock(product as any)) {
      const stock = inventoryRef.current?.get(product.product_id)
      if (stock !== undefined) {
        // Base units across every line of this product (Lon + Thùng share one stock)
        const inCart = baseQtyInCart(stateRef.current.items, product.product_id)
        const rate = Number((product as any).conversion_rate) || 1
        // rate 1 keeps the original rule (inCart >= stock) so fractional stock still sells
        if (rate === 1 ? inCart >= stock : inCart + rate > stock) {
          toast.warning(`Đã đủ số lượng trong kho`, {
            description: `"${product.name}" chỉ còn ${stock} - không thể thêm`,
          })
          return
        }
      }
    }

    let resolvedTaxRate = product.tax_rate
    let resolvedTaxGroup = product.tax_group

    if ((!resolvedTaxRate || !resolvedTaxGroup) && product.category_id) {
      try {
        const category = await localDb.categories.get(product.category_id)
        if (category) {
          resolvedTaxRate = resolvedTaxRate || category.tax_rate || '0'
          resolvedTaxGroup = resolvedTaxGroup || category.tax_group || ''
        }
      } catch (err) {
        console.error('Failed to resolve category tax fallback in cart:', err)
      }
    }

    dispatch({
      type: 'ADD_ITEM',
      product: {
        ...product,
        tax_rate: resolvedTaxRate || '0',
        tax_group: resolvedTaxGroup || '',
      }
    })
    void checkNearExpiryBatches(product.product_id, product.name)
  }, [checkNearExpiryBatches, allowNegativeStock])

  // For variant children and modifier products — adds with full context
  const addItemWithOptions = useCallback(async (item: CartItem) => {
    let resolvedTaxRate = item.tax_rate
    let resolvedTaxGroup = item.tax_group

    if ((!resolvedTaxRate || !resolvedTaxGroup)) {
      try {
        const product = await localDb.products.get(item.product_id)
        if (product && product.category_id) {
          const category = await localDb.categories.get(product.category_id)
          if (category) {
            resolvedTaxRate = resolvedTaxRate || category.tax_rate || '0'
            resolvedTaxGroup = resolvedTaxGroup || category.tax_group || ''
          }
        }
      } catch (err) {
        console.error('Failed to resolve category tax fallback in cart with options:', err)
      }
    }

    dispatch({
      type: 'ADD_ITEM_WITH_OPTS',
      item: {
        ...item,
        original_price: item.original_price ?? item.unit_price,
        tax_rate: resolvedTaxRate || '0',
        tax_group: resolvedTaxGroup || '',
      }
    })
    void checkNearExpiryBatches(item.product_id, item.product_name)
  }, [checkNearExpiryBatches])

  /** `key` = cartLineKey(item); a bare product_id still works (affects every line of it). */
  const removeItem = useCallback((key: string) => dispatch({ type: 'REMOVE_ITEM', key }), [])

  const setQty = useCallback((key: string, qty: number) => {
    if (qty <= 0) {
      dispatch({ type: 'SET_QTY', key, qty: 0 })
      return
    }
    const items = stateRef.current.items
    const line = items.find((i) => matchLine(i, key))
    if (line) {
      const stock = inventoryRef.current?.get(line.product_id)
      const max = maxQtyForLine(items, line, stock, allowNegativeStock)
      // stock > 0 guard kept from the original behaviour (no clamping on empty/negative stock)
      if (max !== undefined && stock !== undefined && stock > 0 && qty > max) {
        if (max < 1) {
          toast.warning(`Không đủ tồn kho cho "${line.product_name}"`)
          return
        }
        const unit = line.unit_name ? ` ${line.unit_name}` : ''
        toast.warning(`Chỉ còn ${max}${unit} trong kho - đã điều chỉnh số lượng`)
        dispatch({ type: 'SET_QTY', key, qty: max })
        return
      }
    }
    dispatch({ type: 'SET_QTY', key, qty })
  }, [allowNegativeStock])
  const setItemDiscount = useCallback(
    (key: string, discount: number) => dispatch({ type: 'SET_ITEM_DISCOUNT', key, discount }),
    []
  )
  const setItemPriceAndDiscount = useCallback(
    (key: string, unit_price: number, discount_amount: number) => dispatch({ type: 'SET_ITEM_PRICE_AND_DISCOUNT', key, unit_price, discount_amount }),
    []
  )
  const setOrderDiscount = useCallback((discount: number) => dispatch({ type: 'SET_ORDER_DISCOUNT', discount }), [])
  const setNote = useCallback((note: string) => dispatch({ type: 'SET_NOTE', note }), [])
  const clear = useCallback(() => dispatch({ type: 'CLEAR' }), [])
  const restore = useCallback(
    (state: { items: CartItem[]; discount_amount: number; note: string }) =>
      dispatch({ type: 'RESTORE', state }),
    []
  )

  return {
    items: state.items,
    discount_amount: state.discount_amount,
    note: state.note,
    subtotal,
    total,
    addItem,
    addItemWithOptions,
    removeItem,
    setQty,
    setItemDiscount,
    setItemPriceAndDiscount,
    setOrderDiscount,
    setNote,
    clear,
    restore,
  }
}
