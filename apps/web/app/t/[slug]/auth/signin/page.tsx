import { redirect } from 'next/navigation';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { WorkspaceSignInForm } from '../../../../components/auth/WorkspaceSignInForm';

export default async function WorkspaceSignIn({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = getSupabaseAdminClient();

  const { data: tenant } = await admin
    .from('tenants')
    .select('name, slug')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/');

  return <WorkspaceSignInForm tenantName={tenant.name} tenantSlug={tenant.slug} />;
}
