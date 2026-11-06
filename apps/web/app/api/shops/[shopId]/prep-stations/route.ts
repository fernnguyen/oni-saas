export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import {
  clearOtherDefaults, kitchenErrorResponse, listStations, requireKitchenConnector, stationCreateSchema,
} from '@/lib/server/kitchen/stations'
import { getKitchenSettingsSafe } from '@/lib/server/kitchen/tickets'
import { handleApiError } from '../../_helpers'

// Bar/Bếp K0 — list / create prep stations (docs/KITCHEN-BAR-PLAN.md)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId)
    const tx = requireKitchenConnector(connector)
    const data = await listStations(connector, shopId)
    // `settings` lets clients pick their save flow (mobile: "Lưu & báo bếp" vs "Lưu vào bàn")
    return NextResponse.json({ data, settings: await getKitchenSettingsSafe(tx, shopId) })
  } catch (e) {
    return kitchenErrorResponse(e) ?? handleApiError(e, 'GET prep-stations')
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'settings.manage')
    requireKitchenConnector(connector)
    const body = stationCreateSchema.parse(await req.json())

    const existing = await listStations(connector, shopId)
    // The first station of a branch becomes the catch-all default automatically.
    const isDefault = existing.length === 0 ? 'TRUE' : (body.is_default ?? 'FALSE')
    const created = await connector.create('prep_stations', {
      branch_id: shopId,
      name: body.name,
      kind: body.kind,
      output: body.output,
      is_default: isDefault,
      sort_order: String(body.sort_order ?? existing.length),
    })
    if (isDefault === 'TRUE') await clearOtherDefaults(connector, shopId, created.id)
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return kitchenErrorResponse(e) ?? handleApiError(e, 'POST prep-stations')
  }
}
