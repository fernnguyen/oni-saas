'use client'
import { useMemo, useState } from 'react'
import type { InboxItem } from '@oni/core'
import type { TableSyncV2Api } from '@/hooks/useTableSyncV2'

// Table sync v2 conflict inbox (plan Phase 4, first cut): lists what the server refused from
// this device so nothing disappears silently. Resolution is manual for now: the cashier reads the
// item, re-enters it on the right table if needed, then marks it handled.

const REASON_LABELS: Record<string, string> = {
  session_not_open: 'Bàn đã được thanh toán/đóng trên thiết bị khác',
  resource_occupied: 'Bàn đã được mở trên thiết bị khác',
  session_not_found: 'Phiên bàn không tồn tại trên máy chủ',
  line_not_found: 'Món đã bị xoá trên thiết bị khác',
  session_id_conflict: 'Mã phiên trùng với bàn khác',
}

function describeEntry(item: InboxItem): string {
  const entry = item.entry
  if (entry.kind === 'open') return `Mở bàn (giờ vào ${new Date(entry.payload.check_in).toLocaleString('vi-VN')})`
  const op = entry.op as any
  switch (op.type) {
    case 'add_item': return `Thêm ${op.qty} × ${op.product_name}`
    case 'change_qty': return `${op.delta > 0 ? 'Tăng' : 'Giảm'} ${Math.abs(op.delta)} số lượng món`
    case 'remove_item': return 'Xoá món'
    case 'set_time_charge': return `Tiền giờ ${Number(op.amount || 0).toLocaleString('vi-VN')}đ`
    default: return op.type
  }
}

export function TableSyncInboxPanel({
  open,
  onClose,
  tableSync,
  resourceNameById,
}: {
  open: boolean
  onClose: () => void
  tableSync: TableSyncV2Api
  resourceNameById: Record<string, string>
}) {
  const [busy, setBusy] = useState(false)
  const grouped = useMemo(() => {
    const map = new Map<string, InboxItem[]>()
    for (const item of tableSync.inbox) {
      const list = map.get(item.session_id) || []
      list.push(item)
      map.set(item.session_id, list)
    }
    return Array.from(map.entries())
  }, [tableSync.inbox])

  if (!open) return null

  const tableLabel = (items: InboxItem[]) => {
    const openEntry = items.find((i) => i.entry.kind === 'open')?.entry
    const resourceId = openEntry && openEntry.kind === 'open' ? openEntry.payload.resource_id : ''
    return resourceId ? (resourceNameById[resourceId] || resourceId) : 'Phiên bàn'
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Hộp xung đột đồng bộ</h3>
            <p className="text-xs text-slate-500">
              {tableSync.outbox.length > 0
                ? `${tableSync.outbox.length} thao tác đang chờ gửi lên máy chủ`
                : 'Không có thao tác nào đang chờ gửi'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Đóng">✕</button>
        </div>

        {tableSync.outbox.length > 0 && (
          <button
            disabled={busy}
            onClick={async () => { setBusy(true); try { await tableSync.flush() } finally { setBusy(false) } }}
            className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? 'Đang gửi…' : 'Gửi lại ngay'}
          </button>
        )}

        {grouped.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Không có xung đột nào.</p>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {grouped.map(([sessionId, items]) => (
              <div key={sessionId} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-800">{tableLabel(items)}</div>
                  <button
                    onClick={() => tableSync.resolveInbox(items.map((i) => i.id))}
                    className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    Đã xử lý
                  </button>
                </div>
                <p className="mb-2 text-xs text-amber-800">{REASON_LABELS[items[0].reason] || items[0].reason}</p>
                <ul className="space-y-1">
                  {items.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 text-xs text-slate-700">
                      <span>{describeEntry(i)}</span>
                      <span className="shrink-0 text-slate-400">{new Date(i.detected_at).toLocaleTimeString('vi-VN')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-400">
          Các món bị từ chối không được tính vào hoá đơn nào. Nếu khách vẫn dùng món, hãy nhập lại vào đúng bàn rồi bấm “Đã xử lý”.
        </p>
      </div>
    </div>
  )
}
