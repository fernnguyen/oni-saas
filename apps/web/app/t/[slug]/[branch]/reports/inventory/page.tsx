import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getTenantAndShopBySlugs } from '@/lib/server/shops'
import { Suspense } from 'react'
import { PageHeader } from '@/app/components/ui/PageHeader'
import { InventoryReportClient } from './InventoryReportClient'

export default async function InventoryReportPage({
  params,
}: {
  params: Promise<{ slug: string; branch: string }>
}) {
  const { slug, branch } = await params
  const supabase = await getSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`)
  }

  const { shop } = await getTenantAndShopBySlugs(slug, branch)

  if (!shop) notFound()

  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <PageHeader title="Báo cáo kho" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        </div>
      }
    >
      <InventoryReportClient shopId={shop.id} />
    </Suspense>
  )
}
