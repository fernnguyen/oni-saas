export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { handleApiError } from '@/app/api/shops/_helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params;
    const { connector, permissions } = await requireShopAccess(shopId);

    const hasViewAccess = permissions.includes('assets.view') || permissions.includes('settings.manage') || permissions.includes('owner') || permissions.includes('admin');
    if (!hasViewAccess) {
      return NextResponse.json({ error: 'Forbidden: no permission to view assets' }, { status: 403 });
    }

    // Query asset-depreciations table
    const res = await connector.list('asset-depreciations', {
      filters: { asset_id: id },
      limit: 100,
      sortDesc: true, // Newest first
    });

    const data = res.data || [];

    // Resolve profile display names for created_by and updated_by
    if (data.length > 0) {
      const userIds = Array.from(new Set(
        data.flatMap((r: any) => [r.created_by, r.updated_by]).filter(Boolean)
      ));

      let profileMap = new Map<string, string>();
      if (userIds.length > 0) {
        try {
          const { getSupabaseAdminClient } = await import('@/lib/server/supabaseAdmin');
          const admin = getSupabaseAdminClient();
          const { data: profiles } = await admin
            .from('tenant_user_profiles')
            .select('user_id, display_name, login_email')
            .in('user_id', userIds);
          
          if (profiles && profiles.length > 0) {
            profileMap = new Map(profiles.map(p => [p.user_id, p.display_name || p.login_email || p.user_id]));
          }
        } catch (profileErr) {
          console.error('Failed to resolve profile display names for asset depreciations:', profileErr);
        }
      }

      res.data = data.map((r: any) => {
        const creatorName = r.created_by ? (profileMap.get(r.created_by) || `User (${r.created_by.slice(0, 8)})`) : 'Hệ thống';
        const updaterName = r.updated_by ? (profileMap.get(r.updated_by) || `User (${r.updated_by.slice(0, 8)})`) : 'Hệ thống';
        return {
          ...r,
          created_by: creatorName,
          updated_by: updaterName,
        };
      });
    }

    return NextResponse.json(res);
  } catch (e) {
    return handleApiError(e, 'GET asset depreciations');
  }
}
