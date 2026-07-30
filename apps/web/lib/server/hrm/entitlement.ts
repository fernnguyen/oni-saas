import type { PlanMetadata } from '@oni/core/types';

import { getTenantPlanMeta } from '../subscriptions';
import { getSupabaseAdminClient } from '../supabaseAdmin';

export type HrmEntitlementSource = 'feature_flag' | 'plan';

export type HrmEntitlementReason =
  | 'FEATURE_FLAG_ENABLED'
  | 'FEATURE_FLAG_DISABLED'
  | 'PLAN_INCLUDED'
  | 'PLAN_NOT_INCLUDED';

export interface HrmEntitlement {
  enabled: boolean;
  source: HrmEntitlementSource;
  reason: HrmEntitlementReason;
}

export interface HrmEntitlementDependencies {
  getFeatureFlagOverride: (tenantId: string) => Promise<boolean | null>;
  getPlanMetadata: (tenantId: string) => Promise<PlanMetadata>;
}

export class HrmEntitlementLookupError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HrmEntitlementLookupError';
  }
}

export function resolveHrmEntitlement(
  featureFlagOverride: boolean | null,
  planMetadata: PlanMetadata,
): HrmEntitlement {
  if (featureFlagOverride !== null) {
    return {
      enabled: featureFlagOverride,
      source: 'feature_flag',
      reason: featureFlagOverride ? 'FEATURE_FLAG_ENABLED' : 'FEATURE_FLAG_DISABLED',
    };
  }

  const enabledByPlan = planMetadata.hrm === true;
  return {
    enabled: enabledByPlan,
    source: 'plan',
    reason: enabledByPlan ? 'PLAN_INCLUDED' : 'PLAN_NOT_INCLUDED',
  };
}

const defaultDependencies: HrmEntitlementDependencies = {
  async getFeatureFlagOverride(tenantId) {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('feature_flags')
      .select('enabled')
      .eq('tenant_id', tenantId)
      .eq('key', 'hrm')
      .maybeSingle();

    if (error) {
      throw new HrmEntitlementLookupError('Không thể kiểm tra quyền truy cập HRM.', {
        cause: error,
      });
    }

    return data ? data.enabled === true : null;
  },

  getPlanMetadata: getTenantPlanMeta,
};

export async function getHrmEntitlement(
  tenantId: string,
  dependencies: HrmEntitlementDependencies = defaultDependencies,
): Promise<HrmEntitlement> {
  const normalizedTenantId = tenantId.trim();
  if (!normalizedTenantId) {
    throw new TypeError('tenantId is required');
  }

  const featureFlagOverride = await dependencies.getFeatureFlagOverride(normalizedTenantId);
  if (featureFlagOverride !== null) {
    return resolveHrmEntitlement(featureFlagOverride, {});
  }

  const planMetadata = await dependencies.getPlanMetadata(normalizedTenantId);
  return resolveHrmEntitlement(null, planMetadata);
}
