export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { getGMT7Time } from '@oni/core'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { handleApiError } from '../../../../_helpers'

// Generate the last 12 calendar months in GMT+7 for display
function generateRecentMonths() {
  const months = []
  const now = new Date()
  // Adjust to GMT+7 to avoid timezone mismatch
  now.setUTCHours(now.getUTCHours() + 7)
  
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    
    // Start and End dates of the month
    const start_date = `${year}-${month}-01`
    const lastDay = new Date(year, d.getMonth() + 1, 0).getDate()
    const end_date = `${year}-${month}-${String(lastDay).padStart(2, '0')}`
    const period_name = `Tháng ${month}/${year}`
    
    months.push({
      period_name,
      start_date,
      end_date,
      key: `${year}-${month}`,
    })
  }
  return months
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'settings.view')

    // 1. Fetch locked periods from db
    const lockedRes = await connector.list('tax-locked-periods', {
      filters: { branch_id: shopId },
      limit: 200,
    })
    const dbPeriods = lockedRes.data as Array<{
      period_name: string
      start_date: string
      end_date: string
      status: string
      locked_at?: string
      locked_by?: string
    }>

    const dbMap = new Map<string, typeof dbPeriods[0]>()
    for (const p of dbPeriods) {
      dbMap.set(p.period_name, p)
    }

    // 2. Generate last 12 months and merge with DB records
    const recentMonths = generateRecentMonths()
    const result = recentMonths.map((m) => {
      const dbRecord = dbMap.get(m.period_name)
      return {
        ...m,
        id: dbRecord ? (dbRecord as any).id || (dbRecord as any).period_id : null,
        status: dbRecord?.status || 'unlocked',
        locked_at: dbRecord?.locked_at || null,
        locked_by: dbRecord?.locked_by || null,
      }
    })

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET tax lockdown')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, shop, user } = await requireShopAccess(shopId, 'settings.manage')

    const body = await req.json()
    const { period_name, start_date, end_date, action, reason } = body

    if (!period_name || !start_date || !end_date || !action) {
      return NextResponse.json(
        { error: 'Thiếu thông tin kỳ thuế hoặc hành động!' },
        { status: 400 }
      )
    }

    if (action !== 'lock' && action !== 'unlock') {
      return NextResponse.json({ error: 'Hành động không hợp lệ!' }, { status: 400 })
    }

    // Find existing lock record
    const lockedRes = await connector.list('tax-locked-periods', {
      filters: { branch_id: shopId, period_name },
      limit: 1,
    })
    const existing = lockedRes.data[0]

    const nowStr = getGMT7Time()
    const operatorEmail = user.email || 'System'

    if (action === 'lock') {
      if (existing) {
        await connector.update('tax-locked-periods', existing.id, {
          status: 'locked',
          locked_at: nowStr,
          locked_by: operatorEmail,
        })
      } else {
        await connector.create('tax-locked-periods', {
          branch_id: shopId,
          period_name,
          start_date,
          end_date,
          status: 'locked',
          locked_at: nowStr,
          locked_by: operatorEmail,
        })
      }
    } else {
      // action === 'unlock'
      if (!reason || reason.trim() === '') {
        return NextResponse.json(
          { error: 'Bắt buộc phải nhập lý do giải trình khi mở khóa!' },
          { status: 400 }
        )
      }

      if (existing) {
        await connector.update('tax-locked-periods', existing.id, {
          status: 'unlocked',
          locked_at: nowStr,
          locked_by: operatorEmail,
        })
      } else {
        await connector.create('tax-locked-periods', {
          branch_id: shopId,
          period_name,
          start_date,
          end_date,
          status: 'unlocked',
          locked_at: nowStr,
          locked_by: operatorEmail,
        })
      }

      // Log audit trail to Supabase
      const admin = getSupabaseAdminClient()
      await admin.from('audit_logs').insert({
        tenant_id: shop.tenant_id,
        shop_id: shop.id,
        user_id: user.id,
        action: 'tax.unlock',
        metadata: {
          period_name,
          start_date,
          end_date,
          reason: reason.trim(),
          operator: operatorEmail,
        },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e, 'POST tax lockdown')
  }
}
