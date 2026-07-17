import React from 'react'
import { SettingsClient } from './SettingsClient'
import { getSystemSettings } from '@/lib/server/settings'
import { getTaxGroupsAction } from './actions'
import { getZaloOAStatus } from '@/lib/server/zaloOA'
import { ZaloOASettingsCard } from './ZaloOASettingsCard'
import { buildZaloPhoneSyncReport } from '@/lib/server/zaloUserPhoneSync'
import { ZaloUserPhoneSyncCard } from './ZaloUserPhoneSyncCard'

export default async function SuperSettingsPage() {
  const config = await getSystemSettings()
  const taxGroups = await getTaxGroupsAction().catch(() => [])
  const zaloPhoneSyncReport = await buildZaloPhoneSyncReport().catch(() => ({
    summary: {
      scannedAuthUsers: 0,
      zaloUsers: 0,
      alreadySynced: 0,
      safeToSync: 0,
      manualReview: 0,
      noPhoneSource: 0,
    },
    candidates: [],
  }))
  const zaloOAStatus = await getZaloOAStatus().catch(() => ({
    configured: false,
    hasAccessToken: false,
    hasRefreshToken: false,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    accessTokenSecondsLeft: null,
    refreshTokenSecondsLeft: null,
    isAccessTokenExpiringSoon: false,
    lastSyncedAt: null,
    lastError: null,
    lastErrorAt: null,
    tokenSource: null,
    oaId: null,
  }))

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Superadmin</div>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Cài đặt hệ thống</h1>
        <p className="text-sm text-slate-500 mt-0.5">Quản lý cấu hình chung cho toàn bộ dự án.</p>
      </div>

      <ZaloOASettingsCard initialStatus={zaloOAStatus} />
      <ZaloUserPhoneSyncCard initialReport={zaloPhoneSyncReport} />
      <SettingsClient initialConfig={config} initialTaxGroups={taxGroups} />
    </div>
  )
}
