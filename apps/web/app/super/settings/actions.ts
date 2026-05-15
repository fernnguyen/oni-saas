'use server'

import { createServerClient } from '@oni/core'
import { getSuperAdminUser } from '@/lib/server/auth'
import { revalidatePath, revalidateTag } from 'next/cache'

export async function updateSystemSettings(config: Record<string, any>) {
  const user = await getSuperAdminUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = await createServerClient()
  const { error } = await supabase
    .from('system_settings')
    .upsert({ id: 'global', config })

  if (error) throw error
  revalidateTag('system_settings')
  revalidatePath('/super/settings')
}
