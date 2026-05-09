import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { returnUpdateSchema } from '@/lib/validators/returns'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId)

    const row = await connector.findById('returns', id)
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return handleApiError(e, 'GET return')
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
    const data = returnUpdateSchema.parse(body)

    const updated = await connector.update('returns', id, data)
    invalidate(shopId, 'returns')
    return NextResponse.json(updated)
  } catch (e) {
    return handleApiError(e, 'PUT return')
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { connector } = await requireShopAccess(shopId)

    const ret = await connector.findById('returns', id)
    if (ret) {
      const r = ret as Record<string, string>
      // Only allow deleting pending/rejected returns — processed ones have inventory impact
      if (r.status === 'processed') {
        return NextResponse.json(
          { error: 'Không thể xóa phiếu trả hàng đã xử lý. Hãy tạo phiếu điều chỉnh kho thay thế.' },
          { status: 409 }
        )
      }
    }

    await connector.delete('returns', id)
    invalidate(shopId, 'returns')
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return handleApiError(e, 'DELETE return')
  }
}
