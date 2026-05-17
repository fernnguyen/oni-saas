import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { resourceUpdateSchema } from '@/lib/validators/resources'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'pos.use')

    const body = await req.json()
    const data = resourceUpdateSchema.parse(body)

    const updated = await connector.update('location-resources', id, data)
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

    await connector.delete('location-resources', id)
    invalidate(shopId, 'location-resources')
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e, 'DELETE location-resources')
  }
}
