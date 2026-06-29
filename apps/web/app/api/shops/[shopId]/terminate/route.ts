import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { getConnectorForShop } from '@/lib/server/connectorFactory'

const SHOP_BUSINESS_TABLES = [
  'employees', 'products', 'categories', 'discounts', 'customer_branch_stats', 
  'warehouses', 'location_resources', 'qr_order_requests', 'qr_session_carts', 
  'qr_ordering_sessions', 'returns', 'payments', 'orders', 'goods_receipt_notes', 
  'purchase_orders', 'purchase_requisitions', 'product_purchase_history', 
  'stock_movements', 'inventory', 'asset_allocations', 'assets', 'housekeeping_logs', 
  'room_minibar_stock', 'reservations', 'booking_channels', 'sepay_webhook_logs', 
  'cashbook', 'shop_shifts', 'fund_audits', 'payment_funds', 'payment_methods', 
  'tax_locked_periods'
]

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const body = await req.json()
    const password = body.password

    if (!password) {
      return NextResponse.json({ message: 'Yêu cầu nhập mật khẩu để xác nhận xóa' }, { status: 400 })
    }

    const supabase = await getSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    // Verify password for safety (MFA alternative for now)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: authData.user.email!,
      password: password,
    })

    if (signInError) {
      return NextResponse.json({ message: 'Mật khẩu xác nhận không chính xác' }, { status: 400 })
    }

    const admin = getSupabaseAdminClient()

    // 1. Lấy tenant_id của shop
    const { data: shop } = await admin
      .from('shops')
      .select('tenant_id, name, slug')
      .eq('id', shopId)
      .single()

    if (!shop) {
      return NextResponse.json({ message: 'Không tìm thấy cửa hàng' }, { status: 404 })
    }
    const tenantId = shop.tenant_id

    // 2. Verify user is owner of this tenant
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
      return NextResponse.json({ message: 'Chỉ chủ sở hữu (Owner) mới có quyền xóa chi nhánh' }, { status: 403 })
    }

    // 3. Attempt to connect to the connector to clean up remote data if needed
    try {
      const connector = await getConnectorForShop(shopId, tenantId)
      // Remote data cleanup would go here if implemented
    } catch (e) {
      console.log('Connector not available, skipping remote data deletion...', e)
    }

    // 4. Hard Delete: Data-plane (Shared DB Scenario)
    for (const table of SHOP_BUSINESS_TABLES) {
      await admin.from(table).delete().eq('tenant_id', tenantId).eq('branch_id', shopId)
    }

    // 5. Delete Shop settings
    await admin.from('shop_settings').delete().eq('shop_id', shopId)

    // 6. Delete the Shop itself
    const { error: deleteShopError } = await admin.from('shops').delete().eq('id', shopId)
    if (deleteShopError) {
      throw deleteShopError
    }

    // 7. Check if this was the last shop
    const { count } = await admin.from('shops').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
    
    let defaultShopSlug = null;

    if (count === 0) {
      // Create a placeholder shop so the system doesn't break
      const newShopId = 'shop_' + Math.random().toString(36).substring(2, 9)
      defaultShopSlug = 'cua-hang-mac-dinh-' + Math.floor(Date.now() / 1000)
      
      const { error: insertShopError } = await admin.from('shops').insert({
        id: newShopId,
        tenant_id: tenantId,
        name: 'Cửa hàng mặc định',
        slug: defaultShopSlug,
      })

      if (insertShopError) {
        console.error('Error creating placeholder shop:', insertShopError)
      } else {
        // Create default settings for the new shop
        const { error: insertSettingsError } = await admin.from('shop_settings').insert({
          shop_id: newShopId,
          currency: 'VND',
          timezone: 'Asia/Ho_Chi_Minh',
        })
        if (insertSettingsError) console.error(insertSettingsError)
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Chi nhánh và dữ liệu đã được xóa vĩnh viễn.',
      defaultShopSlug // Return this so the frontend knows where to redirect if needed
    })

  } catch (e: any) {
    console.error('Terminate Error:', e)
    return NextResponse.json({ message: e?.message ?? 'Server error' }, { status: 500 })
  }
}
