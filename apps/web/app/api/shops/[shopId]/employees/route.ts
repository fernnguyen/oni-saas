import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { employeeCreateSchema } from '@/lib/validators/employees'
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

    const filters: Record<string, string> = {}
    const branch_id = sp.get('branch_id')
    if (branch_id) filters.branch_id = branch_id
    const role = sp.get('role')
    if (role) filters.role = role

    const result = await connector.list('employees', { page, limit, search, filters })
    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET employees')
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
    const data = employeeCreateSchema.parse(body)

    const created = await connector.create('employees', data)
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST employees')
  }
}
