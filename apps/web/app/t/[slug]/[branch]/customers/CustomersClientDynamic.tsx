'use client'
import dynamic from 'next/dynamic'

export const CustomersClientDynamic = dynamic(
  () => import('./CustomersClient').then((mod) => mod.CustomersClient),
  { ssr: false }
)
