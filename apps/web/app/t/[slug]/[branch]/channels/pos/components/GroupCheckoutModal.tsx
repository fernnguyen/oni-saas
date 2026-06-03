'use client'

import React, { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { 
  X, 
  Check, 
  RefreshCw, 
  Combine, 
  Split, 
  Wallet, 
  AlertCircle,
  HelpCircle,
  Building,
  User,
  Layers,
  ArrowRight,
  Info
} from 'lucide-react'

interface Order {
  id: string
  order_no: string
  customer_name: string
  total_amount: string
  paid_amount: string
  debt_amount: string
  subtotal: string
  resource_id?: string
  resource_name?: string
  metadata?: string | Record<string, any>
}

interface GroupCheckoutModalProps {
  isOpen: boolean
  onClose: () => void
  shopId: string
  slug: string
  branch: string
  activeOrders: Order[] // Orders selected for group checkout/splitting
  onSuccess: () => void
}

export default function GroupCheckoutModal({
  isOpen,
  onClose,
  shopId,
  slug,
  branch,
  activeOrders,
  onSuccess
}: GroupCheckoutModalProps) {
  const [loading, setLoading] = useState(false)
  const [actionType, setActionType] = useState<'merge' | 'split' | 'hybrid'>('hybrid')
  const [depositMode, setDepositMode] = useState<'hold' | 'even' | 'manual'>('hold')
  
  // Total deposit calculation
  const [totalDeposit, setTotalDeposit] = useState(0)
  const [depositAllocations, setDepositAllocations] = useState<Record<string, string>>({})
  
  // State to hold items of selected orders
  const [orderItemsMap, setOrderItemsMap] = useState<Record<string, any[]>>({})
  const [loadingItems, setLoadingItems] = useState(false)

  // Hybrid selections: which items to move to target/master order
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())
  const [masterOrderNo, setMasterOrderNo] = useState('')

  useEffect(() => {
    if (!isOpen) return
    
    // Parse deposits from orders' metadata
    let depSum = 0
    const allocs: Record<string, string> = {}
    
    activeOrders.forEach(o => {
      let dep = 0
      try {
        const meta = typeof o.metadata === 'string' ? JSON.parse(o.metadata) : (o.metadata || {})
        dep = parseFloat(meta.deposit_amount || '0')
      } catch {}
      depSum += dep
      allocs[o.id] = '0'
    })
    
    setTotalDeposit(depSum)
    setDepositAllocations(allocs)
    
    // Fetch items for all active orders
    fetchOrdersItems()
  }, [isOpen, activeOrders])

  const fetchOrdersItems = async () => {
    setLoadingItems(true)
    try {
      const itemsMap: Record<string, any[]> = {}
      for (const order of activeOrders) {
        const res = await fetch(`/api/shops/${shopId}/order-items?order_id=${order.id}&t=${Date.now()}`)
        if (res.ok) {
          const json = await res.json()
          itemsMap[order.id] = json.data || []
        }
      }
      setOrderItemsMap(itemsMap)
      
      // Prefill: select all "room_rate" or daily rate items for hybrid mode automatically
      const newSelected = new Set<string>()
      Object.values(itemsMap).flat().forEach(item => {
        const isRoomRate = item.product_name.toLowerCase().includes('phòng') || 
                           item.product_name.toLowerCase().includes('tiền giờ') ||
                           item.sku?.toLowerCase().includes('room');
        if (isRoomRate) {
          newSelected.add(item.id)
        }
      })
      setSelectedItemIds(newSelected)
    } catch {
      toast.error('Lỗi khi tải chi tiết các mặt hàng phòng/bàn')
    } finally {
      setLoadingItems(false)
    }
  }

  const handleCheckboxChange = (itemId: string) => {
    const next = new Set(selectedItemIds)
    if (next.has(itemId)) {
      next.delete(itemId)
    } else {
      next.add(itemId)
    }
    setSelectedItemIds(next)
  }

  const handleSelectAllItems = () => {
    const allItemIds = Object.values(orderItemsMap).flat().map(item => item.id)
    const isAllSelected = allItemIds.length > 0 && allItemIds.every(id => selectedItemIds.has(id))
    
    const next = new Set<string>()
    if (!isAllSelected) {
      allItemIds.forEach(id => next.add(id))
    }
    setSelectedItemIds(next)
  }

  const handleDepositModeChange = (mode: 'hold' | 'even' | 'manual') => {
    setDepositMode(mode)
    const allocs: Record<string, string> = {}
    
    if (mode === 'even' && activeOrders.length > 0) {
      const evenAmount = Math.floor(totalDeposit / activeOrders.length)
      activeOrders.forEach(o => {
        allocs[o.id] = String(evenAmount)
      })
    } else {
      activeOrders.forEach(o => {
        allocs[o.id] = '0'
      })
    }
    setDepositAllocations(allocs)
  }

  const handleManualDepositChange = (orderId: string, value: string) => {
    const raw = value.replace(/\D/g, '')
    const num = parseFloat(raw) || 0
    
    setDepositAllocations(prev => ({
      ...prev,
      [orderId]: String(num)
    }))
  }

  const handleProcessSplitMerge = async () => {
    setLoading(true)
    const loadToast = toast.loading('Đang xử lý phân bổ hóa đơn...')
    try {
      if (actionType === 'merge') {
        // MERGE: merge all selected orders into target (first order)
        const targetOrder = activeOrders[0]
        const sourceIds = activeOrders.slice(1).map(o => o.id)
        
        const res = await fetch(`/api/shops/${shopId}/orders/split-merge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'merge',
            sourceOrderIds: [targetOrder.id, ...sourceIds],
            targetOrderId: targetOrder.id,
            customer_name: targetOrder.customer_name
          })
        })

        if (!res.ok) throw new Error()
        toast.success('Đã gộp thành công tất cả hóa đơn vào đơn chính!')
      } 
      
      else if (actionType === 'split') {
        // SPLIT: apply deposit allocations only
        const depositPayload = Object.entries(depositAllocations).map(([orderId, amount]) => ({
          orderId,
          amount
        }))

        const res = await fetch(`/api/shops/${shopId}/orders/split-merge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'split',
            splits: [], // No item moves, just deposits
            deposits: depositPayload
          })
        })

        if (!res.ok) throw new Error()
        toast.success('Đã phân bổ tiền đặt cọc thành công!')
      } 
      
      else if (actionType === 'hybrid') {
        // HYBRID: Route selected items to a Master Order, leaving remaining items in child orders
        const targetOrder = activeOrders[0]
        const itemIdsToMove = Array.from(selectedItemIds)
        
        if (itemIdsToMove.length === 0) {
          toast.error('Vui lòng chọn ít nhất một món (tiền phòng/tiền ăn) để gom về hóa đơn tổng')
          setLoading(false)
          toast.dismiss(loadToast)
          return
        }

        // 1. Move items to master order
        const splitRes = await fetch(`/api/shops/${shopId}/orders/split-merge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'split',
            splits: [
              {
                targetOrderId: targetOrder.id, // Master Order (using first order as master)
                itemIds: itemIdsToMove
              }
            ],
            deposits: Object.entries(depositAllocations).map(([orderId, amount]) => ({
              orderId,
              amount
            })),
            sourceOrderId: targetOrder.id
          })
        })

        if (!splitRes.ok) throw new Error()
        toast.success('Đã tách thành công hóa đơn phòng tổng và phụ thu dịch vụ!')
      }

      onSuccess()
      onClose()
    } catch {
      toast.error('Lỗi khi xử lý tách/gộp hóa đơn')
    } finally {
      setLoading(false)
      toast.dismiss(loadToast)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-3xl">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" /> Phân Phối Hóa Đơn & Tiền Cọc
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Xử lý thanh toán linh hoạt cho đoàn lưu trú / ghép bàn FnB</p>
          </div>
          <button onClick={onClose} disabled={loading} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Active Orders List Summary */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <h4 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider mb-2">Danh sách phòng/bàn tham gia ({activeOrders.length})</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {activeOrders.map(o => (
                <div key={o.id} className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs flex justify-between items-center text-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      {o.resource_name || 'Phòng/Bàn'} <span className="text-[10px] text-slate-400 font-medium">#{o.order_no}</span>
                    </span>
                    <span className="text-slate-500">Khách: {o.customer_name}</span>
                  </div>
                  <span className="font-extrabold text-slate-800">{Number(o.total_amount).toLocaleString('vi-VN')}đ</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action Choice Tabs */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-500">1. Chọn phương thức xử lý hóa đơn</label>
            <div className="grid grid-cols-3 gap-2">
              
              {/* Hybrid Tab */}
              <button
                type="button"
                onClick={() => setActionType('hybrid')}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between h-28 ${
                  actionType === 'hybrid' 
                    ? 'border-primary bg-primary/5 text-primary shadow-xs ring-1 ring-primary' 
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex justify-between items-center w-full">
                  <Split className="w-5 h-5" />
                  <span className="bg-emerald-500/10 text-emerald-600 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full uppercase">Đề xuất</span>
                </div>
                <div>
                  <span className="font-bold text-xs block">Tách hỗn hợp (Hybrid)</span>
                  <span className="text-[10px] opacity-75 mt-0.5 block">Tiền phòng về đoàn, minibar khách lẻ tự trả</span>
                </div>
              </button>

              {/* Merge Tab */}
              <button
                type="button"
                onClick={() => setActionType('merge')}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between h-28 ${
                  actionType === 'merge' 
                    ? 'border-primary bg-primary/5 text-primary shadow-xs ring-1 ring-primary' 
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Combine className="w-5 h-5" />
                <div>
                  <span className="font-bold text-xs block">Gộp hóa đơn tổng</span>
                  <span className="text-[10px] opacity-75 mt-0.5 block">Gộp toàn bộ chi phí tất cả phòng về 1 bill duy nhất</span>
                </div>
              </button>

              {/* Split (Separate) Tab */}
              <button
                type="button"
                onClick={() => setActionType('split')}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between h-28 ${
                  actionType === 'split' 
                    ? 'border-primary bg-primary/5 text-primary shadow-xs ring-1 ring-primary' 
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Layers className="w-5 h-5" />
                <div>
                  <span className="font-bold text-xs block">Tách bill độc lập</span>
                  <span className="text-[10px] opacity-75 mt-0.5 block">Giữ nguyên hóa đơn riêng, chỉ phân bổ tiền cọc</span>
                </div>
              </button>

            </div>
          </div>

          {/* Deposit Allocation Section */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-bold text-slate-500">2. Phân bổ tiền cọc quỹ đoàn (Tổng cọc: <span className="text-emerald-600 font-extrabold">{totalDeposit.toLocaleString('vi-VN')}₫</span>)</label>
              <div className="flex bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold">
                <button type="button" onClick={() => handleDepositModeChange('hold')} className={`px-2 py-1 rounded-md transition-colors ${depositMode === 'hold' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Hoàn cọc/Gộp</button>
                <button type="button" onClick={() => handleDepositModeChange('even')} className={`px-2 py-1 rounded-md transition-colors ${depositMode === 'even' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Chia đều</button>
                <button type="button" onClick={() => handleDepositModeChange('manual')} className={`px-2 py-1 rounded-md transition-colors ${depositMode === 'manual' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Nhập tay</button>
              </div>
            </div>

            {depositMode === 'hold' && (
              <div className="bg-emerald-50/50 text-emerald-800 border border-emerald-100/50 p-3.5 rounded-xl text-xs flex gap-2">
                <Wallet className="w-4 h-4 mt-0.5 text-emerald-600 flex-shrink-0" />
                <p>Tiền cọc sẽ được giữ nguyên ở tài khoản cọc và không cấn trừ vào hóa đơn phụ của khách ở lẻ. Khoản này sẽ được cấn trừ khi xuất Hóa đơn gộp cuối cùng của đoàn, hoặc trả lại tiền mặt/chuyển khoản cho Công ty lữ hành.</p>
              </div>
            )}

            {depositMode !== 'hold' && (
              <div className="space-y-2 border border-slate-100 p-4 rounded-2xl bg-slate-50/30">
                {activeOrders.map(o => (
                  <div key={o.id} className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700">{o.resource_name || 'Phòng/Bàn'} (#{o.order_no}):</span>
                    <div className="flex items-center gap-1.5">
                      <input 
                        type="text" 
                        disabled={depositMode === 'even' || loading}
                        value={depositMode === 'even' ? Number(depositAllocations[o.id] || '0').toLocaleString('vi-VN') : (depositAllocations[o.id] || '0')}
                        onChange={e => handleManualDepositChange(o.id, e.target.value)}
                        className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-right outline-none font-bold bg-white text-slate-800 focus:border-primary disabled:bg-slate-100"
                      />
                      <span className="text-slate-400">₫</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hybrid Item Checklist Selector */}
          {actionType === 'hybrid' && (
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-slate-500">3. Chọn các khoản chuyển sang Bill tổng (Hóa đơn công ty)</label>
                {Object.keys(orderItemsMap).length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllItems}
                    className="text-primary hover:text-primary/80 font-bold text-xs bg-primary/5 px-2.5 py-1 rounded-lg border border-primary/10 transition-colors cursor-pointer select-none"
                  >
                    {(() => {
                      const allItemIds = Object.values(orderItemsMap).flat().map(item => item.id)
                      const isAllSelected = allItemIds.length > 0 && allItemIds.every(id => selectedItemIds.has(id))
                      return isAllSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'
                    })()}
                  </button>
                )}
              </div>
              
              {loadingItems ? (
                <div className="text-center py-6 text-xs text-slate-400">Đang tải danh sách dịch vụ phát sinh...</div>
              ) : Object.keys(orderItemsMap).length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400 italic">Không có mặt hàng nào để phân phối.</div>
              ) : (
                <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100 max-h-[220px] overflow-y-auto">
                  {activeOrders.map(o => {
                    const items = orderItemsMap[o.id] || []
                    if (items.length === 0) return null
                    
                    return (
                      <div key={o.id} className="p-3 bg-slate-50/20">
                        <div className="font-extrabold text-[10px] text-slate-400 uppercase tracking-wider mb-2 flex justify-between">
                          <span>{o.resource_name || 'Phòng/Bàn'}</span>
                          <span>Chủ phòng: {o.customer_name}</span>
                        </div>
                        <div className="space-y-1.5">
                          {items.map(item => {
                            const isSelected = selectedItemIds.has(item.id)
                            return (
                              <div key={item.id} className="flex justify-between items-center text-xs bg-white border border-slate-100 rounded-xl p-2.5 shadow-xs">
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleCheckboxChange(item.id)}
                                    className="w-4 h-4 text-primary border-slate-200 rounded focus:ring-primary cursor-pointer"
                                  />
                                  <div className="flex flex-col text-left">
                                    <span className="font-bold text-slate-800">{item.product_name}</span>
                                    <span className="text-[10px] text-slate-400">SL: {item.qty} • Đơn giá: {Number(item.unit_price).toLocaleString('vi-VN')}đ</span>
                                  </div>
                                </div>
                                <span className="font-extrabold text-slate-800">{Number(item.line_total).toLocaleString('vi-VN')}đ</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 bg-slate-50/50 rounded-b-3xl">
          <button 
            type="button" 
            disabled={loading} 
            onClick={onClose}
            className="flex-1 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
          >
            Hủy bỏ
          </button>
          <button 
            type="button" 
            disabled={loading || loadingItems} 
            onClick={handleProcessSplitMerge}
            className="flex-1 py-3 bg-primary hover:bg-primary/95 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-primary/20 flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Check className="w-4 h-4" /> Xác nhận xử lý thanh toán
          </button>
        </div>

      </div>
    </div>
  )
}
