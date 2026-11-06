export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import {
  kitchenErrorResponse, listRoutes, listStations, replaceCategoryRoutes, requireKitchenConnector, routesReplaceSchema,
} from '@/lib/server/kitchen/stations'
import { handleApiError } from '../../../_helpers'

// Bar/Bếp K0 — category → station routing for one branch.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId)
    const tx = requireKitchenConnector(connector)
    const data = await listRoutes(tx, shopId)
    return NextResponse.json({ data })
  } catch (e) {
    return kitchenErrorResponse(e) ?? handleApiError(e, 'GET prep-stations/routes')
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'settings.manage')
    const tx = requireKitchenConnector(connector)
    const { categories } = routesReplaceSchema.parse(await req.json())

    const stations = await listStations(connector, shopId)
    const saved = await replaceCategoryRoutes(tx, shopId, categories, new Set(stations.map((s) => s.id)))
    return NextResponse.json({ saved })
  } catch (e) {
    return kitchenErrorResponse(e) ?? handleApiError(e, 'PUT prep-stations/routes')
  }
}
