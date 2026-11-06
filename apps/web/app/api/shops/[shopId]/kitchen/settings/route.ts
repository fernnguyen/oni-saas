export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { kitchenErrorResponse, requireKitchenConnector } from '@/lib/server/kitchen/stations'
import { kitchenSettingsSchema, saveKitchenSettings } from '@/lib/server/kitchen/settings'
import { getKitchenSettingsSafe } from '@/lib/server/kitchen/tickets'
import { handleApiError } from '../../../_helpers'

// Bar/Bếp — branch settings (auto send). Read: any POS user; write: settings.manage.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId)
    return NextResponse.json(await getKitchenSettingsSafe(requireKitchenConnector(connector), shopId))
  } catch (e) {
    return kitchenErrorResponse(e) ?? handleApiError(e, 'GET kitchen/settings')
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'settings.manage')
    const body = kitchenSettingsSchema.parse(await req.json())
    return NextResponse.json(await saveKitchenSettings(requireKitchenConnector(connector), shopId, body))
  } catch (e) {
    return kitchenErrorResponse(e) ?? handleApiError(e, 'PUT kitchen/settings')
  }
}
