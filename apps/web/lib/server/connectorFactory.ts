import { createConnector, IDataConnector } from '@oni/adapters'
import { getSupabaseAdminClient } from './supabaseAdmin'
import { getServiceAccountToken } from './googleServiceAccount'

export async function getConnectorForShop(shopId: string, preFetchedTenantId?: string): Promise<IDataConnector> {
  const admin = getSupabaseAdminClient()
  
  // 1. First get the tenant_id for this shop if not provided
  let tenantId = preFetchedTenantId;
  if (!tenantId) {
    const { data: shop, error: shopError } = await admin
      .from('shops')
      .select('tenant_id')
      .eq('id', shopId)
      .single()
      
    if (shopError) throw shopError
    tenantId = shop.tenant_id
  }

  // 2. Fetch the active connector for this tenant
  const { data: connector, error } = await admin
    .from('connectors')
    .select('id, type, status, config')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) throw error
  if (!connector) {
    throw Object.assign(
      new Error('No active connector configured for this tenant'),
      { code: 'NO_CONNECTOR' },
    )
  }

  // 3. Create the connector and inject both tenantId and branchId (shopId)
  return createConnector(
    connector.type,
    connector.config as Record<string, unknown>,
    connector.type === 'google_sheets' ? getServiceAccountToken : undefined,
    tenantId,
    shopId,
  )
}
