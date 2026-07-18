import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getTenantAndShopBySlugs } from '@/lib/server/shops'
import { SuppliersClient } from './SuppliersClient'

interface Props {
  params: Promise<{ slug: string; branch: string }>
}

export default async function SuppliersPage({ params }: Props) {
  const { slug, branch } = await params
  const supabase = await getSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`)
  }

  const { shop } = await getTenantAndShopBySlugs(slug, branch)
    
  if (!shop) notFound()

  return <SuppliersClient shopId={shop.id} shopName={shop.name} />
}
