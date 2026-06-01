import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { getConnectorForShop } from '@/lib/server/connectorFactory'

const schema = z.object({
  share_customers: z.boolean(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params
    const supabase = await getSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const admin = getSupabaseAdminClient()

    // Verify user is owner/admin of this tenant
    const { data: access } = await admin
      .from('user_tenants')
      .select('id, roles(code)')
      .eq('user_id', authData.user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!access) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const roleCode = Array.isArray((access as any).roles)
      ? (access as any).roles[0]?.code
      : (access as any).roles?.code
    if (roleCode !== 'owner' && roleCode !== 'admin') {
      return NextResponse.json({ message: 'Chỉ owner/admin mới được thay đổi cấu hình workspace' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ message: 'Giá trị không hợp lệ' }, { status: 422 })
    }

    const { error } = await admin
      .from('tenants')
      .update({ share_customers: parsed.data.share_customers })
      .eq('id', tenantId)

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 })
    }

    // Clear Next.js customer data cache for all shops under this tenant
    const { data: shops } = await admin
      .from('shops')
      .select('id')
      .eq('tenant_id', tenantId)

    if (shops && shops.length > 0) {
      // ── AUTO-MERGE DEDUPLICATION PROCESS ──
      // If we are enabling customer sharing, merge duplicate local customer profiles
      if (parsed.data.share_customers) {
        try {
          const firstShop = shops[0]
          const connector = await getConnectorForShop(firstShop.id, tenantId)
          const customersRes = await connector.list('customers', { limit: 100000 })
          const allCustomers = customersRes.data as Record<string, string>[]

          // Group by phone number
          const phoneGroups = new Map<string, Record<string, string>[]>()
          for (const c of allCustomers) {
            const phone = c.phone?.trim()
            if (!phone) continue // ignore private/nameless
            if (!phoneGroups.has(phone)) {
              phoneGroups.set(phone, [])
            }
            phoneGroups.get(phone)!.push(c)
          }

          // Process groups with duplicates
          for (const [phone, group] of phoneGroups.entries()) {
            if (group.length <= 1) continue

            // 1. Choose primary profile (prefer global or the oldest)
            const globalProfile = group.find(c => !c.branch_id || c.branch_id === '')
            const primaryProfile = globalProfile || group[0]
            const primaryId = primaryProfile.customer_id || primaryProfile.id

            // Mark as global
            if (primaryProfile.branch_id !== '') {
              await connector.update('customers', primaryId, { branch_id: '' })
            }

            // 2. Merge all duplicates into primary
            for (const duplicate of group) {
              const dupId = duplicate.customer_id || duplicate.id
              if (dupId === primaryId) continue

              const dupBranchId = duplicate.branch_id || firstShop.id

              // Merge stats
              const dupStatsRes = await connector.list('customer-branch-stats', {
                filters: { customer_id: dupId, branch_id: dupBranchId }
              })
              const dupStats = dupStatsRes.data[0]

              if (dupStats) {
                const priStatsRes = await connector.list('customer-branch-stats', {
                  filters: { customer_id: primaryId, branch_id: dupBranchId }
                })
                const priStats = priStatsRes.data[0]

                const dupDebt = parseFloat(dupStats.debt_amount || '0')
                const dupPrepaid = parseFloat(dupStats.prepaid_balance || '0')
                const dupPoints = parseFloat(dupStats.loyalty_points || '0')

                if (priStats) {
                  const priDebt = parseFloat(priStats.debt_amount || '0')
                  const priPrepaid = parseFloat(priStats.prepaid_balance || '0')
                  const priPoints = parseFloat(priStats.loyalty_points || '0')

                  await connector.update('customer-branch-stats', priStats.id, {
                    debt_amount: String(priDebt + dupDebt),
                    prepaid_balance: String(priPrepaid + dupPrepaid),
                    loyalty_points: String(priPoints + dupPoints)
                  })
                  await connector.delete('customer-branch-stats', dupStats.id)
                } else {
                  await connector.update('customer-branch-stats', dupStats.id, {
                    customer_id: primaryId
                  })
                }
              }

              // Remap orders
              const ordersRes = await connector.list('orders', {
                limit: 10000,
                filters: { customer_id: dupId, branch_id: dupBranchId }
              })
              for (const o of ordersRes.data) {
                await connector.update('orders', o.order_id || o.id, {
                  customer_id: primaryId
                })
              }

              // Remap cashbook
              const cbRes = await connector.list('cashbook', {
                limit: 10000,
                filters: { reference_id: dupId, branch_id: dupBranchId }
              })
              for (const cb of cbRes.data) {
                await connector.update('cashbook', cb.transaction_id || cb.id, {
                  reference_id: primaryId
                })
              }

              // Delete duplicate profile
              await connector.delete('customers', dupId)
            }
          }
        } catch (mergeErr) {
          console.error('Failed to auto-merge duplicate customers on share toggle ON:', mergeErr)
        }
      }

      const { invalidate } = await import('@/lib/server/cache')
      for (const shop of shops) {
        invalidate(shop.id, 'customers')
      }
    }

    return NextResponse.json({ success: true, share_customers: parsed.data.share_customers })
  } catch (e: any) {
    return NextResponse.json({ message: e?.message ?? 'Server error' }, { status: 500 })
  }
}
