/** System role codes — seeded by migrations. Custom roles added by tenant are arbitrary strings. */
export type SystemRole = 'owner' | 'admin' | 'staff' | 'viewer';
export type TenantRole = SystemRole | (string & {});

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  industryType: string;
  createdAt: string;
}

export interface Shop {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  address: string | null;
  createdAt: string;
  connectorId: string | null;
  connectorType: string | null;
  connectorStatus: 'pending' | 'active' | 'error' | null;
}

/**
 * Plan metadata: action key → max count (-1 = unlimited, 0 = blocked).
 * Keys are action names registered in planLimits.ts (e.g. "create_shop").
 * Adding a new limit = add a key here + register the counter in planLimits.ts.
 */
export type PlanMetadata = Record<string, number | boolean>;

export interface Plan {
  id: number;
  code: string;
  name: string;
  isDefault: boolean;
  metadata: PlanMetadata;
}

export interface Subscription {
  id: string;
  tenantId: string;
  planId: number;
  status: 'active' | 'past_due' | 'canceled';
  currentPeriodEnd: string | null;
}

export interface ConnectorConfig {
  id: string;
  shopId: string;
  type: 'google_sheets' | 'supabase_db' | string;
  status: 'pending' | 'active' | 'error';
  config: Record<string, any>;
}
