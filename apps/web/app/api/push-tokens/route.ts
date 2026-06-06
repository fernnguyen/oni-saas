export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';

/**
 * POST /api/push-tokens
 * Đăng ký hoặc cập nhật push token cho thiết bị hiện tại.
 * Body: { token, tenantId, deviceName?, platform }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { token, tenantId, deviceName, platform } = body;

    if (!token || !tenantId) {
      return NextResponse.json(
        { error: 'token and tenantId are required' },
        { status: 400 },
      );
    }

    if (platform && !['ios', 'android'].includes(platform)) {
      return NextResponse.json(
        { error: 'platform must be "ios" or "android"' },
        { status: 400 },
      );
    }

    // Upsert on (user_id, token) — re-activates a previously deactivated token
    const { data, error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: auth.user.id,
          tenant_id: tenantId,
          token,
          device_name: deviceName || null,
          platform: platform || 'ios',
          is_active: true,
        },
        { onConflict: 'user_id,token' },
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    console.error('[POST /api/push-tokens]', error);
    return NextResponse.json(
      { error: error.message || String(error) },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/push-tokens
 * Vô hiệu hóa push token (đánh dấu is_active = false).
 * Body: { token }
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { error: 'token is required' },
        { status: 400 },
      );
    }

    // RLS ensures users can only deactivate their own tokens
    const { error } = await supabase
      .from('push_tokens')
      .update({ is_active: false })
      .eq('user_id', auth.user.id)
      .eq('token', token);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error('[DELETE /api/push-tokens]', error);
    return NextResponse.json(
      { error: error.message || String(error) },
      { status: 500 },
    );
  }
}
