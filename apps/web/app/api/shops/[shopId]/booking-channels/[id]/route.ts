export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.view')

    const row = await connector.findById('booking-channels', id)
    if (!row) return NextResponse.json({ error: 'Kênh đặt phòng không tồn tại' }, { status: 404 })

    return NextResponse.json(row)
  } catch (e) {
    return handleApiError(e, 'GET booking-channel')
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.edit')

    const body = await req.json()
    const original = await connector.findById('booking-channels', id)
    if (!original) return NextResponse.json({ error: 'Kênh đặt phòng không tồn tại' }, { status: 404 })

    const updated = await connector.update('booking-channels', id, {
      ...body,
      commission_rate: String(body.commission_rate ?? original.commission_rate ?? '0')
    })

    invalidate(shopId, 'booking-channels')
    return NextResponse.json(updated)
  } catch (e) {
    return handleApiError(e, 'PUT booking-channel')
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.edit')

    const channel = await connector.findById('booking-channels', id)
    if (!channel) return NextResponse.json({ error: 'Kênh đặt phòng không tồn tại' }, { status: 404 })

    const channelCode = channel.code || ''

    // 1. Check reservations links
    const linkedReservationsById = await connector.list('reservations', {
      filters: { channel_id: id, branch_id: shopId },
      limit: 1
    })
    const linkedReservationsByCode = channelCode ? await connector.list('reservations', {
      filters: { channel_id: channelCode, branch_id: shopId },
      limit: 1
    }) : { total: 0 }

    if (linkedReservationsById.total > 0 || linkedReservationsByCode.total > 0) {
      return NextResponse.json({ 
        error: 'Không thể xóa kênh đặt phòng này vì đang có phiếu Đặt phòng lưu trú liên kết!' 
      }, { status: 400 })
    }

    // 2. Check orders links
    const linkedOrdersById = await connector.list('orders', {
      filters: { booking_channel_id: id, branch_id: shopId },
      limit: 1
    })
    const linkedOrdersByCode = channelCode ? await connector.list('orders', {
      filters: { booking_channel_id: channelCode, branch_id: shopId },
      limit: 1
    }) : { total: 0 }

    if (linkedOrdersById.total > 0 || linkedOrdersByCode.total > 0) {
      return NextResponse.json({ 
        error: 'Không thể xóa kênh đặt phòng này vì đang có Đơn hàng/Hóa đơn liên kết!' 
      }, { status: 400 })
    }

    // 3. Check ota_bookings links
    const linkedOtaById = await connector.list('ota-bookings', {
      filters: { agency_id: id, branch_id: shopId },
      limit: 1
    })
    const linkedOtaByCode = channelCode ? await connector.list('ota-bookings', {
      filters: { agency_id: channelCode, branch_id: shopId },
      limit: 1
    }) : { total: 0 }

    if (linkedOtaById.total > 0 || linkedOtaByCode.total > 0) {
      return NextResponse.json({ 
        error: 'Không thể xóa kênh đặt phòng này vì đang có đối soát đại lý OTA liên kết!' 
      }, { status: 400 })
    }

    // Direct / direct is core default channel, protect it from deletion
    if (channelCode === 'direct') {
      return NextResponse.json({ 
        error: 'Không thể xóa kênh mặc định Lễ tân trực tiếp!' 
      }, { status: 400 })
    }

    await connector.delete('booking-channels', id)
    invalidate(shopId, 'booking-channels')
    
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return handleApiError(e, 'DELETE booking-channel')
  }
}
