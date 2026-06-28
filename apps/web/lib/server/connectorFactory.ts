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

  // 2. Fetch the active connector and tenant's share_customers setting
  const [connectorResult, tenantResult] = await Promise.all([
    admin
      .from('connectors')
      .select('id, type, status, config')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .maybeSingle(),
    admin
      .from('tenants')
      .select('share_customers')
      .eq('id', tenantId)
      .maybeSingle()
  ])

  if (connectorResult.error) throw connectorResult.error
  if (tenantResult.error) throw tenantResult.error

  const connector = connectorResult.data
  if (!connector) {
    throw Object.assign(
      new Error('No active connector configured for this tenant'),
      { code: 'NO_CONNECTOR' },
    )
  }

  const shareCustomers = tenantResult.data?.share_customers ?? false

  // 3. Create the connector and inject both tenantId and branchId (shopId)
  return createConnector(
    connector.type,
    connector.config as Record<string, unknown>,
    connector.type === 'google_sheets' ? getServiceAccountToken : undefined,
    tenantId,
    shopId,
    shareCustomers,
  )
}

export async function getConnectorForTenant(tenantId: string): Promise<IDataConnector> {
  const admin = getSupabaseAdminClient()
  
  const [connectorResult, tenantResult] = await Promise.all([
    admin
      .from('connectors')
      .select('id, type, status, config')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .maybeSingle(),
    admin
      .from('tenants')
      .select('share_customers')
      .eq('id', tenantId)
      .maybeSingle()
  ])

  if (connectorResult.error) throw connectorResult.error
  if (tenantResult.error) throw tenantResult.error

  const connector = connectorResult.data
  if (!connector) {
    throw Object.assign(
      new Error('No active connector configured for this tenant'),
      { code: 'NO_CONNECTOR' },
    )
  }

  const shareCustomers = tenantResult.data?.share_customers ?? false

  // Create the connector without branchId (shopId)
  return createConnector(
    connector.type,
    connector.config as Record<string, unknown>,
    connector.type === 'google_sheets' ? getServiceAccountToken : undefined,
    tenantId,
    undefined, // No branchId -> global tenant scope
    shareCustomers,
  )
}
