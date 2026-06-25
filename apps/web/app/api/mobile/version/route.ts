import { NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'

// Ensure this route is dynamic and public
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient()
    const { data } = await supabase
      .from('system_settings')
      .select('config')
      .eq('id', 'global')
      .single()

    const config = data?.config || {}
    const mobileVersion = config.mobile_version || {
      ios: { min_version: '1.0.0', latest_version: '1.0.0', store_url: '' },
      android: { min_version: '1.0.0', latest_version: '1.0.0', store_url: '' },
      ota_enabled: true
    }

    // Configure CORS so mobile app can fetch without issues
    return NextResponse.json(mobileVersion, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
      }
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch mobile version' },
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
