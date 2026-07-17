import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../../lib/server/supabaseAdmin';
import { isZaloOAMessageEnabled, sendZaloOAMessageToUser } from '@/lib/server/zaloOA';

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slug, name, zaloIdByOA } = await req.json();
    if (!slug || !name) {
      return NextResponse.json({ error: 'Missing slug or name' }, { status: 400 });
    }

    // Zalo OA Customer Service API requires OA-scoped user id.
    const zaloId = zaloIdByOA || auth.user.user_metadata?.zalo_id_by_oa || '';
    const phone = auth.user.user_metadata?.phone || '';

    // Save zalo_id_by_oa to user metadata if it was passed and not yet saved
    if (zaloIdByOA && !auth.user.user_metadata?.zalo_id_by_oa) {
      try {
        const admin = getSupabaseAdminClient();
        await admin.auth.admin.updateUserById(auth.user.id, {
          user_metadata: {
            ...auth.user.user_metadata,
            zalo_id_by_oa: zaloIdByOA
          }
        });
        console.log(`[SendOAWelcome] Successfully saved user's OA User ID: ${zaloIdByOA} to metadata`);
      } catch (metaErr) {
        console.error('[SendOAWelcome] Failed to update user metadata with zaloIdByOA:', metaErr);
      }
    }

    console.log(`[SendOAWelcome] Preparing welcome message for user Zalo ID (resolved): ${zaloId}, phone: ${phone}, Shop: ${name} (${slug})`);

    const messageText = `Cảm ơn bạn đã đăng ký thành công cửa hàng ${name}!\n\n` +
      `Thông tin cửa hàng của bạn:\n` +
      `• Đường dẫn: https://${slug}.oni.vn\n` +
      `• Tài khoản quản lý: ${auth.user.email}\n\n` +
      `Quản lý cửa hàng trực tiếp trên Zalo Mini App bằng cách quét mã QR hoặc truy cập:\n` +
      `https://zalo.me/s/${process.env.NEXT_PUBLIC_ZALO_MINI_APP_ID || '3208409885005498355'}/?tenant_slug=${slug}`;

    let sentSuccessfully = false;
    let zaloResponse = null;
    let reason: string | null = null;

    const sendOAMsgEnabled = await isZaloOAMessageEnabled();

    if (!sendOAMsgEnabled) {
      reason = 'disabled_by_setting';
      console.info('[SendOAWelcome] Skipped OA send because system_settings.config.sendOAMsg is disabled.');
    } else if (!zaloId) {
      reason = 'missing_oa_user_id';
      console.warn('[SendOAWelcome] Missing zaloIdByOA. User may not have granted OA interaction or Mini App is not OA-authenticated.');
    } else {
      try {
        const delivery = await sendZaloOAMessageToUser(zaloId, messageText);
        zaloResponse = delivery.zaloResponse || null;
        reason = delivery.reason;
        if (delivery.sent) {
          sentSuccessfully = true;
          console.log('[SendOAWelcome] Message sent successfully via Zalo OA API');
        } else {
          console.error('[SendOAWelcome] Zalo OA delivery failed:', delivery);
        }
      } catch (e) {
        reason = 'zalo_fetch_failed';
        console.error('[SendOAWelcome] Fetch to Zalo OpenAPI failed:', e);
      }
    }

    return NextResponse.json({
      success: sentSuccessfully,
      sent: sentSuccessfully,
      reason,
      zaloIdByOA: zaloId || null,
      zaloResponse: zaloResponse,
      mocked: false,
      message: messageText
    });
  } catch (err: any) {
    console.error('[SendOAWelcome] Internal Server Error:', err);
    return NextResponse.json({ error: 'Internal Server Error', details: err?.message || String(err) }, { status: 500 });
  }
}
