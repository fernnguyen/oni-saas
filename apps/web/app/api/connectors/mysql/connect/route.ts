import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { getTenantActivePlanDetails } from '../../../../../lib/server/subscriptions';

const schema = z.object({
  tenant_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const json = await req.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: 'Dữ liệu không hợp lệ' }, { status: 400 });

  const { tenant_id } = parsed.data;

  const admin = getSupabaseAdminClient();

  // Verify tenant ownership
  const { data: tenantAccess } = await admin
    .from('user_tenants')
    .select('roles(code)')
    .eq('user_id', auth.user.id)
    .eq('tenant_id', tenant_id)
    .maybeSingle();

  // @ts-ignore
  const roleCode = Array.isArray(tenantAccess?.roles) ? tenantAccess?.roles[0]?.code : tenantAccess?.roles?.code;
  if (roleCode !== 'owner' && roleCode !== 'admin') {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  // Verify plan is Pro or Enterprise
  const planDetails = await getTenantActivePlanDetails(tenant_id);
  const planCode = planDetails?.planCode;
  if (planCode !== 'plan_pro' && planCode !== 'plan_enterprise') {
    return NextResponse.json(
      { message: 'Tính năng kết nối dữ liệu riêng chỉ dành cho gói Chuyên nghiệp (Pro) trở lên. Vui lòng nâng cấp gói để sử dụng.' },
      { status: 403 }
    );
  }

  // Check if a connector already exists
  const { data: existing } = await admin
    .from('connectors')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('status', 'active')
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ message: 'Workspace này đã có kết nối dữ liệu.' }, { status: 400 });
  }

  // Create local mysql connector
  const { data: connector, error } = await admin
    .from('connectors')
    .insert({
      tenant_id,
      type: 'mysql_local',
      status: 'active',
      config: {},
    })
    .select('id')
    .single();

  if (error || !connector) {
    console.error('mysql connect error', error);
    return NextResponse.json({ message: 'Lỗi khi tạo kết nối' }, { status: 500 });
  }

  return NextResponse.json({
    connector_id: connector.id,
    message: 'Thành công',
  });
}
