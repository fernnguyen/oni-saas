import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ slug: string; branch: string }>
}

export default async function ReportsIndexPage({ params }: Props) {
  const { slug, branch } = await params
  redirect(`/t/${slug}/${branch}/reports/overview`)
}
