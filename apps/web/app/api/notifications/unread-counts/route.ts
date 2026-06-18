export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    
    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = req.nextUrl.searchParams;
    const tenantId = sp.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId search parameter is required' }, { status: 400 });
    }

    // Query in_app_notifications and left join notification_reads
    // Since RLS is active on notification_reads, it will only return read status matching this user.
    // Filter to only this user's notifications (recipient_id is null or matching current user).
    const { data: notifications, error } = await supabase
      .from('in_app_notifications')
      .select(`
        id,
        branch_id,
        notification_reads (
          read_at
        )
      `)
      .eq('tenant_id', tenantId)
      .or(`recipient_id.is.null,recipient_id.eq.${auth.user.id}`);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const counts: Record<string, number> = {};
    let globalCount = 0;
    let totalCount = 0;

    (notifications || []).forEach((n: any) => {
      const isRead = Array.isArray(n.notification_reads) && n.notification_reads.length > 0;
      if (!isRead) {
        totalCount++;
        if (n.branch_id) {
          counts[n.branch_id] = (counts[n.branch_id] || 0) + 1;
        } else {
          globalCount++;
        }
      }
    });

    return NextResponse.json({
      byBranch: counts,
      global: globalCount,
      total: totalCount,
    });
  } catch (error: any) {
    console.error('[GET /api/notifications/unread-counts]', error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
