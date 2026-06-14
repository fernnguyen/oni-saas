import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Paths that are public on the MAIN domain (no auth required)
const MAIN_DOMAIN_PUBLIC = ['/auth', '/api', '/_next', '/favicon', '/register', '/admin-login', '/qr-order', '/solutions', '/icons', '/logos', '/fonts', '/.well-known', '/support', '/privacy'];

// Paths on subdomain that bypass AAL check (auth flows themselves)
const SUBDOMAIN_AUTH_BYPASS = ['/auth/', '/api/', '/_next/'];

function isMainPublic(pathname: string) {
  // Allow dynamic Open Graph and Twitter cover images to bypass auth on main domain
  if (pathname.includes('/opengraph-image') || pathname.includes('/twitter-image')) {
    return true;
  }
  return pathname === '/' ||
    MAIN_DOMAIN_PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Xử lý CORS Preflight cho môi trường phát triển (VD: chạy Expo Web trên cổng 8081) - Chỉ cho phép ở môi trường Local/Development
  if (pathname.startsWith('/api/') && req.method === 'OPTIONS' && process.env.NODE_ENV === 'development') {
    const response = new NextResponse(null, { status: 204 });
    response.headers.set('Access-Control-Allow-Origin', req.headers.get('origin') || '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-tenant-slug');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    return response;
  }

  const xForwardedHost = req.headers.get('x-forwarded-host');
  const xForwardedProto = req.headers.get('x-forwarded-proto');
  const host = xForwardedHost || req.headers.get('host') || '';

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
  let subdomain = extractSubdomain(host, rootDomain);

  // Fallback cho môi trường Mobile / API qua IP LAN (không dùng được subdomain DNS trực tiếp) - Chỉ cho phép ở môi trường Local/Development
  if (!subdomain && process.env.NODE_ENV === 'development') {
    subdomain = req.headers.get('x-tenant-slug');
  }

  // ── SUBDOMAIN (tenant workspace) ─────────────────────────────
  // Must be checked FIRST — subdomain /auth/signin must serve the
  // workspace login form, not the superadmin form.
  if (subdomain) {
    // API routes, Next.js internals, and public QR ordering routes/assets do not require rewrite/auth — pass through
    if (
      pathname.startsWith('/api/') ||
      pathname.startsWith('/_next/') ||
      pathname.startsWith('/qr-order/') ||
      pathname.startsWith('/icons/') ||
      pathname.startsWith('/logos/') ||
      pathname.startsWith('/fonts/') ||
      pathname.startsWith('/.well-known/')
    ) {
      return withSupabaseSession(req, NextResponse.next());
    }

    // These paths belong only on the main domain
    if (
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/register') ||
      pathname.startsWith('/super')
    ) {
      const cleanRoot = rootDomain.replace(/^https?:\/\//, '');
      const protocol = req.headers.get('x-forwarded-proto') || 'http';
      const redirectUrl = new URL('/', `${protocol}://${cleanRoot}`);
      return NextResponse.redirect(redirectUrl);
    }

    // AAL guard: if user has 2FA enabled but session is only AAL1, redirect to 2FA page
    const needsBypass = SUBDOMAIN_AUTH_BYPASS.some((p) => pathname.startsWith(p));
    if (!needsBypass) {
      const mfaRedirect = await checkMFARedirect(req, pathname);
      if (mfaRedirect) return withSupabaseSession(req, mfaRedirect);
    }

    // Rewrite all other subdomain paths to /t/[slug]/...
    const rewriteUrl = req.nextUrl.clone();
    if (xForwardedProto === 'https') rewriteUrl.protocol = 'https:';
    rewriteUrl.pathname = `/t/${subdomain}${pathname === '/' ? '' : pathname}`;
    const res = NextResponse.rewrite(rewriteUrl);
    res.headers.set('x-tenant-slug', subdomain);
    return withSupabaseSession(req, res);
  }

  // ── MAIN DOMAIN ───────────────────────────────────────────────
  // Block direct /t/ access (only reachable via subdomain rewrite)
  // Bypass this block for dynamic Open Graph and Twitter images so scrapers can load them directly
  if (pathname.startsWith('/t/') && !pathname.includes('/opengraph-image') && !pathname.includes('/twitter-image')) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/auth/signin';
    return NextResponse.redirect(redirectUrl);
  }

  // Public paths on main domain — pass through
  if (isMainPublic(pathname)) {
    return withSupabaseSession(req, NextResponse.next());
  }

  // All other main-domain routes require superadmin
  const { user } = await getUser(req);
  if (!user) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/auth/signin';
    return NextResponse.redirect(redirectUrl);
  }
  if (user.app_metadata?.role !== 'super_admin') {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/auth/signin';
    redirectUrl.searchParams.set('error', 'not_superadmin');
    return NextResponse.redirect(redirectUrl);
  }

  return withSupabaseSession(req, NextResponse.next());
}

// ── Helpers ──────────────────────────────────────────────────────

function extractSubdomain(host: string, rootDomain: string): string | null {
  // Strip http(s):// and port before comparing base hostnames
  const cleanRoot = rootDomain.replace(/^https?:\/\//, '');
  const rootBase = cleanRoot.split(':')[0];
  const hostBase = host.split(':')[0];
  if (hostBase === rootBase) return null;
  if (!hostBase.endsWith(`.${rootBase}`)) return null;
  const sub = hostBase.slice(0, hostBase.length - rootBase.length - 1);
  return sub === 'www' || sub === '' ? null : sub;
}

async function getUser(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value; },
        set() {},
        remove() {},
      },
    },
  );
  const { data } = await supabase.auth.getUser();
  return { user: data.user };
}

// Checks if user needs MFA upgrade. Returns a redirect Response or null.
async function checkMFARedirect(req: NextRequest, pathname: string): Promise<NextResponse | null> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value; },
        set() {},
        remove() {},
      },
    },
  );

  // getUser() verifies the user server-side (secure)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Check if user has any verified TOTP factors (from verified user object)
  const verifiedFactors = (user.factors ?? []).filter(
    (f: { status: string }) => f.status === 'verified',
  );
  if (verifiedFactors.length === 0) return null;

  // getSession only for access_token to decode AAL claim from JWT (no extra network call)
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const currentAAL = decodeJWTClaim(session.access_token, 'aal');
  if (currentAAL === 'aal2') return null;

  // User has 2FA but session is only AAL1 — redirect to 2FA challenge
  const rewriteUrl = req.nextUrl.clone();
  if (req.headers.get('x-forwarded-proto') === 'https') rewriteUrl.protocol = 'https:';
  rewriteUrl.pathname = '/auth/2fa';
  rewriteUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(rewriteUrl);
}

function decodeJWTClaim(token: string, claim: string): string | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    return payload[claim] ?? null;
  } catch { return null; }
}

async function withSupabaseSession(req: NextRequest, res: NextResponse): Promise<NextResponse> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value; },
        set(name: string, value: string, options: Record<string, unknown>) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: Record<string, unknown>) {
          res.cookies.set({ name, value: '', ...options });
        },
      },
    },
  );
  await supabase.auth.getUser();

  // Bổ sung CORS headers cho các API response trong môi trường local/testing - Chỉ cho phép ở môi trường Local/Development
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/') && process.env.NODE_ENV === 'development') {
    res.headers.set('Access-Control-Allow-Origin', req.headers.get('origin') || '*');
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-tenant-slug');
    res.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|logos/|fonts/|\\.well-known/|.*\\.(?:wav|mp3|svg|png|jpg|jpeg|gif|webp|ico|webmanifest|ttf|woff|woff2)$).*)'],
};
