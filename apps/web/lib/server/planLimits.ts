/**
 * Dynamic plan limit enforcement.
 *
 * How to add a new limit:
 *   1. Register the action in ACTION_REGISTRY below (key + how to count usage).
 *   2. Add the key to plans.metadata in a DB migration (value = max count).
 *   3. Call enforceLimit(actionKey, context, tenantId) in the API route.
 *
 * Limit is only applied when the key exists in the tenant's plan metadata.
 * If the key is absent, no limit is enforced for that action.
 *
 * NOTE: For binary feature gates (unlocked vs locked features like 'qr_table_ordering'),
 * use checkFeatureAccess() from ./features.ts instead.
 */

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from './supabaseAdmin';
import { getTenantPlanMeta } from './subscriptions';

// ─── Action registry ──────────────────────────────────────────────────────────

export interface LimitContext {
  tenantId?: string;
  shopId?: string;
}

interface ActionDef {
  /** Human-readable label used in error messages and UI. */
  label: string;
  /** Key in the JSONB metadata field in the plans table */
  metaKey: string;
  /** How to count current usage given the context. */
  count: (ctx: LimitContext) => Promise<number>;
}

const admin = () => getSupabaseAdminClient();

async function countRows(table: string, column: string, value: string): Promise<number> {
  const { count } = await admin()
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, value);
  return count ?? 0;
}

export const ACTION_REGISTRY: Record<string, ActionDef> = {
  create_shop: {
    label: 'chi nhánh',
    metaKey: 'max_shops',
    count: ({ tenantId }) => countRows('shops', 'tenant_id', tenantId!),
  },
  create_shop_user: {
    label: 'người dùng',
    metaKey: 'max_users',
    count: ({ tenantId }) => countRows('user_tenants', 'tenant_id', tenantId!),
  },
  create_connector: {
    label: 'kết nối dữ liệu',
    metaKey: 'max_connectors_per_shop',
    count: ({ shopId }) => countRows('connectors', 'shop_id', shopId!),
  },
  create_domain: {
    label: 'domain tùy chỉnh',
    metaKey: 'max_custom_domains',
    count: ({ shopId }) => countRows('domains', 'shop_id', shopId!),
  },
};

// ─── Error type ───────────────────────────────────────────────────────────────

export class PlanLimitError extends Error {
  readonly name = 'PlanLimitError';
  constructor(
    public readonly action: string,
    public readonly current: number,
    public readonly limit: number,
  ) {
    const label = ACTION_REGISTRY[action]?.label ?? action;
    super(
      `Đã đạt giới hạn ${label} của gói hiện tại (${current}/${limit}). Vui lòng nâng cấp gói để tiếp tục.`,
    );
  }
}

export function isPlanLimitError(err: unknown): err is PlanLimitError {
  return err instanceof PlanLimitError;
}

/** Standard 402 response returned to the client when a plan limit is hit. */
export function planLimitResponse(err: PlanLimitError): NextResponse {
  return NextResponse.json(
    {
      error: 'plan_limit_exceeded',
      action: err.action,
      current: err.current,
      limit: err.limit,
      message: err.message,
    },
    { status: 402 },
  );
}

// ─── Core enforcement ─────────────────────────────────────────────────────────

/**
 * Throws PlanLimitError if the tenant's plan has a limit for this action
 * and that limit is already reached.
 *
 * No-op when:
 *   - action key is not in the plan metadata (no limit declared)
 *   - action key is not in ACTION_REGISTRY (not yet wired up)
 *   - limit value is -1 (unlimited)
 */
export async function enforceLimit(
  action: string,
  context: LimitContext,
  tenantId: string,
): Promise<void> {
  const meta = await getTenantPlanMeta(tenantId);
  const def = ACTION_REGISTRY[action];
  if (!def) return;

  const limit = meta[def.metaKey];
  if (limit === undefined || typeof limit !== 'number' || limit === -1) return;

  const current = await def.count(context);
  if (current >= limit) throw new PlanLimitError(action, current, limit);
}

// ─── Status query — for UI display ───────────────────────────────────────────

export interface LimitStatus {
  current: number;
  limit: number;   // -1 = unlimited
  atLimit: boolean;
}

/**
 * Returns current usage and limit for a given action.
 * Returns null if the action has no limit declared in the plan metadata.
 */
export async function getLimitStatus(
  action: string,
  context: LimitContext,
  tenantId: string,
): Promise<LimitStatus | null> {
  const meta = await getTenantPlanMeta(tenantId);
  const def = ACTION_REGISTRY[action];
  if (!def) return null;

  const limit = meta[def.metaKey];
  if (limit === undefined || typeof limit !== 'number') return null;

  const current = await def.count(context);
  return { current, limit, atLimit: limit !== -1 && current >= limit };
}
