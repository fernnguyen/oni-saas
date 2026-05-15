'use server'

import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { getSuperAdminUser } from '@/lib/server/auth'
import { revalidatePath, revalidateTag } from 'next/cache'

export async function updateSystemSettings(config: Record<string, any>) {
  const user = await getSuperAdminUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = getSupabaseAdminClient()
  const { error } = await supabase
    .from('system_settings')
    .upsert({ id: 'global', config })

  if (error) throw error
  // @ts-ignore - Next.js 16 signature mismatch
  revalidateTag('system_settings')
  revalidatePath('/super/settings')
}
