'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

type ProductCandidate = {
  product_id: string
  id?: string
  name: string
  barcode?: string
  sell_price?: string | number
  unit?: string
}

type QuickProduct = ProductCandidate & Record<string, unknown>
type Category = { category_id: string; name: string }

function maskMoney(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits ? Number(digits).toLocaleString('vi-VN') : ''
}

function moneyValue(value: string) {
  return Number(value.replace(/\D/g, '') || 0)
}

interface Props {
  open: boolean
  shopId: string
  initialName: string
  initialBarcode: string
  categories: Category[]
  allowLocalImageUpload: boolean
  onClose: () => void
  onCreated: (product: QuickProduct) => void | Promise<void>
  onUseExisting: (product: ProductCandidate) => void | Promise<void>
}

export function QuickCreateProductDialog({
  open, shopId, initialName, initialBarcode, categories, allowLocalImageUpload, onClose, onCreated, onUseExisting,
}: Props) {
  const [name, setName] = useState(initialName)
  const [barcode, setBarcode] = useState(initialBarcode)
  const [sellPrice, setSellPrice] = useState('')
  const [costPrice, setCostPrice] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [unit, setUnit] = useState('Cái')
  const [imageUrl, setImageUrl] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [suggestions, setSuggestions] = useState<ProductCandidate[]>([])
  const [saving, setSaving] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName(initialName)
    setBarcode(initialBarcode)
    setSellPrice('')
    setCostPrice('')
    setMinPrice('')
    setCategoryId('')
    setUnit('Cái')
    setImageUrl('')
    setShowMore(false)
    setSuggestions([])
    setSelectedFile(null)
  }, [open, initialName, initialBarcode])

  useEffect(() => {
    if (!open || name.trim().length < 2) {
      setSuggestions([])
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/shops/${shopId}/products/quick-create?q=${encodeURIComponent(name.trim())}`, {
          signal: controller.signal,
        })
        if (response.ok) setSuggestions((await response.json()).data || [])
      } catch (error) {
        if ((error as Error).name !== 'AbortError') console.warn('Cannot load product suggestions', error)
      }
    }, 300)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [name, open, shopId])

  if (!open) return null

  async function save() {
    const numericPrice = moneyValue(sellPrice)
    if (!name.trim()) return toast.error('Vui lòng nhập tên sản phẩm')
    if (!Number.isFinite(numericPrice) || numericPrice < 0) return toast.error('Vui lòng nhập giá bán hợp lệ')

    setSaving(true)
    try {
      const response = await fetch(`/api/shops/${shopId}/products/quick-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), barcode: barcode.trim(), sell_price: numericPrice,
          cost_price: moneyValue(costPrice), min_price: moneyValue(minPrice), category_id: categoryId,
          unit: unit.trim() || 'Cái', image_url: selectedFile ? '' : imageUrl.trim(), source: 'pos_quick_web',
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (response.status === 409 && payload.existing_product) {
        toast.error('Barcode này đã tồn tại. Hãy dùng sản phẩm có sẵn.')
        await onUseExisting(payload.existing_product)
        onClose()
        return
      }
      if (!response.ok) throw new Error(payload.error || 'Không thể tạo sản phẩm')
      let product = payload.product as QuickProduct
      if (selectedFile) {
        const productId = String(product.product_id || product.id)
        const uploadUrlResponse = await fetch(`/api/shops/${shopId}/products/${productId}/upload-url`)
        if (!uploadUrlResponse.ok) throw new Error('Đã tạo sản phẩm nhưng không lấy được link tải ảnh')
        const { uploadUrl, publicUrl } = await uploadUrlResponse.json()
        const uploadResponse = await fetch(uploadUrl, { method: 'PUT', body: selectedFile, headers: { 'Content-Type': selectedFile.type || 'image/jpeg' } })
        if (!uploadResponse.ok) throw new Error('Đã tạo sản phẩm nhưng tải ảnh lên thất bại')
        const imageResponse = await fetch(`/api/shops/${shopId}/products/${productId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_url: publicUrl }) })
        if (!imageResponse.ok) throw new Error('Đã tải ảnh nhưng không thể cập nhật sản phẩm')
        product = { ...product, image_url: publicUrl }
      }
      await onCreated(product)
      toast.success('Đã tạo sản phẩm và thêm vào giỏ', { description: 'Sản phẩm được đánh dấu cần review.' })
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể tạo sản phẩm')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Tạo nhanh sản phẩm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Tạo nhanh sản phẩm</h2>
            <p className="mt-0.5 text-xs text-slate-500">Lưu vào đơn ngay; tồn kho có thể âm và sẽ cần review.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Đóng">✕</button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block text-xs font-semibold text-slate-700">Tên sản phẩm <span className="text-rose-500">*</span>
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary" placeholder="Ví dụ: Mì gói Hảo Hảo" />
          </label>
          {suggestions.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
              <p className="px-1 pb-1 text-xs font-semibold text-amber-800">Có thể là sản phẩm đã có</p>
              {suggestions.map((product) => (
                <button key={product.product_id || product.id} type="button" onClick={() => { void onUseExisting(product); onClose() }} className="flex w-full items-center justify-between rounded px-1.5 py-1.5 text-left text-xs hover:bg-amber-100">
                  <span className="font-medium text-slate-800">{product.name}</span><span className="text-slate-500">{Number(product.sell_price || 0).toLocaleString('vi-VN')}đ</span>
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-slate-700">Giá bán <span className="text-rose-500">*</span>
              <input inputMode="numeric" value={sellPrice} onChange={(event) => setSellPrice(maskMoney(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-sm outline-none focus:border-primary" placeholder="0" />
            </label>
            <label className="block text-xs font-semibold text-slate-700">Đơn vị tính
              <input value={unit} onChange={(event) => setUnit(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary" />
            </label>
          </div>
          <label className="block text-xs font-semibold text-slate-700">Barcode
            <input value={barcode} onChange={(event) => setBarcode(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary" placeholder="Tự điền khi quét mã" />
          </label>
          <button type="button" onClick={() => setShowMore(!showMore)} className="text-xs font-semibold text-primary hover:underline">{showMore ? 'Ẩn thông tin thêm' : 'Thêm ảnh / thông tin mở rộng'}</button>
          {showMore && <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            <label className="block text-xs font-semibold text-slate-700">Danh mục
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary"><option value="">Chưa phân loại</option>{categories.map((category) => <option key={category.category_id} value={category.category_id}>{category.name}</option>)}</select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-slate-700">Giá vốn
                <input inputMode="numeric" value={costPrice} onChange={(event) => setCostPrice(maskMoney(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm outline-none focus:border-primary" placeholder="0" />
              </label>
              <label className="block text-xs font-semibold text-slate-700">Giá sàn
                <input inputMode="numeric" value={minPrice} onChange={(event) => setMinPrice(maskMoney(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm outline-none focus:border-primary" placeholder="0" />
              </label>
            </div>
            <label className="block text-xs font-semibold text-slate-700">Ảnh sản phẩm
              {allowLocalImageUpload && <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} />}
              <div className="mt-1 flex gap-2">{allowLocalImageUpload && <button type="button" onClick={() => fileInputRef.current?.click()} className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">{selectedFile ? selectedFile.name : 'Chọn từ máy'}</button>}<input value={imageUrl} disabled={!!selectedFile} onChange={(event) => setImageUrl(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-slate-100" placeholder="URL ảnh" /></div>
              {!allowLocalImageUpload && <p className="mt-1 text-[11px] font-medium text-slate-500">Gói Tiên phong chỉ hỗ trợ ảnh từ URL.</p>}
            </label>
          </div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200">Huỷ</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-60">{saving ? 'Đang lưu...' : 'Lưu vào đơn'}</button>
        </div>
      </div>
    </div>
  )
}
