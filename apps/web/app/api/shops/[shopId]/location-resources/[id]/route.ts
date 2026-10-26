export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { resourceUpdateSchema } from '@/lib/validators/resources'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'
import {
  cleanResourceSessionMetadata,
  cancelOrphanedInProgressOrdersForResource,
  parseMetadataSafe,
} from '@/lib/server/tableSessionReconciler'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'pos.use')

    const row = await connector.findById('location-resources', id)
    if (!row || row.branch_id !== shopId) {
      return NextResponse.json({ error: 'Không tìm thấy bàn/phòng trong chi nhánh này.' }, { status: 404 })
    }
    return NextResponse.json(row, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  } catch (e) {
    return handleApiError(e, 'GET location-resource')
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'pos.use')

    // 1. Verify resource exists and belongs to the active branch
    const current = await connector.findById('location-resources', id)
    if (!current || current.branch_id !== shopId) {
      return NextResponse.json({ error: 'Không tìm thấy bàn/phòng trong chi nhánh này.' }, { status: 404 })
    }

    const body = await req.json()
    const data = resourceUpdateSchema.parse(body)

    // Force strict branch scoping on write
    data.branch_id = shopId

    // Self-healing metadata & session cleanup when releasing or occupying a table/room
    const isReleasing = data.status === 'available' || data.status === 'dirty' || data.status === 'cleaning'
    const isOccupying = data.status === 'occupied' || data.status === 'playing'

    if (isReleasing) {
      data.current_order_id = ''
      data.metadata = cleanResourceSessionMetadata(data.metadata ?? current.metadata, {
        last_checkout_time: new Date().toISOString(),
      })
    } else if (isOccupying && current.status !== 'occupied' && current.status !== 'playing') {
      const incomingMeta = parseMetadataSafe(data.metadata ?? current.metadata)
      if (!data.metadata || !incomingMeta.check_in) {
        const cleanedBase = parseMetadataSafe(cleanResourceSessionMetadata(current.metadata))
        data.metadata = JSON.stringify({
          ...cleanedBase,
          ...incomingMeta,
          check_in: incomingMeta.check_in || new Date().toISOString(),
        })
      }
    }

    const updated = await connector.update('location-resources', id, data)

    if (isReleasing) {
      await cancelOrphanedInProgressOrdersForResource(connector, shopId, id)
    }

    // Automatically complete active/pending QR sessions when table becomes available or enters cleaning
    if (data.status === 'available' || data.status === 'cleaning' || data.status === 'dirty') {
      try {
        const { getSupabaseAdminClient } = await import('@/lib/server/supabaseAdmin')
        const admin = getSupabaseAdminClient()
        await admin
          .from('qr_ordering_sessions')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('branch_id', shopId)
          .eq('resource_id', id)
          .in('status', ['active', 'pending'])
          .eq('active', 'TRUE')
      } catch (sessErr) {
         console.error('Failed to auto-complete QR session in resource PATCH:', sessErr)
      }
    }

    invalidate(shopId, 'location-resources')
    return NextResponse.json(updated)
  } catch (e) {
    return handleApiError(e, 'PATCH location-resources')
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'pos.use')

    // 1. Verify resource exists and belongs to the active branch
    const current = await connector.findById('location-resources', id)
    if (!current || current.branch_id !== shopId) {
      return NextResponse.json({ error: 'Không tìm thấy bàn/phòng trong chi nhánh này.' }, { status: 404 })
    }

    await connector.delete('location-resources', id)
    invalidate(shopId, 'location-resources')
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e, 'DELETE location-resources')
  }
}
