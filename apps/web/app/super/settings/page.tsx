import React from 'react'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { SettingsClient } from './SettingsClient'
import { unstable_cache } from 'next/cache'

// We cache the system settings so that when handleApiError runs, it's fast
export const getSystemSettings = unstable_cache(
  async () => {
    const supabase = getSupabaseAdminClient()
    const { data } = await supabase
      .from('system_settings')
      .select('config')
      .eq('id', 'global')
      .single()
    return data?.config || { enable_sentry_debug: false }
  },
  ['system_settings_global'],
  { tags: ['system_settings'], revalidate: 3600 }
)

export default async function SuperSettingsPage() {
  const config = await getSystemSettings()

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Superadmin</div>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Cài đặt hệ thống</h1>
        <p className="text-sm text-slate-500 mt-0.5">Quản lý cấu hình chung cho toàn bộ dự án.</p>
      </div>

      <SettingsClient initialConfig={config} />
    </div>
  )
}
