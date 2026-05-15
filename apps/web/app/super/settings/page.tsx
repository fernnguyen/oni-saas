import React from 'react'
import { createServerClient } from '@oni/core'
import { SettingsClient } from './SettingsClient'
import { unstable_cache } from 'next/cache'

// We cache the system settings so that when handleApiError runs, it's fast
export const getSystemSettings = unstable_cache(
  async () => {
    const supabase = await createServerClient()
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
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Cài đặt hệ thống</h1>
        <p className="text-gray-500 mt-1">Quản lý cấu hình chung cho toàn bộ dự án.</p>
      </div>

      <SettingsClient initialConfig={config} />
    </div>
  )
}
