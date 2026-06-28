import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { getConnectorForShop } from '@/lib/server/connectorFactory'
import { getCacheService } from '@oni/adapters/src/cache'
import * as xlsx from 'xlsx'

const ALLOWED_TYPES = ['customers', 'products', 'orders', 'order-items', 'cashbook', 'inventory', 'suppliers', 'employees']

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const type = req.nextUrl.searchParams.get('type')

    if (!type || !ALLOWED_TYPES.includes(type)) {
      return NextResponse.json({ message: 'Invalid export type' }, { status: 400 })
    }

    // Rate Limiting (3 exports per day per shop)
    const cache = getCacheService()
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const rateLimitKey = `export_limit:shop:${shopId}:${today}`
    
    const currentCountStr = await cache.get<string>(rateLimitKey)
    const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0
    
    if (currentCount >= 3) {
      return NextResponse.json({ message: 'Bạn đã đạt giới hạn xuất dữ liệu (3 lần/ngày). Vui lòng thử lại vào ngày mai.' }, { status: 429 })
    }

    const supabase = await getSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const admin = getSupabaseAdminClient()

    // Lấy tenant_id của shop này
    const { data: shop } = await admin
      .from('shops')
      .select('tenant_id')
      .eq('id', shopId)
      .single()

    if (!shop) {
      return NextResponse.json({ message: 'Shop not found' }, { status: 404 })
    }
    const tenantId = shop.tenant_id

    // Verify user is owner of this tenant
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
      
    if (roleCode !== 'owner') {
      return NextResponse.json({ message: 'Chỉ chủ sở hữu (Owner) mới có quyền xuất dữ liệu' }, { status: 403 })
    }

    // Connect to the shop's data source (which auto-filters by branchId = shopId)
    const connector = await getConnectorForShop(shopId, tenantId)
    
    // Fetch all data for this type (up to a large limit)
    const result = await connector.list(type, { limit: 100000 })
    
    if (!result.data || result.data.length === 0) {
      return NextResponse.json({ message: 'Không có dữ liệu để xuất' }, { status: 404 })
    }

    // Convert data to Excel
    const worksheet = xlsx.utils.json_to_sheet(result.data)
    const workbook = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(workbook, worksheet, type)
    
    // Generate buffer
    const buf = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    
    // Increment rate limit counter (expires in 24 hours)
    await cache.set(rateLimitKey, (currentCount + 1).toString(), 86400)

    // Return as downloadable file
    const headers = new Headers()
    const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-')
    headers.set('Content-Disposition', `attachment; filename="oni-vn_${type}_${dateStr}.xlsx"`)
    headers.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    return new NextResponse(buf, {
      status: 200,
      headers
    })

  } catch (e: any) {
    console.error('Export Error:', e)
    return NextResponse.json({ message: e?.message ?? 'Server error' }, { status: 500 })
  }
}
