import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Paths that are public on the MAIN domain (no auth required)
const MAIN_DOMAIN_PUBLIC = ['/auth', '/api', '/_next', '/favicon', '/register'];

// Paths on subdomain that bypass AAL check (auth flows themselves)
const SUBDOMAIN_AUTH_BYPASS = ['/auth/', '/api/', '/_next/'];

function isMainPublic(pathname: string) {
  return pathname === '/' ||
    MAIN_DOMAIN_PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get('host') ?? '';

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
  const subdomain = extractSubdomain(host, rootDomain);

  // ── SUBDOMAIN (tenant workspace) ─────────────────────────────
  // Must be checked FIRST — subdomain /auth/signin must serve the
  // workspace login form, not the superadmin form.
  if (subdomain) {
    // API routes and Next.js internals are not tenant-specific — pass through
    if (pathname.startsWith('/api/') || pathname.startsWith('/_next/')) {
      return withSupabaseSession(req, NextResponse.next());
    }

    // These paths belong only on the main domain
    if (
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/register') ||
      pathname.startsWith('/super')
    ) {
      return NextResponse.redirect(new URL('/', `http://${rootDomain}`));
    }

    // AAL guard: if user has 2FA enabled but session is only AAL1, redirect to 2FA page
    const needsBypass = SUBDOMAIN_AUTH_BYPASS.some((p) => pathname.startsWith(p));
    if (!needsBypass) {
      const mfaRedirect = await checkMFARedirect(req, pathname);
      if (mfaRedirect) return withSupabaseSession(req, mfaRedirect);
    }

    // Rewrite all other subdomain paths to /t/[slug]/...
    const url = req.nextUrl.clone();
    url.pathname = `/t/${subdomain}${pathname === '/' ? '' : pathname}`;
    const res = NextResponse.rewrite(url);
    res.headers.set('x-tenant-slug', subdomain);
    return withSupabaseSession(req, res);
  }

  // ── MAIN DOMAIN ───────────────────────────────────────────────
  // Block direct /t/ access (only reachable via subdomain rewrite)
  if (pathname.startsWith('/t/')) {
    return NextResponse.redirect(new URL('/auth/signin', req.nextUrl));
  }

  // Public paths on main domain — pass through
  if (isMainPublic(pathname)) {
    return withSupabaseSession(req, NextResponse.next());
  }

  // All other main-domain routes require superadmin
  const { user } = await getUser(req);
  if (!user) {
    return NextResponse.redirect(new URL('/auth/signin', req.nextUrl));
  }
  if (user.app_metadata?.role !== 'super_admin') {
    return NextResponse.redirect(new URL('/auth/signin?error=not_superadmin', req.nextUrl));
  }

  return withSupabaseSession(req, NextResponse.next());
}

// ── Helpers ──────────────────────────────────────────────────────

function extractSubdomain(host: string, rootDomain: string): string | null {
  // Strip port before comparing base hostnames
  const rootBase = rootDomain.split(':')[0];
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
  const url = req.nextUrl.clone();
  url.pathname = '/auth/2fa';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
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
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:wav|mp3|svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
