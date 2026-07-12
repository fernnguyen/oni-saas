import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../../lib/server/supabaseAdmin';

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

    // Prioritize OA UID (zaloIdByOA) because Zalo OA Customer Service API requires it
    const zaloId = zaloIdByOA || auth.user.user_metadata?.zalo_id_by_oa || auth.user.user_metadata?.zalo_id || auth.user.user_metadata?.phone;
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

    const oaAccessToken = process.env.ZALO_OA_ACCESS_TOKEN;
    let sentSuccessfully = false;
    let zaloResponse = null;

    if (oaAccessToken && zaloId) {
      try {
        // Send message to user via Zalo OA Customer Service API
        const response = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'access_token': oaAccessToken,
          },
          body: JSON.stringify({
            recipient: {
              user_id: zaloId,
            },
            message: {
              text: messageText,
            },
          }),
        });

        zaloResponse = await response.json();
        if (response.ok && zaloResponse?.error === 0) {
          sentSuccessfully = true;
          console.log('[SendOAWelcome] Message sent successfully via Zalo OA API');
        } else {
          console.error('[SendOAWelcome] Zalo OA API Error:', zaloResponse);
        }
      } catch (e) {
        console.error('[SendOAWelcome] Fetch to Zalo OpenAPI failed:', e);
      }
    } else {
      console.warn('[SendOAWelcome] ZALO_OA_ACCESS_TOKEN or zaloId is missing. Simulating successful dispatch.');
    }

    return NextResponse.json({
      success: true,
      sent: sentSuccessfully,
      zaloResponse: zaloResponse,
      mocked: !sentSuccessfully,
      message: messageText
    });
  } catch (err: any) {
    console.error('[SendOAWelcome] Internal Server Error:', err);
    return NextResponse.json({ error: 'Internal Server Error', details: err?.message || String(err) }, { status: 500 });
  }
}
