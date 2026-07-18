import { redirect, notFound } from 'next/navigation'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getTenantAndShopBySlugs } from '@/lib/server/shops'
import { DebtClientDynamic as DebtClient } from './DebtClientDynamic'
import { Suspense } from 'react'

interface Props {
  params: Promise<{ slug: string; branch: string }>
}

export default async function DebtPage({ params }: Props) {
  const { slug, branch } = await params
  const supabase = await getSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    redirect(`/auth/signin?next=${encodeURIComponent('/')}`)
  }

  const { shop } = await getTenantAndShopBySlugs(slug, branch)

  if (!shop) notFound()

  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Đang tải sổ nợ...</div>}>
      <DebtClient shopId={shop.id} shopName={shop.name} />
    </Suspense>
  )
}
