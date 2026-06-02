export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

function getGMT7Time() {
  const d = new Date()
  d.setUTCHours(d.getUTCHours() + 7)
  return d.toISOString().replace('Z', '')
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.view')

    const row = await connector.findById('reservations', id)
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return handleApiError(e, 'GET reservation')
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector, user } = await requireShopAccess(shopId, 'orders.edit')

    const body = await req.json()
    
    // Fetch original reservation to check status transition
    const original = await connector.findById('reservations', id)
    if (!original) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Check if transitioning to 'checked_in'
    if (body.status === 'checked_in' && original.status !== 'checked_in') {
      const roomResourceId = body.resource_id || original.resource_id
      if (!roomResourceId) {
        return NextResponse.json({ error: 'Vui lòng gán phòng cụ thể trước khi Check-in!' }, { status: 400 })
      }

      // 1. Fetch room resource details
      const room = await connector.findById('location-resources', roomResourceId)
      if (!room) return NextResponse.json({ error: 'Phòng không tồn tại' }, { status: 400 })
      if (room.status === 'occupied') {
        return NextResponse.json({ error: `Phòng ${room.name} đang có khách ở, không thể check-in!` }, { status: 400 })
      }

      // 2. Generate new Order for POS/Checkout
      const orderNoSeq = 'ORD-' + Date.now()
      const orderMeta = {
        reservation_id: id,
        check_in: getGMT7Time(),
        expected_checkout: body.expected_checkout || original.expected_checkout,
        booking_channel_id: body.channel_id || original.channel_id,
        ota_booking_code: body.ota_booking_code || original.ota_booking_code,
        deposit_amount: body.deposit_amount || original.deposit_amount || '0',
        customer_phone: body.customer_phone || original.customer_phone || '',
        num_guests: String(body.num_guests || original.num_guests || '1'),
        rental_type: body.rental_type || 'daily', // default daily
        daily_rate: body.daily_rate || original.daily_rate || room.hourly_rate || '0'
      }

      const createdOrder = await connector.create('orders', {
        status: 'in_progress',
        order_no: orderNoSeq,
        customer_id: body.customer_id || original.customer_id,
        customer_name: body.customer_name || original.customer_name || 'Khách lẻ',
        branch_id: shopId,
        employee_id: user.email || 'system',
        subtotal: '0',
        discount_amount: '0',
        total_amount: '0',
        paid_amount: '0',
        resource_id: roomResourceId,
        booking_channel_id: body.channel_id || original.channel_id || 'direct',
        metadata: JSON.stringify(orderMeta)
      })

      // 3. Mark the room resource as occupied
      await connector.update('location-resources', roomResourceId, {
        status: 'occupied',
        current_order_id: createdOrder.id
      })

      body.resource_id = roomResourceId
      invalidate(shopId, 'location-resources')
      invalidate(shopId, 'orders')
    }

    const updated = await connector.update('reservations', id, body)
    invalidate(shopId, 'reservations')
    
    return NextResponse.json(updated)
  } catch (e) {
    return handleApiError(e, 'PUT reservation')
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.edit')

    await connector.delete('reservations', id)
    invalidate(shopId, 'reservations')
    
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return handleApiError(e, 'DELETE reservation')
  }
}
