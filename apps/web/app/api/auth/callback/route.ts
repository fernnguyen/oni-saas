import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../../lib/server/supabaseAdmin';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const nextParam = searchParams.get('next');
  const next = (nextParam?.startsWith('/') && !nextParam?.startsWith('//')) ? nextParam : '/super/dashboard';
  const xForwardedHost = req.headers.get('x-forwarded-host');
  const xForwardedProto = req.headers.get('x-forwarded-proto') || 'http';
  const realHost = xForwardedHost || req.headers.get('host') || '';
  const resolvedOrigin = realHost ? `${xForwardedProto}://${realHost}` : origin;

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Main domain: only superadmins allowed
      const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
      const host = req.headers.get('host') ?? '';
      const isMainDomain = host === rootDomain || host.replace(/:\d+$/, '') === rootDomain.replace(/:\d+$/, '');

      if (isMainDomain) {
        const { data: userData } = await supabase.auth.getUser();
        const isSuperAdmin = userData.user?.app_metadata?.role === 'super_admin';

        if (!isSuperAdmin) {
          let workspaceSlug: string | null = null;
          if (userData.user) {
            const admin = getSupabaseAdminClient();
            const { data } = await admin
              .from('user_tenants')
              .select('tenants(slug)')
              .eq('user_id', userData.user.id)
              .order('is_default', { ascending: false })
              .limit(1)
              .maybeSingle();
            workspaceSlug = (data as any)?.tenants?.slug ?? null;
          }

          await supabase.auth.signOut();
          const rejectUrl = new URL('/auth/signin', resolvedOrigin);
          rejectUrl.searchParams.set('error', 'not_superadmin');
          if (workspaceSlug) rejectUrl.searchParams.set('workspace', workspaceSlug);
          return NextResponse.redirect(rejectUrl);
        }
      }

      return NextResponse.redirect(`${resolvedOrigin}${next}`);
    }
  }

  return NextResponse.redirect(`${resolvedOrigin}/auth/signin?error=oauth_failed`);
}
