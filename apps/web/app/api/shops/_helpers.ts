import { NextResponse } from 'next/server'
import { ShopAccessError } from '@/lib/server/shopAccess'
import { ZodError } from 'zod'

export function handleApiError(e: unknown, label: string): NextResponse {
  if (e instanceof ShopAccessError) {
    return NextResponse.json({ error: e.message }, { status: e.status })
  }
  if (e instanceof ZodError) {
    return NextResponse.json({ error: 'Validation error', details: e.errors }, { status: 400 })
  }
  if ((e as { code?: string })?.code === 'NO_CONNECTOR') {
    return NextResponse.json(
      { error: 'No active connector configured for this shop. Go to Settings > Connector to set one up.' },
      { status: 422 }
    )
  }
  console.error(`[${label}]`, e)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
