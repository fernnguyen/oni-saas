'use client'
import dynamic from 'next/dynamic'

export const DebtClientDynamic = dynamic(
  () => import('./DebtClient').then((mod) => mod.DebtClient),
  { ssr: false }
)
