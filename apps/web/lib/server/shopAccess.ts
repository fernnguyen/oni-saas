import type { IDataConnector } from '@oni/adapters'
import { getSupabaseServerClient } from './supabaseServer'
import { assertUserShopAccess } from './shops'
import { getConnectorForShop } from './connectorFactory'

export class ShopAccessError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ShopAccessError'
  }
}

export async function requireShopAccess(shopId: string): Promise<{
  userId: string
  connector: IDataConnector
}> {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    throw new ShopAccessError(401, 'Unauthorized')
  }

  const hasAccess = await assertUserShopAccess(data.user.id, shopId)
  if (!hasAccess) {
    throw new ShopAccessError(403, 'Forbidden: no access to this shop')
  }

  const connector = await getConnectorForShop(shopId)
  return { userId: data.user.id, connector }
}
