export type TenantRole = 'owner' | 'admin' | 'staff' | 'viewer';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
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

export interface PlanMetadata {
  max_shops: number;                 // -1 = unlimited
  max_users: number;
  max_connectors_per_shop: number;
  max_custom_domains: number;
}

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
