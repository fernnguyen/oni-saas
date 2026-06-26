'use server'

import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'

export async function updateMobileVersionSettings(payload: {
  ios: { min_version: string, latest_version: string, store_url: string }
  android: { min_version: string, latest_version: string, store_url: string }
  ota_enabled: boolean
}) {
  const supabase = getSupabaseAdminClient()

  // Lấy config hiện tại
  const { data: current } = await supabase
    .from('system_settings')
    .select('config')
    .eq('id', 'global')
    .single()

  const currentConfig = current?.config || {}
  const newConfig = {
    ...currentConfig,
    mobile_version: payload
  }

  const { error } = await supabase
    .from('system_settings')
    .upsert({
      id: 'global',
      config: newConfig
    })

  if (error) throw new Error(error.message)

  return true
}
