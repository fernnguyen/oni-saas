import { NextRequest, NextResponse } from 'next/server'
import { getSuperAdminUser } from '@/lib/server/auth'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'

export async function POST(req: NextRequest) {
  try {
    const user = await getSuperAdminUser()
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const admin = getSupabaseAdminClient()
    const body = await req.json()
    const { tenant_id, type } = body as { tenant_id: string; type: string }

    if (!tenant_id || !type) {
      return NextResponse.json({ message: 'tenant_id and type required' }, { status: 400 })
    }

    // Deactivate existing
    await admin
      .from('connectors')
      .update({ status: 'inactive' })
      .eq('tenant_id', tenant_id)
      .eq('status', 'active')

    // Create new
    const isSystem = type === 'postgres_local' || type === 'mysql_local'
    const { error } = await admin.from('connectors').insert({
      tenant_id,
      type,
      status: 'active',
      config: {
        is_system: isSystem,
        read_only: isSystem,
        worker_name: isSystem ? 'Database Hệ thống' : 'Database Riêng',
      },
    })

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ message: e?.message ?? 'Server error' }, { status: 500 })
  }
}
