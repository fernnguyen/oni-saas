// Bar/Bếp K2 — kitchen/bar ticket print template (docs/KITCHEN-BAR-PLAN.md).
// Same mechanism as printBill: a hidden iframe + window.print(). With Chrome started in
// --kiosk-printing the ticket goes straight to the default printer without a dialog.

export interface PrintableKitchenItem {
  product_name: string
  variant_label?: string
  modifiers?: string
  note?: string
  qty: number
  /** cancel lines: 'made' = already cooked (printed so nobody serves it), 'stopped' = never made */
  void_outcome?: string
}

export interface PrintableKitchenTicket {
  ticket_no: number
  station_name: string
  resource_name: string
  kind: 'order' | 'void'
  created_at: string // GMT+7 naive "YYYY-MM-DDTHH:mm:ss…"
  print_count: number
  items: PrintableKitchenItem[]
}

export type KitchenPaperWidth = '58' | '80'

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** "Size L · Ít đường, Thêm trân châu" from variant label + modifiers JSON ([{option}]). */
export function kitchenItemDetail(variantLabel?: string, modifiers?: string): string {
  let mods: string[] = []
  if (modifiers) {
    try {
      const parsed = JSON.parse(modifiers)
      if (Array.isArray(parsed)) mods = parsed.map((m) => (typeof m === 'string' ? m : m?.option || m?.name || '')).filter(Boolean)
    } catch {
      /* free text / legacy */
    }
  }
  return [variantLabel || '', mods.join(', ')].filter(Boolean).join(' · ')
}

/** "HH:mm dd/MM" from a GMT+7 naive timestamp (no timezone conversion). */
export function kitchenTime(createdAt: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(createdAt || '')
  return m ? `${m[4]}:${m[5]} ${m[3]}/${m[2]}` : createdAt
}

export function buildKitchenTicketHtml(ticket: PrintableKitchenTicket, opts: { paper?: KitchenPaperWidth; reprint?: boolean } = {}): string {
  const paper = opts.paper ?? '80'
  const isVoid = ticket.kind === 'void'
  const rows = ticket.items
    .map((it) => {
      const detail = kitchenItemDetail(it.variant_label, it.modifiers)
      const qty = Math.abs(Number(it.qty) || 0)
      return `<tr>
  <td class="q">${isVoid ? '−' : 'x'}${qty}</td>
  <td class="n">${esc(it.product_name)}${detail ? `<div class="d">${esc(detail)}</div>` : ''}${it.note ? `<div class="note">» ${esc(it.note)}</div>` : ''}${isVoid && it.void_outcome === 'made' ? '<div class="note">ĐÃ LÀM – KHÔNG RA MÓN</div>' : ''}</td>
</tr>`
    })
    .join('')
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Phiếu ${esc(ticket.station_name)} #${ticket.ticket_no}</title>
<style>
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 0; padding: 4px 6px; width: ${paper === '58' ? '54mm' : '76mm'}; }
.station { font-size: 13px; text-align: center; text-transform: uppercase; letter-spacing: 1px; }
.void { font-size: 22px; font-weight: 800; text-align: center; border: 2px solid #000; padding: 2px; margin: 4px 0; }
.table { font-size: ${paper === '58' ? '24px' : '28px'}; font-weight: 800; text-align: center; margin: 2px 0; }
.meta { display: flex; justify-content: space-between; font-size: 12px; }
.sep { border-top: 1px dashed #000; margin: 6px 0; }
table { width: 100%; border-collapse: collapse; }
td { vertical-align: top; padding: 3px 0; }
td.q { width: 2.6em; font-size: 18px; font-weight: 800; }
td.n { font-size: 16px; font-weight: 700; }
.d { font-size: 13px; font-weight: 400; }
.note { font-size: 14px; font-weight: 700; font-style: italic; }
.reprint { text-align: center; font-size: 11px; margin-top: 4px; }
@media print { @page { margin: 0; size: ${paper}mm auto; } }
</style></head>
<body>
<div class="station">${esc(ticket.station_name)}</div>
${isVoid ? '<div class="void">PHIẾU HUỶ MÓN</div>' : ''}
<div class="table">${esc(ticket.resource_name || 'Mang về')}</div>
<div class="meta"><span>#${ticket.ticket_no}</span><span>${esc(kitchenTime(ticket.created_at))}</span></div>
<div class="sep"></div>
<table>${rows}</table>
<div class="sep"></div>
${opts.reprint ? `<div class="reprint">IN LẠI (lần ${Math.max(ticket.print_count, 2)})</div>` : ''}
</body></html>`
}

/** Print through a hidden iframe. Resolves once the print call has been made. */
export function printKitchenTicket(ticket: PrintableKitchenTicket, opts: { paper?: KitchenPaperWidth; reprint?: boolean } = {}): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve()
    const iframe = document.createElement('iframe')
    Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow?.document
    if (!doc) {
      iframe.remove()
      return resolve()
    }
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } finally {
        setTimeout(() => iframe.remove(), 1000)
        resolve()
      }
    }
    doc.open()
    doc.write(buildKitchenTicketHtml(ticket, opts))
    doc.close()
  })
}
