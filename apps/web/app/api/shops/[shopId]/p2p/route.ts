import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { assertUserShopAccess } from '../../../../../lib/server/shops';
import { getUserPermissions } from '../../../../../lib/server/permissions';
import { getTenantForUser } from '../../../../../lib/server/tenants';
import { getConnectorForShop } from '../../../../../lib/server/connectorFactory';
import { checkFeatureAccess } from '../../../../../lib/server/features';
import { P2PEngine, type PRAction } from '@oni/core';

export const dynamic = 'force-dynamic';

/**
 * Custom request authenticator and permission resolver.
 */
async function resolveAuth(req: NextRequest, shopId: string) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const hasAccess = await assertUserShopAccess(auth.user.id, shopId);
  if (!hasAccess) return null;

  const tenant = await getTenantForUser(auth.user.id);
  let tenantId = (tenant as any)?.id as string | undefined;
  if (!tenantId) {
    const admin = getSupabaseAdminClient();
    const { data: shop } = await admin
      .from('shops')
      .select('tenant_id')
      .eq('id', shopId)
      .maybeSingle();
    tenantId = shop?.tenant_id;
  }
  if (!tenantId) return null;

  const permissions = await getUserPermissions(auth.user.id, tenantId, shopId);
  return { user: auth.user, permissions, tenantId };
}

