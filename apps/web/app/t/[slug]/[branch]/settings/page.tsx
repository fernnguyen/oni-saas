import { redirect, notFound } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getUserPermissions } from '@/lib/server/permissions';
import { ShopSettingsForm } from '@/app/components/settings/ShopSettingsForm';
import { PermissionGate } from '@/app/components/ui/PermissionGate';

interface Props {
  params: Promise<{ slug: string; branch: string }>;
}

export default async function BranchSettingsPage({ params }: Props) {
  const { slug, branch } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`);
  }

  const admin = getSupabaseAdminClient();
  const { data: shop } = await admin
    .from('shops_view')
    .select('id, name, slug, address, tenant_id')
    .eq('slug', branch)
    .maybeSingle();

  if (!shop) notFound();
  const permissions: string[] = await getUserPermissions(authData.user.id, shop.tenant_id, shop.id).catch(() => []);
  if (!permissions.includes('settings.view')) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Cài đặt chi nhánh</h1>
        </div>
        <PermissionGate />
      </div>
    );
  }
  const shopId: string = shop.id;

  const [settingsResult] = await Promise.all([
    admin.from('shop_settings').select('*').eq('shop_id', shopId).maybeSingle(),
  ]);

  const canManage =
    permissions.includes('settings.manage');

  const defaultSettings = {
    shop_id: shopId,
    shop_name: shop.name as string,
    currency: 'VND',
    timezone: 'Asia/Ho_Chi_Minh',
    tax_rate: 0,
    invoice_prefix: 'ORD',
    low_stock_threshold: 5,
    allow_negative_stock: false,
    default_price_type: 'retail',
    synced_from_sheet_at: null as string | null,
    updated_at: new Date().toISOString(),
  };

  const settings = settingsResult.data ?? defaultSettings;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{shop.name}</div>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Cài đặt chi nhánh</h1>
        <p className="text-sm text-slate-500 mt-0.5">Cấu hình thông tin chi nhánh và bán hàng</p>
      </div>
      <ShopSettingsForm
        shop={{ id: shopId, name: shop.name, slug: shop.slug, address: shop.address ?? null }}
        settings={settings}
        canManage={canManage}
      />
    </div>
  );
}
