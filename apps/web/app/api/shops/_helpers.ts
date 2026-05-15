import { NextResponse } from 'next/server'
import { ShopAccessError } from '@/lib/server/shopAccess'
import { ZodError } from 'zod'
import * as Sentry from '@sentry/nextjs'

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

  // Fire and forget: check global debug flag before sending to Sentry
  ;(async () => {
    try {
      const { createServerClient } = await import('@oni/core')
      const { unstable_cache } = await import('next/cache')
      
      const getSentryFlag = unstable_cache(
        async () => {
          const supabase = await createServerClient()
          const { data } = await supabase
            .from('system_settings')
            .select('config')
            .eq('id', 'global')
            .single()
          return data?.config?.enable_sentry_debug ?? false
        },
        ['system_settings_global'],
        { tags: ['system_settings'], revalidate: 3600 }
      )
      
      const enabled = await getSentryFlag()
      if (enabled) {
        Sentry.captureException(e, { extra: { context: label } })
      }
    } catch (err) {
      console.error('Failed to check Sentry flag or capture exception:', err)
    }
  })()

  const message = e instanceof Error ? e.message : String(e)
  return NextResponse.json({ error: message, details: e }, { status: 500 })
}
