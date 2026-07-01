import { getSuperAdminUser } from '@/lib/server/auth';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { redirect } from 'next/navigation';
import MigrateClient from './MigrateClient';

export default async function MigrateImagesPage() {
  const user = await getSuperAdminUser();
  if (!user) redirect('/admin-login');

  const admin = getSupabaseAdminClient();
  
  // Fetch all tenants
  const { data: tenants = [] } = await admin
    .from('tenants')
    .select('id, name, slug')
    .order('name');
    
  // Fetch all shops
  const { data: shops = [] } = await admin
    .from('shops')
    .select('id, name, tenant_id, slug')
    .order('name');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Migrate Hình Ảnh Sản Phẩm (S2)</h1>
        <p className="text-sm text-slate-500 mt-1">
          Quét các sản phẩm có hình ảnh từ hệ thống khác (KiotViet, Sapo,...) và tự động upload sang Cloudflare S2 của ONI.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <MigrateClient tenants={tenants || []} shops={shops || []} />
      </div>
    </div>
  );
}
