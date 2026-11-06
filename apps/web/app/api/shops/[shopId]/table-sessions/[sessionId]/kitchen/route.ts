import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { requireTableSyncV2 } from '@/lib/server/tableSync/service'
import { fireKitchenForSession, getSessionKitchenStatus } from '@/lib/server/kitchen/tickets'
import { tableSyncErrorResponse } from '../../_respond'

type Ctx = { params: Promise<{ shopId: string; sessionId: string }> }

// GET – kitchen state of a table: is Bar/Bếp on, how many lines are unsent, per-item sent/ready.
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { shopId, sessionId } = await params
    const { connector } = await requireShopAccess(shopId, 'pos.use')
    const tx = await requireTableSyncV2(shopId, connector)
    return NextResponse.json(await getSessionKitchenStatus(tx, shopId, sessionId))
  } catch (e) {
    return tableSyncErrorResponse(e, 'GET table-sessions/kitchen')
  }
}

// POST { batch_id?, device_id?, notes?: { [order_item_id]: note } } – "Gửi bếp": ticket everything
// still unsent for this table.
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { shopId, sessionId } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.create')
    const tx = await requireTableSyncV2(shopId, connector)
    const body = await req.json().catch(() => ({}))
    const tickets = await fireKitchenForSession(tx, shopId, sessionId, {
      deviceId: String(body?.device_id || ''),
      batchId: body?.batch_id ? String(body.batch_id) : undefined,
      notes: body?.notes && typeof body.notes === 'object' && !Array.isArray(body.notes)
        ? Object.fromEntries(Object.entries(body.notes as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]))
        : undefined,
    })
    return NextResponse.json({ tickets, status: await getSessionKitchenStatus(tx, shopId, sessionId) })
  } catch (e) {
    return tableSyncErrorResponse(e, 'POST table-sessions/kitchen')
  }
}
