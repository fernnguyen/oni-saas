import { redirect } from 'next/navigation';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { SignInForm } from '../../../../components/auth/SignInForm';

export default async function WorkspaceSignIn({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = getSupabaseAdminClient();

  const { data: tenant } = await admin
    .from('tenants')
    .select('name, slug, industry_type')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/');

  return (
    <SignInForm 
      tenantName={tenant.name} 
      tenantSlug={tenant.slug} 
      industryType={tenant.industry_type} 
    />
  );
}
