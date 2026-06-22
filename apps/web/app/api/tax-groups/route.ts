import { NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { unstable_cache } from 'next/cache'

export const dynamic = 'force-dynamic'

// Caching global system tax groups for 2 hours (7200 seconds)
export const getSystemTaxGroupsCached = unstable_cache(
  async () => {
    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('system_tax_groups')
      .select('id, code, name, vat_rate, pit_rate, active')
      .eq('active', true)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching system tax groups from Supabase:', error)
      return []
    }
    return data || []
  },
  ['system_tax_groups_active'],
  { tags: ['system_tax_groups'], revalidate: 7200 }
)

export async function GET() {
  try {
    const taxGroups = await getSystemTaxGroupsCached()
    return NextResponse.json({ ok: true, data: taxGroups })
  } catch (err: any) {
    console.error('API /api/tax-groups failed:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
