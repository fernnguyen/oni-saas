'use client'

import React, { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  ChevronDown,
  KeyRound,
  MessageSquareText,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
} from 'lucide-react'

type ZaloOAStatus = {
  configured: boolean
  hasAccessToken: boolean
  hasRefreshToken: boolean
  accessTokenExpiresAt: string | null
  refreshTokenExpiresAt: string | null
  accessTokenSecondsLeft: number | null
  refreshTokenSecondsLeft: number | null
  isAccessTokenExpiringSoon: boolean
  lastSyncedAt: string | null
  lastError: string | null
  lastErrorAt: string | null
  tokenSource: string | null
  oaId: string | null
}

const DEFAULT_OA_ID = '2780444502954767948'

function formatDateTime(value: string | null) {
  if (!value) return 'Chưa có'
  return new Date(value).toLocaleString('vi-VN')
}

function formatTimeLeft(seconds: number | null) {
  if (seconds == null) return 'Chưa có'
  if (seconds <= 0) return 'Đã hết hạn'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 24) {
    const days = Math.floor(hours / 24)
    return `${days} ngày ${hours % 24} giờ`
  }
  return `${hours} giờ ${minutes} phút`
}

async function requestStatus() {
  const res = await fetch('/api/super/settings/zalo-oa-token', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error || 'Không thể tải trạng thái Zalo OA')
  }
  return data as ZaloOAStatus
}

