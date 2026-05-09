'use client'
import { useCallback, useReducer } from 'react'
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
}

type CartState = {
  items: CartItem[]
  discount_amount: number
  note: string
}

type CartAction =
  | { type: 'ADD_ITEM'; product: LocalProduct }
  | { type: 'REMOVE_ITEM'; product_id: string }
  | { type: 'SET_QTY'; product_id: string; qty: number }
  | { type: 'SET_ITEM_DISCOUNT'; product_id: string; discount: number }
  | { type: 'SET_ORDER_DISCOUNT'; discount: number }
  | { type: 'SET_NOTE'; note: string }
  | { type: 'RESTORE'; state: CartState }
  | { type: 'CLEAR' }

function lineTotal(item: CartItem): number {
  return Math.max(0, item.unit_price - item.discount_amount) * item.qty
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
        unit_price: action.product.sell_price,
        cost_price: action.product.cost_price,
        qty: 1,
        discount_amount: 0,
        line_total: action.product.sell_price,
      }
      return { ...state, items: [...state.items, newItem] }
    }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter((i) => i.product_id !== action.product_id) }
    case 'SET_QTY': {
      if (action.qty <= 0) {
        return { ...state, items: state.items.filter((i) => i.product_id !== action.product_id) }
      }
      return {
        ...state,
        items: state.items.map((i) =>
          i.product_id === action.product_id
            ? { ...i, qty: action.qty, line_total: lineTotal({ ...i, qty: action.qty }) }
            : i
        ),
      }
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

export function useCart() {
  const [state, dispatch] = useReducer(cartReducer, { items: [], discount_amount: 0, note: '' })

  const subtotal = state.items.reduce((s, i) => s + i.line_total, 0)
  const total = Math.max(0, subtotal - state.discount_amount)

  const addItem = useCallback((product: LocalProduct) => dispatch({ type: 'ADD_ITEM', product }), [])
  const removeItem = useCallback((product_id: string) => dispatch({ type: 'REMOVE_ITEM', product_id }), [])
  const setQty = useCallback((product_id: string, qty: number) => dispatch({ type: 'SET_QTY', product_id, qty }), [])
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
    removeItem,
    setQty,
    setItemDiscount,
    setOrderDiscount,
    setNote,
    clear,
    restore,
  }
}
