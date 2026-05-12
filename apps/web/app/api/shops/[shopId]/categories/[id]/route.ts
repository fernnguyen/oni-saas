import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { categoryUpdateSchema } from '@/lib/validators/categories'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'products.view')

    const row = await connector.findById('categories', id)
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return handleApiError(e, 'GET category')
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'products.edit')

    const body = await req.json()
    const data = categoryUpdateSchema.parse(body)

    const updated = await connector.update('categories', id, data)
    invalidate(shopId, 'categories')
    return NextResponse.json(updated)
  } catch (e) {
    return handleApiError(e, 'PUT category')
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'products.delete')

    await connector.delete('categories', id)
    invalidate(shopId, 'categories')
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return handleApiError(e, 'DELETE category')
  }
}
