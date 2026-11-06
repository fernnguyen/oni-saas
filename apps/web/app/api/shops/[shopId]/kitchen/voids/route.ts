export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getGMT7Time } from '@oni/core'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { kitchenErrorResponse, requireKitchenConnector } from '@/lib/server/kitchen/stations'
import { listVoidReport, summariseByActor } from '@/lib/server/kitchen/tickets'
import { handleApiError } from '../../../_helpers'

// Bar/Bếp — cancelled dishes report: GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (business dates, GMT+7;
// default today, max 93 days). Who may see it: shop reports or settings managers.
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Current display names of the tenant's users (the record keeps a snapshot as fallback). */
async function currentNames(tenantId: string, userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  if (!tenantId || userIds.length === 0) return names
  try {
    const { data } = await getSupabaseAdminClient()
      .from('tenant_user_profiles')
      .select('user_id, display_name, login_email')
      .eq('tenant_id', tenantId)
      .in('user_id', userIds)
    for (const p of data || []) {
      const name = String(p.display_name || p.login_email || '').trim()
      if (p.user_id && name) names.set(String(p.user_id), name)
    }
  } catch {
    /* names are display-only: keep the snapshots */
  }
  return names
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params
    const { connector, permissions, shop } = await requireShopAccess(shopId)
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

    const report = await listVoidReport(requireKitchenConnector(connector), shopId, { from, to })
    const ids = [...new Set(report.lines.flatMap((l) => [l.cancelled_by_user, l.answered_by_user]).filter(Boolean))]
    const names = await currentNames(String(shop?.tenant_id || ''), ids)
    const lines = report.lines.map((l) => ({
      ...l,
      cancelled_by_name: names.get(l.cancelled_by_user) || l.cancelled_by_name,
      answered_by_name: names.get(l.answered_by_user) || l.answered_by_name,
    }))
    return NextResponse.json({ from, to, lines, totals: report.totals, by_actor: summariseByActor(lines) })
  } catch (e) {
    return kitchenErrorResponse(e) ?? handleApiError(e, 'GET kitchen/voids')
  }
}
