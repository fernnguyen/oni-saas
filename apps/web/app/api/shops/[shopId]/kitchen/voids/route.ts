export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getGMT7Time } from '@oni/core'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { kitchenErrorResponse, requireKitchenConnector } from '@/lib/server/kitchen/stations'
import { listVoidReport } from '@/lib/server/kitchen/tickets'
import { handleApiError } from '../../../_helpers'

// Bar/Bếp — cancelled dishes report: GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (business dates, GMT+7;
// default today, max 93 days). Who may see it: shop reports or settings managers.
const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params
    const { connector, permissions } = await requireShopAccess(shopId)
    if (!['reports.view_shop', 'settings.manage', 'owner', 'admin'].some((p) => permissions.includes(p))) {
      return NextResponse.json({ error: 'Bạn không có quyền xem báo cáo huỷ món' }, { status: 403 })
    }
    const today = getGMT7Time().slice(0, 10)
    const sp = req.nextUrl.searchParams
    let from = sp.get('from') || today
    let to = sp.get('to') || from
    if (!DATE.test(from) || !DATE.test(to)) return NextResponse.json({ error: 'Ngày không hợp lệ' }, { status: 400 })
    if (from > to) [from, to] = [to, from]
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
    if (days > 93) return NextResponse.json({ error: 'Chỉ xem tối đa 3 tháng một lần' }, { status: 400 })
    return NextResponse.json({ from, to, ...(await listVoidReport(requireKitchenConnector(connector), shopId, { from, to })) })
  } catch (e) {
    return kitchenErrorResponse(e) ?? handleApiError(e, 'GET kitchen/voids')
  }
}
