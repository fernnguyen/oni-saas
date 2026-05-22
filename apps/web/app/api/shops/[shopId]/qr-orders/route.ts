export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { checkFeatureAccess } from '@/lib/server/features'
import { requireShopAccess } from '@/lib/server/shopAccess'
import crypto from 'crypto'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const sp = req.nextUrl.searchParams
    const session_id = sp.get('session_id')
    const session_token = sp.get('session_token')
    const status = sp.get('status') // optional filter: pending, accepted, rejected

    const admin = getSupabaseAdminClient()

    // Determine if receptionist (has pos.use) or guest (must provide valid session_token)
    let tenantId: string
    let isStaff = false

    try {
      const access = await requireShopAccess(shopId, 'pos.use')
      tenantId = access.tenantId
      isStaff = true
    } catch {
      // Not a staff or not logged in, must be a guest
      if (!session_id || !session_token) {
        return NextResponse.json({ error: 'Unauthorized or missing session credentials' }, { status: 401 })
      }
      
      // Validate guest session
      const { data: session } = await admin
        .from('qr_ordering_sessions')
        .select('tenant_id, status, active')
        .eq('id', session_id)
        .eq('session_token', session_token)
        .single()

      if (!session || session.status !== 'active' || session.active !== 'TRUE') {
        return NextResponse.json({ error: 'Invalid or expired session' }, { status: 403 })
      }
      tenantId = session.tenant_id
    }

    // Fetch order requests
    let query = admin
      .from('qr_order_requests')
      .select('*')
      .eq('branch_id', shopId)
      .eq('tenant_id', tenantId)

    if (session_id) {
      query = query.eq('session_id', session_id)
    }
    if (status) {
      query = query.eq('status', status)
    } else if (!isStaff) {
      // If guest, only show non-deleted order requests
      query = query.eq('active', 'TRUE')
    }

    const { data: requests, error: fetchError } = await query.order('created_at', { ascending: false })
    if (fetchError) throw fetchError

    return NextResponse.json(requests)
  } catch (e) {
    console.error('[GET qr-orders]', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const body = await req.json()
    const { session_id, session_token, items } = body

    if (!session_id || !session_token || !items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Missing session_id, session_token or items array' }, { status: 400 })
    }

    const admin = getSupabaseAdminClient()

    // 1. Validate session
    const { data: session, error: sessError } = await admin
      .from('qr_ordering_sessions')
      .select('tenant_id, resource_id, status, active')
      .eq('id', session_id)
      .eq('branch_id', shopId)
      .eq('session_token', session_token)
      .single()

    if (sessError || !session || session.status !== 'active' || session.active !== 'TRUE') {
      return NextResponse.json({ error: 'Phiên gọi món không tồn tại hoặc đã kết thúc.' }, { status: 403 })
    }

    const tenantId = session.tenant_id

    // 2. Check Feature Access
    const hasAccess = await checkFeatureAccess(tenantId, 'qr_table_ordering')
    if (!hasAccess) {
      return NextResponse.json(
        {
          error: 'feature_locked',
          message: 'Vui lòng nâng cấp lên gói Pro hoặc mua thêm Add-on để sử dụng tính năng này.',
        },
        { status: 403 }
      )
    }

    // 3. Create the order request
    const requestId = crypto.randomUUID()
    const { data: orderRequest, error: createError } = await admin
      .from('qr_order_requests')
      .insert({
        id: requestId,
        tenant_id: tenantId,
        branch_id: shopId,
        session_id,
        resource_id: session.resource_id,
        items, // jsonb array
        status: 'pending',
        active: 'TRUE'
      })
      .select()
      .single()

    if (createError) throw createError

    return NextResponse.json(orderRequest, { status: 201 })
  } catch (e) {
    console.error('[POST qr-orders]', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    
    // Only staff with 'pos.use' can update request status (accept/reject)
    const { tenantId } = await requireShopAccess(shopId, 'pos.use')

    const body = await req.json()
    const { request_id, action, reject_reason } = body

    if (!request_id || !action) {
      return NextResponse.json({ error: 'Missing request_id or action' }, { status: 400 })
    }

    const admin = getSupabaseAdminClient()

    // 1. Fetch order request
    const { data: request, error: fetchError } = await admin
      .from('qr_order_requests')
      .select('*')
      .eq('id', request_id)
      .eq('branch_id', shopId)
      .single()

    if (fetchError || !request) {
      return NextResponse.json({ error: 'Order request not found' }, { status: 404 })
    }

    if (request.status !== 'pending') {
      return NextResponse.json({ error: 'Order request is already processed' }, { status: 400 })
    }

    if (action === 'accept') {
      const { data: updatedRequest, error: updateError } = await admin
        .from('qr_order_requests')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', request_id)
        .select()
        .single()

      if (updateError) throw updateError
      return NextResponse.json({ request: updatedRequest })
    }

    if (action === 'reject') {
      const { data: updatedRequest, error: updateError } = await admin
        .from('qr_order_requests')
        .update({ 
          status: 'rejected', 
          reject_reason: reject_reason || 'Bị từ chối bởi lễ tân',
          updated_at: new Date().toISOString() 
        })
        .eq('id', request_id)
        .select()
        .single()

      if (updateError) throw updateError
      return NextResponse.json({ request: updatedRequest })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (e) {
    console.error('[PATCH qr-orders]', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
