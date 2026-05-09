import type { LocalOrder, LocalOrderItem, LocalPayment } from '@/lib/localDb/schema'

const METHOD_LABEL: Record<string, string> = {
  cash: 'Tiền mặt',
  card: 'Thẻ',
  bank_transfer: 'Chuyển khoản',
  momo: 'MoMo',
  vnpay: 'VNPay',
  zalopay: 'ZaloPay',
  debt: 'Ghi nợ',
}

function fmtVND(amount: number) {
  return amount.toLocaleString('vi-VN') + 'đ'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function printBill({
  order,
  items,
  payments,
  shopName,
}: {
  order: LocalOrder
  items: LocalOrderItem[]
  payments: LocalPayment[]
  shopName: string
}) {
  const shortId = order.local_id.slice(-8).toUpperCase()

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Hoá đơn #${shortId}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; padding: 8px; color: #000; }
h1 { font-size: 15px; text-align: center; font-weight: bold; }
.sub { font-size: 11px; text-align: center; color: #444; margin-bottom: 2px; }
.sep { border-top: 1px dashed #000; margin: 6px 0; }
table { width: 100%; border-collapse: collapse; }
td { padding: 2px 0; vertical-align: top; }
.r { text-align: right; }
.bold { font-weight: bold; }
.total-row td { font-size: 14px; font-weight: bold; padding-top: 4px; }
.footer { text-align: center; font-size: 11px; margin-top: 6px; }
@media print {
  @page { margin: 0; size: 80mm auto; }
}
</style>
</head>
<body>
<h1>${shopName}</h1>
<p class="sub">HOÁ ĐƠN BÁN HÀNG</p>
<p class="sub">${fmtDate(order.created_at)}</p>
<p class="sub">Mã đơn: #${shortId}</p>
<div class="sep"></div>
<p>${order.customer_name ? 'Khách: ' + order.customer_name : 'Khách lẻ'}</p>
<div class="sep"></div>
<table>
<tr><td class="bold">Sản phẩm</td><td class="r bold">SL</td><td class="r bold">Đ.giá</td><td class="r bold">T.tiền</td></tr>
${items
  .map(
    (it) => `<tr>
  <td>${it.product_name}${it.sku ? '<br/><span style="font-size:10px;color:#666">' + it.sku + '</span>' : ''}</td>
  <td class="r">${it.qty}</td>
  <td class="r">${fmtVND(it.unit_price)}</td>
  <td class="r">${fmtVND(it.line_total)}</td>
</tr>`
  )
  .join('')}
</table>
<div class="sep"></div>
<table>
<tr><td>Tạm tính:</td><td class="r">${fmtVND(order.subtotal)}</td></tr>
${order.discount_amount > 0 ? `<tr><td>Giảm giá:</td><td class="r">-${fmtVND(order.discount_amount)}</td></tr>` : ''}
<tr class="total-row"><td>TỔNG CỘNG:</td><td class="r">${fmtVND(order.total_amount)}</td></tr>
</table>
<div class="sep"></div>
<table>
${payments.map((p) => `<tr><td>${METHOD_LABEL[p.method] ?? p.method}:</td><td class="r">${fmtVND(p.amount)}</td></tr>`).join('')}
</table>
${order.note ? `<div class="sep"></div><p>Ghi chú: ${order.note}</p>` : ''}
<div class="sep"></div>
<p class="footer">Cảm ơn quý khách!</p>
</body>
</html>`

  const win = window.open('', '_blank', 'width=400,height=600,scrollbars=yes')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.onload = () => {
    win.focus()
    win.print()
  }
}
