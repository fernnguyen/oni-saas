import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { assertUserShopAccess } from '../../../../../lib/server/shops';
import { getUserPermissions } from '../../../../../lib/server/permissions';
import { getTenantForUser } from '../../../../../lib/server/tenants';
import { getConnectorForShop } from '../../../../../lib/server/connectorFactory';
import { checkFeatureAccess } from '../../../../../lib/server/features';
import { invalidate } from '../../../../../lib/server/cache';
import { P2PEngine, type PRAction } from '@oni/core';
import { NotificationDispatcher } from '../../../../../lib/server/notificationDispatcher';

export const dynamic = 'force-dynamic';

/**
 * Custom request authenticator and permission resolver.
 */
async function resolveAuth(req: NextRequest, shopId: string) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  // Parallelize shop access check and tenant lookup to reduce sequential cloud overhead
  const [hasAccess, tenant] = await Promise.all([
    assertUserShopAccess(auth.user.id, shopId),
    getTenantForUser(auth.user.id),
  ]);

  if (!hasAccess) return null;

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

    const sp = req.nextUrl.searchParams;
    const entity = sp.get('entity');
    if (!entity) return NextResponse.json({ error: 'Missing entity type' }, { status: 400 });

    const search = sp.get('search') || undefined;
    const limit = parseInt(sp.get('limit') || '50', 10);
    const page = parseInt(sp.get('page') || '1', 10);
    const sortDesc = sp.get('sortDesc') !== 'false';

    let filters: Record<string, string> = {};
    const filtersRaw = sp.get('filters');
    if (filtersRaw) {
      try { filters = JSON.parse(filtersRaw); } catch {}
    }

    // Enforce role-based data filtering: non-management/non-purchasing users should only see their own PRs
    const isPurchasingOrAdmin = ctx.permissions.some(p =>
      ['admin', 'owner', 'purchaser', 'purchasing.manage', 'chief_accountant', 'settings.manage'].includes(p)
    );
    if (!isPurchasingOrAdmin && entity === 'purchase-requisitions') {
      filters.created_by = ctx.user.id;
    }

    // 1. Run Feature Gating check and the extremely fast local PG queries IN PARALLEL!
    // This shaves off 330ms+ of sequential cloud latency on every listing request.
    const [hasAddon, result] = await Promise.all([
      checkFeatureAccess(ctx.tenantId, 'warehouse_p2p'),
      (async () => {
        const connector = await getConnectorForShop(shopId, ctx.tenantId);
        return connector.list(entity, { page, limit, search, filters, sortDesc });
      })()
    ]);

    if (!hasAddon) {
      return NextResponse.json(
        { error: 'feature_locked', message: 'Phân hệ mua hàng doanh nghiệp nâng cao (P2P) chưa được kích hoạt cho Tenant này.' },
        { status: 403 }
      );
    }

    // 2. Robust Multi-User Resolution using flatMap (collects created_by, received_by, and purchaser_id without missing any)
    if (result && Array.isArray(result.data) && result.data.length > 0) {
      const userIds = Array.from(new Set(
        result.data.flatMap((r: any) => [r.created_by, r.received_by, r.purchaser_id]).filter(Boolean)
      ));

      let profileMap = new Map<string, string>();
      if (userIds.length > 0) {
        const admin = getSupabaseAdminClient();
        const { data: profiles } = await admin
          .from('tenant_user_profiles')
          .select('user_id, display_name, login_email')
          .in('user_id', userIds);
        
        if (profiles && profiles.length > 0) {
          profileMap = new Map(profiles.map(p => [p.user_id, p.display_name || p.login_email || p.user_id]));
        }
      }

      // Always populate name properties, falling back to a clean UUID slice if profile is missing
      result.data = result.data.map((r: any) => {
        const creatorName = r.created_by ? (profileMap.get(r.created_by) || `User (${r.created_by.slice(0, 8)})`) : 'N/A';
        const receiverName = r.received_by ? (profileMap.get(r.received_by) || `User (${r.received_by.slice(0, 8)})`) : 'N/A';
        const purchaserName = r.purchaser_id ? (profileMap.get(r.purchaser_id) || `User (${r.purchaser_id.slice(0, 8)})`) : 'N/A';
        return {
          ...r,
          creator_name: creatorName,
          receiver_name: receiverName,
          purchaser_name: purchaserName,
        };
      });
    }

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
      case 'CREATE_PR': {
        const data = body.data;
        if (!data) return NextResponse.json({ error: 'Missing row payload' }, { status: 400 });

        const { note, items, status } = data;

        // 1. Tạo PR Header
        let prHeader = await connector.create('purchase-requisitions', {
          status: status || 'DRAFT',
          created_by: ctx.user.id,
          estimated_total: '0',
          note: note || '',
        });

        // Cập nhật requisition_no theo ID đã sinh tự động
        prHeader = await connector.update('purchase-requisitions', prHeader.id, {
          requisition_no: prHeader.id,
        });


        // 2. Tạo các PR Items nếu có
        if (Array.isArray(items) && items.length > 0) {
          for (const item of items) {
            await connector.create('purchase-requisition-items', {
              requisition_id: prHeader.id,
              product_id: item.product_id,
              product_name: item.product_name,
              qty: String(item.qty),
              estimated_unit_price: '0',
              line_total: '0',
            });
          }
        }

        // Bắn thông báo đề xuất mua sắm mới
        if (prHeader.status !== 'DRAFT') {
          try {
            const admin = getSupabaseAdminClient();
            const { data: shopInfo } = await admin
              .from('shops')
              .select('name, slug')
              .eq('id', shopId)
              .maybeSingle();

            if (shopInfo) {
              await NotificationDispatcher.sendPrCreated(
                { tenantId: ctx.tenantId, userId: ctx.user.id },
                { id: shopId, name: shopInfo.name, slug: shopInfo.slug },
                prHeader as { id: string; status: string }
              );
            }
          } catch (err) {
            console.error('Failed to dispatch PR created notification:', err);
          }
        }

        return NextResponse.json(prHeader);
      }

      case 'CREATE_GRN_FROM_PO': {
        const canCreate = ctx.permissions.some(p =>
          ['admin', 'owner', 'purchaser', 'purchasing.manage', 'chief_accountant', 'settings.manage', 'warehouse.manage'].includes(p)
        );
        if (!canCreate) {
          return NextResponse.json({ error: '🔒 Bạn không có quyền khởi tạo phiếu đối chiếu GRN.' }, { status: 403 });
        }

        const { purchase_order_id } = body;
        if (!purchase_order_id) return NextResponse.json({ error: 'Missing purchase_order_id' }, { status: 400 });

        // 1. Tìm PO Header
        const po = await connector.findById('purchase-orders', purchase_order_id);
        if (!po) return NextResponse.json({ error: 'Đơn đặt hàng PO không tồn tại.' }, { status: 404 });

        // Check if GRN already exists for this PO to prevent duplicate voucher creation
        const existingGrns = await connector.list('goods-receipt-notes', {
          limit: 1,
          filters: { purchase_order_id: po.id }
        });
        if (existingGrns.data && existingGrns.data.length > 0) {
          return NextResponse.json({ error: 'Đơn đặt hàng này đã được lập phiếu đối chiếu GRN từ trước.' }, { status: 400 });
        }

        // 2. Tạo GRN Header
        let grnHeader = await connector.create('goods-receipt-notes', {
          purchase_order_id: po.id,
          received_by: ctx.user.id,
          warehouse_id: 'default',
          status: 'DRAFT',
          note: `Tự động tạo đối chiếu theo đơn đặt hàng PO #${po.purchase_order_no || po.id}`,
        });

        // Cập nhật grn_no theo ID đã sinh tự động
        grnHeader = await connector.update('goods-receipt-notes', grnHeader.id, {
          grn_no: grnHeader.id,
        });

        // 3. Lấy danh sách PO Items
        const poItemsResult = await connector.list('purchase-order-items', {
          limit: 200,
          filters: { purchase_order_id: po.id }
        });

        // 4. Copy các item sang GRN Items
        if (Array.isArray(poItemsResult.data) && poItemsResult.data.length > 0) {
          for (const poItem of poItemsResult.data) {
            const qty = poItem.qty || '0';
            const unitCost = poItem.actual_unit_price || '0';
            const lineTotal = parseFloat(qty) * parseFloat(unitCost);

            await connector.create('goods-receipt-note-items', {
              grn_id: grnHeader.id,
              product_id: poItem.product_id || '',
              product_name: poItem.product_name || '',
              qty_ordered: qty,
              qty_received: qty, // Mặc định số lượng nhận bằng số lượng đặt hàng
              unit_cost: unitCost,
              line_total: String(lineTotal),
            });
          }
        }

        // Bắn thông báo tạo đối chiếu nhập kho GRN mới
        try {
          const admin = getSupabaseAdminClient();
          const { data: shopInfo } = await admin
            .from('shops')
            .select('name, slug')
            .eq('id', shopId)
            .maybeSingle();

          if (shopInfo) {
            // Tìm thông tin người tạo PR ban đầu để báo đã lập đối chiếu nhập kho
            let prCreatorId: string | undefined = undefined;
            if (po.requisition_id) {
              const pr = await connector.findById('purchase-requisitions', po.requisition_id);
              if (pr && pr.created_by) {
                prCreatorId = pr.created_by;
              }
            }

            await NotificationDispatcher.sendGrnCreated(
              { tenantId: ctx.tenantId, userId: ctx.user.id },
              { id: shopId, name: shopInfo.name, slug: shopInfo.slug },
              po as { id: string; purchaser_id: string },
              grnHeader as { id: string },
              prCreatorId
            );
          }
        } catch (err) {
          console.error('Failed to dispatch GRN created notification:', err);
        }

        return NextResponse.json(grnHeader);
      }

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
        invalidate(shopId, entity); // Thu hồi Next.js server-side cache của thực thể này
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
        invalidate(shopId, entity); // Thu hồi Next.js server-side cache của thực thể này
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
        invalidate(shopId, entity); // Thu hồi Next.js server-side cache của thực thể này
        return NextResponse.json({ ok: true });
      }

      case 'TRANSITION_PR': {
        const { prId, prAction, payload } = body;
        if (!prId || !prAction) return NextResponse.json({ error: 'Missing prId or prAction' }, { status: 400 });

        // Enforce granular transition permissions
        if (prAction === 'ASSIGN_PRICE') {
          const allowed = ctx.permissions.includes('purchasing.manage') || ctx.permissions.includes('purchaser') || ctx.permissions.includes('admin');
          if (!allowed) return NextResponse.json({ error: 'Bạn không có vai trò Báo giá.' }, { status: 403 });
        } else if (prAction === 'APPROVE_KTT') {
          const allowed = ctx.permissions.includes('chief_accountant') || ctx.permissions.includes('admin') || ctx.permissions.includes('owner');
          if (!allowed) return NextResponse.json({ error: 'Bạn không có vai trò Kế toán trưởng duyệt.' }, { status: 403 });
        } else if (prAction === 'APPROVE_GD') {
          const allowed = ctx.permissions.includes('admin') || ctx.permissions.includes('owner');
          if (!allowed) return NextResponse.json({ error: 'Bạn không có vai trò Giám đốc duyệt.' }, { status: 403 });
        } else if (prAction === 'RECALL') {
          const pr = await connector.findById('purchase-requisitions', prId);
          if (!pr) return NextResponse.json({ error: 'Đề xuất PR không tồn tại.' }, { status: 404 });
          const isCreator = pr.created_by === ctx.user.id;
          const isAdminOrOwner = ctx.permissions.includes('admin') || ctx.permissions.includes('owner');
          if (!isCreator && !isAdminOrOwner) {
            return NextResponse.json({ error: 'Bạn không có quyền thu hồi phiếu đề xuất này.' }, { status: 403 });
          }
        }

        const updatedPr = await P2PEngine.transitionPR(connector, prId, prAction as PRAction, ctx.user.id, payload);

        // Bắn thông báo chuyển đổi trạng thái PR
        try {
          const admin = getSupabaseAdminClient();
          const { data: shopInfo } = await admin
            .from('shops')
            .select('name, slug')
            .eq('id', shopId)
            .maybeSingle();

          if (shopInfo) {
            // Đảm bảo lấy đầy đủ thông tin PR (bao gồm created_by) từ DB để tránh mất dữ liệu người tạo
            const fullPr = await connector.findById('purchase-requisitions', updatedPr.id);
            const prData = fullPr || updatedPr;

            await NotificationDispatcher.sendPrTransition(
              { tenantId: ctx.tenantId, userId: ctx.user.id },
              { id: shopId, name: shopInfo.name, slug: shopInfo.slug },
              prData as { id: string; created_by: string },
              prAction as any
            );
          }
        } catch (err) {
          console.error('Failed to dispatch PR transition notification:', err);
        }

        return NextResponse.json(updatedPr);
      }

      case 'CREATE_PO_FROM_PR': {
        const { prId, supplierId, supplierName } = body;
        if (!prId || !supplierId || !supplierName) {
          return NextResponse.json({ error: 'Missing conversion params (prId, supplierId, supplierName)' }, { status: 400 });
        }

        const pr = await connector.findById('purchase-requisitions', prId);
        if (!pr) return NextResponse.json({ error: 'PR không tồn tại.' }, { status: 404 });

        const po = await P2PEngine.createPOFromPR(connector, prId, ctx.user.id, supplierId, supplierName);

        // Bắn thông báo tạo đơn mua hàng PO thành công từ đề xuất PR
        try {
          const admin = getSupabaseAdminClient();
          const { data: shopInfo } = await admin
            .from('shops')
            .select('name, slug')
            .eq('id', shopId)
            .maybeSingle();

          if (shopInfo) {
            await NotificationDispatcher.sendPoCreatedFromPr(
              { tenantId: ctx.tenantId, userId: ctx.user.id },
              { id: shopId, name: shopInfo.name, slug: shopInfo.slug },
              pr as { id: string; created_by: string },
              po as { id: string }
            );
          }
        } catch (err) {
          console.error('Failed to dispatch PO created notification:', err);
        }

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

        // Fetch GRN & PO to get details for notification before finalizing
        const grn = await connector.findById('goods-receipt-notes', grnId);
        if (!grn) return NextResponse.json({ error: 'Phiếu đối chiếu GRN không tồn tại.' }, { status: 404 });
        
        const po = grn.purchase_order_id ? await connector.findById('purchase-orders', grn.purchase_order_id) : null;

        const completedGrn = await P2PEngine.approveGRN(connector, grnId, ctx.user.id);

        // Bắn thông báo phê duyệt nhập kho thành công
        if (po) {
          try {
            const admin = getSupabaseAdminClient();
            const { data: shopInfo } = await admin
              .from('shops')
              .select('name, slug')
              .eq('id', shopId)
              .maybeSingle();

            if (shopInfo) {
              // Tìm thông tin người tạo PR ban đầu để báo hàng đã về kho
              let prCreatorId: string | undefined = undefined;
              if (po.requisition_id) {
                const pr = await connector.findById('purchase-requisitions', po.requisition_id);
                if (pr && pr.created_by) {
                  prCreatorId = pr.created_by;
                }
              }

              await NotificationDispatcher.sendGrnApproved(
                { tenantId: ctx.tenantId, userId: ctx.user.id },
                { id: shopId, name: shopInfo.name, slug: shopInfo.slug },
                po as { id: string; purchaser_id: string; supplier_name?: string },
                { id: grnId },
                prCreatorId
              );
            }
          } catch (err) {
            console.error('Failed to dispatch GRN approved notification:', err);
          }
        }

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
