export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { customerCreateSchema } from '@/lib/validators/customers'
import { shopTag, invalidate, shopCache } from '@/lib/server/cache'
import { cacheTTL } from '@/lib/env'
import { handleApiError } from '../../_helpers'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { shop, connector } = await requireShopAccess(shopId, 'customers.view')

    const admin = getSupabaseAdminClient()
    const { data: tenant } = await admin
      .from('tenants')
      .select('share_customers')
      .eq('id', shop.tenant_id)
      .maybeSingle()
    const shareCustomers = tenant?.share_customers ?? false

    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50')))
    const search = sp.get('search') ?? ''
    const customer_type = sp.get('customer_type') ?? ''
    const sort_by = sp.get('sort_by') ?? ''
    const sort_order = sp.get('sort_order') ?? 'asc'
    const filters: Record<string, string> = {}
    if (customer_type) filters.customer_type = customer_type

    const show_merged = sp.get('show_merged') === 'true'

    // Fetch customers
    const res = await connector.list('customers', {
      page: 1, // Always fetch page 1 from DB when we slice in memory
      limit: 5000, // Fetch up to 5000 records to support filtering and pagination in memory
      search: search || undefined,
      filters
    })

    // Filter out merged/duplicate customers if not show_merged
    if (!show_merged) {
      res.data = res.data.filter((c: any) => {
        let meta = c.metadata
        if (typeof meta === 'string') {
          try { meta = JSON.parse(meta) } catch (e) {}
        }
        return !meta?.merged_into_id
      })
      res.total = res.data.length
    }

    // Fetch stats for the current branch to merge and to know who has transacted
    const statsRes = await connector.list('customer-branch-stats', {
      limit: 10000,
      filters: { branch_id: shopId }
    })
    const statsMap = new Map<string, any>()
    for (const s of statsRes.data) {
      statsMap.set(s.customer_id, s)
    }

    if (shareCustomers) {
      // Shared Mode: merge stats for all profiles
      res.data = res.data.map((c: any) => {
        if (c.id === 'C-DEFAULT-RETAIL') return c
        const stats = statsMap.get(c.id)
        
        let debt = stats?.debt_amount ?? c.debt_amount ?? '0'
        let prepaid = stats?.prepaid_balance ?? c.prepaid_balance ?? '0'
        const points = stats?.loyalty_points ?? c.loyalty_points ?? '0'
        const note = stats?.note ?? c.note ?? ''

        const dNum = parseFloat(debt)
        if (dNum < 0) {
          const absD = Math.abs(dNum)
          prepaid = String(parseFloat(prepaid) + absD)
          debt = '0'
          
          // Self-heal the database in the background
          if (stats) {
            void connector.update('customer-branch-stats', stats.id, {
              debt_amount: '0',
              prepaid_balance: prepaid
            }).catch(err => console.error('Self-heal stats failed:', err))
          } else {
            void connector.update('customers', c.id, {
              debt_amount: '0',
              prepaid_balance: prepaid
            }).catch(err => console.error('Self-heal customer profile failed:', err))
          }
        }

        return {
          ...c,
          debt_amount: debt,
          loyalty_points: points,
          prepaid_balance: prepaid,
          note,
        }
      })
    } else {
      // Private Mode: only allow global profiles if they have transacted (have stats in this shop)
      res.data = res.data.filter((c: any) => {
        if (c.id === 'C-DEFAULT-RETAIL') return true
        
        const isLocal = c.branch_id === shopId
        if (isLocal) return true
        
        const isGlobal = !c.branch_id || c.branch_id === ''
        const hasTransacted = statsMap.has(c.id)
        
        return isGlobal && hasTransacted
      }).map((c: any) => {
        // Merge stats for allowed transacted global profiles
        const stats = statsMap.get(c.id)
        
        let debt = stats?.debt_amount ?? c.debt_amount ?? '0'
        let prepaid = stats?.prepaid_balance ?? c.prepaid_balance ?? '0'
        const points = stats?.loyalty_points ?? c.loyalty_points ?? '0'
        const note = stats?.note ?? c.note ?? ''

        const dNum = parseFloat(debt)
        if (dNum < 0) {
          const absD = Math.abs(dNum)
          prepaid = String(parseFloat(prepaid) + absD)
          debt = '0'
          
          // Self-heal the database in the background
          if (stats) {
            void connector.update('customer-branch-stats', stats.id, {
              debt_amount: '0',
              prepaid_balance: prepaid
            }).catch(err => console.error('Self-heal stats failed:', err))
          } else {
            void connector.update('customers', c.id, {
              debt_amount: '0',
              prepaid_balance: prepaid
            }).catch(err => console.error('Self-heal customer profile failed:', err))
          }
        }

        return {
          ...c,
          debt_amount: debt,
          loyalty_points: points,
          prepaid_balance: prepaid,
          note,
        }
      })
    }

    // Sync total count after all filters are applied
    res.total = res.data.length

    // Inject virtual Khach le if no search or matches search
    const s = search.toLowerCase()
    if (!s || 'khách lẻ'.includes(s) || 'khach le'.includes(s) || s === 'c-default-retail') {
      const exists = res.data.some((c: any) => c.customer_id === 'C-DEFAULT-RETAIL')
      if (!exists) {
        res.data.unshift({
          id: 'C-DEFAULT-RETAIL',
          customer_id: 'C-DEFAULT-RETAIL',
          name: 'Khách lẻ',
          phone: '',
          email: '',
          address: '',
          customer_type: 'retail',
          credit_limit: '0',
          debt_amount: '0',
          loyalty_points: '0',
          prepaid_balance: '0',
          note: 'Khách hàng mặc định của hệ thống'
        })
        res.total += 1
      }
    }

    // Sort in memory if requested
    if (sort_by && ['name', 'loyalty_points', 'prepaid_balance', 'debt_amount'].includes(sort_by)) {
      res.data.sort((a: any, b: any) => {
        const aVal = a[sort_by] ?? ''
        const bVal = b[sort_by] ?? ''
        
        if (['loyalty_points', 'prepaid_balance', 'debt_amount'].includes(sort_by)) {
          const aNum = parseFloat(String(aVal)) || 0
          const bNum = parseFloat(String(bVal)) || 0
          return sort_order === 'asc' ? aNum - bNum : bNum - aNum
        } else {
          return sort_order === 'asc'
            ? String(aVal).localeCompare(String(bVal), 'vi', { numeric: true })
            : String(bVal).localeCompare(String(aVal), 'vi', { numeric: true })
        }
      })
    }

    // Always slice data in-memory for 100% consistent pagination and total count
    const offset = (page - 1) * limit
    const slicedData = res.data.slice(offset, offset + limit)
    
    return NextResponse.json({
      data: slicedData,
      total: res.total,
      page,
      limit
    })
  } catch (e) {
    return handleApiError(e, 'GET customers')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { shop, connector } = await requireShopAccess(shopId, 'customers.create')

    const admin = getSupabaseAdminClient()
    const { data: tenant } = await admin
      .from('tenants')
      .select('share_customers')
      .eq('id', shop.tenant_id)
      .maybeSingle()
    const shareCustomers = tenant?.share_customers ?? false

    const body = await req.json()
    const parsed = customerCreateSchema.parse(body)

    let created: any
    const phone = parsed.phone?.trim()

    if (shareCustomers && phone) {
      // 1. Search if a customer with this phone number already exists globally
      const existRes = await connector.list('customers', { filters: { phone } })
      const existing = existRes.data.find((c: any) => c.phone?.trim() === phone)

      if (existing) {
        // Customer profile exists globally. Let's Auto-Link!
        // Try to find if branch stats already exist for this branch
        const statsRes = await connector.list('customer-branch-stats', {
          filters: { customer_id: existing.id, branch_id: shopId }
        })
        const existingStats = statsRes.data[0]

        if (!existingStats) {
          // Initialize branch stats with 0 balances
          await connector.create('customer-branch-stats', {
            customer_id: existing.id,
            branch_id: shopId,
            debt_amount: '0',
            loyalty_points: '0',
            prepaid_balance: '0',
            note: parsed.note || ''
          })
        }

        created = {
          ...existing,
          debt_amount: existingStats?.debt_amount ?? '0',
          loyalty_points: existingStats?.loyalty_points ?? '0',
          prepaid_balance: existingStats?.prepaid_balance ?? '0',
          note: existingStats?.note ?? parsed.note ?? '',
        }
        
        invalidate(shopId, 'customers')
        return NextResponse.json(created, { status: 200 })
      } else {
        // Create new global profile
        const data = {
          ...parsed,
          branch_id: '', // Global profile
          prepaid_balance: '0',
          loyalty_points: '0',
          debt_amount: '0',
        } as any
        
        if (data.metadata) {
          data.metadata = typeof data.metadata === 'string' ? data.metadata : JSON.stringify(data.metadata)
        }

        // Remove note from data as it goes to stats
        const note = data.note || ''
        delete data.note

        const profile = await connector.create('customers', data)

        // Create branch stats for current branch
        await connector.create('customer-branch-stats', {
          customer_id: profile.id,
          branch_id: shopId,
          debt_amount: '0',
          loyalty_points: '0',
          prepaid_balance: '0',
          note: note
        })

        created = {
          ...profile,
          debt_amount: '0',
          loyalty_points: '0',
          prepaid_balance: '0',
          note: note,
        }
        
        invalidate(shopId, 'customers')
        return NextResponse.json(created, { status: 201 })
      }
    } else {
      // Private mode, or customer has no phone number (treat as local to branch)
      const data = {
        ...parsed,
        branch_id: shopId, // Explicitly branch-scoped
        prepaid_balance: '0',
        loyalty_points: '0',
        debt_amount: '0',
      } as any

      if (data.metadata) {
        data.metadata = typeof data.metadata === 'string' ? data.metadata : JSON.stringify(data.metadata)
      }

      created = await connector.create('customers', data)
      invalidate(shopId, 'customers')
      return NextResponse.json(created, { status: 201 })
    }
  } catch (e) {
    return handleApiError(e, 'POST customers')
  }
}
