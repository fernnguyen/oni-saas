import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { supplierUpdateSchema } from '@/lib/validators/suppliers'
import { handleApiError } from '../../../_helpers'
import { invalidate } from '@/lib/server/cache'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId)

    const row = await connector.findById('suppliers', id)
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return handleApiError(e, 'GET supplier')
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
    const data = supplierUpdateSchema.parse(body)

    const updated = await connector.update('suppliers', id, data)
    invalidate(shopId, 'suppliers')
    return NextResponse.json(updated)
  } catch (e) {
    return handleApiError(e, 'PUT supplier')
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId)

    await connector.delete('suppliers', id)
    invalidate(shopId, 'suppliers')
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return handleApiError(e, 'DELETE supplier')
  }
}
