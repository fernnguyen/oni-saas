import { getSupabaseServerClient } from './supabaseServer';
import type { PlanMetadata } from '@oni/core/types';

/** Returns the active plan's metadata for a tenant. Empty object if no active subscription. */
export async function getTenantPlanMeta(tenantId: string): Promise<PlanMetadata> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from('subscriptions')
    .select('plans(metadata)')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle();

  return ((data?.plans as any)?.metadata ?? {}) as PlanMetadata;
}
