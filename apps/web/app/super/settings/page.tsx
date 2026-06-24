import React from 'react'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { SettingsClient } from './SettingsClient'
import { getSystemSettings } from '@/lib/server/settings'

import { getTaxGroupsAction } from './actions'

export default async function SuperSettingsPage() {
  const config = await getSystemSettings()
  const taxGroups = await getTaxGroupsAction().catch(() => [])

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Superadmin</div>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Cài đặt hệ thống</h1>
        <p className="text-sm text-slate-500 mt-0.5">Quản lý cấu hình chung cho toàn bộ dự án.</p>
      </div>

      <SettingsClient initialConfig={config} initialTaxGroups={taxGroups} />
    </div>
  )
}