export function ZaloOASettingsCard({ initialStatus }: { initialStatus: ZaloOAStatus }) {
  const [status, setStatus] = useState<ZaloOAStatus>(initialStatus)
  const [oaId] = useState(initialStatus.oaId || DEFAULT_OA_ID)
  const [manualAccessToken, setManualAccessToken] = useState('')
  const [manualRefreshToken, setManualRefreshToken] = useState('')
  const [testZaloIdByOA, setTestZaloIdByOA] = useState('')
  const [testMessage, setTestMessage] = useState(
    'Tin nhắn kiểm tra từ ONI. Nếu bạn nhận được tin này thì luồng Zalo OA backend đang hoạt động bình thường.'
  )
  const [isSettingsOpen, setIsSettingsOpen] = useState(!initialStatus.configured)
  const [isPending, startTransition] = useTransition()

  const shouldShowBootstrap = isSettingsOpen
  const shouldShowDiagnostics = isSettingsOpen

  const syncStatus = () => {
    startTransition(async () => {
      try {
        const latest = await requestStatus()
        setStatus(latest)
      } catch (error: any) {
        toast.error(error?.message || 'Không thể tải trạng thái Zalo OA')
      }
    })
  }

  const handleBootstrap = () => {
    if (!manualAccessToken.trim() || !manualRefreshToken.trim()) {
      toast.error('Vui lòng nhập access token và refresh token')
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/super/settings/zalo-oa-token', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            oaId,
            accessToken: manualAccessToken.trim() || undefined,
            refreshToken: manualRefreshToken.trim() || undefined,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Không thể khởi tạo OA token')

        setStatus(data)
        setManualAccessToken('')
        setManualRefreshToken('')
        setIsSettingsOpen(false)
        toast.success('Đã lưu và kích hoạt Zalo OA token')
      } catch (error: any) {
        toast.error(error?.message || 'Lỗi khi khởi tạo Zalo OA token')
      }
    })
  }

  const handleForceRefresh = () => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/super/settings/zalo-oa-token', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ forceRefresh: true }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Không thể refresh OA token')

        setStatus(data)
        toast.success('Đã refresh OA token')
      } catch (error: any) {
        toast.error(error?.message || 'Lỗi khi refresh OA token')
      }
    })
  }

  const handleTestSend = () => {
    if (!testZaloIdByOA.trim()) {
      toast.error('Vui lòng nhập idByOA để test')
      return
    }
    if (!testMessage.trim()) {
      toast.error('Vui lòng nhập nội dung tin nhắn test')
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/super/settings/zalo-oa-test-send', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            zaloIdByOA: testZaloIdByOA.trim(),
            message: testMessage.trim(),
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || data?.reason || 'Không thể gửi test OA')

        toast.success('Đã gửi test OA thành công')
      } catch (error: any) {
        toast.error(error?.message || 'Lỗi khi gửi test OA')
      }
    })
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Zalo OA Token</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Quản lý OA access token dùng ở backend cho welcome message, cron và các luồng OA về sau.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsSettingsOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Settings2 className="h-4 w-4" />
            Cấu hình
            <ChevronDown className={`h-4 w-4 transition-transform ${isSettingsOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      <div className="space-y-5 px-6 py-5">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center gap-2 text-slate-600">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">Trạng thái</span>
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900">
              {status.configured ? 'Đã cấu hình' : 'Chưa bootstrap'}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {status.isAccessTokenExpiringSoon ? 'Access token sắp hết hạn' : 'Token manager sẵn sàng'}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center gap-2 text-slate-600">
              <KeyRound className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">Access token</span>
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900">
              {status.hasAccessToken ? formatTimeLeft(status.accessTokenSecondsLeft) : 'Chưa có'}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Hết hạn: {formatDateTime(status.accessTokenExpiresAt)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center gap-2 text-slate-600">
              <RefreshCw className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">Refresh token</span>
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900">
              {status.hasRefreshToken ? formatTimeLeft(status.refreshTokenSecondsLeft) : 'Chưa có'}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Hết hạn: {formatDateTime(status.refreshTokenExpiresAt)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center gap-2 text-slate-600">
              <MessageSquareText className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">Lần đồng bộ gần nhất</span>
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900">
              {formatDateTime(status.lastSyncedAt)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Nguồn: {status.tokenSource || 'Chưa có'}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900">
          Token chỉ được dùng ở backend. UI này không đọc hoặc hiển thị access token/refresh token thô, chỉ thao tác
          bootstrap, refresh và xem metadata hạn dùng.
        </div>

        {shouldShowBootstrap || shouldShowDiagnostics ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            {shouldShowBootstrap ? (
              <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Manual bootstrap từ Zalo Developer</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Dùng access token và refresh token lấy thủ công từ Zalo Developer, sau đó backend sẽ tự refresh khi cần.
                  </p>
                </div>

                <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <div className="flex items-center gap-2 text-emerald-900">
                    <KeyRound className="h-4 w-4" />
                    <h4 className="text-sm font-semibold">Cách lấy token</h4>
                  </div>
                  <p className="text-xs leading-relaxed text-emerald-900/80">
                    Mở Zalo API Explorer, cấp quyền bằng UI của Zalo, rồi copy `access_token` và `refresh_token` để dán vào
                    form bên dưới. Với cách manual này thì không cần PKCE và cũng không cần `authorization_code`.
                  </p>
                  <a
                    href="https://developers.zalo.me/tools/explorer/600170175253575588"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                  >
                    Mở Zalo API Explorer
                  </a>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Lưu token vào backend</h4>
                    <p className="mt-1 text-xs text-slate-500">
                      OA ID đang được cố định theo cấu hình hiện tại để tránh nhập sai khi vận hành.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-700">OA ID</label>
                    <input
                      value={oaId}
                      disabled
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-600"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-700">OA Access Token</label>
                    <textarea
                      value={manualAccessToken}
                      onChange={(e) => setManualAccessToken(e.target.value)}
                      rows={2}
                      disabled={isPending}
                      placeholder="Dán access_token từ API Explorer"
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-mono focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-700">OA Refresh Token</label>
                    <textarea
                      value={manualRefreshToken}
                      onChange={(e) => setManualRefreshToken(e.target.value)}
                      rows={2}
                      disabled={isPending}
                      placeholder="Dán refresh_token từ API Explorer"
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-mono focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleBootstrap}
                    disabled={isPending}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/95 disabled:opacity-60"
                  >
                    <KeyRound className="h-4 w-4" />
                    Lưu token
                  </button>

                  <button
                    type="button"
                    onClick={handleForceRefresh}
                    disabled={isPending || !status.hasRefreshToken}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
                    Refresh token ngay
                  </button>

                  <button
                    type="button"
                    onClick={syncStatus}
                    disabled={isPending}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Đồng bộ trạng thái
                  </button>
                </div>
              </div>
            ) : null}

            {shouldShowDiagnostics ? (
              <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Chẩn đoán nhanh</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Dùng để xác định backend có thể gửi OA message hay đang kẹt ở bước nào.
                  </p>
                </div>

                <dl className="space-y-2 text-xs">
                  <div className="flex justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-slate-500">OA ID</dt>
                    <dd className="font-medium text-slate-800">{status.oaId || 'Chưa lưu'}</dd>
                  </div>
                  <div className="flex justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-slate-500">Có access token</dt>
                    <dd className="font-medium text-slate-800">{status.hasAccessToken ? 'Có' : 'Không'}</dd>
                  </div>
                  <div className="flex justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-slate-500">Có refresh token</dt>
                    <dd className="font-medium text-slate-800">{status.hasRefreshToken ? 'Có' : 'Không'}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-slate-500">Lỗi gần nhất</dt>
                    <dd className="mt-1 break-words font-medium text-slate-800">
                      {status.lastError || 'Không có'}
                    </dd>
                    {status.lastErrorAt ? (
                      <div className="mt-1 text-[11px] text-slate-400">{formatDateTime(status.lastErrorAt)}</div>
                    ) : null}
                  </div>
                </dl>
              </div>
            ) : null}
          </div>
        ) : null}

        {isSettingsOpen ? (
          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Test gửi OA theo idByOA</h3>
              <p className="mt-1 text-xs text-slate-500">
                Dùng để kiểm tra end-to-end: token manager, refresh logic và gửi `v3.0/oa/message/cs`.
              </p>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-xs leading-relaxed text-blue-900">
              `idByOA` không lấy từ Zalo Developer UI. Giá trị này được Mini App nhận sau khi user hoàn tất luồng
              onboarding OA và app gọi `getUserInfo()`. Ở code hiện tại, backend sẽ lưu nó vào
              `user_metadata.zalo_id_by_oa`, nên để test bạn có thể lấy từ metadata user sau một lần onboarding thành công.
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[0.8fr_1.2fr]">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">idByOA</label>
                <input
                  value={testZaloIdByOA}
                  onChange={(e) => setTestZaloIdByOA(e.target.value)}
                  disabled={isPending}
                  placeholder="Ví dụ: user id OA scope"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Nội dung tin nhắn</label>
                <textarea
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  rows={3}
                  disabled={isPending}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestSend}
                disabled={isPending || !status.hasAccessToken}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/95 disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                Gửi test OA
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
