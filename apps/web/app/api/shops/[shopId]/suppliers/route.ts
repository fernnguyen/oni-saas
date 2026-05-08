import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { supplierCreateSchema } from '@/lib/validators/suppliers'
import { handleApiError } from '../../_helpers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId)

    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50')))
    const search = sp.get('search') ?? undefined

    const result = await connector.list('suppliers', { page, limit, search })
    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET suppliers')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId)

    const body = await req.json()
    const data = supplierCreateSchema.parse(body)

    const created = await connector.create('suppliers', data)
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST suppliers')
  }
}
