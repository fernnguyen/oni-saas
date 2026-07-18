import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getTenantAndShopBySlugs } from '@/lib/server/shops'
import { WarehouseClient } from './WarehouseClient'

interface Props {
  params: Promise<{ slug: string; branch: string }>
}

export default async function WarehousesPage({ params }: Props) {
  const { slug, branch } = await params
  const supabase = await getSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`)
  }

  const { shop } = await getTenantAndShopBySlugs(slug, branch)
    
  if (!shop) notFound()

  return <WarehouseClient shopId={shop.id} shopName={shop.name} />
}
