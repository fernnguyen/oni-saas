import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../../lib/server/supabaseAdmin';

const schema = z.object({ email: z.string().email(), password: z.string().min(6) });

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const json = await req.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid input' }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  // Main domain: only superadmins are allowed
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
  const host = req.headers.get('host') ?? '';
  const isMainDomain = host === rootDomain || host.replace(/:\d+$/, '') === rootDomain.replace(/:\d+$/, '');

  if (isMainDomain) {
    const { data: userData } = await supabase.auth.getUser();
    const isSuperAdmin = userData.user?.app_metadata?.role === 'super_admin';

    if (!isSuperAdmin) {
      // Look up their workspace so we can point them to the right place
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
      return NextResponse.json(
        {
          message: 'Trang này chỉ dành cho superadmin. Vui lòng đăng nhập tại workspace của bạn.',
          workspace_slug: workspaceSlug,
        },
        { status: 403 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
