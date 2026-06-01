import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, user, permissions } = await requireShopAccess(shopId, 'customers.edit')

    // 1. Role-based check: Only owner or admin roles can merge
    const admin = getSupabaseAdminClient()
    const { data: userTenant } = await admin
      .from('user_tenants')
      .select('roles(code)')
      .eq('user_id', user.id)
      .maybeSingle()
    
    const roleCode = Array.isArray((userTenant as any)?.roles)
      ? (userTenant as any).roles[0]?.code
      : (userTenant as any).roles?.code

    if (roleCode !== 'owner' && roleCode !== 'admin') {
      return NextResponse.json(
        { error: 'Chỉ chủ sở hữu (owner) hoặc quản trị viên (admin) mới có quyền gộp khách hàng.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { primary_id, duplicate_id } = body as { primary_id: string; duplicate_id: string }

    if (!primary_id || !duplicate_id) {
      return NextResponse.json({ error: 'Thiếu thông tin khách hàng gộp' }, { status: 400 })
    }
    if (primary_id === duplicate_id) {
      return NextResponse.json({ error: 'Không thể gộp chính khách hàng đó' }, { status: 400 })
    }

    // 2. Fetch both profiles
    const primary = await connector.findById('customers', primary_id)
    const duplicate = await connector.findById('customers', duplicate_id)

    if (!primary || !duplicate) {
      return NextResponse.json({ error: 'Không tìm thấy khách hàng' }, { status: 404 })
    }

    // Make sure duplicate is not already merged
    let dupMeta: any = duplicate.metadata
    if (typeof dupMeta === 'string') {
      try { dupMeta = JSON.parse(dupMeta) } catch (e) {}
    }
    if (dupMeta?.merged_into_id) {
      return NextResponse.json({ error: 'Khách hàng phụ đã được gộp từ trước' }, { status: 400 })
    }

    // 3. Aggregate stats across ALL branches of the duplicate customer
    const dupStatsRes = await connector.list('customer-branch-stats', {
      filters: { customer_id: duplicate_id }
    })

    const originalStats: Record<string, { debt_amount: string; prepaid_balance: string; loyalty_points: string }> = {}
    const modifiedStats: { id: string; branch_id: string; repointed: boolean }[] = []

    for (const dupStats of dupStatsRes.data) {
      const bId = dupStats.branch_id
      const dupDebt = parseFloat(dupStats.debt_amount || '0')
      const dupPrepaid = parseFloat(dupStats.prepaid_balance || '0')
      const dupPoints = parseFloat(dupStats.loyalty_points || '0')

      originalStats[bId] = {
        debt_amount: String(dupDebt),
        prepaid_balance: String(dupPrepaid),
        loyalty_points: String(dupPoints)
      }

      // Fetch primary stats at this specific branch
      const priStatsRes = await connector.list('customer-branch-stats', {
        filters: { customer_id: primary_id, branch_id: bId }
      })
      const priStats = priStatsRes.data[0]

      if (priStats) {
        const priDebt = parseFloat(priStats.debt_amount || '0')
        const priPrepaid = parseFloat(priStats.prepaid_balance || '0')
        const priPoints = parseFloat(priStats.loyalty_points || '0')

        await connector.update('customer-branch-stats', priStats.id, {
          debt_amount: String(priDebt + dupDebt),
          prepaid_balance: String(priPrepaid + dupPrepaid),
          loyalty_points: String(priPoints + dupPoints)
        })

        // Zero out duplicate branch stats
        await connector.update('customer-branch-stats', dupStats.id, {
          debt_amount: '0',
          prepaid_balance: '0',
          loyalty_points: '0'
        })
        modifiedStats.push({ id: dupStats.id, branch_id: bId, repointed: false })
      } else {
        // Repoint the duplicate branch stats row to primary ID
        await connector.update('customer-branch-stats', dupStats.id, {
          customer_id: primary_id
        })
        modifiedStats.push({ id: dupStats.id, branch_id: bId, repointed: true })
      }
    }

    // 4. Remap Orders across ALL branches
    const modifiedOrders: string[] = []
    const ordersRes = await connector.list('orders', {
      limit: 10000,
      filters: { customer_id: duplicate_id }
    })
    for (const o of ordersRes.data) {
      const oId = o.order_id || o.id
      await connector.update('orders', oId, {
        customer_id: primary_id
      })
      modifiedOrders.push(oId)
    }

    // 5. Remap Cashbook across ALL branches
    const modifiedCashbook: string[] = []
    const cbRes = await connector.list('cashbook', {
      limit: 10000,
      filters: { reference_id: duplicate_id }
    })
    for (const cb of cbRes.data) {
      const cbId = cb.transaction_id || cb.id
      await connector.update('cashbook', cbId, {
        reference_id: primary_id
      })
      modifiedCashbook.push(cbId)
    }

    // 6. Save duplicate metadata with references for rollback
    const newMetadata = {
      ...(dupMeta || {}),
      merged_into_id: primary_id,
      original_stats: originalStats,
      modified_stats: modifiedStats,
      modified_orders: modifiedOrders,
      modified_cashbook: modifiedCashbook,
      merged_at: new Date().toISOString(),
      merged_by: user.email
    }

    await connector.update('customers', duplicate_id, {
      metadata: JSON.stringify(newMetadata),
      debt_amount: '0',
      prepaid_balance: '0',
      loyalty_points: '0'
    })

    invalidate(shopId, 'customers')
    invalidate(shopId, 'orders')
    invalidate(shopId, 'cashbook')

    return NextResponse.json({ success: true, message: 'Gộp khách hàng thành công!' })
  } catch (e) {
    return handleApiError(e, 'MERGE customer')
  }
}
