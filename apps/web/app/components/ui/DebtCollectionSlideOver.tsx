'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { SlideOver } from './SlideOver'
import { NumberInput } from './NumberInput'
import { ConfirmDialog } from './ConfirmDialog'
import { CopyableId } from './CopyableId'
import { BANKS } from '@/lib/constants/banks'
import { Coins, Check, X, Clock, CheckCircle2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'

function OrderItemsPreview({ shopId, order }: { shopId: string; order: DebtOrder }) {
  const { data, isLoading } = useQuery({
    queryKey: ['order-items', shopId, order.id],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/order-items?order_id=${order.id}`)
      if (!res.ok) throw new Error('Lỗi khi tải mặt hàng')
      return res.json()
    }
  })
  
  if (isLoading) return <div className="p-3 text-xs text-slate-400 text-center animate-pulse bg-slate-50/50">Đang tải mặt hàng...</div>
  const items = data?.data || []
  if (items.length === 0) return <div className="p-3 text-xs text-slate-400 text-center bg-slate-50/50">Không có mặt hàng nào.</div>
  
  return (
    <div className="bg-slate-50/80 border-t border-slate-100 p-3">
      <div className="space-y-2 mb-3">
        {items.map((item: any) => (
          <div key={item.id || item.item_id} className="flex justify-between items-start text-xs">
            <div className="flex-1 pr-2">
              <span className="font-medium text-slate-700">{item.product_name}</span>
              <div className="text-slate-500 mt-0.5">
                {item.qty} x {fmtVND(item.unit_price)}đ
                {Number(item.line_discount || 0) > 0 && ` (Giảm: ${fmtVND(item.line_discount)}đ)`}
              </div>
            </div>
            <div className="font-semibold text-slate-800 text-right">
              {fmtVND(item.line_total)}đ
            </div>
          </div>
        ))}
      </div>
      
      <div className="pt-2 border-t border-slate-200/60 space-y-1">
        <div className="flex justify-between text-xs text-slate-500">
          <span>Tổng tiền hàng:</span>
          <span>{fmtVND(order.subtotal || order.total_amount)}đ</span>
        </div>
        {Number(order.discount_amount || 0) > 0 && (
          <div className="flex justify-between text-xs text-slate-500">
            <span>Giảm giá hóa đơn:</span>
            <span>-{fmtVND(order.discount_amount)}đ</span>
          </div>
        )}
        {Number(order.shipping_fee || 0) > 0 && (
          <div className="flex justify-between text-xs text-slate-500">
            <span>Phí giao hàng:</span>
            <span>{fmtVND(order.shipping_fee)}đ</span>
          </div>
        )}
        {Number(order.tax_amount || 0) > 0 && (
          <div className="flex justify-between text-xs text-slate-500">
            <span>Thuế (VAT):</span>
            <span>{fmtVND(order.tax_amount)}đ</span>
          </div>
        )}
        <div className="flex justify-between text-xs font-semibold text-slate-800 pt-1">
          <span>Khách phải trả:</span>
          <span>{fmtVND(order.total_amount)}đ</span>
        </div>
      </div>
    </div>
  )
}

function getBankDisplayName(bankCodeOrName: string) {
  if (!bankCodeOrName) return '—'
  const trimmed = bankCodeOrName.trim().toUpperCase()
  const bank = BANKS.find(
    (b) =>
      b.code?.toUpperCase() === trimmed ||
      b.shortName?.toUpperCase() === trimmed ||
      b.name?.toUpperCase() === trimmed ||
      b.short_name?.toUpperCase() === trimmed
  )
  return bank ? bank.shortName : bankCodeOrName
}

function fmtVND(val: string | number) {
  return Number(val || 0).toLocaleString('vi-VN')
}

/** Extract just the numeric ID from order_no like "3D-10225" → "10225" */
function shortOrderNo(orderNo: string | undefined, fallbackId: string): string {
  if (!orderNo) {
    // Fallback: try extracting number from ID (e.g. "C-3D-10225" -> "10225")
    const parts = fallbackId.split('-')
    const lastPart = parts[parts.length - 1]
    // If last part looks numeric, use it
    if (/^\d+$/.test(lastPart)) return lastPart
    return fallbackId.slice(-6)
  }
  // If contains dash, take the last segment
  const parts = orderNo.replace(/^#/, '').split('-')
  return parts[parts.length - 1]
}

function fmtDate(d: string | undefined) {
  if (!d) return '—'
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(new Date(d))
  } catch { return d }
}

interface OrderAllocation {
  order_id: string
  order_no: string
  amount: number
  remaining_debt: number
  fully_paid: boolean
}

interface DebtOrder {
  id: string
  order_no: string
  created_at: string
  total_amount: string
  paid_amount: string
  debt_amount: string
  customer_name: string
  [key: string]: any
}

interface Props {
  open: boolean
  onClose: () => void
  shopId: string
  entity: {
    customer_id?: string
    id?: string
    name?: string
    phone?: string
    debt_amount?: string
    order_no?: string
  } | null
  entityType: 'customer' | 'supplier'
  funds: Record<string, any>[]
  onSuccess: () => void
}

export function DebtCollectionSlideOver({
  open, onClose, shopId, entity, entityType, funds, onSuccess
}: Props) {
  const queryClient = useQueryClient()

  const [amountToCollect, setAmountToCollect] = useState(0)
  const [method, setMethod] = useState('cash')
  const [fundId, setFundId] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])

  const [expandedOrderIds, setExpandedOrderIds] = useState<string[]>([])
  const [hasAutoSelected, setHasAutoSelected] = useState(false)

  const customerId = entity?.customer_id || entity?.id || ''

  // Fetch unpaid orders for this customer
  const { data: debtOrdersData, isLoading: ordersLoading, isFetching: ordersFetching, refetch: refetchOrders } = useQuery({
    queryKey: ['orders-debt', shopId, customerId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/orders/debt?customer_id=${customerId}`)
      if (!res.ok) throw new Error('Không tải được danh sách đơn nợ')
      return res.json() as Promise<{ data: DebtOrder[]; total: number; totalDebt: number }>
    },
    enabled: open && !!customerId && entityType === 'customer'
  })

  const debtOrders = debtOrdersData?.data ?? []
  // Auto-detect mode: has debt orders → by_order, no orders → basic
  const isCustomer = entityType === 'customer'
  const debtMode = isCustomer && debtOrders.length > 0 ? 'by_order' : 'basic'

  const customerDebt = useMemo(() => {
    const rawEntityDebt = parseFloat(entity?.debt_amount || '0')
    if (isCustomer && debtOrdersData?.totalDebt !== undefined) {
      // Use the larger value to handle opening balance (Nợ đầu kỳ) or data discrepancies
      return Math.max(rawEntityDebt, debtOrdersData.totalDebt)
    }
    return rawEntityDebt
  }, [isCustomer, debtOrdersData, entity])

  // Reset state when entity changes
  useEffect(() => {
    if (open && entity) {
      setAmountToCollect(customerDebt)
      setSelectedOrderIds([])
      setExpandedOrderIds([])
      setHasAutoSelected(false)

      // Auto-select default fund
      const defaultFund = funds.find(f => f.is_default === 'TRUE') || funds[0]
      setFundId(defaultFund?.id || '')
      if (defaultFund) {
        setMethod(defaultFund.type === 'cash' ? 'cash' : 'bank_transfer')
      } else {
        setMethod('cash')
      }
    }
  }, [open, entity, entityType, customerDebt, funds])

  // Auto-select all orders when debtOrders load
  useEffect(() => {
    if (debtOrders.length > 0 && !hasAutoSelected && debtMode === 'by_order') {
      if (entity?.order_no || entity?.id?.startsWith('ORD')) {
        setSelectedOrderIds([entity.id!])
      } else {
        setSelectedOrderIds(debtOrders.map(o => o.id))
      }
      setHasAutoSelected(true)
    }
  }, [debtOrders, debtMode, entity, hasAutoSelected])

  // Calculate total debt of selected orders
  const selectedOrdersDebt = useMemo(() => {
    if (debtMode !== 'by_order') return customerDebt
    return debtOrders
      .filter(o => selectedOrderIds.includes(o.id))
      .reduce((sum, o) => sum + parseFloat(o.debt_amount || '0'), 0)
  }, [selectedOrderIds, debtOrders, debtMode, customerDebt])

  // In by_order mode, auto-set amount to selected orders debt and cap it
  useEffect(() => {
    if (debtMode === 'by_order') {
      if (selectedOrderIds.length > 0) {
        setAmountToCollect(selectedOrdersDebt)
      } else {
        setAmountToCollect(0)
      }
    }
  }, [selectedOrdersDebt, debtMode, selectedOrderIds])

  // Compute FIFO allocation preview
  const allocations = useMemo((): OrderAllocation[] => {
    if (debtMode !== 'by_order' || amountToCollect <= 0) return []

    const selectedOrders = debtOrders.filter(o => selectedOrderIds.includes(o.id))
    const result: OrderAllocation[] = []
    let remaining = amountToCollect

    for (const order of selectedOrders) {
      if (remaining <= 0) break
      const orderDebt = parseFloat(order.debt_amount || '0')
      const applied = Math.min(remaining, orderDebt)
      result.push({
        order_id: order.id,
        order_no: order.order_no || order.id,
        amount: applied,
        remaining_debt: orderDebt - applied,
        fully_paid: applied >= orderDebt
      })
      remaining -= applied
    }
    return result
  }, [debtMode, amountToCollect, debtOrders, selectedOrderIds])

  const toggleOrder = (orderId: string) => {
    setSelectedOrderIds(prev =>
      prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    )
  }

  const selectAllOrders = () => {
    if (selectedOrderIds.length === debtOrders.length) {
      setSelectedOrderIds([])
    } else {
      setSelectedOrderIds(debtOrders.map(o => o.id))
    }
  }

  // Collect mutation
  const collectMutation = useMutation({
    mutationFn: async () => {
      if (!entity) throw new Error('Không có đối tượng')
      if (amountToCollect <= 0) throw new Error('Số tiền phải lớn hơn 0')

      const payload: Record<string, any> = {
        type: entityType === 'supplier' ? 'payment' : 'receipt',
        amount: amountToCollect,
        method,
        fund_id: fundId || undefined,
        category: entityType === 'supplier' ? 'debt_payment' : 'debt_collection',
        reference_id: customerId,
        reference_name: entity.name,
        note: entityType === 'supplier'
          ? `Trả nợ nhà cung cấp ${entity.name}`
          : `Thu nợ khách hàng ${entity.name}`,
      }

      // If by_order mode and we have allocations, send them
      if (debtMode === 'by_order' && allocations.length > 0) {
        payload.order_allocations = allocations.map(a => ({
          order_id: a.order_id,
          amount: a.amount
        }))
      }

      const res = await fetch(`/api/shops/${shopId}/cashbook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Thanh toán thất bại')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success(entityType === 'supplier'
        ? `Đã trả ${fmtVND(amountToCollect)}đ thành công!`
        : `Đã thu ${fmtVND(amountToCollect)}đ thành công!`
      )
      onClose()
      queryClient.invalidateQueries({ queryKey: ['debt', shopId] })
      queryClient.invalidateQueries({ queryKey: ['cashbook', shopId] })
      queryClient.invalidateQueries({ queryKey: ['customers', shopId] })
      queryClient.invalidateQueries({ queryKey: ['suppliers', shopId] })
      queryClient.invalidateQueries({ queryKey: ['payment-funds', shopId] })
      queryClient.invalidateQueries({ queryKey: ['orders-debt', shopId] })
      queryClient.invalidateQueries({ queryKey: ['orders', shopId] })
      queryClient.invalidateQueries({ queryKey: ['payments', shopId] })
      onSuccess()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (!entity) return null

  return (
    <>
      <SlideOver
        open={open}
        onClose={onClose}
        title={isCustomer ? 'Thu nợ khách hàng' : 'Trả nợ nhà cung cấp'}
        width={520}
        zIndex={70}
        footer={
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3 w-full *:w-full sm:*:w-auto">
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all justify-center"
            >
              <X className="w-4 h-4" />
              Hủy
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={collectMutation.isPending || amountToCollect <= 0}
              className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-sm justify-center"
            >
              {collectMutation.isPending ? (
                <>
                  <svg className="animate-spin -ml-1 mr-1.5 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Đang xử lý...
                </>
              ) : (
                <>
                  <Coins className="w-4 h-4" />
                  {isCustomer ? 'Xác nhận thu nợ' : 'Xác nhận trả nợ'}
                </>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Customer/Supplier info */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-slate-500">{isCustomer ? 'Khách hàng:' : 'Nhà cung cấp:'}</span>
              <span className="text-sm text-slate-500 font-medium">{entity.name}</span>
            </div>
            {entity.phone && (
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-slate-500">Số điện thoại:</span>
                <span className="text-sm text-slate-500 font-medium">{entity.phone}</span>
              </div>
            )}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
              <span className="text-sm font-medium text-slate-700">Tổng dư nợ hiện tại:</span>
              <span className="text-base font-bold text-red-600">
                {fmtVND(customerDebt)}đ
              </span>
            </div>
          </div>

          {/* Loading indicator while checking for debt orders */}
          {isCustomer && ordersLoading && (
            <div className="flex items-center justify-center py-4 text-sm text-slate-400">
              <svg className="animate-spin mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Đang kiểm tra đơn hàng nợ...
            </div>
          )}

          {/* Order selection — only when customer has debt orders */}
          {debtMode === 'by_order' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-slate-700">
                    Đơn hàng đang nợ ({debtOrders.length})
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      await refetchOrders()
                      toast.success('Đã làm mới danh sách đơn nợ')
                    }}
                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                    title="Làm mới danh sách đơn nợ"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${ordersFetching ? 'animate-spin text-primary' : ''}`} />
                  </button>
                </div>
                {debtOrders.length > 0 && (
                  <button
                    type="button"
                    onClick={selectAllOrders}
                    className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                  >
                    {selectedOrderIds.length === debtOrders.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  </button>
                )}
              </div>

              {ordersLoading ? (
                <div className="flex items-center justify-center py-6 text-sm text-slate-400">
                  <svg className="animate-spin mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Đang tải đơn hàng...
                </div>
              ) : debtOrders.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
                  Không có đơn hàng nợ nào. Sử dụng chế độ &quot;Cơ bản&quot; để thu nợ.
                </div>
              ) : (
                <div className="max-h-[240px] overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {debtOrders.map((order) => {
                    const isSelected = selectedOrderIds.includes(order.id)
                    const orderDebt = parseFloat(order.debt_amount || '0')
                    const alloc = allocations.find(a => a.order_id === order.id)

                    return (
                      <div key={order.id} className="flex flex-col border-b border-slate-100 last:border-0">
                        <label
                          className={`flex items-start gap-3 p-3 cursor-pointer transition-colors ${
                            isSelected ? 'bg-primary/5' : 'hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOrder(order.id)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/20"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-slate-800">
                                #{shortOrderNo(order.order_no, order.id)}
                              </span>
                              <span className="text-sm font-bold text-red-600">
                                {fmtVND(orderDebt)}đ
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-xs text-slate-400">
                                {fmtDate(order.created_at)}
                              </span>
                              <span className="text-xs text-slate-400">
                                Tổng: {fmtVND(order.total_amount)}đ
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-1.5">
                              <div className="flex-1">
                                {/* Show allocation result for this order */}
                                {isSelected && alloc && (
                                  <div className={`text-xs font-medium flex items-center gap-1 ${alloc.fully_paid ? 'text-green-600' : 'text-orange-600'}`}>
                                    {alloc.fully_paid
                                      ? <><CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" /> Gạch {fmtVND(alloc.amount)}đ → Hết nợ</>
                                      : <><Clock className="w-3.5 h-3.5 text-orange-500 shrink-0" /> Gạch {fmtVND(alloc.amount)}đ → Còn {fmtVND(alloc.remaining_debt)}đ</>}
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setExpandedOrderIds(prev => prev.includes(order.id) ? prev.filter(x => x !== order.id) : [...prev, order.id])
                                }}
                                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-200 px-1.5 py-0.5 rounded transition-colors"
                              >
                                {expandedOrderIds.includes(order.id) ? 'Thu gọn' : 'Chi tiết'}
                                {expandedOrderIds.includes(order.id) ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        </label>
                        {expandedOrderIds.includes(order.id) && (
                          <OrderItemsPreview shopId={shopId} order={order} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Summary of selected orders */}
              {selectedOrderIds.length > 0 && (
                <div className="mt-2 flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                  <span className="text-slate-600">
                    Tổng nợ {selectedOrderIds.length} đơn đã chọn:
                  </span>
                  <span className="font-bold text-red-600">
                    {fmtVND(selectedOrdersDebt)}đ
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Amount input */}
          <div className="space-y-4">
            <NumberInput
              label={isCustomer ? 'Số tiền thu *' : 'Số tiền trả *'}
              value={String(amountToCollect)}
              onChange={(v) => {
                const maxAllowed = debtMode === 'by_order' ? selectedOrdersDebt : customerDebt
                setAmountToCollect(Math.min(Number(v) || 0, maxAllowed))
              }}
              suffix="đ"
              max={debtMode === 'by_order' ? selectedOrdersDebt : customerDebt}
            />
            {debtMode === 'by_order' && selectedOrderIds.length > 0 && (
              <div className="flex justify-between items-center -mt-2 min-h-[20px]">
                <p className="text-xs text-slate-400">
                  Có thể sửa số tiền để trả một phần
                </p>
                {amountToCollect < selectedOrdersDebt && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary hover:underline transition-colors cursor-pointer"
                    onClick={() => setAmountToCollect(selectedOrdersDebt)}
                  >
                    Thu đủ {selectedOrderIds.length} đơn
                  </button>
                )}
              </div>
            )}
            {debtMode === 'basic' && (
              <div className="flex justify-end -mt-2 min-h-[20px]">
                {amountToCollect < customerDebt && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary hover:underline hover:text-primary-dark transition-colors cursor-pointer"
                    onClick={() => setAmountToCollect(customerDebt)}
                  >
                    {isCustomer ? 'Thu toàn bộ' : 'Trả toàn bộ'}
                  </button>
                )}
              </div>
            )}

            {/* Fund selection */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {isCustomer ? 'Tài khoản/Sổ quỹ nhận tiền *' : 'Tài khoản/Sổ quỹ chi tiền *'}
              </label>
              <select
                value={fundId}
                onChange={(e) => {
                  const val = e.target.value
                  setFundId(val)
                  const selectedFund = funds.find(f => f.id === val)
                  if (selectedFund) {
                    setMethod(selectedFund.type === 'cash' ? 'cash' : 'bank_transfer')
                  }
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none transition-colors"
              >
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.type === 'cash' ? 'Tiền mặt' : 'Tài khoản ngân hàng'} - Số dư: {fmtVND(f.current_balance || 0)}đ)
                  </option>
                ))}
                {funds.length === 0 && <option value="">Đang tải danh sách sổ quỹ...</option>}
              </select>
            </div>

            {/* Bank info */}
            {(() => {
              const selectedFund = funds.find(f => f.id === fundId)
              if (selectedFund && selectedFund.type === 'bank' && (selectedFund.bank_name || selectedFund.account_number)) {
                return (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 space-y-2 text-xs text-indigo-900 animate-in fade-in slide-in-from-top-1 duration-200 shadow-xs relative overflow-hidden">
                    <div className="absolute right-3 top-3 opacity-10 text-3xl font-bold select-none pointer-events-none">🏛️</div>
                    <p className="font-bold text-[10px] uppercase tracking-wider text-indigo-500 mb-1 flex items-center gap-1">
                      <span>🏛️</span> Thông tin thanh toán (Chuyển khoản)
                    </p>
                    <div className="grid grid-cols-3 gap-y-1.5 gap-x-2">
                      <span className="text-indigo-650 font-medium">Ngân hàng:</span>
                      <span className="col-span-2 font-bold text-slate-800">
                        {getBankDisplayName(selectedFund.bank_name)}
                      </span>
                      <span className="text-indigo-650 font-medium">Số tài khoản:</span>
                      <span className="col-span-2 font-bold text-slate-800">
                        {selectedFund.account_number ? (
                          <CopyableId id={selectedFund.account_number} className="text-sm font-bold text-slate-800" />
                        ) : '—'}
                      </span>
                      <span className="text-indigo-650 font-medium">Chủ tài khoản:</span>
                      <span className="col-span-2 font-bold text-slate-800">
                        {selectedFund.account_name ? (
                          <CopyableId id={selectedFund.account_name.toUpperCase()} className="text-sm font-bold text-slate-800 uppercase" />
                        ) : '—'}
                      </span>
                    </div>
                  </div>
                )
              }
              return null
            })()}
          </div>

          {/* Summary */}
          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
            <p>Sau khi {isCustomer ? 'thu' : 'trả'}, dư nợ của {isCustomer ? 'khách hàng' : 'nhà cung cấp'} sẽ còn <b>{fmtVND(Math.max(0, customerDebt - amountToCollect))}đ</b>.</p>
            <p className="mt-1">Một <b>Phiếu {isCustomer ? 'Thu' : 'Chi'}</b> sẽ được tự động tạo trong Sổ Quỹ.</p>
            {debtMode === 'by_order' && allocations.length > 0 && (
              <p className="mt-1">
                <b>{allocations.filter(a => a.fully_paid).length}</b> đơn sẽ được gạch hết nợ
                {allocations.some(a => !a.fully_paid) && <>, <b>{allocations.filter(a => !a.fully_paid).length}</b> đơn trả một phần</>}.
              </p>
            )}
          </div>
        </div>
      </SlideOver>

      {/* Double confirmation modal */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          collectMutation.mutate()
          setConfirmOpen(false)
        }}
        title={isCustomer ? 'Xác nhận thu nợ khách hàng' : 'Xác nhận trả nợ nhà cung cấp'}
        description={
          isCustomer
            ? `Hành động này sẽ tự động tạo một PHIẾU THU SỔ QUỸ tương ứng và khấu trừ công nợ của khách hàng.${
                debtMode === 'by_order' && allocations.length > 0
                  ? ` Đồng thời gạch nợ ${allocations.length} đơn hàng.`
                  : ''
              } Bạn có chắc chắn muốn thu ${fmtVND(amountToCollect)}đ từ khách hàng "${entity?.name}" không?`
            : `Hành động này sẽ tự động tạo một PHIẾU CHI SỔ QUỸ tương ứng và khấu trừ công nợ của nhà cung cấp. Bạn có chắc chắn muốn trả ${fmtVND(amountToCollect)}đ cho nhà cung cấp "${entity?.name}" không?`
        }
        confirmLabel={isCustomer ? 'Xác nhận thu nợ' : 'Xác nhận trả nợ'}
        variant="default"
        loading={collectMutation.isPending}
      />
    </>
  )
}
