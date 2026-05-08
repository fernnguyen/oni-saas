import { createConnector, IDataConnector } from '@oni/adapters'
import { getSupabaseAdminClient } from './supabaseAdmin'
import { getServiceAccountToken } from './googleServiceAccount'

export async function getConnectorForShop(shopId: string): Promise<IDataConnector> {
  const admin = getSupabaseAdminClient()
  const { data: connector, error } = await admin
    .from('connectors')
    .select('id, type, status, config')
    .eq('shop_id', shopId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) throw error
  if (!connector) {
    throw Object.assign(
      new Error('No active connector configured for this shop'),
      { code: 'NO_CONNECTOR' },
    )
  }

  return createConnector(
    connector.type,
    connector.config as Record<string, unknown>,
    connector.type === 'google_sheets' ? getServiceAccountToken : undefined,
  )
}
