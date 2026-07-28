'use server'

import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { getSuperAdminUser } from '@/lib/server/auth'
import { revalidatePath, revalidateTag } from 'next/cache'
import { normalizeMaxTenantsPerAccount } from '@/lib/server/tenantCreationPolicy'

export async function updateSystemSettings(config: Record<string, any>) {
  const user = await getSuperAdminUser()
  if (!user) throw new Error('Unauthorized')

  const normalizedConfig = {
    ...config,
    max_tenants_per_account: normalizeMaxTenantsPerAccount(config.max_tenants_per_account),
  }
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase
    .from('system_settings')
    .upsert({ id: 'global', config: normalizedConfig })

  if (error) throw error
  // @ts-ignore - Next.js 16 signature mismatch
  revalidateTag('system_settings')
  revalidatePath('/super/settings')
}

export async function getTaxGroupsAction() {
  const user = await getSuperAdminUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('system_tax_groups')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function upsertTaxGroupAction(group: { id?: string; code: string; name: string; vat_rate: number; pit_rate: number; active?: boolean }) {
  const user = await getSuperAdminUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = getSupabaseAdminClient()
  const payload = {
    code: group.code,
    name: group.name,
    vat_rate: group.vat_rate,
    pit_rate: group.pit_rate,
    active: group.active ?? true,
    updated_at: new Date().toISOString()
  }

  let error;
  if (group.id) {
    const { error: err } = await supabase
      .from('system_tax_groups')
      .update(payload)
      .eq('id', group.id)
    error = err
  } else {
    const { error: err } = await supabase
      .from('system_tax_groups')
      .insert(payload)
    error = err
  }

  if (error) throw error
  // @ts-ignore - Next.js 16 signature mismatch
  revalidateTag('system_tax_groups')
  revalidatePath('/super/settings')
}

export async function deleteTaxGroupAction(id: string) {
  const user = await getSuperAdminUser()
  if (!user) throw new Error('Unauthorized')

  const supabase = getSupabaseAdminClient()
  const { error } = await supabase
    .from('system_tax_groups')
    .delete()
    .eq('id', id)

  if (error) throw error
  // @ts-ignore - Next.js 16 signature mismatch
  revalidateTag('system_tax_groups')
  revalidatePath('/super/settings')
}
