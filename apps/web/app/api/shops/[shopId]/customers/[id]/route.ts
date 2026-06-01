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
      return NextResponse.json({
        ...row,
        debt_amount: stats?.debt_amount ?? '0',
        loyalty_points: stats?.loyalty_points ?? '0',
        prepaid_balance: stats?.prepaid_balance ?? '0',
        note: stats?.note ?? '',
      })
    } else {
      const isLocal = row.branch_id === shopId
      const isGlobal = !row.branch_id || row.branch_id === ''
      
      if (isLocal) {
        return NextResponse.json(row)
      }
      
      if (isGlobal && stats) {
        return NextResponse.json({
          ...row,
          debt_amount: stats.debt_amount ?? '0',
          loyalty_points: stats.loyalty_points ?? '0',
          prepaid_balance: stats.prepaid_balance ?? '0',
          note: stats.note ?? '',
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
      const updated = await connector.update('customers', id, updateData)
      invalidate(shopId, 'customers')
      return NextResponse.json(updated)
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

    if (shareCustomers) {
      // Find the customer to see if they are local or global
      const customer = await connector.findById('customers', id)
      if (customer) {
        // Delete branch stats
        const statsRes = await connector.list('customer-branch-stats', {
          filters: { customer_id: id, branch_id: shopId }
        })
        for (const s of statsRes.data) {
          await connector.delete('customer-branch-stats', s.id)
        }

        // If the customer has a branch_id set to this shopId (local customer), we delete the main profile too!
        if (customer.branch_id === shopId) {
          await connector.delete('customers', id)
        }
      }
    } else {
      await connector.delete('customers', id)
    }

    invalidate(shopId, 'customers')
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return handleApiError(e, 'DELETE customer')
  }
}
