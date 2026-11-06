export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import {
  clearOtherDefaults, deleteRoutesOfStation, kitchenErrorResponse, listStations, requireKitchenConnector,
  stationUpdateSchema,
} from '@/lib/server/kitchen/stations'
import { handleApiError } from '../../../_helpers'

type Ctx = { params: Promise<{ shopId: string; id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'settings.manage')
    requireKitchenConnector(connector)
    const body = stationUpdateSchema.parse(await req.json())

    const patch: Record<string, string> = {}
    if (body.name !== undefined) patch.name = body.name
    if (body.kind !== undefined) patch.kind = body.kind
    if (body.output !== undefined) patch.output = body.output
    if (body.sort_order !== undefined) patch.sort_order = String(body.sort_order)
    if (body.is_default !== undefined) {
      // Never leave a branch without a default once it has stations: unsetting is ignored,
      // the default moves only by setting another station as default.
      if (body.is_default === 'TRUE') patch.is_default = 'TRUE'
    }

    const updated = await connector.update('prep_stations', id, patch)
    if (patch.is_default === 'TRUE') await clearOtherDefaults(connector, shopId, id)
    return NextResponse.json(updated)
  } catch (e) {
    return kitchenErrorResponse(e) ?? handleApiError(e, 'PATCH prep-station')
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'settings.manage')
    const tx = requireKitchenConnector(connector)

    const before = await listStations(connector, shopId)
    const target = before.find((s) => s.id === id)
    if (!target) return NextResponse.json({ error: 'Không tìm thấy trạm' }, { status: 404 })

    await connector.delete('prep_stations', id)
    await deleteRoutesOfStation(tx, shopId, id)

    // Hand the default flag to the next station so unrouted items still have a home.
    if (target.is_default) {
      const next = before.find((s) => s.id !== id)
      if (next) {
        await connector.update('prep_stations', next.id, { is_default: 'TRUE' })
        await clearOtherDefaults(connector, shopId, next.id)
      }
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    return kitchenErrorResponse(e) ?? handleApiError(e, 'DELETE prep-station')
  }
}
