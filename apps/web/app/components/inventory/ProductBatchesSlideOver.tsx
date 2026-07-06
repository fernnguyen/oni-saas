'use client'

import { useState, useEffect } from 'react'
import { SlideOver } from '@/app/components/ui/SlideOver'
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { localDb } from '@/lib/localDb/schema'

interface Props {
  open: boolean
  onClose: () => void
  shopId: string
  productId: string
  warehouseId?: string
  onBatchesChanged?: () => void
}

export function ProductBatchesSlideOver({ open, onClose, shopId, productId, warehouseId, onBatchesChanged }: Props) {
  const [selectedProductBatches, setSelectedProductBatches] = useState<any[]>([])
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [addingBatch, setAddingBatch] = useState(false)
  const [addingBatchLoading, setAddingBatchLoading] = useState(false)
  const [adjustingBatch, setAdjustingBatch] = useState<any | null>(null)
  const [adjustingLoading, setAdjustingLoading] = useState(false)
  const [adjustQtyInput, setAdjustQtyInput] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [newBatchForm, setNewBatchForm] = useState({
    batch_no: '',
    expiry_date: '',
    stock_qty: '0'
  })

  const [hideSoldOut, setHideSoldOut] = useState(true)

  // 1. Fetch Product Info
  const { data: productData, isLoading: loadingProduct } = useQuery({
    queryKey: ['product', shopId, productId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/products/${productId}`)
      if (!res.ok) throw new Error('Failed to load product')
      return res.json()
    },
    enabled: open && !!productId
  })
  
  const product = productData

  // 2. Fetch Batches
  const loadBatches = async () => {
    if (!productId || !open) return
    setLoadingBatches(true)
    try {
      const targetId = product?.id || productId
      const res = await fetch(`/api/shops/${shopId}/inventory-batches?product_id=${targetId}&limit=1000`)
      if (res.ok) {
        const json = await res.json()
        let activeBatches = (json.data || []).filter((b: any) => 
          warehouseId ? (!b.warehouse_id || b.warehouse_id === warehouseId) : true
        )
        setSelectedProductBatches(activeBatches)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingBatches(false)
    }
  }

  useEffect(() => {
    if (open && productId) {
      loadBatches()
    }
  }, [open, productId, warehouseId, product?.id])

  const handleInitiateAdjustBatch = (batch: any) => {
    setAdjustingBatch(batch)
    setAdjustQtyInput('0')
    setAdjustReason(`Điều chỉnh / Hủy lô: ${batch.batch_no}`)
  }

  const handleConfirmAdjustBatch = async () => {
    if (!adjustingBatch || !product) return
    setAdjustingLoading(true)
    try {
      const currentQty = Number(adjustingBatch.stock_qty || 0)
      const targetQty = Number(adjustQtyInput)
      const delta = targetQty - currentQty

      if (delta === 0) {
        toast.error('Số lượng tồn không thay đổi')
        setAdjustingLoading(false)
        return
      }

      const targetProductId = product.id || productId

      const res = await fetch(`/api/shops/${shopId}/inventory/adjust-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id: shopId,
          warehouse_id: adjustingBatch.warehouse_id || warehouseId || '',
          reason: adjustReason || `Điều chỉnh lô hàng ${adjustingBatch.batch_no}: ${currentQty} -> ${targetQty}`,
          items: [
            {
              product_id: targetProductId,
              qty: String(delta),
              batch_no: adjustingBatch.batch_no,
              unit_cost: String(product.cost_price || 0)
            }
          ]
        })
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Điều chỉnh lô thất bại')

      if (typeof window !== 'undefined' && localDb) {
        await localDb.inventoryBatches.update(adjustingBatch.id, { stock_qty: targetQty }).catch(() => {})
        const localInvList = await localDb.inventory.where('[product_id+branch_id]').equals([targetProductId, shopId]).toArray()
        if (localInvList[0]) {
          const newQty = Math.max(0, Number(localInvList[0].stock_qty || 0) + delta)
          await localDb.inventory.where('[product_id+branch_id]').equals([targetProductId, shopId]).modify({ stock_qty: newQty }).catch(() => {})
        }
      }

      toast.success(json.movement_no ? `Điều chỉnh lô hàng thành công! (Phiếu: ${json.movement_no})` : 'Điều chỉnh lô hàng thành công!')
      setAdjustingBatch(null)
      loadBatches()
      onBatchesChanged?.()
    } catch (error: any) {
      toast.error(error.message || 'Có lỗi xảy ra khi điều chỉnh lô')
    } finally {
      setAdjustingLoading(false)
    }
  }

  const handleConfirmAddBatch = async () => {
    if (!product) return
    if (!newBatchForm.batch_no) {
      toast.error('Vui lòng nhập số hiệu lô')
      return
    }
    setAddingBatchLoading(true)
    try {
      const qty = Number(newBatchForm.stock_qty || 0)

      const targetProductId = product.id || productId

      const res = await fetch(`/api/shops/${shopId}/inventory/adjust-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id: shopId,
          warehouse_id: warehouseId || (batches.length > 0 ? batches[0].warehouse_id : ''),
          reason: `Khởi tạo tồn kho lô ${newBatchForm.batch_no}`,
          items: [
            {
              product_id: targetProductId,
              qty: String(qty),
              batch_no: newBatchForm.batch_no,
              expiry_date: newBatchForm.expiry_date || null,
              unit_cost: String(product.cost_price || 0)
            }
          ]
        })
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Thêm lô thất bại')

      if (typeof window !== 'undefined' && localDb) {
        const localInvList = await localDb.inventory.where('[product_id+branch_id]').equals([productId, shopId]).toArray()
        if (localInvList[0]) {
          const newQty = Math.max(0, Number(localInvList[0].stock_qty || 0) + qty)
          await localDb.inventory.where('[product_id+branch_id]').equals([productId, shopId]).modify({ stock_qty: newQty }).catch(() => {})
        }
        await localDb.inventoryBatches.add({
          id: `IB-${crypto.randomUUID()}`,
          tenant_id: shopId,
          branch_id: shopId,
          product_id: targetProductId,
          batch_no: newBatchForm.batch_no,
          stock_qty: qty,
          expiry_date: newBatchForm.expiry_date || null,
          warehouse_id: warehouseId || (batches.length > 0 ? batches[0].warehouse_id : ''),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          active: 'TRUE'
        }).catch(() => {})
      }

      toast.success(json.movement_no ? `Thêm lô hàng thành công! (Phiếu: ${json.movement_no})` : 'Thêm lô hàng thành công!')
      setAddingBatch(false)
      loadBatches()
      onBatchesChanged?.()
    } catch (error: any) {
      toast.error(error.message || 'Lỗi thêm lô')
    } finally {
      setAddingBatchLoading(false)
    }
  }

  const visibleBatches = selectedProductBatches.filter(b => {
    if (hideSoldOut) return Number(b.stock_qty || 0) > 0;
    return true;
  });

  const totalQty = selectedProductBatches.reduce((acc, b) => acc + Number(b.stock_qty || 0), 0)

  return (
    <>
      <SlideOver
        open={open}
        onClose={onClose}
        title="Chi tiết lô tồn kho"
        width={520}
      >
        <div className="space-y-6">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-50/80 via-slate-50/60 to-amber-50/40 p-5 text-slate-800 shadow-sm border border-orange-100/60">
            <div className="relative space-y-3">
              <span className="inline-flex items-center rounded-full bg-orange-100/70 px-2.5 py-0.5 text-xs font-semibold text-orange-700 border border-orange-200/50">
                Thông tin hàng hóa
              </span>
              <div>
                <h3 className="text-lg font-bold tracking-tight text-slate-900 leading-snug">
                  {loadingProduct ? 'Đang tải...' : product?.name || 'Không rõ tên sản phẩm'}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  SKU: {product?.sku || '—'}
                </p>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200/60 pt-3 mt-1">
                <span className="text-xs font-medium text-slate-500">Tổng tồn (từ các lô):</span>
                <span className="text-xl font-extrabold text-orange-600 tabular-nums">
                  {totalQty.toLocaleString('vi-VN')} {product?.unit || 'đv'}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Danh sách các lô tồn kho</h4>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer hover:opacity-80">
                  <input 
                    type="checkbox" 
                    checked={!hideSoldOut} 
                    onChange={() => setHideSoldOut(!hideSoldOut)} 
                    className="rounded border-slate-300 text-orange-600 focus:ring-orange-500" 
                  />
                  <span className="text-[11px] font-medium text-slate-600">Hiển thị lô đã bán hết</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setNewBatchForm({
                      batch_no: '',
                      expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                      stock_qty: '0'
                    })
                    setAddingBatch(true)
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary-dark hover:underline transition-all"
                >
                  Thêm lô nhanh
                </button>
              </div>
            </div>

            {loadingBatches ? (
              <div className="flex justify-center p-8 text-sm text-slate-500">Đang tải lô hàng...</div>
            ) : visibleBatches.length > 0 ? (
              <div className="space-y-2.5">
                {visibleBatches.map((batch) => {
                  const qty = Number(batch.stock_qty || 0)
                  let expiryText = '—'
                  let statusBadge = null

                  if (batch.expiry_date) {
                    const expDate = new Date(batch.expiry_date)
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    const timeDiff = expDate.getTime() - today.getTime()
                    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24))

                    expiryText = new Date(batch.expiry_date).toLocaleDateString('vi-VN')

                    if (daysDiff < 0) {
                      statusBadge = <span className="inline-flex items-center rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">Hết hạn ({Math.abs(daysDiff)} ngày)</span>
                    } else if (daysDiff <= 30) {
                      statusBadge = <span className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/30">Cận date ({daysDiff} ngày)</span>
                    } else {
                      statusBadge = <span className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/10">Còn {daysDiff} ngày</span>
                    }
                  }

                  return (
                    <div key={batch.id || batch.batch_no} className="group relative flex items-center justify-between rounded-xl border border-slate-100 bg-white p-4 shadow-sm hover:border-indigo-100 hover:bg-indigo-50/10 transition-all duration-200">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 shadow-sm">Lô: {batch.batch_no}</span>
                          {statusBadge}
                        </div>
                        <p className="text-xs text-slate-400 flex items-center gap-1">HSD: <span className="font-semibold text-slate-600">{expiryText}</span></p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-base font-extrabold text-slate-900 tabular-nums">{qty.toLocaleString('vi-VN')}</span>
                          <span className="block text-[10px] font-medium text-slate-400">{product?.unit || 'đv'}</span>
                        </div>
                        <button type="button" onClick={() => handleInitiateAdjustBatch(batch)} className="p-1.5 rounded-lg text-slate-500 hover:text-orange-600 hover:bg-orange-50 border border-transparent hover:border-orange-100 transition-all cursor-pointer">
                           <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center shadow-sm">
                <p className="text-xs text-slate-400 mx-auto leading-relaxed">Không tìm thấy lô hàng nào cho sản phẩm này.</p>
              </div>
            )}
          </div>
        </div>
      </SlideOver>

      {/* Adjust Batch Dialog */}
      <ConfirmDialog
        open={!!adjustingBatch}
        onClose={() => setAdjustingBatch(null)}
        onConfirm={handleConfirmAdjustBatch}
        title="Điều chỉnh tồn kho lô"
        confirmLabel="Cập nhật"
        cancelLabel="Hủy bỏ"
        loading={adjustingLoading}
      >
        <div className="space-y-4 text-sm text-slate-600">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">Lô đang điều chỉnh</label>
              <div className="rounded-xl bg-indigo-50/50 px-3 py-2 font-mono font-bold text-indigo-700 border border-indigo-100">{adjustingBatch?.batch_no}</div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">Tồn kho hiện tại</label>
              <div className="rounded-xl bg-slate-50 px-3 py-2 font-mono text-slate-700 border border-slate-200">
                {Number(adjustingBatch?.stock_qty || 0).toLocaleString('vi-VN')} {product?.unit || 'đv'}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4 space-y-3">
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-800">Tồn kho mới thực tế *</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  value={adjustQtyInput}
                  onChange={(e) => setAdjustQtyInput(e.target.value)}
                  className="w-full rounded-xl border border-orange-200 px-4 py-2.5 font-mono text-lg font-bold text-slate-900 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all shadow-sm"
                  placeholder="Nhập số lượng tồn kho đúng..."
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                  {product?.unit || 'đv'}
                </span>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Lý do điều chỉnh / Ghi chú</label>
              <textarea
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none bg-white"
                rows={2}
                placeholder="VD: Hàng bị hư hỏng, đền bù, thất thoát..."
              />
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3.5 text-xs text-blue-700 leading-relaxed flex gap-2.5 shadow-sm">
            <span className="shrink-0 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-blue-500">
                <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 011.08 1.04l-4.25 4.5a.75.75 0 01-1.152-.043l-2.25-2.75a.75.75 0 011.164-1.165l1.554 1.899L12.53 14H12a.75.75 0 010-1.5h.364l.823-3.291zM12 6a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" clipRule="evenodd" />
              </svg>
            </span>
            <span>
              Khi nhấn nút cập nhật, hệ thống sẽ tự động tạo một <strong>Phiếu điều chỉnh (PDK)</strong> nhằm điều chỉnh tồn kho cho lô này thành <strong>{Number(adjustQtyInput || 0).toLocaleString('vi-VN')} {product?.unit || 'đv'}</strong> (chênh lệch: {(() => {
                const diff = Number(adjustQtyInput || 0) - (adjustingBatch ? Number(adjustingBatch.stock_qty) : 0);
                return diff > 0 ? `+${diff.toLocaleString('vi-VN')}` : diff.toLocaleString('vi-VN');
              })()} {product?.unit || 'đv'}).
            </span>
          </div>
        </div>
      </ConfirmDialog>

      {/* Add Batch Dialog */}
      <ConfirmDialog
        open={addingBatch}
        onClose={() => setAddingBatch(false)}
        onConfirm={handleConfirmAddBatch}
        title="Thêm lô tồn kho nhanh"
        confirmLabel="Xác nhận khởi tạo"
        cancelLabel="Hủy bỏ"
        loading={addingBatchLoading}
      >
        <div className="space-y-4 text-sm text-slate-600">
          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3.5 text-xs text-blue-700 leading-relaxed space-y-1.5 shadow-sm">
            <div className="flex items-center gap-1.5 font-bold">
              <svg className="h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              <span>Nghiệp vụ tạo Phiếu Điều Chỉnh (PDK)</span>
            </div>
            <p>
              Hệ thống sẽ tự động tạo một <strong>Phiếu điều chỉnh tồn kho (PDK)</strong> nhằm tăng tồn kho thực tế cho lô hàng này. Việc này đảm bảo tính minh bạch của sổ sách kế toán kho và dễ dàng đối soát sau này.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Sản phẩm</label>
              <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-800 font-medium border border-slate-200/50">
                {product?.displayName || product?.name || productId}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Số hiệu lô *</label>
                <input
                  type="text"
                  value={newBatchForm.batch_no}
                  onChange={(e) => setNewBatchForm(f => ({ ...f, batch_no: e.target.value }))}
                  placeholder="VD: LOT-001"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none uppercase"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Hạn sử dụng *</label>
                <input
                  type="date"
                  value={newBatchForm.expiry_date}
                  onChange={(e) => setNewBatchForm(f => ({ ...f, expiry_date: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Số lượng tồn thực tế khởi tạo *</label>
              <input
                type="number"
                min="1"
                value={newBatchForm.stock_qty}
                onChange={(e) => setNewBatchForm(f => ({ ...f, stock_qty: e.target.value }))}
                placeholder="VD: 50"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none font-semibold text-slate-900"
              />
            </div>
          </div>
        </div>
      </ConfirmDialog>
    </>
  )
}
