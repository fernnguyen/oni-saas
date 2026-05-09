'use client'
import dynamic from 'next/dynamic'

export const POSClientDynamic = dynamic(
  () => import('./POSClient').then((m) => m.POSClient),
  { ssr: false }
)
