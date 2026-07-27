import type { IDataConnector } from '@oni/adapters'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'

type OrderRow = Record<string, string>

function metadataOf(row: OrderRow): Record<string, unknown> {
  if (!row.metadata) return {}
  try {
    return typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
  } catch {
    return {}
  }
}

/**
 * employee_id is intentionally kept as the stable identifier used by orders.
 * This helper adds a display-only name without mutating the stored identifier.
 */
export async function withOrderEmployeeNames(
  connector: IDataConnector,
  tenantId: string,
  rows: OrderRow[]
): Promise<OrderRow[]> {
  if (!rows.length) return rows

  const identifiers = new Set(rows.map((row) => row.employee_id).filter(Boolean))
  if (!identifiers.size) {
    return rows.map((row) => ({ ...row, employee_name: 'Hệ thống' }))
  }

  const admin = getSupabaseAdminClient()
  const [{ data: profiles }, employeesResult] = await Promise.all([
    admin
      .from('tenant_user_profiles')
      .select('user_id, display_name, login_email')
      .eq('tenant_id', tenantId),
    connector.list('employees', { page: 1, limit: 1000 }).catch(() => ({ data: [], total: 0, page: 1, limit: 1000 })),
  ])

  const displayByIdentifier = new Map<string, string>()
  for (const profile of profiles || []) {
    const display = profile.display_name || profile.login_email
    if (!display) continue
    if (profile.user_id) displayByIdentifier.set(profile.user_id, display)
    if (profile.login_email) displayByIdentifier.set(profile.login_email, display)
  }
  for (const employee of employeesResult.data) {
    const display = employee.name || employee.employee_code
    if (!display) continue
    for (const identifier of [employee.id, employee.employee_id, employee.employee_code]) {
      if (identifier) displayByIdentifier.set(identifier, display)
    }
  }

  return rows.map((row) => {
    const metadata = metadataOf(row)
    const recordedName = typeof metadata.recorded_by_name === 'string' ? metadata.recorded_by_name : ''
    const recordedEmail = typeof metadata.recorded_by_email === 'string' ? metadata.recorded_by_email : ''
    const employeeName = displayByIdentifier.get(row.employee_id)
      || recordedName
      || recordedEmail
      || (row.employee_id?.includes('@') ? row.employee_id : '')
      || 'Nhân viên'

    return { ...row, employee_name: employeeName }
  })
}
