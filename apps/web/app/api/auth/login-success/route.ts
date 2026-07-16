import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../lib/server/supabaseAdmin';
import { getSupabaseServerClient } from '../../../../lib/server/supabaseServer';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const intent = searchParams.get('intent') || 'login';
  
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/auth/signin?error=Session not found`);
  }

  const adminAuth = getSupabaseAdminClient();
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';
  const cleanRoot = rootDomain.replace(/^https?:\/\//, '').split(':')[0];
  
  const xForwardedHost = req.headers.get('x-forwarded-host');
  const realHost = xForwardedHost || req.headers.get('host') || new URL(origin).host;
  const originHost = realHost.split(':')[0];
  
  const xForwardedProto = req.headers.get('x-forwarded-proto') || 'http';
  const realOrigin = `${xForwardedProto}://${realHost}`;
  
  const isMainDomain = originHost === cleanRoot || originHost.endsWith(`.${cleanRoot}`) && originHost.split('.').length === cleanRoot.split('.').length;

  if (!isMainDomain) {
    // User logged in from a specific tenant subdomain
    const subdomain = originHost.replace(`.${cleanRoot}`, '');
    const { data: tenant } = await adminAuth.from('tenants').select('id, slug').eq('slug', subdomain).single();
    
    if (tenant) {
      const { data: isMember } = await adminAuth
        .from('user_tenants')
        .select('id')
        .eq('user_id', user.id)
        .eq('tenant_id', tenant.id)
        .single();
        
      if (isMember) {
        return NextResponse.redirect(`${realOrigin}/`);
      } else {
        return NextResponse.redirect(`${realOrigin}/auth/signin?error=Bạn không có quyền truy cập cửa hàng này`);
      }
    } else {
      return NextResponse.redirect(`${realOrigin}/auth/signin?error=Cửa hàng không tồn tại (${subdomain})`);
    }
  }

  // Check tenant count for root domain login
  const { data: tenantMembers } = await supabase
    .from('user_tenants')
    .select('tenant_id')
    .eq('user_id', user.id);

  const tenantCount = tenantMembers?.length || 0;

  if (tenantCount === 0) {
    const protocol = rootDomain.includes('localhost') ? 'http' : 'https';
    return NextResponse.redirect(`${protocol}://${rootDomain}/onboarding`);
  }

  if (intent === 'register') {
    const protocol = rootDomain.includes('localhost') ? 'http' : 'https';
    return NextResponse.redirect(`${protocol}://${rootDomain}/auth/select-workspace?intent=register`);
  }

  if (tenantCount === 1) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('slug')
      .eq('id', tenantMembers![0].tenant_id)
      .single();
    
    if (tenant) {
      const protocol = rootDomain.includes('localhost') ? 'http' : 'https';
      return NextResponse.redirect(`${protocol}://${tenant.slug}.${rootDomain}`);
    }
  }
  
  const protocol = rootDomain.includes('localhost') ? 'http' : 'https';
  return NextResponse.redirect(`${protocol}://${rootDomain}/auth/select-workspace?intent=${intent}`);
}
