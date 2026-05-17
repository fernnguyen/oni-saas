import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'

/**
 * Switch the active connector for a tenant.
 * Deactivates the current connector and creates/activates a new one.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { tenant_id, type, config } = body as {
      tenant_id: string
      type: string
      config?: Record<string, unknown>
    }

    if (!tenant_id || !type) {
      return NextResponse.json({ message: 'tenant_id and type are required' }, { status: 400 })
    }

    const validTypes = ['postgres_local', 'postgres_remote', 'mysql_local', 'mysql_remote', 'google_sheets']
    if (!validTypes.includes(type)) {
      return NextResponse.json({ message: `Invalid type: ${type}` }, { status: 400 })
    }

    const admin = getSupabaseAdminClient()

    // Verify user has access to this tenant
    const { data: access } = await admin
      .from('user_tenants')
      .select('id, roles(code)')
      .eq('user_id', authData.user.id)
      .eq('tenant_id', tenant_id)
      .maybeSingle()

    if (!access) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const roleCode = Array.isArray((access as any).roles)
      ? (access as any).roles[0]?.code
      : (access as any).roles?.code
    if (roleCode !== 'owner' && roleCode !== 'admin') {
      return NextResponse.json({ message: 'Chỉ owner/admin mới được thay đổi' }, { status: 403 })
    }

    // Deactivate existing connectors
    await admin
      .from('connectors')
      .update({ status: 'inactive' })
      .eq('tenant_id', tenant_id)
      .eq('status', 'active')

    // Determine config
    const isSystem = type === 'postgres_local' || type === 'mysql_local'
    const connectorConfig: Record<string, unknown> = {
      is_system: isSystem,
      read_only: isSystem,
      worker_name: isSystem ? 'Database Hệ thống' : 'Database Riêng',
      ...(config ?? {}),
    }

    // Create new connector
    const { data: newConnector, error } = await admin
      .from('connectors')
      .insert({
        tenant_id,
        type,
        status: 'active',
        config: connectorConfig,
      })
      .select('id, type, status')
      .single()

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, connector: newConnector })
  } catch (e: any) {
    return NextResponse.json({ message: e?.message ?? 'Server error' }, { status: 500 })
  }
}
