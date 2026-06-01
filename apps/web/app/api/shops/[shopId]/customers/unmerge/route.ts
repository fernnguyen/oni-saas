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

    // 1. Role-based check: Only owner or admin roles can unmerge
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
        { error: 'Chỉ chủ sở hữu (owner) hoặc quản trị viên (admin) mới có quyền hủy gộp khách hàng.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { duplicate_id } = body as { duplicate_id: string }

    if (!duplicate_id) {
      return NextResponse.json({ error: 'Thiếu thông tin khách hàng gộp' }, { status: 400 })
    }

    // 2. Fetch profile of duplicate
    const duplicate = await connector.findById('customers', duplicate_id)
    if (!duplicate) {
      return NextResponse.json({ error: 'Không tìm thấy khách hàng' }, { status: 404 })
    }

    let dupMeta: any = duplicate.metadata
    if (typeof dupMeta === 'string') {
      try { dupMeta = JSON.parse(dupMeta) } catch (e) {}
    }

    const primaryId = dupMeta?.merged_into_id
    if (!primaryId) {
      return NextResponse.json({ error: 'Khách hàng này chưa từng được gộp' }, { status: 400 })
    }

    const primary = await connector.findById('customers', primaryId)
    if (!primary) {
      return NextResponse.json({ error: 'Không tìm thấy hồ sơ chính đã gộp' }, { status: 404 })
    }

    const originalStats = dupMeta.original_stats || {}
    const modifiedStats = dupMeta.modified_stats || []
    const modifiedOrders = dupMeta.modified_orders || []
    const modifiedCashbook = dupMeta.modified_cashbook || []

    const dupBranchId = duplicate.branch_id || shopId

    // 3. Rollback Stats across ALL modified branches
    for (const item of modifiedStats) {
      const orig = originalStats[item.branch_id] || { debt_amount: '0', prepaid_balance: '0', loyalty_points: '0' }
      
      const dupDebt = parseFloat(orig.debt_amount || '0')
      const dupPrepaid = parseFloat(orig.prepaid_balance || '0')
      const dupPoints = parseFloat(orig.loyalty_points || '0')

      if (item.repointed) {
        // Change customer_id reference back to duplicate_id and restore values
        await connector.update('customer-branch-stats', item.id, {
          customer_id: duplicate_id,
          debt_amount: String(dupDebt),
          prepaid_balance: String(dupPrepaid),
          loyalty_points: String(dupPoints)
        }).catch((err: any) => console.error(`Failed to restore repointed stats ${item.id}:`, err))
      } else {
        // Subtract stats from primary
        const priStatsRes = await connector.list('customer-branch-stats', {
          filters: { customer_id: primaryId, branch_id: item.branch_id }
        })
        const priStats = priStatsRes.data[0]

        if (priStats) {
          const priDebt = parseFloat(priStats.debt_amount || '0')
          const priPrepaid = parseFloat(priStats.prepaid_balance || '0')
          const priPoints = parseFloat(priStats.loyalty_points || '0')

          await connector.update('customer-branch-stats', priStats.id, {
            debt_amount: String(Math.max(0, priDebt - dupDebt)),
            prepaid_balance: String(Math.max(0, priPrepaid - dupPrepaid)),
            loyalty_points: String(Math.max(0, priPoints - dupPoints))
          }).catch((err: any) => console.error(`Failed to subtract primary stats ${priStats.id}:`, err))
        }

        // Restore duplicate branch stats row balances
        await connector.update('customer-branch-stats', item.id, {
          debt_amount: String(dupDebt),
          prepaid_balance: String(dupPrepaid),
          loyalty_points: String(dupPoints)
        }).catch((err: any) => console.error(`Failed to restore dup stats row ${item.id}:`, err))
      }
    }

    // 4. Restore Orders
    for (const oId of modifiedOrders) {
      await connector.update('orders', oId, {
        customer_id: duplicate_id
      }).catch(err => console.error(`Failed to restore order ${oId}:`, err))
    }

    // 5. Restore Cashbook entries
    for (const cbId of modifiedCashbook) {
      await connector.update('cashbook', cbId, {
        reference_id: duplicate_id
      }).catch(err => console.error(`Failed to restore cashbook ${cbId}:`, err))
    }

    // 6. Clear duplicate metadata fields
    const clearedMeta = { ...dupMeta }
    delete clearedMeta.merged_into_id
    delete clearedMeta.original_stats
    delete clearedMeta.modified_stats
    delete clearedMeta.modified_orders
    delete clearedMeta.modified_cashbook
    delete clearedMeta.merged_at
    delete clearedMeta.merged_by

    // Find the original stats for local properties at duplicate's branch
    const localOrig = originalStats[dupBranchId] || { debt_amount: '0', prepaid_balance: '0', loyalty_points: '0' }

    await connector.update('customers', duplicate_id, {
      metadata: JSON.stringify(clearedMeta),
      debt_amount: String(localOrig.debt_amount || '0'),
      prepaid_balance: String(localOrig.prepaid_balance || '0'),
      loyalty_points: String(localOrig.loyalty_points || '0')
    })

    invalidate(shopId, 'customers')
    invalidate(shopId, 'orders')
    invalidate(shopId, 'cashbook')

    return NextResponse.json({ success: true, message: 'Hủy gộp khách hàng thành công!' })
  } catch (e) {
    return handleApiError(e, 'UNMERGE customer')
  }
}
