'use client'
import { useCallback, useReducer, useRef } from 'react'
import { toast } from 'sonner'
import type { LocalProduct } from '@/lib/localDb/schema'

export interface CartItem {
  product_id: string
  product_name: string
  sku?: string
  unit_price: number
  cost_price: number
  qty: number
  discount_amount: number
  line_total: number
  // ── Variant / Modifier context (Sprint 4) ───────────────────────────────────────────
  variant_label?: string       // "Size L" — denormalized for display
  modifiers?: SelectedModifier[] // [{group,option,price_adj}]
  modifier_total?: number      // sum of price_adj
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
  | { type: 'REMOVE_ITEM'; product_id: string }
  | { type: 'SET_QTY'; product_id: string; qty: number }
  | { type: 'SET_ITEM_DISCOUNT'; product_id: string; discount: number }
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
      const existing = state.items.find((i) => i.product_id === action.product.product_id)
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            i.product_id === action.product.product_id
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
        cost_price: Number(action.product.cost_price),
        qty: 1,
        discount_amount: 0,
        line_total: Number(action.product.sell_price),
      }
      return { ...state, items: [...state.items, newItem] }
    }
    case 'ADD_ITEM_WITH_OPTS': {
      // For variant/modifier: use composite key (product_id + variant_label + modifiers signature)
      // so same base product with different variants can coexist in cart
      const sig = action.item.variant_label || JSON.stringify(action.item.modifiers || [])
      const existingIdx = state.items.findIndex(
        (i) => i.product_id === action.item.product_id &&
          (i.variant_label || JSON.stringify(i.modifiers || [])) === sig
      )
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
      const newItems = state.items.filter((i) => i.product_id !== action.product_id)
      const newSubtotal = newItems.reduce((s, i) => s + Number(i.line_total), 0)
      return { ...state, items: newItems, discount_amount: Math.min(state.discount_amount, newSubtotal) }
    }
    case 'SET_QTY': {
      if (action.qty <= 0) {
        const newItems = state.items.filter((i) => i.product_id !== action.product_id)
        const newSubtotal = newItems.reduce((s, i) => s + Number(i.line_total), 0)
        return { ...state, items: newItems, discount_amount: Math.min(state.discount_amount, newSubtotal) }
      }
      const newItems = state.items.map((i) =>
        i.product_id === action.product_id
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
          i.product_id === action.product_id
            ? { ...i, discount_amount: action.discount, line_total: lineTotal({ ...i, discount_amount: action.discount }) }
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

export function useCart(inventory?: Map<string, number>) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], discount_amount: 0, note: '' })

  const inventoryRef = useRef(inventory)
  inventoryRef.current = inventory
  const stateRef = useRef(state)
  stateRef.current = state

  const subtotal = state.items.reduce((s, i) => s + Number(i.line_total), 0)
  const total = Math.max(0, subtotal - Number(state.discount_amount))

  const addItem = useCallback((product: LocalProduct) => {
    const stock = inventoryRef.current?.get(product.product_id)
    if (stock !== undefined) {
      const currentQty = stateRef.current.items.find((i) => i.product_id === product.product_id)?.qty ?? 0
      if (currentQty >= stock) {
        toast.warning(`Đã đủ số lượng trong kho`, {
          description: `"${product.name}" chỉ còn ${stock} - không thể thêm`,
        })
        return
      }
    }
    dispatch({ type: 'ADD_ITEM', product })
  }, [])

  // For variant children and modifier products — adds with full context
  const addItemWithOptions = useCallback((item: CartItem) => {
    dispatch({ type: 'ADD_ITEM_WITH_OPTS', item })
  }, [])

  const removeItem = useCallback((product_id: string) => dispatch({ type: 'REMOVE_ITEM', product_id }), [])

  const setQty = useCallback((product_id: string, qty: number) => {
    if (qty <= 0) {
      dispatch({ type: 'SET_QTY', product_id, qty: 0 })
      return
    }
    const stock = inventoryRef.current?.get(product_id)
    if (stock !== undefined && stock > 0 && qty > stock) {
      toast.warning(`Chỉ còn ${stock} trong kho - đã điều chỉnh số lượng`)
      dispatch({ type: 'SET_QTY', product_id, qty: stock })
      return
    }
    dispatch({ type: 'SET_QTY', product_id, qty })
  }, [])
  const setItemDiscount = useCallback(
    (product_id: string, discount: number) => dispatch({ type: 'SET_ITEM_DISCOUNT', product_id, discount }),
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
    setOrderDiscount,
    setNote,
    clear,
    restore,
  }
}
