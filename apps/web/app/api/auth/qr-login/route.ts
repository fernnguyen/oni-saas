import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { buildQrLoginContent, QR_LOGIN_TTL_MS } from '../../../../lib/server/qrLogin';
import {
  createQrLoginRequest,
  getQrLoginRequest,
  QrLoginStoreNotReadyError,
  updateQrLoginRequest,
} from '../../../../lib/server/qrLoginStore';

function resolveRequestOrigin(req: NextRequest) {
  const url = new URL(req.url);
  const xForwardedHost = req.headers.get('x-forwarded-host');
  const xForwardedProto = req.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  const realHost = xForwardedHost || req.headers.get('host') || url.host;
  const requestedOrigin = `${xForwardedProto}://${realHost}`;
  const requestedHost = realHost.split(':')[0];

  return { requestedOrigin, requestedHost };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const tenantSlug = typeof body?.tenantSlug === 'string' && body.tenantSlug.trim()
      ? body.tenantSlug.trim().toLowerCase()
      : null;

    const { requestedOrigin, requestedHost } = resolveRequestOrigin(req);
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + QR_LOGIN_TTL_MS).toISOString();
    const qrContent = buildQrLoginContent(token, requestedHost, tenantSlug);
    const qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qrContent)}`;

    await createQrLoginRequest({
      token,
      requested_origin: requestedOrigin,
      requested_host: requestedHost,
      tenant_slug: tenantSlug,
      expires_at: expiresAt,
    });

    return NextResponse.json({
      token,
      qrContent,
      qrDataUrl,
      requestedOrigin,
      requestedHost,
      tenantSlug,
      expiresAt,
    });
  } catch (error) {
    console.error('[QR Login][Create]', error);
    if (error instanceof QrLoginStoreNotReadyError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Không thể tạo mã QR đăng nhập' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = new URL(req.url).searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const data = await getQrLoginRequest(token);
    if (!data) {
      return NextResponse.json({ error: 'QR login request not found' }, { status: 404 });
    }

    const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
    const isExpired = !expiresAt || expiresAt.getTime() <= Date.now();

    if (isExpired && data.status !== 'expired') {
      await updateQrLoginRequest(token, {
        status: 'expired',
        updated_at: new Date().toISOString(),
      });
    }

    const effectiveStatus = isExpired ? 'expired' : data.status;

    return NextResponse.json({
      status: effectiveStatus,
      session: effectiveStatus === 'confirmed' ? data.session_payload : null,
      requestedOrigin: data.requested_origin,
      requestedHost: data.requested_host,
      expiresAt: data.expires_at,
    });
  } catch (error) {
    console.error('[QR Login][Poll]', error);
    if (error instanceof QrLoginStoreNotReadyError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Không thể kiểm tra trạng thái đăng nhập QR' }, { status: 500 });
  }
}
