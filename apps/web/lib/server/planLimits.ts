import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from './supabaseAdmin';
import { getTenantPlanMeta } from './subscriptions';
import type { PlanMetadata } from '@oni/core/types';

// ─── Error type ───────────────────────────────────────────────────────────────

const DIMENSION_LABELS: Record<keyof PlanMetadata, string> = {
  max_shops:               'chi nhánh',
  max_users:               'người dùng',
  max_connectors_per_shop: 'kết nối dữ liệu',
  max_custom_domains:      'domain tùy chỉnh',
};

export class PlanLimitError extends Error {
  readonly name = 'PlanLimitError';
  constructor(
    public readonly dimension: keyof PlanMetadata,
    public readonly current: number,
    public readonly limit: number,
  ) {
    super(
      `Đã đạt giới hạn ${DIMENSION_LABELS[dimension]} của gói hiện tại (${current}/${limit}). Vui lòng nâng cấp gói để tiếp tục.`,
    );
  }
}

export function isPlanLimitError(err: unknown): err is PlanLimitError {
  return err instanceof PlanLimitError;
}

/** Standard 402 response for plan limit exceeded */
export function planLimitResponse(err: PlanLimitError): NextResponse {
  return NextResponse.json(
    {
      error: 'plan_limit_exceeded',
      dimension: err.dimension,
      current: err.current,
      limit: err.limit,
      message: err.message,
    },
    { status: 402 },
  );
}

// ─── Enforce helpers — throw PlanLimitError if at limit ───────────────────────

export async function enforceShopLimit(tenantId: string): Promise<void> {
  const meta = await getTenantPlanMeta(tenantId);
  if (meta.max_shops === -1) return;

  const admin = getSupabaseAdminClient();
  const { count } = await admin
    .from('shops')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  const current = count ?? 0;
  if (current >= meta.max_shops) throw new PlanLimitError('max_shops', current, meta.max_shops);
}

export async function enforceUserLimit(tenantId: string): Promise<void> {
  const meta = await getTenantPlanMeta(tenantId);
  if (meta.max_users === -1) return;

  const admin = getSupabaseAdminClient();
  // tenant_user_profiles tracks all users (workspace + personal) for a tenant
  const { count } = await admin
    .from('tenant_user_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  const current = count ?? 0;
  if (current >= meta.max_users) throw new PlanLimitError('max_users', current, meta.max_users);
}

export async function enforceConnectorLimit(shopId: string): Promise<void> {
  const admin = getSupabaseAdminClient();

  // Resolve tenant from shop
  const { data: shop } = await admin
    .from('shops')
    .select('tenant_id')
    .eq('id', shopId)
    .maybeSingle();
  if (!shop) return;

  const meta = await getTenantPlanMeta(shop.tenant_id);
  if (meta.max_connectors_per_shop === -1) return;

  const { count } = await admin
    .from('connectors')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', shopId);

  const current = count ?? 0;
  if (current >= meta.max_connectors_per_shop) {
    throw new PlanLimitError('max_connectors_per_shop', current, meta.max_connectors_per_shop);
  }
}

// ─── Status queries — for UI display ─────────────────────────────────────────

export interface LimitStatus {
  current: number;
  limit: number;       // -1 = unlimited
  atLimit: boolean;
}

export async function getShopLimitStatus(tenantId: string): Promise<LimitStatus> {
  const admin = getSupabaseAdminClient();
  const meta = await getTenantPlanMeta(tenantId);

  const { count } = await admin
    .from('shops')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  const current = count ?? 0;
  return {
    current,
    limit: meta.max_shops,
    atLimit: meta.max_shops !== -1 && current >= meta.max_shops,
  };
}

export async function getUserLimitStatus(tenantId: string): Promise<LimitStatus> {
  const admin = getSupabaseAdminClient();
  const meta = await getTenantPlanMeta(tenantId);

  const { count } = await admin
    .from('tenant_user_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  const current = count ?? 0;
  return {
    current,
    limit: meta.max_users,
    atLimit: meta.max_users !== -1 && current >= meta.max_users,
  };
}
