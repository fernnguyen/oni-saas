import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminUser } from '../../../../../../lib/server/auth';
import { getSupabaseAdminClient } from '../../../../../../lib/server/supabaseAdmin';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSuperAdminUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.formData();
  const plan_id = Number(body.get('plan_id'));

  if (!plan_id) return NextResponse.json({ error: 'plan_id required' }, { status: 400 });

  const admin = getSupabaseAdminClient();

  const [{ data: prev }, { data: newPlan }] = await Promise.all([
    admin.from('subscriptions').select('plan_id, plans(name)').eq('tenant_id', id).maybeSingle(),
    admin.from('plans').select('name').eq('id', plan_id).maybeSingle(),
  ]);

  const { error } = await admin
    .from('subscriptions')
    .update({ plan_id })
    .eq('tenant_id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from('audit_logs').insert({
    tenant_id: id,
    user_id: user.id,
    action: 'tenant.plan_change',
    metadata: {
      previous_plan_id: (prev as any)?.plan_id ?? null,
      previous_plan_name: (prev as any)?.plans?.name ?? null,
      new_plan_id: plan_id,
      new_plan_name: (newPlan as any)?.name ?? null,
    },
  });

  return NextResponse.redirect(new URL(`/super/tenants/${id}`, req.url));
}
