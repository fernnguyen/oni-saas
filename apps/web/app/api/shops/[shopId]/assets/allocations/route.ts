export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { assetAllocationCreateSchema } from '@/lib/validators/assets';
import { invalidate } from '@/lib/server/cache';
import { handleApiError } from '@/app/api/shops/_helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const { connector, permissions } = await requireShopAccess(shopId);

    const hasViewAccess = permissions.includes('assets.view') || permissions.includes('settings.manage') || permissions.includes('owner') || permissions.includes('admin');
    if (!hasViewAccess) {
      return NextResponse.json({ error: 'Forbidden: no permission to view asset allocations' }, { status: 403 });
    }

    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'));
    const limit = Math.min(500, Math.max(1, parseInt(sp.get('limit') ?? '200')));
    const assetId = sp.get('asset_id');

    const filters: Record<string, string> = {};
    if (assetId) filters.asset_id = assetId;

    const result = await connector.list('asset-allocations', { page, limit, filters, sortDesc: false });

    // Resolve profile display names for created_by and updated_by
    if (result && Array.isArray(result.data) && result.data.length > 0) {
      const userIds = Array.from(new Set(
        result.data.flatMap((r: any) => [r.created_by, r.updated_by]).filter(Boolean)
      ));

      let profileMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { getSupabaseAdminClient } = await import('@/lib/server/supabaseAdmin');
        const admin = getSupabaseAdminClient();
        const { data: profiles } = await admin
          .from('tenant_user_profiles')
          .select('user_id, display_name, login_email')
          .in('user_id', userIds);
        
        if (profiles && profiles.length > 0) {
          profileMap = new Map(profiles.map(p => [p.user_id, p.display_name || p.login_email || p.user_id]));
        }
      }

      result.data = result.data.map((r: any) => {
        const creatorName = r.created_by ? (profileMap.get(r.created_by) || `User (${r.created_by.slice(0, 8)})`) : 'Hệ thống';
        const updaterName = r.updated_by ? (profileMap.get(r.updated_by) || `User (${r.updated_by.slice(0, 8)})`) : 'Hệ thống';
        return {
          ...r,
          created_by: creatorName,
          updated_by: updaterName,
        };
      });
    }

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, 'GET asset allocations');
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const { connector, permissions, userId } = await requireShopAccess(shopId);

    const hasManageAccess = permissions.includes('assets.manage') || permissions.includes('settings.manage') || permissions.includes('owner') || permissions.includes('admin');
    if (!hasManageAccess) {
      return NextResponse.json({ error: 'Forbidden: no permission to manage asset allocations' }, { status: 403 });
    }

    const body = await req.json();
    const data = assetAllocationCreateSchema.parse(body);
    data.created_by = userId;
    data.updated_by = userId;

    const created = await connector.create('asset-allocations', data);
    invalidate(shopId, 'assets');

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return handleApiError(e, 'POST asset allocations');
  }
}
