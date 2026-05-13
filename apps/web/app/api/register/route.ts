import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdminClient } from '../../../lib/server/supabaseAdmin';

// Reject fake tenant emails — these are reserved for tenant user accounts
const ONI_FAKE_EMAIL_RE = /^[^@]+@[^.]+\.oni\.vn$/i;

const schema = z.object({
  slug:      z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Chỉ dùng chữ thường, số và dấu gạch ngang'),
  name:      z.string().min(2).max(100),
  email:     z.string().email().refine(
    (e) => !ONI_FAKE_EMAIL_RE.test(e),
    { message: 'Không thể đăng ký với email này' },
  ),
  password:  z.string().min(8),
  plan_code: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  if (!json) return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Dữ liệu không hợp lệ', errors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { slug, name, email, password } = parsed.data;
  const admin = getSupabaseAdminClient();

  // 1 — Check slug uniqueness (tenant + shop + reserved subdomains share global slug namespace)
  const [{ count: tenantCount }, { count: shopCount }, { count: reservedCount }] = await Promise.all([
    admin.from('tenants').select('*', { count: 'exact', head: true }).eq('slug', slug),
    admin.from('shops').select('*',   { count: 'exact', head: true }).eq('slug', slug),
    admin.from('reserved_subdomains').select('*', { count: 'exact', head: true }).eq('subdomain', slug),
  ]);
  if ((tenantCount ?? 0) > 0 || (shopCount ?? 0) > 0 || (reservedCount ?? 0) > 0) {
    const isReserved = (reservedCount ?? 0) > 0;
    return NextResponse.json(
      { message: isReserved ? 'Tên miền này không hợp lệ hoặc đã được bảo lưu.' : 'Subdomain này đã được sử dụng. Hãy chọn tên khác.', field: 'slug' },
      { status: 409 }
    );
  }

  // 2 — Create auth user (email pre-confirmed so workspace is immediately accessible)
  const { data: userData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError) {
    const isDuplicate = authError.message.toLowerCase().includes('already');
    return NextResponse.json(
      { message: isDuplicate ? 'Email này đã được đăng ký.' : authError.message, field: isDuplicate ? 'email' : undefined },
      { status: isDuplicate ? 409 : 400 },
    );
  }
  const userId = userData.user.id;

  // 3 — Create tenant + owner membership + subscription (one atomic RPC)
  const { data: tenant, error: tenantError } = await admin.rpc('create_tenant_with_owner', {
    p_name:     name,
    p_slug:     slug,
    p_owner_id: userId,
  });
  if (tenantError) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ message: tenantError.message }, { status: 400 });
  }
  const tenantId = (tenant as any).id as string;

  // Update subscription to selected plan and set 3-year expiration for plan_mini
  const planCode = parsed.data.plan_code || 'plan_mini';
  const { data: plan } = await admin.from('plans').select('id, code').eq('code', planCode).single();
  
  if (plan) {
    const updateData: any = { plan_id: plan.id };
    
    // Set 3 years expiration for plan_mini
    if (plan.code === 'plan_mini') {
      const threeYearsLater = new Date();
      threeYearsLater.setFullYear(threeYearsLater.getFullYear() + 3);
      updateData.current_period_end = threeYearsLater.toISOString();
    }
    
    await admin.from('subscriptions').update(updateData).eq('tenant_id', tenantId);
  }

  // 4 — Create default branch (same slug as tenant)
  const { error: shopError } = await admin.rpc('create_shop', {
    p_tenant_id: tenantId,
    p_name:      name,
    p_slug:      slug,
    p_address:   null,
  });
  if (shopError) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ message: shopError.message }, { status: 400 });
  }

  // 5 — Assign default Local DB connector (System worker, Read-only)
  await admin.from('connectors').insert({
    tenant_id: tenantId,
    type: 'mysql_local',
    status: 'active',
    config: {
      is_system: true,
      read_only: true,
      worker_name: 'Database Hệ thống'
    }
  });

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
  const protocol   = rootDomain.startsWith('localhost') ? 'http' : 'https';
  const workspaceUrl = `${protocol}://${slug}.${rootDomain}`;

  return NextResponse.json({ tenant_id: tenantId, workspace_url: workspaceUrl, email, slug }, { status: 201 });
}
