export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: notificationId } = await params;
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!notificationId) {
      return NextResponse.json({ error: 'Notification ID is required' }, { status: 400 });
    }

    // Insert read record into notification_reads.
    // If it already exists (on conflict), we do nothing.
    const { error } = await supabase
      .from('notification_reads')
      .upsert(
        {
          notification_id: notificationId,
          user_id: auth.user.id,
          read_at: new Date().toISOString(),
        },
        { onConflict: 'notification_id,user_id' }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[POST /api/notifications/[id]/read]', error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
