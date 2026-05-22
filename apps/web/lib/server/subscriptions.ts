import { getSupabaseAdminClient } from './supabaseAdmin';
import type { PlanMetadata } from '@oni/core/types';

/** Returns the active plan's metadata for a tenant. Empty object if no active subscription. */
export async function getTenantPlanMeta(tenantId: string): Promise<PlanMetadata> {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from('subscriptions')
    .select('plans(metadata)')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle();

  return ((data?.plans as any)?.metadata ?? {}) as PlanMetadata;
}

/** Returns the active plan's display details for a tenant. Used by PlanBadge. */
export async function getTenantActivePlanDetails(tenantId: string) {
  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('subscriptions')
    .select('current_period_start, current_period_end, plans(code, name)')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle();

  if (!data || !data.plans) return null;
  const p = Array.isArray(data.plans) ? data.plans[0] : data.plans;
  return {
    planCode: p.code as string,
    planName: p.name as string,
    periodStart: data.current_period_start as string | undefined,
    periodEnd: data.current_period_end as string | undefined,
  };
}