/**
 * GET Handler: Query PR, PO, GRN or Price Histories.
 * Query Params:
 *  - entity: 'purchase-requisitions' | 'purchase-orders' | 'goods-receipt-notes' | etc.
 *  - search: search text
 *  - filters: JSON string of filter rules
 *  - page, limit, sortDesc
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const ctx = await resolveAuth(req, shopId);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 1. Enforce dedicated warehouse_p2p Add-on gating
    const hasAddon = await checkFeatureAccess(ctx.tenantId, 'warehouse_p2p');
    if (!hasAddon) {
      return NextResponse.json(
        { error: 'feature_locked', message: 'Phân hệ mua hàng doanh nghiệp nâng cao (P2P) chưa được kích hoạt cho Tenant này.' },
        { status: 403 }
      );
    }

    const sp = req.nextUrl.searchParams;
    const entity = sp.get('entity');
    if (!entity) return NextResponse.json({ error: 'Missing entity type' }, { status: 400 });

    const search = sp.get('search') || undefined;
    const limit = parseInt(sp.get('limit') || '50', 10);
    const page = parseInt(sp.get('page') || '1', 10);
    const sortDesc = sp.get('sortDesc') === 'true';

    let filters: Record<string, string> = {};
    const filtersRaw = sp.get('filters');
    if (filtersRaw) {
      try { filters = JSON.parse(filtersRaw); } catch {}
    }

    const connector = await getConnectorForShop(shopId, ctx.tenantId);
    const result = await connector.list(entity, { page, limit, search, filters, sortDesc });

    return NextResponse.json(result);
  } catch (e) {
    console.error('[GET p2p API]', e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST Handler: Handles creation of PR/PO/GRN, or execution of state machine operations.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const ctx = await resolveAuth(req, shopId);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const hasAddon = await checkFeatureAccess(ctx.tenantId, 'warehouse_p2p');
    if (!hasAddon) {
      return NextResponse.json({ error: 'feature_locked' }, { status: 403 });
    }

    const body = await req.json();
    const action = body.action || 'CREATE';
    const entity = body.entity;

    const connector = await getConnectorForShop(shopId, ctx.tenantId);

    switch (action) {
      case 'CREATE': {
        if (!entity) return NextResponse.json({ error: 'Missing entity type' }, { status: 400 });

        // Enforce anti-fraud permissions on supplier creation
        if (entity === 'suppliers') {
          const canCreateSupplier = ctx.permissions.includes('suppliers.create') || ctx.permissions.includes('purchasing.manage');
          if (!canCreateSupplier) {
            return NextResponse.json({ error: 'Không có quyền tạo Nhà cung cấp mới.' }, { status: 403 });
          }
        }

        const data = body.data;
        if (!data) return NextResponse.json({ error: 'Missing row payload' }, { status: 400 });

        const inserted = await connector.create(entity, data);
        return NextResponse.json(inserted);
      }

      case 'UPDATE': {
        if (!entity || !body.id) return NextResponse.json({ error: 'Missing entity or row ID' }, { status: 400 });

        // Anti-fraud lock: Only managers / admins / accountants can edit Supplier information
        if (entity === 'suppliers') {
          const canEditSupplier = ctx.permissions.includes('suppliers.edit') || ctx.permissions.includes('chief_accountant') || ctx.permissions.includes('admin') || ctx.permissions.includes('owner');
          if (!canEditSupplier) {
            return NextResponse.json({ error: '🔒 Quyền chỉnh sửa tài khoản Nhà cung cấp chỉ dành cho Quản lý cấp cao.' }, { status: 403 });
          }
        }

        const updated = await connector.update(entity, body.id, body.data);
        return NextResponse.json(updated);
      }

      case 'DELETE': {
        if (!entity || !body.id) return NextResponse.json({ error: 'Missing entity or row ID' }, { status: 400 });

        // Anti-fraud lock: Only managers / admins / accountants can delete Suppliers
        if (entity === 'suppliers') {
          const canDeleteSupplier = ctx.permissions.includes('suppliers.delete') || ctx.permissions.includes('admin') || ctx.permissions.includes('owner');
          if (!canDeleteSupplier) {
            return NextResponse.json({ error: '🔒 Quyền xóa Nhà cung cấp bị khóa đối với nhân viên mua sắm.' }, { status: 403 });
          }
        }

        await connector.delete(entity, body.id);
        return NextResponse.json({ ok: true });
      }

      case 'TRANSITION_PR': {
        const { prId, prAction, payload } = body;
        if (!prId || !prAction) return NextResponse.json({ error: 'Missing prId or prAction' }, { status: 400 });

        // Enforce granular transition permissions
        if (prAction === 'ASSIGN_PRICE') {
          const allowed = ctx.permissions.includes('purchasing.manage') || ctx.permissions.includes('purchaser') || ctx.permissions.includes('admin');
          if (!allowed) return NextResponse.json({ error: 'Bạn không có vai trò Gán giá mua.' }, { status: 403 });
        } else if (prAction === 'APPROVE_KTT') {
          const allowed = ctx.permissions.includes('chief_accountant') || ctx.permissions.includes('admin') || ctx.permissions.includes('owner');
          if (!allowed) return NextResponse.json({ error: 'Bạn không có vai trò Kế toán trưởng duyệt.' }, { status: 403 });
        } else if (prAction === 'APPROVE_GD') {
          const allowed = ctx.permissions.includes('admin') || ctx.permissions.includes('owner');
          if (!allowed) return NextResponse.json({ error: 'Bạn không có vai trò Giám đốc duyệt.' }, { status: 403 });
        }

        const updatedPr = await P2PEngine.transitionPR(connector, prId, prAction as PRAction, ctx.user.id, payload);
        return NextResponse.json(updatedPr);
      }

      case 'CREATE_PO_FROM_PR': {
        const { prId, supplierId, supplierName } = body;
        if (!prId || !supplierId || !supplierName) {
          return NextResponse.json({ error: 'Missing conversion params (prId, supplierId, supplierName)' }, { status: 400 });
        }

        const po = await P2PEngine.createPOFromPR(connector, prId, ctx.user.id, supplierId, supplierName);
        return NextResponse.json(po);
      }

      case 'APPROVE_GRN': {
        const { grnId } = body;
        if (!grnId) return NextResponse.json({ error: 'Missing grnId' }, { status: 400 });

        // GRN Approval requires warehouse management or accountant roles
        const canApprove = ctx.permissions.includes('warehouse.manage') || ctx.permissions.includes('chief_accountant') || ctx.permissions.includes('admin') || ctx.permissions.includes('owner');
        if (!canApprove) {
          return NextResponse.json({ error: 'Bạn không có quyền Phê duyệt nhập kho đối chiếu.' }, { status: 403 });
        }

        const completedGrn = await P2PEngine.approveGRN(connector, grnId, ctx.user.id);
        return NextResponse.json(completedGrn);
      }

      default:
        return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    console.error('[POST p2p API]', e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
