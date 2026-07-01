import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { getUserPermissions } from '@/lib/server/permissions'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { PermissionGate } from '@/app/components/ui/PermissionGate'
import { getTimeChargeProductId } from '@oni/core'
import { TaxSettingsClient } from './TaxSettingsClient'

interface Props {
  params: Promise<{ slug: string; branch: string }>
}

export default async function TaxSettingsPage({ params }: Props) {
  const { slug, branch } = await params
  const supabase = await getSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`)
  }

  const admin = getSupabaseAdminClient()
  const { data: shop } = await admin
    .from('shops_view')
    .select('id, name, slug, address, tenant_id, industry_type')
    .eq('slug', branch)
    .maybeSingle()

  if (!shop) notFound()

  const permissions: string[] = await getUserPermissions(
    authData.user.id,
    shop.tenant_id,
    shop.id
  ).catch(() => [] as string[])

  if (!permissions.includes('settings.view') && !permissions.includes('settings.manage')) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Cấu hình Thuế</h1>
        </div>
        <PermissionGate />
      </div>
    )
  }

  const { connector } = await requireShopAccess(shop.id, 'settings.view')

  // Fetch categories and products for mapping
  const [categoriesRes, productsRes] = await Promise.all([
    connector.list('categories', { limit: 200, filters: { active: 'TRUE' } }),
    connector.list('products', { limit: 5000 }), // remove active filter to get hidden/system products
  ])

  // Self-healing for missing Time Charge product
  const resolvedIndustry = shop.industry_type ?? 'retail';
  const prodId = getTimeChargeProductId(resolvedIndustry);
  const timeChargeProductExists = (productsRes.data as any[]).some(
    p => p.product_id === prodId || p.id === prodId
  );

  if (!timeChargeProductExists) {
    try {
      const newProduct = {
        id: prodId,
        product_id: prodId,
        sku: prodId,
        name: resolvedIndustry === 'billiards' 
          ? 'Dịch vụ tiền giờ Billiards (Hệ thống)' 
          : resolvedIndustry === 'lodging'
          ? 'Dịch vụ tiền phòng (Hệ thống)'
          : 'Dịch vụ tiền giờ (Hệ thống)',
        active: 'TRUE',
        sell_price: '0',
        cost_price: '0',
        tax_rate: '0',
        input_tax_rate: '0',
        tax_group: '',
        product_type: 'service',
        branch_id: shop.id
      };
      await connector.create('products', newProduct);
      // Re-fetch products
      const newProductsRes = await connector.list('products', { limit: 5000 });
      productsRes.data = newProductsRes.data;
    } catch (err) {
      console.error('Failed to self-heal TIME_CHARGE product:', err);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
          {shop.name}
        </div>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Thiết lập Thuế & Khóa sổ</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Cấu hình nhóm ngành thuế HKD, thuế suất, và quản lý các kỳ khóa sổ kế toán.
        </p>
      </div>

      <TaxSettingsClient
        shopId={shop.id}
        slug={slug}
        branch={branch}
        categories={categoriesRes.data as any}
        products={productsRes.data as any}
        permissions={permissions}
        industryType={shop.industry_type ?? 'retail'}
      />
    </div>
  )
}
