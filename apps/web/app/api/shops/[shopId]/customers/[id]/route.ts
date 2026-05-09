import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { customerUpdateSchema } from '@/lib/validators/customers'
import { handleApiError } from '../../../_helpers'
import { invalidate } from '@/lib/server/cache'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId)

    const row = await connector.findById('customers', id)
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return handleApiError(e, 'GET customer')
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId)

    const body = await req.json()
    const data = customerUpdateSchema.parse(body)

    const updated = await connector.update('customers', id, data)
    invalidate(shopId, 'customers')
    return NextResponse.json(updated)
  } catch (e) {
    return handleApiError(e, 'PUT customer')
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId)

    await connector.delete('customers', id)
    invalidate(shopId, 'customers')
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return handleApiError(e, 'DELETE customer')
  }
}
