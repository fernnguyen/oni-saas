import type { LocalOrder, LocalOrderItem, LocalPayment } from '@/lib/localDb/schema'
import { BANKS } from '@/lib/constants/banks'

function getMethodLabel(method: string, isBilingual: boolean) {
  const labels: Record<string, { vi: string, en: string }> = {
    cash: { vi: 'Tiền mặt', en: 'Cash' },
    card: { vi: 'Thẻ', en: 'Card' },
    bank_transfer: { vi: 'Chuyển khoản', en: 'Bank Transfer' },
    momo: { vi: 'MoMo', en: 'MoMo' },
    vnpay: { vi: 'VNPay', en: 'VNPay' },
    zalopay: { vi: 'ZaloPay', en: 'ZaloPay' },
    debt: { vi: 'Ghi nợ', en: 'Debt' },
  }
  const entry = labels[method]
  if (!entry) return method
  return isBilingual ? `${entry.vi} / ${entry.en}` : entry.vi
}

function translateProductName(name: string, isBilingual: boolean) {
  if (!isBilingual) return name
  if (name.includes('Tiền phòng (Qua đêm)')) return 'Tiền phòng (Qua đêm) / Room Charge (Overnight)'
  if (name.includes('Tiền giờ sử dụng')) {
    const match = name.match(/\(([^)]+)\)/)
    const duration = match ? match[1] : ''
    const enDuration = duration
      .replace(/phút/g, 'm')
      .replace(/p/g, 'm')
      .replace(/giờ/g, 'h')
      .replace(/g/g, 'h')
      .replace(/ngày/g, 'd')
    return duration 
      ? `Tiền giờ sử dụng (${duration}) / Hourly Charge (${enDuration})`
      : 'Tiền giờ sử dụng / Hourly Charge'
  }
  if (name.includes('Tiền phòng')) return name + ' / Room Charge'
  if (name.includes('Tiền bàn')) return name + ' / Table Charge'
  return name
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

function fmtTimeSpan(checkInIso: string, checkOutIso?: string) {
  const inDate = new Date(checkInIso)
  const inTimeStr = inDate.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  const day = String(inDate.getDate()).padStart(2, '0')
  const month = String(inDate.getMonth() + 1).padStart(2, '0')
  const inDateStr = `${day}/${month}`
  
  if (!checkOutIso) {
    return { in: inTimeStr, out: '' }
  }
  
  const outDate = new Date(checkOutIso)
  const outTimeStr = outDate.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  const outDay = String(outDate.getDate()).padStart(2, '0')
  const outMonth = String(outDate.getMonth() + 1).padStart(2, '0')
  const outDateStr = `${outDay}/${outMonth}`
  
  if (inDateStr === outDateStr && inDate.getFullYear() === outDate.getFullYear()) {
    return { in: inTimeStr, out: outTimeStr }
  } else {
    return { in: `${inTimeStr} ${inDateStr}`, out: `${outTimeStr} ${outDateStr}` }
  }
}

