import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_PATHS = ['/auth/', '/api/', '/_next/', '/favicon', '/register'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get('host') ?? '';

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
  const subdomain = extractSubdomain(host, rootDomain);

  // Always pass through public paths (no auth check needed)
  if (PUBLIC_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'))) {
    return withSupabaseSession(req, NextResponse.next());
  }

  // ── Landing page ──
  if (pathname === '/') {
    return withSupabaseSession(req, NextResponse.next());
  }

  // ── Subdomain (tenant workspace) ──
  if (subdomain) {
    // Control-plane & register paths belong only on the main domain
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/register') || pathname.startsWith('/super')) {
      return NextResponse.redirect(new URL('/', `http://${rootDomain}`));
    }
    // Rewrite workspace paths to /t/[slug]/...
    const url = req.nextUrl.clone();
    url.pathname = `/t/${subdomain}${pathname === '/' ? '' : pathname}`;
    const res = NextResponse.rewrite(url);
    res.headers.set('x-tenant-slug', subdomain);
    return withSupabaseSession(req, res);
  }

  // ── Main domain — only superadmins past this point ──
  // Block direct /t/ access (only reachable via subdomain rewrite)
  if (pathname.startsWith('/t/')) {
    return NextResponse.redirect(new URL('/auth/signin', req.nextUrl));
  }

  // /super/* — superadmin guard
  if (pathname.startsWith('/super')) {
    const { user } = await getUser(req);
    if (!user) return NextResponse.redirect(new URL('/auth/signin', req.nextUrl));
    if (user.app_metadata?.role !== 'super_admin') {
      return rejectNonSuperadmin(req, user, rootDomain);
    }
    return withSupabaseSession(req, NextResponse.next());
  }

  // /dashboard/* and any other protected main-domain route
  // Under the new model the main domain is superadmin-only
  const { user } = await getUser(req);
  if (!user) {
    return NextResponse.redirect(new URL('/auth/signin', req.nextUrl));
  }
  if (user.app_metadata?.role !== 'super_admin') {
    return rejectNonSuperadmin(req, user, rootDomain);
  }

  return withSupabaseSession(req, NextResponse.next());
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractSubdomain(host: string, rootDomain: string): string | null {
  if (host === rootDomain) return null;
  // strip port for comparison (e.g. "localhost:3000" vs "linhka.localhost:3000")
  const rootBase = rootDomain.split(':')[0];
  const hostBase = host.split(':')[0];
  if (!hostBase.endsWith(`.${rootBase}`)) return null;
  const sub = hostBase.slice(0, hostBase.length - rootBase.length - 1);
  if (sub === 'www') return null;
  return sub || null;
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

function rejectNonSuperadmin(req: NextRequest, user: { id: string } | null, _rootDomain: string) {
  // Redirect to signin with a flag so the UI can show an appropriate message
  const url = new URL('/auth/signin', req.nextUrl);
  url.searchParams.set('error', 'not_superadmin');
  return NextResponse.redirect(url);
}

// Refresh Supabase session cookie on every request
async function withSupabaseSession(req: NextRequest, res: NextResponse): Promise<NextResponse> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value; },
        set(name: string, value: string, options: Record<string, unknown>) { res.cookies.set({ name, value, ...options }); },
        remove(name: string, options: Record<string, unknown>) { res.cookies.set({ name, value: '', ...options }); },
      },
    },
  );
  await supabase.auth.getUser();
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
