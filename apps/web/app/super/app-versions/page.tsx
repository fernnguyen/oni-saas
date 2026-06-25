import React from 'react'
import { getSystemSettings } from '@/lib/server/settings'
import { AppVersionsClient } from './AppVersionsClient'

export default async function SuperAppVersionsPage() {
  const config = await getSystemSettings()
  const mobileVersion = config.mobile_version || {
    ios: { min_version: '1.0.0', latest_version: '1.0.0', store_url: '' },
    android: { min_version: '1.0.0', latest_version: '1.0.0', store_url: '' },
    ota_enabled: true
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Superadmin</div>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Quản lý phiên bản App</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Cấu hình phiên bản cập nhật cho ứng dụng di động, bao gồm OTA và App Store / Google Play.
        </p>
      </div>

      <AppVersionsClient initialData={mobileVersion} />
    </div>
  )
}
