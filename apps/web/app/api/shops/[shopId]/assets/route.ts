export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { assetCreateSchema } from '@/lib/validators/assets';
import { invalidate } from '@/lib/server/cache';
import { handleApiError } from '../../_helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    // Xem tài sản yêu cầu quyền assets.view hoặc quản trị chung settings.manage
    const { connector, permissions } = await requireShopAccess(shopId);

    const hasViewAccess = permissions.includes('assets.view') || permissions.includes('settings.manage') || permissions.includes('owner') || permissions.includes('admin');
    if (!hasViewAccess) {
      return NextResponse.json({ error: 'Forbidden: no permission to view assets' }, { status: 403 });
    }

    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'));
    const limit = Math.min(500, Math.max(1, parseInt(sp.get('limit') ?? '100')));
    const type = sp.get('type'); // 'ccdc' | 'tscd'

    const filter: Record<string, string> = {};
    if (type) filter.type = type;

    const result = await connector.list('assets', { page, limit, filters: filter, sortDesc: false });

    // Fetch allocations and departments to resolve current department location
    let allocationMap = new Map<string, string>();
    try {
      const [allocationsRes, departmentsRes] = await Promise.all([
        connector.list('asset-allocations', { limit: 1000 }),
        connector.list('departments', { limit: 100 }),
      ]);

      const departmentNameMap = new Map(
        departmentsRes?.data?.map((d: any) => [d.id, d.name]) || []
      );

      if (allocationsRes && Array.isArray(allocationsRes.data)) {
        // Sort allocations by allocated_at descending or created_at descending to get the latest
        const sortedAllocs = [...allocationsRes.data].sort((a: any, b: any) => {
          const dateA = new Date(a.allocated_at || a.created_at || 0).getTime();
          const dateB = new Date(b.allocated_at || b.created_at || 0).getTime();
          return dateB - dateA;
        });

        sortedAllocs.forEach((alloc: any) => {
          const assetId = alloc.asset_id;
          const deptId = alloc.department_id;
          const deptName = departmentNameMap.get(deptId) || deptId;
          if (!allocationMap.has(assetId) && deptName) {
            allocationMap.set(assetId, deptName);
          }
        });
      }
    } catch (err) {
      console.error('Failed to resolve current department allocations:', err);
    }

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
        const currentDept = allocationMap.get(r.id) || 'Chưa di chuyển';
        return {
          ...r,
          created_by: creatorName,
          updated_by: updaterName,
          current_department: currentDept,
        };
      });
    }

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, 'GET assets');
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
      return NextResponse.json({ error: 'Forbidden: no permission to manage assets' }, { status: 403 });
    }

    const body = await req.json();
    const data = assetCreateSchema.parse(body);
    data.created_by = userId;
    data.updated_by = userId;

    const created = await connector.create('assets', data);
    invalidate(shopId, 'assets');

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return handleApiError(e, 'POST assets');
  }
}
