export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { tenantId, shopId } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    // 1. Fetch all unread notification IDs for this tenant (and optional shop)
    let query = supabase
      .from('in_app_notifications')
      .select(`
        id,
        notification_reads (
          read_at
        )
      `)
      .eq('tenant_id', tenantId);

    if (shopId) {
      query = query.or(`branch_id.eq.${shopId},branch_id.is.null`);
    }

    const { data: notifications, error: fetchError } = await query;

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // Filter down to only those that are actually unread (empty notification_reads array)
    const unreadIds = (notifications || [])
      .filter((n: any) => !Array.isArray(n.notification_reads) || n.notification_reads.length === 0)
      .map((n: any) => n.id);

    if (unreadIds.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    // 2. Bulk insert / upsert them in notification_reads
    const bulkInsertRows = unreadIds.map((id) => ({
      notification_id: id,
      user_id: auth.user.id,
      read_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from('notification_reads')
      .upsert(bulkInsertRows, { onConflict: 'notification_id,user_id' });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: unreadIds.length });
  } catch (error: any) {
    console.error('[POST /api/notifications/read-all]', error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
