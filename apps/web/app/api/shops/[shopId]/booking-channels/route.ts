export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../_helpers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.view')

    const result = await connector.list('booking-channels', {
      limit: 200,
      filters: { branch_id: shopId },
      sortDesc: false
    })

    // If no custom channels exist yet, let's auto-seed default ones to offer immediate plug-n-play
    if (result.total === 0) {
      const defaults = [
        { name: 'Lễ tân / Trực tiếp', code: 'direct', color: '#3b82f6', notes: 'Đặt trực tiếp tại quầy lễ tân' },
        { name: 'Booking.com', code: 'booking_com', color: '#1d4ed8', notes: 'Kênh OTA Booking.com' },
        { name: 'Agoda', code: 'agoda', color: '#8b5cf6', notes: 'Kênh OTA Agoda' },
        { name: 'Expedia', code: 'expedia', color: '#ec4899', notes: 'Kênh OTA Expedia' },
        { name: 'Đoàn lữ hành / Công ty', code: 'corporate', color: '#10b981', notes: 'Khách đoàn, công ty đối tác' }
      ]

      const seeded = []
      for (const item of defaults) {
        const created = await connector.create('booking-channels', {
          ...item,
          branch_id: shopId
        })
        seeded.push(created)
      }
      return NextResponse.json({ data: seeded, total: seeded.length, page: 1, limit: 200 })
    }

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET booking-channels')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, user } = await requireShopAccess(shopId, 'orders.create')

    const body = await req.json()
    const data = {
      ...body,
      branch_id: shopId,
      commission_rate: String(body.commission_rate || '0')
    }

    if (!data.name || !data.name.trim()) {
      return NextResponse.json({ error: 'Tên kênh đặt phòng không được để trống' }, { status: 400 })
    }

    if (!data.code || !data.code.trim()) {
      // Auto-generate code from name
      data.code = data.name.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/(^_+|_+$)/g, '')
    }

    // Check if code already exists
    const existing = await connector.list('booking-channels', {
      filters: { code: data.code, branch_id: shopId },
      limit: 1
    })

    if (existing.total > 0) {
      return NextResponse.json({ error: `Kênh với mã "${data.code}" đã tồn tại!` }, { status: 400 })
    }

    const created = await connector.create('booking-channels', data)
    invalidate(shopId, 'booking-channels')
    
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST booking-channels')
  }
}