export async function printBill({
  order,
  items,
  payments,
  shopName,
  settings,
  printCount = 1,
  shopId,
}: {
  order: LocalOrder | Record<string, any>
  items: LocalOrderItem[] | Record<string, any>[]
  payments: LocalPayment[] | Record<string, any>[]
  shopName: string
  settings?: any
  printCount?: number
  shopId?: string
}) {
  let currentSettings = settings
  if (!currentSettings && shopId) {
    try {
      const res = await fetch(`/api/shops/${shopId}/settings`)
      if (res.ok) currentSettings = await res.json()
    } catch (e) {
      console.error('Failed to fetch settings for printBill', e)
    }
  }

  // Support both LocalOrder and Server Order structures
  const orderNo = (order as any).order_no || (order as any).server_id || (order as any).order_id
  const baseId = (order as any).local_id || ''
  const shortId = baseId.slice(-8).toUpperCase()
  const displayOrderCode = orderNo ? orderNo : `LORD-${shortId}`
  
  const createdDate = order.created_at || new Date().toISOString()
  const subtotal = Number(order.subtotal || 0)
  const discount = Number(order.discount_amount || 0)
  const total = Number(order.total_amount || 0)
  const customerName = order.customer_name
  
  let orderMeta: any = {}
  try {
    orderMeta = typeof (order as any).metadata === 'string' ? JSON.parse((order as any).metadata) : ((order as any).metadata || {})
  } catch {}

  const isBilingual = !!currentSettings?.print_bilingual
  const billTitle = isBilingual ? 'HOÁ ĐƠN BÁN HÀNG<br/><span style="font-size:10px;font-weight:normal;text-transform:uppercase;color:#444">SALES RECEIPT</span>' : 'HOÁ ĐƠN BÁN HÀNG'
  const reprintHtml = printCount > 1 
    ? (isBilingual 
        ? `<p class="sub" style="font-style: italic; margin-top: 2px;">(In lại lần ${printCount - 1} / Duplicate #${printCount - 1})</p>`
        : `<p class="sub" style="font-style: italic; margin-top: 2px;">(In lại lần ${printCount - 1})</p>`)
    : ''
  
  const taxIdHtml = currentSettings?.tax_id ? `<p class="sub">${isBilingual ? 'MST / Tax ID' : 'MST'}: ${currentSettings.tax_id}</p>` : ''
  const addressHtml = currentSettings?.address ? `<p class="sub">${currentSettings.address}</p>` : ''
  const phoneHtml = currentSettings?.phone ? `<p class="sub">Hotline: ${currentSettings.phone}</p>` : ''
  
  let qrHtml = ''
  
  // Find bank transfer payment
  const bankTransferPayment = (payments || []).find((p) => p.method === 'bank_transfer')
  
  let activeBankCode = ''
  let activeBankAccountNumber = ''
  let activeBankAccountName = ''
  let activeQrTemplate = 'compact2'
  let qrAmount = total

  if (bankTransferPayment) {
    qrAmount = Number(bankTransferPayment.amount || 0)
    if (qrAmount <= 0) qrAmount = total

    let fundInfo: any = null
    if (bankTransferPayment.fund_id && shopId) {
      try {
        const res = await fetch(`/api/shops/${shopId}/payment-funds?active=TRUE`)
        if (res.ok) {
          const json = await res.json()
          const funds = json.data || []
          fundInfo = funds.find((f: any) => f.id === bankTransferPayment.fund_id)
        }
      } catch (e) {
        console.error('Failed to fetch payment funds for printBill', e)
      }
    }

    if (fundInfo?.account_number && fundInfo?.bank_name) {
      activeBankCode = fundInfo.bank_name
      activeBankAccountNumber = fundInfo.account_number
      activeBankAccountName = fundInfo.account_name || ''
      activeQrTemplate = fundInfo.qr_template || 'compact2'
    } else {
      activeBankCode = currentSettings?.bank_code || ''
      activeBankAccountNumber = currentSettings?.bank_account_number || ''
      activeBankAccountName = currentSettings?.bank_account_name || ''
      activeQrTemplate = currentSettings?.qr_template || 'compact2'
    }
  } else {
    activeBankCode = currentSettings?.bank_code || ''
    activeBankAccountNumber = currentSettings?.bank_account_number || ''
    activeBankAccountName = currentSettings?.bank_account_name || ''
    activeQrTemplate = currentSettings?.qr_template || 'compact2'
  }

  if (activeBankCode && activeBankAccountNumber && activeQrTemplate) {
    const qrUrl = `https://img.vietqr.io/image/${activeBankCode}-${activeBankAccountNumber}-${activeQrTemplate}.png?amount=${qrAmount}&addInfo=${orderNo || shortId}&accountName=${encodeURIComponent(activeBankAccountName)}`
    
    if (activeQrTemplate === 'qr_only') {
      qrHtml = `<div class="sep"></div>
      <div style="text-align:center; margin-top: 10px;">
        <p style="font-weight:bold; margin-bottom: 4px;">${isBilingual ? 'Quét QR để thanh toán / Scan to pay' : 'Quét QR để thanh toán'}</p>
        <img src="${qrUrl}" style="width: 100%; max-width: 70px; margin: 0 auto;" />
      </div>`
    } else {
      qrHtml = `<div class="sep"></div>
      <div style="text-align:center; margin-top: 10px;">
        <p style="font-weight:bold; margin-bottom: 4px;">${isBilingual ? 'Quét QR để thanh toán / Scan to pay' : 'Quét QR để thanh toán'}</p>
        <img src="${qrUrl}" style="width: 100%; max-width: 95px; margin: 0 auto;" />
      </div>`
    }
  }
  
  const wifiHtml = currentSettings?.wifi_info ? `<p style="text-align:center;">Wi-Fi: ${currentSettings.wifi_info}</p>` : ''
  const showBrandAttribution = currentSettings?.show_brand_attribution !== false
  const customFooter = currentSettings?.receipt_footer 
    ? `<p class="footer">${currentSettings.receipt_footer}</p>` 
    : `<p class="footer">${isBilingual ? 'Cảm ơn quý khách! / Thank you!' : 'Cảm ơn quý khách!'}</p>`
  const attributionHtml = showBrandAttribution
    ? `<br/><br/><div class="sep"></div><p class="sub" style="font-size: 11px; margin-top: 6px;">Hệ thống quản lý bán hàng <b>ONI.vn</b></p>`
    : ''
  const footerHtml = `${customFooter}${attributionHtml}`

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Hoá đơn #${shortId}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; padding: 8px; color: #000; }
h1 { font-size: 15px; text-align: center; font-weight: bold; }
h2 { font-size: 18px; text-align: center; font-weight: bold; margin-top: 8px; margin-bottom: 6px; }
.sub { font-size: 11px; text-align: center; color: #444; margin-bottom: 2px; }
.sep { border-top: 1px dashed #000; margin: 6px 0; }
table { width: 100%; border-collapse: collapse; }
td { padding: 2px 0; vertical-align: top; }
.r { text-align: right; }
.c { text-align: center; }
.pl { padding-left: 4px; }
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
${addressHtml}
${phoneHtml}
${taxIdHtml}
<h2>${billTitle}</h2>
${reprintHtml}
<p class="sub">${isBilingual ? 'Ngày / Date: ' + fmtDate(createdDate) : fmtDate(createdDate)}</p>
<p class="sub">${isBilingual ? 'Mã đơn / Order No: ' + displayOrderCode : 'Mã đơn: ' + displayOrderCode}</p>
<div class="sep"></div>
${(() => {
  const timeSpan = orderMeta?.check_in ? fmtTimeSpan(orderMeta.check_in, orderMeta.check_out) : null;
  const walkInText = isBilingual ? 'Khách lẻ / Walk-in' : 'Khách lẻ'
  const customerLabel = isBilingual ? 'Khách / Cust' : 'Khách'
  const checkInLabel = isBilingual ? 'Vào / In' : 'Vào'
  const checkOutLabel = isBilingual ? 'Ra / Out' : 'Ra'

  return `<table style="margin-bottom: 4px; width: 100%;">
  <tr>
    <td style="width: 100%; padding-bottom: 2px;">${customerLabel}: ${customerName ? customerName : walkInText}</td>
  </tr>
  ${orderMeta?.resource_name ? `<tr>
    <td style="width: 100%; padding-bottom: 2px;">${isBilingual ? 'Vị trí / Area' : 'Vị trí'}: ${orderMeta.resource_name}</td>
  </tr>` : ''}
  ${timeSpan ? `<tr>
    <td style="width: 100%; padding-top: 2px;">
      <table style="width: 100%;">
        <tr>
          <td style="width: 50%; padding-right: 4px;">${checkInLabel}: ${timeSpan.in}</td>
          <td style="width: 50%; padding-left: 4px;">${timeSpan.out ? `${checkOutLabel}: ${timeSpan.out}` : ''}</td>
        </tr>
      </table>
    </td>
  </tr>` : ''}
</table>`
})()}
<div class="sep"></div>
<table>
<tr>
  <td class="bold" style="width: 6%">${isBilingual ? 'TT<br/>No' : 'TT'}</td>
  <td class="bold pl">${isBilingual ? 'Sản phẩm<br/>Product' : 'Sản phẩm'}</td>
  <td class="c bold pl" style="width: 10%">${isBilingual ? 'SL<br/>Qty' : 'SL'}</td>
  <td class="r bold pl" style="width: 23%">${isBilingual ? 'Đ.giá<br/>Price' : 'Đ.giá'}</td>
  <td class="r bold pl" style="width: 25%">${isBilingual ? 'T.tiền<br/>Amt' : 'T.tiền'}</td>
</tr>
${items
  .map((it, idx) => {
    // Build sub-line for variant/modifier info
    let subLine = ''
    let parsedModifiers = (it as any).modifiers
    if (typeof parsedModifiers === 'string') {
      try {
        parsedModifiers = JSON.parse(parsedModifiers)
      } catch {
        parsedModifiers = []
      }
    }

    if ((it as any).variant_label && !(parsedModifiers && parsedModifiers.length > 0)) {
      subLine = `<br/><span style="font-size:10px;color:#555;font-style:italic">${(it as any).variant_label}</span>`
    } else if (Array.isArray(parsedModifiers) && parsedModifiers.length > 0) {
      const modParts = parsedModifiers.map((m: any) => m.option).join(', ')
      const modAdj = (it as any).modifier_total > 0 ? ` (+${Number((it as any).modifier_total).toLocaleString('vi-VN')}đ)` : ''
      subLine = `<br/><span style="font-size:10px;color:#666">${modParts}${modAdj}</span>`
    }
    const effectivePrice = Number(it.unit_price) + (Number((it as any).modifier_total) || 0)
    return `<tr>
  <td>${idx + 1}</td>
  <td class="pl">${translateProductName(it.product_name, isBilingual)}${subLine}</td>
  <td class="c pl">${it.qty}</td>
  <td class="r pl">${fmtVND(effectivePrice)}</td>
  <td class="r pl">${fmtVND(Number(it.line_total))}</td>
</tr>`
  })
  .join('')}
</table>
<div class="sep"></div>
<table>
<tr><td>${isBilingual ? 'Tạm tính / Subtotal:' : 'Tạm tính:'}</td><td class="r">${fmtVND(subtotal)}</td></tr>
${discount > 0 ? `<tr><td>${isBilingual ? 'Giảm giá / Discount:' : 'Giảm giá:'}</td><td class="r">-${fmtVND(discount)}</td></tr>` : ''}
<tr class="total-row"><td>${isBilingual ? 'TỔNG CỘNG / TOTAL:' : 'TỔNG CỘNG:'}</td><td class="r">${fmtVND(total)}</td></tr>
</table>
<div class="sep"></div>
<table>
${payments.map((p) => {
  const amt = Number(p.amount)
  if (amt < 0) {
    return `<tr><td>${isBilingual ? 'Trả lại khách / Change:' : 'Trả lại khách:'}</td><td class="r">${fmtVND(Math.abs(amt))}</td></tr>`
  }
  return `<tr><td>${getMethodLabel(p.method, isBilingual)}:</td><td class="r">${fmtVND(amt)}</td></tr>`
}).join('')}
</table>
${order.note ? `<div class="sep"></div><p>${isBilingual ? 'Ghi chú / Note' : 'Ghi chú'}: ${order.note}</p>` : ''}
${qrHtml}
${wifiHtml}
${footerHtml}
</body>
</html>`

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  
  const iframeDoc = iframe.contentWindow?.document
  if (!iframeDoc) return
  
  iframeDoc.open()
  iframeDoc.write(html)
  iframeDoc.close()

  iframe.onload = () => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe)
      }
    }, 1000)
  }
}

