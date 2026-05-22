export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { checkFeatureAccess } from '@/lib/server/features'
import { getConnectorForShop } from '@/lib/server/connectorFactory'
import { requireShopAccess } from '@/lib/server/shopAccess'
import crypto from 'crypto'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const sp = req.nextUrl.searchParams
    const resource_id = sp.get('resource_id')

    if (!resource_id) {
      return NextResponse.json({ error: 'Missing resource_id' }, { status: 400 })
    }

    const admin = getSupabaseAdminClient()

    // 1. Get tenant_id and verify shop existence
    const { data: shop, error: shopError } = await admin
      .from('shops')
      .select('tenant_id')
      .eq('id', shopId)
      .single()

    if (shopError || !shop) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
    }

    const tenantId = shop.tenant_id

    // Lazy cleanup expired sessions older than 4 hours (fire and forget)
    admin.rpc('cleanup_expired_qr_sessions').catch(err => console.error('Lazy cleanup error:', err))

    // 2. Check Feature Access (Plug-and-Play Feature Gate)
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

    // 3. Get connector and fetch table status
    const connector = await getConnectorForShop(shopId, tenantId)
    const table = await connector.findById('location-resources', resource_id)

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    // 4. Query active session
    const { data: session, error: sessError } = await admin
      .from('qr_ordering_sessions')
      .select('*')
      .eq('branch_id', shopId)
      .eq('resource_id', resource_id)
      .eq('status', 'active')
      .eq('active', 'TRUE')
      .maybeSingle()

    if (sessError) throw sessError

    // 5. If table is occupied but no active session, auto-create one
    if (table.status === 'occupied' && !session) {
      const newSessionId = crypto.randomUUID()
      const sessionToken = crypto.randomBytes(32).toString('hex')
      
      const { data: newSession, error: createError } = await admin
        .from('qr_ordering_sessions')
        .insert({
          id: newSessionId,
          tenant_id: tenantId,
          branch_id: shopId,
          resource_id,
          session_token: sessionToken,
          status: 'active',
          active: 'TRUE'
        })
        .select()
        .single()

      if (createError) throw createError
      return NextResponse.json({ session: newSession, table })
    }

    return NextResponse.json({ session, table })
  } catch (e) {
    console.error('[GET qr-sessions]', e)
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
    const { resource_id } = body

    if (!resource_id) {
      return NextResponse.json({ error: 'Missing resource_id' }, { status: 400 })
    }

    const admin = getSupabaseAdminClient()

    // 1. Get tenant_id and verify shop existence
    const { data: shop, error: shopError } = await admin
      .from('shops')
      .select('tenant_id')
      .eq('id', shopId)
      .single()

    if (shopError || !shop) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
    }

    const tenantId = shop.tenant_id

    // Lazy cleanup expired sessions older than 4 hours (fire and forget)
    admin.rpc('cleanup_expired_qr_sessions').catch(err => console.error('Lazy cleanup error:', err))

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

    // 3. Get connector and table
    const connector = await getConnectorForShop(shopId, tenantId)
    const table = await connector.findById('location-resources', resource_id)

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    // 4. Check if session already active
    const { data: activeSession } = await admin
      .from('qr_ordering_sessions')
      .select('*')
      .eq('branch_id', shopId)
      .eq('resource_id', resource_id)
      .eq('status', 'active')
      .eq('active', 'TRUE')
      .maybeSingle()

    if (activeSession) {
      return NextResponse.json({ session: activeSession, table })
    }

    // 5. If table is already occupied but no session, auto-create one
    if (table.status === 'occupied') {
      const newSessionId = crypto.randomUUID()
      const sessionToken = crypto.randomBytes(32).toString('hex')
      
      const { data: newSession, error: createError } = await admin
        .from('qr_ordering_sessions')
        .insert({
          id: newSessionId,
          tenant_id: tenantId,
          branch_id: shopId,
          resource_id,
          session_token: sessionToken,
          status: 'active',
          active: 'TRUE'
        })
        .select()
        .single()

      if (createError) throw createError
      return NextResponse.json({ session: newSession, table })
    }

    // 6. Otherwise (table is available), create a pending approval session
    const newSessionId = crypto.randomUUID()
    const tempToken = crypto.randomBytes(32).toString('hex')

    const { data: pendingSession, error: createError } = await admin
      .from('qr_ordering_sessions')
      .insert({
        id: newSessionId,
        tenant_id: tenantId,
        branch_id: shopId,
        resource_id,
        session_token: tempToken,
        status: 'pending', // Waiting for receptionists to approve/open
        active: 'TRUE'
      })
      .select()
      .single()

    if (createError) throw createError

    return NextResponse.json({ session: pendingSession, table })
  } catch (e) {
    console.error('[POST qr-sessions]', e)
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
    
    // Only authenticated staff with 'pos.use' permission can approve/complete/reject sessions
    const { connector, tenantId } = await requireShopAccess(shopId, 'pos.use')

    const body = await req.json()
    const { session_id, action } = body

    if (!session_id || !action) {
      return NextResponse.json({ error: 'Missing session_id or action' }, { status: 400 })
    }

    const admin = getSupabaseAdminClient()

    // 1. Fetch current session
    const { data: session, error: fetchError } = await admin
      .from('qr_ordering_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('branch_id', shopId)
      .single()

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (action === 'approve') {
      if (session.status !== 'pending') {
        return NextResponse.json({ error: 'Session is not in pending state' }, { status: 400 })
      }

      // Update session to active
      const { data: updatedSession, error: updateError } = await admin
        .from('qr_ordering_sessions')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', session_id)
        .select()
        .single()

      if (updateError) throw updateError

      // Update table to occupied via connector
      await connector.update('location-resources', session.resource_id, { status: 'occupied' })

      return NextResponse.json({ session: updatedSession })
    }

    if (action === 'complete') {
      // Complete session
      const { data: updatedSession, error: updateError } = await admin
        .from('qr_ordering_sessions')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', session_id)
        .select()
        .single()

      if (updateError) throw updateError

      // Update table to available via connector
      await connector.update('location-resources', session.resource_id, { status: 'available' })

      return NextResponse.json({ session: updatedSession })
    }

    if (action === 'reject') {
      // Reject session by setting status to completed and active to FALSE
      const { data: updatedSession, error: updateError } = await admin
        .from('qr_ordering_sessions')
        .update({ status: 'completed', active: 'FALSE', updated_at: new Date().toISOString() })
        .eq('id', session_id)
        .select()
        .single()

      if (updateError) throw updateError

      return NextResponse.json({ session: updatedSession })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (e) {
    console.error('[PATCH qr-sessions]', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
