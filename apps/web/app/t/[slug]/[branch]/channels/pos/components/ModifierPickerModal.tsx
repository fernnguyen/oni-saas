'use client'
import { useEffect, useMemo, useState, useRef } from 'react'
import type { LocalProduct } from '@/lib/localDb/schema'
import type { CartItem, SelectedModifier } from '@/hooks/useCart'

interface ModifierOption {
  id: string
  name: string
  price_adj: string
}

interface ModifierGroup {
  id: string
  name: string
  is_required: boolean
  max_selection: number   // 1 = single, 99 = multi
  options: ModifierOption[]
}

interface Props {
  product: LocalProduct               // modifier product
  open: boolean
  onClose: () => void
  onConfirm: (item: CartItem) => void
}

function fmtVND(v: number) {
  if (v === 0) return '0đ'
  return (v > 0 ? '+' : '') + v.toLocaleString('vi-VN') + 'đ'
}

function safeJson(s?: string | null) {
  try { return s ? JSON.parse(s) : null } catch { return null }
}

export function ModifierPickerModal({ product, open, onClose, onConfirm }: Props) {
  const groups: ModifierGroup[] = useMemo(() => {
    const config = safeJson(product.variant_options)
    return Array.isArray(config?.groups) ? config.groups : []
  }, [product.variant_options])

  const [selections, setSelections] = useState<Record<string, Set<string>>>({})
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0)

  // Pre-select first option of each group when opening
  useEffect(() => {
    if (!open || groups.length === 0) return
    const initial: Record<string, Set<string>> = {}
    for (const group of groups) {
      if (group.options.length > 0) {
        initial[group.id] = new Set([group.options[0].id])
      }
    }
    setSelections(initial)
  }, [open, groups])

  const allOptions = useMemo(() => {
    return groups.flatMap((group) =>
      group.options.map((opt) => ({
        group,
        opt,
      }))
    )
  }, [groups])

  // Use refs to avoid re-registering window event listener on every highlight index or options change
  const highlightedIndexRef = useRef(highlightedIndex)
  highlightedIndexRef.current = highlightedIndex

  const allOptionsRef = useRef(allOptions)
  allOptionsRef.current = allOptions

  // Register window-level keydown handler with a 50ms delay to avoid immediate bubbling from ProductGrid Enter
  useEffect(() => {
    if (!open) return

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const currentOptions = allOptionsRef.current
      const currentIndex = highlightedIndexRef.current
      if (currentOptions.length === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex((prev) => (prev + 1) % currentOptions.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex((prev) => (prev - 1 + currentOptions.length) % currentOptions.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const target = currentOptions[currentIndex]
        if (target) {
          handleOptionClick(target.group, target.opt.id)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    const timer = setTimeout(() => {
      window.addEventListener('keydown', handleGlobalKeyDown)
    }, 50)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [open])

  if (!open) return null

  function handleOptionClick(group: ModifierGroup, optId: string) {
    const newSelections = { ...selections }
    const curr = new Set(newSelections[group.id] ?? [])
    if (group.max_selection === 1) {
      newSelections[group.id] = new Set([optId])
    } else {
      if (curr.has(optId)) curr.delete(optId)
      else curr.add(optId)
      newSelections[group.id] = curr
    }
    
    // We update state for visual feedback if it doesn't close immediately
    setSelections(newSelections)
    
    // Auto-submit logic: if all required groups are satisfied, add to cart!
    const newErrors = groups.filter((g) => g.is_required && !(newSelections[g.id]?.size > 0))
    if (newErrors.length === 0) {
      const selectedModifiers: SelectedModifier[] = []
      let modifierTotal = 0
      for (const g of groups) {
        const selIds = newSelections[g.id] ?? new Set()
        for (const o of g.options) {
          if (selIds.has(o.id)) {
            const adj = Number(o.price_adj) || 0
            selectedModifiers.push({ group: g.name, option: o.name, price_adj: adj })
            modifierTotal += adj
          }
        }
      }
      
      const labelParts = selectedModifiers.map((m) => m.option)
      const label = labelParts.length > 0 ? labelParts.join(', ') : undefined
      const basePrice = Number(product.sell_price)
      
      onConfirm({
        product_id: product.product_id,
        product_name: product.name,
        sku: product.sku,
        unit_price: basePrice,
        cost_price: Number(product.cost_price),
        qty: 1,
        discount_amount: 0,
        modifier_total: modifierTotal,
        modifiers: selectedModifiers,
        variant_label: label,
        line_total: basePrice + modifierTotal,
      })
      onClose()
    }
  }

  function isSelected(groupId: string, optId: string) {
    return selections[groupId]?.has(optId) ?? false
  }

  // Validation: required groups must have selection
  const errors = groups
    .filter((g) => g.is_required && !(selections[g.id]?.size > 0))
    .map((g) => g.name)

  // Build modifiers array and modifier_total
  const selectedModifiers: SelectedModifier[] = []
  let modifierTotal = 0
  for (const group of groups) {
    const selIds = selections[group.id] ?? new Set()
    for (const opt of group.options) {
      if (selIds.has(opt.id)) {
        const adj = Number(opt.price_adj) || 0
        selectedModifiers.push({ group: group.name, option: opt.name, price_adj: adj })
        modifierTotal += adj
      }
    }
  }

  function handleConfirm() {
    if (errors.length > 0) return

    // Build display label: "Size L, Full topping"
    const labelParts = selectedModifiers.map((m) => m.option)
    const label = labelParts.length > 0 ? labelParts.join(', ') : undefined

    const basePrice = Number(product.sell_price)
    const item: CartItem = {
      product_id: product.product_id,
      product_name: product.name,
      sku: product.sku,
      unit_price: basePrice,
      cost_price: Number(product.cost_price),
      qty: 1,
      discount_amount: 0,
      modifier_total: modifierTotal,
      modifiers: selectedModifiers,
      variant_label: label,
      line_total: basePrice + modifierTotal,
    }
    onConfirm(item)
    onClose()
  }

  const totalDisplay = Number(product.sell_price) + modifierTotal

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 shrink-0">
          <div>
            <p className="text-xs font-semibold text-amber-500 uppercase tracking-wider">Tuỳ chỉnh</p>
            <p className="text-sm font-bold text-slate-900">{product.name}</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Groups */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {groups.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-6">Không có lựa chọn nào được cấu hình</p>
          )}
          {groups.map((group) => (
            <div key={group.id}>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-bold text-slate-800">{group.name}</p>
                {group.is_required ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-600">Bắt buộc</span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-400">Tuỳ chọn</span>
                )}
                {group.max_selection > 1 && (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-500">Nhiều lựa chọn</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {group.options.map((opt) => {
                  const selected = isSelected(group.id, opt.id)
                  const adj = Number(opt.price_adj) || 0
                  const finalPrice = Number(product.sell_price) + adj
                  const flatIndex = allOptions.findIndex((item) => item.opt.id === opt.id)
                  const isHighlighted = flatIndex === highlightedIndex
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleOptionClick(group, opt.id)}
                      onMouseEnter={() => setHighlightedIndex(flatIndex)}
                      className={[
                        'flex items-center gap-3 w-full rounded-xl border px-4 py-3 text-sm transition-all duration-200 text-left',
                        selected
                          ? isHighlighted
                            ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-400 text-amber-900 shadow-md scale-[1.01]'
                            : 'border-amber-400 bg-amber-50 text-amber-900 shadow-sm'
                          : isHighlighted
                            ? 'border-amber-400 bg-amber-50/30 ring-2 ring-amber-300 text-slate-800 shadow-md scale-[1.01]'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                      ].join(' ')}
                    >
                      <div className={[
                        'shrink-0 flex items-center justify-center w-4 h-4 rounded-full border transition-all duration-150',
                        selected
                          ? 'border-amber-500 bg-amber-500'
                          : isHighlighted
                            ? 'border-amber-500 bg-amber-100/50'
                            : 'border-slate-300'
                      ].join(' ')}>
                        {(selected || isHighlighted) && (
                          <div className={[
                            'w-1.5 h-1.5 rounded-full transition-all duration-150',
                            selected ? 'bg-white scale-100' : 'bg-amber-500 scale-90'
                          ].join(' ')} />
                        )}
                      </div>
                      <span className={`flex-1 ${selected ? 'font-semibold' : ''} flex items-center gap-2`}>
                        {opt.name}
                        {isHighlighted && (
                          <kbd className="px-1 py-0.5 text-[8px] bg-amber-500 text-white border border-amber-600 rounded font-semibold tracking-wider uppercase leading-none shadow-sm animate-pulse shrink-0">
                            Enter
                          </kbd>
                        )}
                      </span>
                      <span className={['w-16 text-right shrink-0', adj > 0 ? 'text-emerald-600 font-medium' : 'text-slate-400'].join(' ')}>
                        {fmtVND(adj)}
                      </span>
                      <span className={`w-20 text-right shrink-0 ${selected ? 'font-bold text-amber-700' : 'font-semibold text-slate-700'}`}>
                        {finalPrice.toLocaleString('vi-VN')}đ
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
