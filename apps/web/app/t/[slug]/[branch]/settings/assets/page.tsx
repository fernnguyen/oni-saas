import { redirect, notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getUserPermissions } from '@/lib/server/permissions';
import { AssetsClient } from './AssetsClient';

interface Props {
  params: Promise<{ slug: string; branch: string }>;
}

export default async function AssetsSettingsPage({ params }: Props) {
  const { slug, branch } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`);
  }

  const admin = getSupabaseAdminClient();
  const { data: shop } = await admin
    .from('shops_view')
    .select('id, name, tenant_id')
    .eq('slug', branch)
    .maybeSingle();

  if (!shop) notFound();

  const permissions = await getUserPermissions(authData.user.id, shop.tenant_id, shop.id).catch(() => [] as string[]);
  
  // Gate check
  const hasViewAccess =
    permissions.includes('assets.view') ||
    permissions.includes('settings.view') ||
    permissions.includes('settings.manage') ||
    permissions.includes('owner') ||
    permissions.includes('admin');

  if (!hasViewAccess) {
    notFound();
  }

  const canManage =
    permissions.includes('assets.manage') ||
    permissions.includes('settings.manage') ||
    permissions.includes('owner') ||
    permissions.includes('admin');

  return (
    <AssetsClient
      shopId={shop.id}
      shopName={shop.name}
      canManage={canManage}
    />
  );
}
