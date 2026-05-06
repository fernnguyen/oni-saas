import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_PATHS = ['/auth/', '/api/auth/', '/_next/', '/favicon'];

export async function middleware(req: NextRequest) {
  const { pathname, origin } = req.nextUrl;
  const host = req.headers.get('host') ?? '';

  // ── Subdomain detection ──
  // Dev:  cafeminh.localhost:3000
  // Prod: cafeminh.oni.vn
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
  const subdomain = extractSubdomain(host, rootDomain);

  if (PUBLIC_PATHS.some((prefix) => pathname.startsWith(prefix))) {
    return withSupabaseSession(req, NextResponse.next());
  }

  if (subdomain) {
    // Rewrite to /s/[slug]/... so the app router can serve the shop's control panel
    const url = req.nextUrl.clone();
    url.pathname = `/s/${subdomain}${pathname === '/' ? '' : pathname}`;
    const res = NextResponse.rewrite(url);
    res.headers.set('x-tenant-slug', subdomain);
    return withSupabaseSession(req, res);
  }

  // ── Auth guard for dashboard ──
  if (pathname.startsWith('/dashboard')) {
    return withSupabaseSession(req, NextResponse.next());
  }

  return withSupabaseSession(req, NextResponse.next());
}

function extractSubdomain(host: string, rootDomain: string): string | null {
  if (host === rootDomain) return null;
  if (!host.endsWith(`.${rootDomain}`)) return null;
  const sub = host.slice(0, host.length - rootDomain.length - 1);
  // Ignore www
  if (sub === 'www') return null;
  return sub || null;
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
