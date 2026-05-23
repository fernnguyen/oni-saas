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
    const { connector } = await requireShopAccess(shopId, 'customers.view')

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
    
    if (id === 'C-DEFAULT-RETAIL') {
      return NextResponse.json({ error: 'Không thể sửa Khách lẻ mặc định' }, { status: 403 })
    }

    const { connector } = await requireShopAccess(shopId, 'customers.edit')

    const body = await req.json()
    const parsed = customerUpdateSchema.parse(body)

    // STRICT accounting integrity: prevent direct updates to accounting & CRM statistics via PUT
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { prepaid_balance, loyalty_points, debt_amount, ...data } = parsed

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
    
    if (id === 'C-DEFAULT-RETAIL') {
      return NextResponse.json({ error: 'Không thể xóa Khách lẻ mặc định' }, { status: 403 })
    }

    const { connector } = await requireShopAccess(shopId)

    await connector.delete('customers', id)
    invalidate(shopId, 'customers')
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return handleApiError(e, 'DELETE customer')
  }
}
