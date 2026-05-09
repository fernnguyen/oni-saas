import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { TwoFactorForm } from '@/app/components/auth/TwoFactorForm';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ next?: string }>;
}

export default async function TwoFactorPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { next = '/' } = await searchParams;

  const admin = getSupabaseAdminClient();
  const { data: tenant } = await admin
    .from('tenants')
    .select('name, slug')
    .eq('slug', slug)
    .single();

  if (!tenant) redirect('/auth/signin');

  // Ensure user is logged in (AAL1) — if not, redirect to sign in
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/signin');

  // If already AAL2, skip straight to destination
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalData?.currentLevel === 'aal2') redirect(next);

  return (
    <TwoFactorForm
      tenantName={tenant.name}
      tenantSlug={tenant.slug}
      next={next}
    />
  );
}
