'use client'

import React, { useState, useRef, useMemo } from 'react'
import { SlideOver } from './SlideOver'
import Barcode from 'react-barcode'
import { useReactToPrint } from 'react-to-print'

export interface PrintProduct {
  id: string
  name: string
  barcode: string
  sku: string
  sell_price: string
}

interface BarcodePrintModalProps {
  open: boolean
  onClose: () => void
  shopName: string
  products: PrintProduct[]
}

export function BarcodePrintModal({ open, onClose, shopName, products }: BarcodePrintModalProps) {
  const [showShopName, setShowShopName] = useState(true)
  const [showProductName, setShowProductName] = useState(true)
  const [showPrice, setShowPrice] = useState(true)
  const [paperSize, setPaperSize] = useState<'50x30' | '35x22'>('50x30')
  const [copies, setCopies] = useState<Record<string, number>>({})

  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `In_Ma_Vach_${shopName}`,
  })

  // Set default copies to 1 for new products
  useMemo(() => {
    const initialCopies: Record<string, number> = {}
    products.forEach(p => {
      if (copies[p.id] === undefined) {
        initialCopies[p.id] = 1
      }
    })
    if (Object.keys(initialCopies).length > 0) {
      setCopies(prev => ({ ...prev, ...initialCopies }))
    }
  }, [products])

  const handleCopiesChange = (id: string, value: number) => {
    if (value < 1) value = 1
    if (value > 1000) value = 1000
    setCopies(prev => ({ ...prev, [id]: value }))
  }

  const formatPrice = (priceStr: string) => {
    const num = Number(priceStr)
    if (isNaN(num)) return '0 VND'
    return num.toLocaleString('vi-VN') + ' VND'
  }

  // Dimensions based on paper size
  // 50x30mm -> approx 189x113 pixels (at 96dpi)
  // 35x22mm -> approx 132x83 pixels
  const mmToPx = (mm: number) => Math.round((mm * 96) / 25.4)
  const widthMm = paperSize === '50x30' ? 50 : 35
  const heightMm = paperSize === '50x30' ? 30 : 22
  const widthPx = mmToPx(widthMm)
  const heightPx = mmToPx(heightMm)

  // Barcode scaling to fit the small labels
  const barcodeHeight = paperSize === '50x30' ? 35 : 25
  const barcodeWidth = paperSize === '50x30' ? 1.6 : 1.2
  const fontSize = paperSize === '50x30' ? 12 : 9

  return (
    <SlideOver open={open} onClose={onClose} title="In tem mã vạch" width={600} footer={
      <>
        <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Đóng</button>
        <button onClick={() => handlePrint()} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">In mã vạch</button>
      </>
    }>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-slate-800">Cài đặt hiển thị</h3>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={showShopName} onChange={(e) => setShowShopName(e.target.checked)} className="rounded border-slate-300 accent-primary w-4 h-4" />
              Tên cửa hàng ({shopName})
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={showProductName} onChange={(e) => setShowProductName(e.target.checked)} className="rounded border-slate-300 accent-primary w-4 h-4" />
              Tên sản phẩm
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} className="rounded border-slate-300 accent-primary w-4 h-4" />
              Giá sản phẩm (... VND)
            </label>
          </div>
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-slate-800">Kích thước giấy (Máy in nhiệt)</h3>
            <select
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value as any)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none bg-white"
            >
              <option value="50x30">Tem 50x30mm (1 tem/hàng)</option>
              <option value="35x22">Tem 35x22mm (2 tem/hàng phổ biến)</option>
            </select>
            <p className="text-xs text-slate-500">Mẹo: Cài đặt khổ giấy đúng kích thước này trong cửa sổ in của trình duyệt (Margins: None).</p>
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-sm text-slate-800 mb-3">Danh sách sản phẩm in ({products.length})</h3>
          <div className="max-h-[300px] overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
            {products.map(p => {
              const code = (p.barcode && p.barcode.trim() !== '') ? p.barcode : p.sku
              return (
                <div key={p.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                  <div className="overflow-hidden">
                    <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Mã: {code} | Giá: {formatPrice(p.sell_price)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <label className="text-xs text-slate-500">Số lượng:</label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={copies[p.id] || 1}
                      onChange={(e) => handleCopiesChange(p.id, parseInt(e.target.value) || 1)}
                      className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm text-center focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>
              )
            })}
            {products.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-500">Chưa có sản phẩm nào được chọn</div>
            )}
          </div>
        </div>

        {/* Preview section */}
        <div>
          <h3 className="font-semibold text-sm text-slate-800 mb-3">Xem trước tem (Minh họa)</h3>
          {products.length > 0 && (
            <div className="p-4 bg-slate-100 rounded-xl flex justify-center overflow-x-auto">
              <div 
                className="bg-white border border-slate-300 flex flex-col items-center justify-center p-1 shadow-sm"
                style={{ width: widthPx, height: heightPx, overflow: 'hidden' }}
              >
                {showShopName && <div className="font-bold w-full text-center leading-tight line-clamp-2" style={{ fontSize: fontSize }}>{shopName}</div>}
                {showProductName && <div className="w-full text-center leading-tight mt-0.5 line-clamp-2" style={{ fontSize: fontSize - 2 }}>{products[0].name}</div>}
                <div className="flex-1 flex items-center justify-center -my-1 w-full overflow-hidden">
                  <Barcode 
                    value={(products[0].barcode && products[0].barcode.trim() !== '') ? products[0].barcode : products[0].sku} 
                    height={barcodeHeight}
                    width={barcodeWidth}
                    displayValue={true}
                    fontSize={fontSize + 1}
                    margin={0}
                    textMargin={0}
                    background="transparent"
                  />
                </div>
                {showPrice && <div className="font-bold w-full text-center leading-tight mb-0.5" style={{ fontSize: fontSize + 1 }}>{formatPrice(products[0].sell_price)}</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hidden printable area */}
      <div className="hidden">
        <div ref={printRef} className="print-area">
          <style type="text/css" media="print">
            {`
              @page {
                size: ${widthMm}mm ${heightMm}mm;
                margin: 0;
              }
              body {
                margin: 0;
                padding: 0;
                -webkit-print-color-adjust: exact;
              }
              .print-area {
                width: ${widthMm}mm;
              }
              .label-page {
                width: ${widthMm}mm;
                height: ${heightMm}mm;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                page-break-after: always;
                box-sizing: border-box;
                padding: 1mm;
              }
              .label-shop-name {
                font-family: sans-serif;
                font-size: ${fontSize}px;
                font-weight: bold;
                text-align: center;
                width: 100%;
                overflow: hidden;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                line-height: 1.1;
              }
              .label-product-name {
                font-family: sans-serif;
                font-size: ${fontSize - 2}px;
                font-weight: normal;
                text-align: center;
                width: 100%;
                overflow: hidden;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                line-height: 1.1;
                margin-top: 1px;
              }
              .label-barcode-container {
                display: flex;
                flex: 1;
                align-items: center;
                justify-content: center;
                width: 100%;
                margin: -2px 0;
                overflow: hidden;
              }
              .label-price {
                font-family: sans-serif;
                font-size: ${fontSize + 1}px;
                font-weight: bold;
                text-align: center;
                width: 100%;
                line-height: 1.2;
                margin-bottom: 1px;
              }
            `}
          </style>
          {products.flatMap(p => {
            const count = copies[p.id] || 1
            const code = (p.barcode && p.barcode.trim() !== '') ? p.barcode : p.sku
            return Array.from({ length: count }).map((_, idx) => (
              <div key={`${p.id}-${idx}`} className="label-page">
                {showShopName && <div className="label-shop-name">{shopName}</div>}
                {showProductName && <div className="label-product-name">{p.name}</div>}
                <div className="label-barcode-container">
                  <Barcode 
                    value={code} 
                    height={barcodeHeight}
                    width={barcodeWidth}
                    displayValue={true}
                    fontSize={fontSize + 1}
                    margin={0}
                    textMargin={0}
                    background="transparent"
                  />
                </div>
                {showPrice && <div className="label-price">{formatPrice(p.sell_price)}</div>}
              </div>
            ))
          })}
        </div>
      </div>
    </SlideOver>
  )
}
