import type { IDataConnector } from '@oni/adapters'
import { getSupabaseServerClient } from './supabaseServer'
import { assertUserShopAccess } from './shops'
import { getConnectorForShop } from './connectorFactory'
import { getUserPermissions } from './permissions'
import { getSupabaseAdminClient } from './supabaseAdmin'
import type { User } from '@supabase/supabase-js'

export class ShopAccessError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ShopAccessError'
  }
}

export async function requireShopAccess(shopId: string, requiredPermission?: string | string[]): Promise<{
  userId: string
  connector: IDataConnector
  permissions: string[]
  shop: any
  user: User
}> {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    throw new ShopAccessError(401, 'Unauthorized')
  }

  const admin = getSupabaseAdminClient()
  const { data: shop } = await admin.from('shops').select('*').eq('id', shopId).single()
  
  if (!shop) {
    throw new ShopAccessError(404, 'Shop not found')
  }

  const [hasAccess, permissions, connector] = await Promise.all([
    assertUserShopAccess(data.user.id, shopId, shop),
    getUserPermissions(data.user.id, shop.tenant_id, shopId),
    getConnectorForShop(shopId, shop.tenant_id)
  ])

  if (!hasAccess) {
    throw new ShopAccessError(403, 'Forbidden: no access to this shop')
  }

  if (requiredPermission) {
    const perms = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission]
    const hasAll = perms.every(p => permissions.includes(p))
    if (!hasAll) {
      throw new ShopAccessError(403, 'Bạn không có quyền thực hiện tính năng này. Vui lòng liên hệ người quản trị.')
    }
  }

  return { userId: data.user.id, connector, permissions, shop, user: data.user }
}
