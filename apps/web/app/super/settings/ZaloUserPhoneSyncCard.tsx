'use client'

import React, { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, PhoneForwarded, RefreshCw, ShieldAlert, UserCog } from 'lucide-react'

type ZaloPhoneSyncStatus = 'already_synced' | 'safe_to_sync' | 'manual_review' | 'no_phone_source'

type ZaloPhoneSyncCandidate = {
  userId: string
  email: string | null
  displayName: string | null
  zaloId: string | null
  authPhone: string | null
  metadataPhone: string | null
  legacyEmailPhone: string | null
  recommendedPhone: string | null
  status: ZaloPhoneSyncStatus
  statusLabel: string
  note: string
}

type ZaloPhoneSyncReport = {
  summary: {
    scannedAuthUsers: number
    zaloUsers: number
    alreadySynced: number
    safeToSync: number
    manualReview: number
    noPhoneSource: number
  }
  candidates: ZaloPhoneSyncCandidate[]
}

type SyncResponse = {
  syncedCount: number
  skippedCount: number
  report: ZaloPhoneSyncReport
}

async function loadReport() {
  const res = await fetch('/api/super/settings/zalo-user-phone-sync', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error || 'Không thể tải báo cáo đồng bộ Zalo')
  }
  return data as ZaloPhoneSyncReport
}

export function ZaloUserPhoneSyncCard({ initialReport }: { initialReport: ZaloPhoneSyncReport }) {
  const [report, setReport] = useState(initialReport)
  const [isPending, startTransition] = useTransition()

  const safeCandidates = report.candidates.filter((item) => item.status === 'safe_to_sync')
  const manualReviewCandidates = report.candidates.filter((item) => item.status === 'manual_review')

  const syncReport = () => {
    startTransition(async () => {
      try {
        setReport(await loadReport())
      } catch (error: any) {
        toast.error(error?.message || 'Không thể quét lại danh sách')
      }
    })
  }

  const runAction = (body: Record<string, unknown>, successMessage: string) => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/super/settings/zalo-user-phone-sync', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Không thể đồng bộ số điện thoại Zalo')

        const payload = data as SyncResponse
        setReport(payload.report)
        toast.success(
          payload.skippedCount > 0
            ? `${successMessage} (${payload.syncedCount} thành công, ${payload.skippedCount} bỏ qua)`
            : successMessage
        )
      } catch (error: any) {
        toast.error(error?.message || 'Không thể đồng bộ số điện thoại Zalo')
      }
    })
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Đồng bộ SĐT Zalo vào Auth</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Tool dành cho superadmin để backfill `auth.users.phone` cho user Zalo cũ mà không mở lại lỗ hổng trust
              `user_metadata.phone` ở luồng đăng nhập.
            </p>
          </div>

          <button
            type="button"
            onClick={syncReport}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
            Quét lại
          </button>
        </div>
      </div>

      <div className="space-y-5 px-6 py-5">
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-relaxed text-amber-900">
          Luồng login web hiện chỉ dùng `auth.users.phone` hoặc email chuẩn phía server. `metadata.phone` không còn
          được trust để xác thực. Vì vậy card này chỉ có nhiệm vụ đưa dữ liệu đã review vào `auth.users.phone`.
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Auth users đã quét</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{report.summary.scannedAuthUsers}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">User Zalo</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{report.summary.zaloUsers}</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Sync an toàn</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-900">{report.summary.safeToSync}</div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Cần review</div>
            <div className="mt-2 text-2xl font-semibold text-amber-900">{report.summary.manualReview}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-emerald-900">
                  <CheckCircle2 className="h-4 w-4" />
                  <h3 className="text-sm font-semibold">Danh sách sync an toàn</h3>
                </div>
                <p className="mt-1 text-xs text-emerald-900/80">
                  Nhóm này có thể đồng bộ hàng loạt vì số điện thoại lấy từ email Zalo legacy dạng `zalo_84...@oni.vn`
                  hoặc `zalo_09...@oni.vn`.
                </p>
              </div>

              <button
                type="button"
                onClick={() => runAction({ action: 'sync_safe' }, 'Đã đồng bộ nhóm an toàn')}
                disabled={isPending || safeCandidates.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <PhoneForwarded className="h-4 w-4" />
                Sync an toàn
              </button>
            </div>

            {safeCandidates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-emerald-200 bg-white/80 px-4 py-4 text-sm text-slate-500">
                Không còn user nào chờ sync an toàn.
              </div>
            ) : (
              <div className="space-y-3">
                {safeCandidates.map((candidate) => (
                  <div key={candidate.userId} className="rounded-xl border border-emerald-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {candidate.displayName || candidate.email || candidate.userId}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{candidate.email || candidate.userId}</div>
                      </div>
                      <div className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                        {candidate.statusLabel}
                      </div>
                    </div>

                    <dl className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600 xl:grid-cols-3">
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <dt className="text-slate-400">Zalo ID</dt>
                        <dd className="mt-1 font-medium text-slate-800">{candidate.zaloId || 'Chưa có'}</dd>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <dt className="text-slate-400">Nguồn legacy email</dt>
                        <dd className="mt-1 font-medium text-slate-800">{candidate.legacyEmailPhone || 'Chưa có'}</dd>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <dt className="text-slate-400">Sẽ sync vào auth</dt>
                        <dd className="mt-1 font-medium text-slate-800">{candidate.recommendedPhone || 'Chưa có'}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
            <div className="flex items-center gap-2 text-amber-900">
              <ShieldAlert className="h-4 w-4" />
              <h3 className="text-sm font-semibold">Review thủ công từ metadata</h3>
            </div>
            <p className="text-xs text-amber-900/80">
              Nhóm này chỉ còn `metadata.phone`. Do dữ liệu lịch sử này có thể đã bị user sửa, hệ thống không tự sync
              hàng loạt. Superadmin cần xem lại rồi bấm từng user nếu xác nhận đúng.
            </p>

            {manualReviewCandidates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-amber-200 bg-white/80 px-4 py-4 text-sm text-slate-500">
                Không có user nào đang chờ review thủ công.
              </div>
            ) : (
              <div className="space-y-3">
                {manualReviewCandidates.map((candidate) => (
                  <div key={candidate.userId} className="rounded-xl border border-amber-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {candidate.displayName || candidate.email || candidate.userId}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{candidate.email || candidate.userId}</div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          runAction(
                            { action: 'sync_manual_review', userIds: [candidate.userId] },
                            'Đã sync user đã review'
                          )
                        }
                        disabled={isPending || !candidate.recommendedPhone}
                        className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-200 disabled:opacity-60"
                      >
                        <UserCog className="h-4 w-4" />
                        Sync user này
                      </button>
                    </div>

                    <dl className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600">
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <dt className="text-slate-400">metadata.phone</dt>
                        <dd className="mt-1 font-medium text-slate-800">{candidate.metadataPhone || 'Chưa có'}</dd>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <dt className="text-slate-400">Ghi chú</dt>
                        <dd className="mt-1 font-medium text-slate-800">{candidate.note}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-xs text-slate-600">
          Đã sync: {report.summary.alreadySynced}. Thiếu nguồn dữ liệu: {report.summary.noPhoneSource}. Những trường
          hợp thiếu dữ liệu nên yêu cầu user login lại bằng Zalo mini app để backend tự backfill chuẩn hơn.
        </div>
      </div>
    </div>
  )
}
