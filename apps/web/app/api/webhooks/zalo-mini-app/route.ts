export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get('x-zevent-signature');
    const body = await req.json();

    console.log('[Zalo Mini App Webhook] Received payload:', body);

    // 1. Xác thực request đến từ Zalo (Verify Signature)
    // Cần có Zalo API Key / Secret Key của ứng dụng để xác thực
    const apiKey = process.env.ZALO_WEBHOOK_SECRET || '';
    
    if (apiKey && signature) {
      const sortedKeys = Object.keys(body).sort();
      let content = '';
      sortedKeys.forEach((key) => {
        content += body[key];
      });

      const expectedSignature = crypto
        .createHmac('sha256', apiKey)
        .update(content)
        .digest('hex');

      if (signature !== expectedSignature) {
        console.warn('[Zalo Mini App Webhook] Invalid signature');
        return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 401 });
      }
    }

    // 2. Xử lý sự kiện rút lại sự đồng ý
    if (body.event === 'user.revoke.consent') {
      const { appId, userId, timestamp } = body;
      console.log(`[Zalo Mini App Webhook] User ${userId} revoked consent for App ${appId} at ${timestamp}`);
      
      // TODO: Triển khai logic xóa hoặc ẩn dữ liệu người dùng (Soft Delete)
      // Ví dụ:
      // await admin.from('customers').update({ deleted_at: new Date().toISOString() }).eq('zalo_user_id', userId);
    }

    // Trả về HTTP 200 cho Zalo
    return NextResponse.json({ message: 'ok' }, { status: 200 });
  } catch (error) {
    console.error('[Zalo Mini App Webhook] Processing error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
