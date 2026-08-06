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
    const branchId = sp.get('shopId'); // Optional branch-specific filter
    const requestedLimit = Number.parseInt(sp.get('limit') || '50', 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, requestedLimit))
      : 50;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId search parameter is required' }, { status: 400 });
    }

    // Query in_app_notifications and left join notification_reads
    // Since RLS is active on notification_reads, it will only return the read_at record
    // matching user_id = auth.uid(), filtering out other users' read states automatically!
    let query = supabase
      .from('in_app_notifications')
      .select(`
        id,
        tenant_id,
        branch_id,
        recipient_id,
        recipient_role,
        type,
        title,
        content,
        metadata,
        created_at,
        expires_at,
        shops (
          name,
          slug
        ),
        notification_reads (
          read_at
        )
      `)
      .eq('tenant_id', tenantId)
      .or(`recipient_id.is.null,recipient_id.eq.${auth.user.id}`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (branchId) {
      // Show notifications targeted to the specific branch, or general tenant-wide notifications
      query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }

    const { data: notifications, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Format the response, converting the join array into a flat 'status' field ('read' | 'unread')
    const formattedNotifications = (notifications || []).map((n: any) => {
      const isRead = Array.isArray(n.notification_reads) && n.notification_reads.length > 0;
      const branchName = n.shops?.name || null;
      const branchSlug = n.shops?.slug || null;
      
      // Clean up the joined field and return a unified format
      const { notification_reads, shops, ...rest } = n;
      return {
        ...rest,
        branchName,
        branchSlug,
        status: isRead ? ('read' as const) : ('unread' as const),
      };
    });

    return NextResponse.json(formattedNotifications);
  } catch (error: any) {
    console.error('[GET /api/notifications]', error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
