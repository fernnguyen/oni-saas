import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { employeeUpdateSchema } from '@/lib/validators/employees'
import { handleApiError } from '../../../_helpers'
import { invalidate } from '@/lib/server/cache'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId, 'pos.use')

    const row = await connector.findById('employees', id)
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return handleApiError(e, 'GET employee')
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
    const data = employeeUpdateSchema.parse(body)

    const updated = await connector.update('employees', id, data)
    invalidate(shopId, 'employees')
    return NextResponse.json(updated)
  } catch (e) {
    return handleApiError(e, 'PUT employee')
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId)

    await connector.delete('employees', id)
    invalidate(shopId, 'employees')
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return handleApiError(e, 'DELETE employee')
  }
}
