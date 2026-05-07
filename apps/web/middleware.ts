import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Paths that are public on the MAIN domain (no auth required)
const MAIN_DOMAIN_PUBLIC = ['/auth', '/api', '/_next', '/favicon', '/register'];

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
    // These paths belong only on the main domain
    if (
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/register') ||
      pathname.startsWith('/super')
    ) {
      return NextResponse.redirect(new URL('/', `http://${rootDomain}`));
    }

    // Rewrite all subdomain paths to /t/[slug]/...
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
