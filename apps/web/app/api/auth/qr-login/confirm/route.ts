import { NextRequest, NextResponse } from 'next/server';
import {
  getQrLoginRequest,
  QrLoginStoreNotReadyError,
  updateQrLoginRequest,
} from '../../../../../lib/server/qrLoginStore';
import { resolveLinkedZaloSession } from '../../../../../lib/server/zaloLinkedSession';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = typeof body?.token === 'string' ? body.token : '';
    const accessToken = typeof body?.accessToken === 'string' ? body.accessToken : '';

    if (!token || !accessToken) {
      return NextResponse.json({ error: 'Missing token or accessToken' }, { status: 400 });
    }

    const requestRow = await getQrLoginRequest(token);
    if (!requestRow) {
      return NextResponse.json({ error: 'Mã QR không hợp lệ hoặc không tồn tại' }, { status: 404 });
    }

    if (requestRow.status !== 'pending') {
      return NextResponse.json({ error: 'Mã QR này đã được xử lý hoặc hết hạn' }, { status: 409 });
    }

    const expiresAt = requestRow.expires_at ? new Date(requestRow.expires_at) : null;
    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      await updateQrLoginRequest(token, {
        status: 'expired',
        updated_at: new Date().toISOString(),
      });
      return NextResponse.json({ error: 'Mã QR đã hết hạn, vui lòng tạo mã mới' }, { status: 410 });
    }

    const result = await resolveLinkedZaloSession(accessToken);
    if (result.status !== 'LOGGED_IN') {
      return NextResponse.json({
        error: 'Tài khoản Zalo này chưa được liên kết để đăng nhập nhanh',
        zaloProfile: result.zaloProfile,
      }, { status: 409 });
    }

    await updateQrLoginRequest(token, {
      status: 'confirmed',
      session_payload: {
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      },
      confirmed_user_id: result.userId,
      confirmed_name: result.zaloProfile.name,
      confirmed_avatar: result.zaloProfile.avatar,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      requestedHost: requestRow.requested_host,
      requestedOrigin: requestRow.requested_origin,
      requestedTenantSlug: requestRow.tenant_slug,
      zaloProfile: result.zaloProfile,
    });
  } catch (error) {
    console.error('[QR Login][Confirm]', error);
    if (error instanceof QrLoginStoreNotReadyError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Không thể xác nhận đăng nhập bằng QR' }, { status: 500 });
  }
}
