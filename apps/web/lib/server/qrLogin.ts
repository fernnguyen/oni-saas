export const QR_LOGIN_TTL_MS = 5 * 60 * 1000;
export const QR_LOGIN_SCHEME = 'oni://auth/qr-login';

export function buildQrLoginContent(token: string, requestedHost: string, tenantSlug?: string | null) {
  const params = new URLSearchParams({
    token,
    origin: requestedHost,
  });

  if (tenantSlug) {
    params.set('tenant_slug', tenantSlug);
  }

  return `${QR_LOGIN_SCHEME}?${params.toString()}`;
}
