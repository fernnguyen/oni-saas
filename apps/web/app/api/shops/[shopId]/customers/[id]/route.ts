import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { customerUpdateSchema } from '@/lib/validators/customers'
import { handleApiError } from '../../../_helpers'
import { invalidate } from '@/lib/server/cache'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    const { shop, connector } = await requireShopAccess(shopId, 'customers.view')

    const admin = getSupabaseAdminClient()
    const { data: tenant } = await admin
      .from('tenants')
      .select('share_customers')
      .eq('id', shop.tenant_id)
      .maybeSingle()
    const shareCustomers = tenant?.share_customers ?? false

    const row = await connector.findById('customers', id)
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (id === 'C-DEFAULT-RETAIL') {
      return NextResponse.json(row)
    }

    const statsRes = await connector.list('customer-branch-stats', {
      filters: { customer_id: id, branch_id: shopId }
    })
    const stats = statsRes.data[0]

    if (shareCustomers) {
      let debt = stats?.debt_amount ?? row.debt_amount ?? '0'
      let prepaid = stats?.prepaid_balance ?? row.prepaid_balance ?? '0'
      const points = stats?.loyalty_points ?? row.loyalty_points ?? '0'
      const note = stats?.note ?? row.note ?? ''

      const dNum = parseFloat(debt)
      if (dNum < 0) {
        const absD = Math.abs(dNum)
        prepaid = String(parseFloat(prepaid) + absD)
        debt = '0'
        
        if (stats) {
          void connector.update('customer-branch-stats', stats.id, {
            debt_amount: '0',
            prepaid_balance: prepaid
          }).catch(err => console.error('Self-heal details stats failed:', err))
        } else {
          void connector.update('customers', row.id, {
            debt_amount: '0',
            prepaid_balance: prepaid
          }).catch(err => console.error('Self-heal details profile failed:', err))
        }
      }

      return NextResponse.json({
        ...row,
        debt_amount: debt,
        loyalty_points: points,
        prepaid_balance: prepaid,
        note,
      })
    } else {
      const isLocal = row.branch_id === shopId
      const isGlobal = !row.branch_id || row.branch_id === ''
      
      if (isLocal) {
        let debt = row.debt_amount ?? '0'
        let prepaid = row.prepaid_balance ?? '0'
        const dNum = parseFloat(debt)
        if (dNum < 0) {
          const absD = Math.abs(dNum)
          prepaid = String(parseFloat(prepaid) + absD)
          debt = '0'
          
          void connector.update('customers', row.id, {
            debt_amount: '0',
            prepaid_balance: prepaid
          }).catch(err => console.error('Self-heal local details profile failed:', err))
          
          row.debt_amount = debt
          row.prepaid_balance = prepaid
        }
        return NextResponse.json(row)
      }
      
      if (isGlobal && stats) {
        let debt = stats.debt_amount ?? row.debt_amount ?? '0'
        let prepaid = stats.prepaid_balance ?? row.prepaid_balance ?? '0'
        const points = stats.loyalty_points ?? row.loyalty_points ?? '0'
        const note = stats.note ?? row.note ?? ''

        const dNum = parseFloat(debt)
        if (dNum < 0) {
          const absD = Math.abs(dNum)
          prepaid = String(parseFloat(prepaid) + absD)
          debt = '0'
          
          void connector.update('customer-branch-stats', stats.id, {
            debt_amount: '0',
            prepaid_balance: prepaid
          }).catch(err => console.error('Self-heal details stats failed:', err))
        }

        return NextResponse.json({
          ...row,
          debt_amount: debt,
          loyalty_points: points,
          prepaid_balance: prepaid,
          note,
        })
      }
      
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  } catch (e) {
    return handleApiError(e, 'GET customer')
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    
    if (id === 'C-DEFAULT-RETAIL') {
      return NextResponse.json({ error: 'Không thể sửa Khách lẻ mặc định' }, { status: 403 })
    }

    const { shop, connector } = await requireShopAccess(shopId, 'customers.edit')

    const admin = getSupabaseAdminClient()
    const { data: tenant } = await admin
      .from('tenants')
      .select('share_customers')
      .eq('id', shop.tenant_id)
      .maybeSingle()
    const shareCustomers = tenant?.share_customers ?? false

    const body = await req.json()
    const parsed = customerUpdateSchema.parse(body)

    // STRICT accounting integrity: prevent direct updates to accounting & CRM statistics via PUT
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { prepaid_balance, loyalty_points, debt_amount, ...data } = parsed

    const updateData = { ...data } as any
    if (updateData.metadata) {
      updateData.metadata = typeof updateData.metadata === 'string'
        ? updateData.metadata
        : JSON.stringify(updateData.metadata)
    }

    if (shareCustomers) {
      // Note goes to customer-branch-stats, not to the main customer table
      const note = updateData.note !== undefined ? updateData.note : null
      delete updateData.note

      // Update the main profile
      const updatedProfile = await connector.update('customers', id, updateData)

      if (note !== null) {
        // Try to find if branch stats already exist for this customer
        const statsRes = await connector.list('customer-branch-stats', {
          filters: { customer_id: id, branch_id: shopId }
        })
        const existingStats = statsRes.data[0]

        if (existingStats) {
          await connector.update('customer-branch-stats', existingStats.id, {
            note
          })
        } else {
          await connector.create('customer-branch-stats', {
            customer_id: id,
            branch_id: shopId,
            debt_amount: '0',
            loyalty_points: '0',
            prepaid_balance: '0',
            note
          })
        }
      }

      // Read final branch stats to return merged result
      const statsRes = await connector.list('customer-branch-stats', {
        filters: { customer_id: id, branch_id: shopId }
      })
      const stats = statsRes.data[0]

      const merged = {
        ...updatedProfile,
        debt_amount: stats?.debt_amount ?? '0',
        loyalty_points: stats?.loyalty_points ?? '0',
        prepaid_balance: stats?.prepaid_balance ?? '0',
        note: stats?.note ?? '',
      }

      invalidate(shopId, 'customers')
      return NextResponse.json(merged)
    } else {
      const customer = await connector.findById('customers', id)
      if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      // Copy-on-Write (CoW) for global profile in Private Mode
      const isGlobal = !customer.branch_id || customer.branch_id === ''
      if (isGlobal) {
        const localData = {
          ...customer,
          ...updateData,
          branch_id: shopId,
        }
        delete localData.id
        delete localData.customer_id
        delete localData.created_at
        delete localData.updated_at

        // 1. Create a local customer profile
        const localCustomer = await connector.create('customers', localData)
        const localCustomerId = localCustomer.customer_id || localCustomer.id

        // 2. Point existing branch stats to the new local customer
        const statsRes = await connector.list('customer-branch-stats', {
          filters: { customer_id: id, branch_id: shopId }
        })
        const stats = statsRes.data[0]
        if (stats) {
          await connector.update('customer-branch-stats', stats.id, {
            customer_id: localCustomerId
          })
        }

        // 3. Update orders of this branch to point to localCustomerId
        const ordersRes = await connector.list('orders', {
          limit: 1000,
          filters: { customer_id: id, branch_id: shopId }
        })
        for (const o of ordersRes.data) {
          await connector.update('orders', o.order_id || o.id, {
            customer_id: localCustomerId
          })
        }

        // 4. Update cashbook entries of this branch to point to localCustomerId
        const cbRes = await connector.list('cashbook', {
          limit: 1000,
          filters: { reference_id: id, branch_id: shopId }
        })
        for (const cb of cbRes.data) {
          await connector.update('cashbook', cb.transaction_id || cb.id, {
            reference_id: localCustomerId
          })
        }

        invalidate(shopId, 'customers')
        invalidate(shopId, 'orders')
        invalidate(shopId, 'cashbook')
        return NextResponse.json(localCustomer)
      } else {
        const updated = await connector.update('customers', id, updateData)
        invalidate(shopId, 'customers')
        return NextResponse.json(updated)
      }
    }
  } catch (e) {
    return handleApiError(e, 'PUT customer')
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params
    
    if (id === 'C-DEFAULT-RETAIL') {
      return NextResponse.json({ error: 'Không thể xóa Khách lẻ mặc định' }, { status: 403 })
    }

    const { shop, connector } = await requireShopAccess(shopId)

    const admin = getSupabaseAdminClient()
    const { data: tenant } = await admin
      .from('tenants')
      .select('share_customers')
      .eq('id', shop.tenant_id)
      .maybeSingle()
    const shareCustomers = tenant?.share_customers ?? false

    const customer = await connector.findById('customers', id)
    if (customer) {
      // 1. Delete branch stats for the current branch
      const statsRes = await connector.list('customer-branch-stats', {
        filters: { customer_id: id, branch_id: shopId }
      })
      for (const s of statsRes.data) {
        await connector.delete('customer-branch-stats', s.id)
      }

      // 2. Check if other branches have transactions or stats
      const allStats = await connector.list('customer-branch-stats', {
        filters: { customer_id: id }
      })
      const hasOtherStats = allStats.data.some((s: any) => s.branch_id !== shopId)

      if (hasOtherStats) {
        // If other branches use this profile, keep the profile but unbind it from current branch if it was local
        if (customer.branch_id === shopId) {
          await connector.update('customers', id, { branch_id: '' })
        }
      } else {
        // If NO other branch uses this profile:
        // Delete the main profile only if it's a local customer of this branch, or a global customer with no other stats
        const isLocal = customer.branch_id === shopId
        const isGlobal = !customer.branch_id || customer.branch_id === ''
        if (isLocal || isGlobal) {
          await connector.delete('customers', id)
        }
      }
    }

    invalidate(shopId, 'customers')
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return handleApiError(e, 'DELETE customer')
  }
}
