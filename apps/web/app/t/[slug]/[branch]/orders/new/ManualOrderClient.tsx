'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeftIcon, CalendarClock, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from '@/app/components/ui/ConfirmProvider'

type Row = Record<string, any>
type CartLine = { product: Row; qty: number }
type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value']

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'card', label: 'Thẻ' },
  { value: 'bank_transfer', label: 'Chuyển khoản' },
  { value: 'momo', label: 'MoMo' },
  { value: 'vnpay', label: 'VNPay' },
  { value: 'zalopay', label: 'ZaloPay' },
] as const

const money = (value: number) => `${value.toLocaleString('vi-VN')}đ`

function toDatetimeLocalValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function idOf(row: Row) {
  return row.product_id || row.customer_id || row.id || ''
}

function fundTypeForMethod(method: PaymentMethod) {
  if (method === 'cash') return 'cash'
  if (method === 'momo' || method === 'vnpay' || method === 'zalopay') return 'wallet'
  return 'bank'
}

function isDefaultFund(row: Row) {
  return row.is_default === true || row.is_default === 'TRUE'
}

export function ManualOrderClient({
  shopId,
  shopName,
  backHref,
}: {
  shopId: string
  shopName: string
  backHref: string
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [customerQuery, setCustomerQuery] = useState('')
  const [customers, setCustomers] = useState<Row[]>([])
  const [customer, setCustomer] = useState<Row | null>(null)
  const [productQuery, setProductQuery] = useState('')
  const [products, setProducts] = useState<Row[]>([])
  const [funds, setFunds] = useState<Row[]>([])
  const [lines, setLines] = useState<CartLine[]>([])
  const [discount, setDiscount] = useState('0')
  const [note, setNote] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [fundId, setFundId] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [occurredAt, setOccurredAt] = useState(() => toDatetimeLocalValue(new Date()))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`/api/shops/${shopId}/payment-funds?active=TRUE`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Không thể tải sổ quỹ.'))))
      .then((body) => setFunds(body.data || []))
      .catch((error) => {
        if ((error as Error).name !== 'AbortError') toast.error((error as Error).message)
      })

    return () => controller.abort()
  }, [shopId])

  useEffect(() => {
    const query = productQuery.trim()
    if (!query) {
      setProducts([])
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/shops/${shopId}/products?search=${encodeURIComponent(query)}&limit=10`, {
          signal: controller.signal,
        })
        if (res.ok) setProducts((await res.json()).data || [])
      } catch (error) {
        if ((error as Error).name !== 'AbortError') console.error(error)
      }
    }, 180)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [shopId, productQuery])

  useEffect(() => {
    const query = customerQuery.trim()
    if (!query) {
      setCustomers([])
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/shops/${shopId}/customers?search=${encodeURIComponent(query)}&limit=8`, {
          signal: controller.signal,
        })
        if (res.ok) setCustomers((await res.json()).data || [])
      } catch (error) {
        if ((error as Error).name !== 'AbortError') console.error(error)
      }
    }, 180)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [shopId, customerQuery])

  const matchingFunds = useMemo(
    () => funds.filter((fund) => fund.type === fundTypeForMethod(paymentMethod)),
    [funds, paymentMethod]
  )

  useEffect(() => {
    const active = matchingFunds.find((fund) => fund.id === fundId)
    if (!active) setFundId((matchingFunds.find(isDefaultFund) || matchingFunds[0])?.id || '')
  }, [fundId, matchingFunds])

  const subtotal = useMemo(
    () => lines.reduce((total, line) => total + Number(line.product.sell_price || line.product.price || 0) * line.qty, 0),
    [lines]
  )
  const discountAmount = Math.max(0, Number(discount) || 0)
  const tax = useMemo(
    () =>
      lines.reduce((total, line) => {
        const gross = Number(line.product.sell_price || line.product.price || 0) * line.qty
        const allocatedDiscount = subtotal ? (discountAmount * gross) / subtotal : 0
        return total + ((gross - allocatedDiscount) * Number(line.product.tax_rate || 0)) / 100
      }, 0),
    [lines, subtotal, discountAmount]
  )
  const total = Math.max(0, subtotal - discountAmount + tax)

  const addProduct = (product: Row) => {
    const productId = idOf(product)
    setLines((current) => {
      const existing = current.find((line) => idOf(line.product) === productId)
      if (existing) {
        return current.map((line) => (line === existing ? { ...line, qty: line.qty + 1 } : line))
      }
      return [...current, { product, qty: 1 }]
    })
    setProductQuery('')
    setProducts([])
  }

  const setQty = (productId: string, qty: number) => {
    setLines((current) =>
      qty <= 0
        ? current.filter((line) => idOf(line.product) !== productId)
        : current.map((line) => (idOf(line.product) === productId ? { ...line, qty } : line))
    )
  }

  const submit = async () => {
    if (!lines.length) return toast.error('Hãy thêm ít nhất một mặt hàng.')
    if (discountAmount > subtotal) return toast.error('Giảm giá không được lớn hơn tiền hàng.')
    if (matchingFunds.length > 0 && !fundId) return toast.error('Hãy chọn sổ quỹ nhận tiền.')

    const invoiceDate = new Date(occurredAt)
    if (Number.isNaN(invoiceDate.getTime())) return toast.error('Ngày giờ hóa đơn không hợp lệ.')
    if (invoiceDate.getTime() > Date.now() + 5 * 60 * 1000) return toast.error('Không thể ghi hóa đơn ở thời điểm tương lai.')

    const paymentLabel = PAYMENT_METHODS.find((method) => method.value === paymentMethod)?.label || paymentMethod
    const selectedFund = matchingFunds.find((fund) => fund.id === fundId)
    const totalQuantity = lines.reduce((sum, line) => sum + line.qty, 0)
    const accepted = await confirm({
      title: 'Xác nhận ghi đơn thủ công',
      description: 'Vui lòng kiểm tra kỹ trước khi tạo. Thao tác này sẽ ghi nhận doanh thu, thu tiền và xuất kho theo ngày giờ hóa đơn đã chọn.',
      confirmLabel: 'Tạo đơn',
      cancelLabel: 'Kiểm tra lại',
      children: (
        <dl className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Khách hàng</dt><dd className="text-right font-medium text-slate-900">{customer?.name || 'Khách lẻ'}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Mặt hàng</dt><dd className="text-right font-medium text-slate-900">{lines.length} loại / {totalQuantity} sản phẩm</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Ngày hóa đơn</dt><dd className="text-right font-medium text-slate-900">{invoiceDate.toLocaleString('vi-VN')}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Thanh toán</dt><dd className="text-right font-medium text-slate-900">{paymentLabel}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Sổ quỹ</dt><dd className="text-right font-medium text-slate-900">{selectedFund?.name || 'Sổ quỹ mặc định'}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Giảm giá</dt><dd className="text-right font-medium text-slate-900">-{money(discountAmount)}</dd></div>
          <div className="flex justify-between gap-4 border-t border-slate-200 pt-2"><dt className="font-semibold text-slate-700">Thành tiền</dt><dd className="text-right font-bold text-primary">{money(total)}</dd></div>
        </dl>
      ),
    })
    if (!accepted) return

    setSaving(true)
    try {
      const res = await fetch(`/api/shops/${shopId}/manual-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customer?.customer_id || customer?.id,
          customer_name: customer?.name,
          occurred_at: new Date(occurredAt).toISOString(),
          note,
          discount_amount: discountAmount,
          payment_method: paymentMethod,
          fund_id: fundId || undefined,
          payment_reference_no: paymentReference,
          items: lines.map((line) => ({ product_id: idOf(line.product), qty: line.qty })),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.message || 'Không thể lưu đơn thủ công.')
      toast.success(`Đã ghi nhận đơn ${body.order_no}.`)
      router.push(`${backHref}?search=${encodeURIComponent(body.order_no)}`)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể lưu đơn thủ công.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Ghi đơn thủ công</h1>
          <p className="mt-1 text-sm text-slate-500">Nhập bù đơn bán lẻ và được đánh dấu riêng. Các phiếu thu trong sổ quỹ, phiếu kho sẽ được tạo với thời gian tương ứng.</p>
        </div>
        <Link href={backHref} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <div className="flex items-center">
            <ArrowLeftIcon className="w-4 h-4 mr-1" /> Quay lại
          </div>
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Khách hàng</h2>
              {!customer && <span className="text-sm font-medium text-slate-600">Khách lẻ</span>}
            </div>

            {customer ? (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-primary/10 bg-primary/5 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  <b>{customer.name}</b>
                  {customer.phone ? <span className="ml-2 text-slate-500">{customer.phone}</span> : null}
                </span>
                <button type="button" onClick={() => setCustomer(null)} className="ml-3 text-rose-500 hover:text-rose-600">
                  Remove
                </button>
              </div>
            ) : (
              <>
                <div className="mt-3 flex items-center rounded-lg border border-slate-200 bg-white px-3 focus-within:border-primary">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    value={customerQuery}
                    onChange={(event) => setCustomerQuery(event.target.value)}
                    placeholder="Tìm khách hàng theo tên hoặc SĐT"
                    className="h-10 flex-1 px-2 text-sm outline-none"
                  />
                  {customerQuery ? (
                    <button type="button" onClick={() => setCustomerQuery('')} className="text-slate-400 hover:text-slate-600">
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                {customers.length > 0 && (
                  <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-100">
                    {customers.map((row) => (
                      <button
                        key={idOf(row)}
                        type="button"
                        onClick={() => {
                          setCustomer(row)
                          setCustomerQuery('')
                          setCustomers([])
                        }}
                        className="block w-full border-b border-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-50 last:border-0"
                      >
                        <b>{row.name}</b>
                        {row.phone ? <span className="ml-2 text-slate-400">{row.phone}</span> : null}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-900">Mặt hàng</h2>
            <div className="mt-3 flex items-center rounded-lg border border-slate-200 bg-white px-3 focus-within:border-primary">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder="Tìm và thêm mặt hàng"
                className="h-10 flex-1 px-2 text-sm outline-none"
              />
              {productQuery ? (
                <button type="button" onClick={() => setProductQuery('')} className="text-slate-400 hover:text-slate-600">
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            {productQuery.trim() && products.length > 0 ? (
              <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-100">
                {products.map((row) => (
                  <button
                    key={idOf(row)}
                    type="button"
                    onClick={() => addProduct(row)}
                    className="flex w-full items-center justify-between border-b border-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-50 last:border-0"
                  >
                    <span className="min-w-0 truncate">
                      <b>{row.name}</b>
                      {row.sku ? <span className="ml-2 text-xs text-slate-400">{row.sku}</span> : null}
                    </span>
                    <span className="shrink-0 font-medium">{money(Number(row.sell_price || row.price || 0))}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-4 divide-y divide-slate-100">
              {lines.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">Chưa có mặt hàng.</p>
              ) : (
                lines.map((line) => {
                  const id = idOf(line.product)
                  const price = Number(line.product.sell_price || line.product.price || 0)
                  return (
                    <div key={id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{line.product.name}</p>
                        <p className="text-xs text-slate-500">{money(price)} / đơn vị</p>
                      </div>
                      <div className="flex items-center rounded-lg border border-slate-200">
                        <button type="button" onClick={() => setQty(id, line.qty - 1)} className="px-2 py-1.5">-</button>
                        <span className="min-w-8 text-center text-sm">{line.qty}</span>
                        <button type="button" onClick={() => setQty(id, line.qty + 1)} className="px-2 py-1.5">+</button>
                      </div>
                      <b className="w-24 text-right text-sm">{money(price * line.qty)}</b>
                    </div>
                  )
                })
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-5 lg:h-fit">
          <h2 className="font-semibold text-slate-900">Thanh toán & hóa đơn</h2>

          <label className="block text-sm font-medium text-slate-700">
            Ngày giờ hóa đơn
            <div className="mt-1 flex items-center rounded-lg border border-slate-200 px-3 focus-within:border-primary">
              <CalendarClock className="h-4 w-4 text-slate-400" />
              <input
                type="datetime-local"
                value={occurredAt}
                max={toDatetimeLocalValue(new Date())}
                onChange={(event) => setOccurredAt(event.target.value)}
                className="h-10 flex-1 px-2 text-sm outline-none"
              />
            </div>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Phương thức
            <select
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>{method.label}</option>
              ))}
            </select>
          </label>

          {matchingFunds.length > 0 ? (
            <label className="block text-sm font-medium text-slate-700">
              Sổ quỹ nhận tiền
              {matchingFunds.length === 1 ? (
                <div className="mt-1 rounded-lg border border-orange-100 bg-orange-50/60 px-3 py-2 text-xs font-semibold text-orange-950">
                  {matchingFunds[0].name}{matchingFunds[0].account_number ? ` (STK: ${matchingFunds[0].account_number})` : ''}
                </div>
              ) : (
                <select
                  value={fundId}
                  onChange={(event) => setFundId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-orange-100 bg-orange-50/60 px-3 py-2 text-xs font-semibold text-orange-950"
                >
                  {matchingFunds.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.name}{fund.account_number ? ` (STK: ${fund.account_number})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </label>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              Chưa có sổ quỹ phù hợp cho phương thức này.
            </p>
          )}

          <label className="block text-sm font-medium text-slate-700">
            Mã tham chiếu
            <input
              value={paymentReference}
              onChange={(event) => setPaymentReference(event.target.value)}
              placeholder="Tùy chọn"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Giảm giá toàn đơn
            <input
              type="number"
              min="0"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Ghi chú
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <div className="space-y-2 border-t border-slate-100 pt-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Tạm tính</span><span>{money(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Giảm giá</span><span>-{money(discountAmount)}</span></div>
            {tax > 0 && <div className="flex justify-between"><span className="text-slate-500">Thuế</span><span>{money(tax)}</span></div>}
            <div className="flex justify-between text-base font-bold"><span>Thành tiền</span><span>{money(total)}</span></div>
          </div>

          <button
            type="button"
            disabled={saving || !lines.length}
            onClick={submit}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : 'Lưu đơn thủ công'}
          </button>
        </aside>
      </div>
    </div>
  )
}
