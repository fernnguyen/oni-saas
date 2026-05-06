import { getSupabaseServerClient } from './supabaseServer';
import type { PlanMetadata } from '@oni/core/types';

export async function getTenantPlanMeta(tenantId: string): Promise<PlanMetadata> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from('subscriptions')
    .select('plans(metadata)')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle();

  const meta = (data?.plans as any)?.metadata;
  // Fallback to plan_mini limits
  return {
    max_shops: meta?.max_shops ?? 1,
    max_users: meta?.max_users ?? 3,
    max_connectors_per_shop: meta?.max_connectors_per_shop ?? 1,
    max_custom_domains: meta?.max_custom_domains ?? 0,
  };
}

export async function checkTenantLimit(
  tenantId: string,
  dimension: keyof PlanMetadata,
  currentCount: number,
): Promise<{ allowed: boolean; limit: number }> {
  const meta = await getTenantPlanMeta(tenantId);
  const limit = meta[dimension];
  return { allowed: limit === -1 || currentCount < limit, limit };
}
