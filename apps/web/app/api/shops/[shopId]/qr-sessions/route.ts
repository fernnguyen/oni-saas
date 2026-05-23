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
    const statusParam = sp.get('status')
    const resource_id = sp.get('resource_id')
    const session_id = sp.get('session_id')
    const session_token = sp.get('session_token')

    if (!resource_id && !statusParam && !session_id) {
      return NextResponse.json({ error: 'Missing resource_id, status or session_id parameter' }, { status: 400 })
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
    void (async () => {
      try {
        await admin.rpc('cleanup_expired_qr_sessions');
      } catch (err) {
        console.error('Lazy cleanup error:', err);
      }
    })();

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

    // Support fetching by specific session_id & session_token (used for persistent recap of completed sessions)
    if (session_id && session_token) {
      const { data: session, error: sessError } = await admin
        .from('qr_ordering_sessions')
        .select('*')
        .eq('id', session_id)
        .eq('session_token', session_token)
        .eq('branch_id', shopId)
        .single()

      if (sessError || !session) {
        return NextResponse.json({ session: null, table: null })
      }

      // Also get the table details
      const connector = await getConnectorForShop(shopId, tenantId)
      const table = await connector.findById('location-resources', session.resource_id)

      return NextResponse.json({ session, table })
    }

    // Support fetching all sessions by status (e.g. pending ones for the Cashier notification center)
    if (statusParam) {
      const { data: sessions, error: sessError } = await admin
        .from('qr_ordering_sessions')
        .select('*')
        .eq('branch_id', shopId)
        .eq('status', statusParam)
        .eq('active', 'TRUE')
        .order('created_at', { ascending: false })

      if (sessError) throw sessError
      return NextResponse.json(sessions)
    }

    // 3. Get connector and fetch table status
    const connector = await getConnectorForShop(shopId, tenantId)
    const table = await connector.findById('location-resources', resource_id!)

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    // 4. Query active or pending session (latest one)
    const { data: sessions, error: sessError } = await admin
      .from('qr_ordering_sessions')
      .select('*')
      .eq('branch_id', shopId)
      .eq('resource_id', resource_id)
      .in('status', ['active', 'pending'])
      .eq('active', 'TRUE')
      .order('created_at', { ascending: false })
      .limit(1)

    if (sessError) throw sessError
    const session = sessions && sessions.length > 0 ? sessions[0] : null


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
    const msg = getErrorMessage(e)
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
    void (async () => {
      try {
        await admin.rpc('cleanup_expired_qr_sessions');
      } catch (err) {
        console.error('Lazy cleanup error:', err);
      }
    })();

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

    // 4. Check if session already active or pending (get the latest active/pending session)
    const { data: activeSessions } = await admin
      .from('qr_ordering_sessions')
      .select('*')
      .eq('branch_id', shopId)
      .eq('resource_id', resource_id)
      .in('status', ['active', 'pending'])
      .eq('active', 'TRUE')
      .order('created_at', { ascending: false })
      .limit(1)

    const activeSession = activeSessions && activeSessions.length > 0 ? activeSessions[0] : null

    if (activeSession) {
      return NextResponse.json({ session: activeSession, table })
    }

    // Fetch shop settings to check if auto-approval is enabled
    const { data: settings } = await admin
      .from('shop_settings')
      .select('qr_auto_approve_session')
      .eq('shop_id', shopId)
      .maybeSingle()

    const autoApprove = settings?.qr_auto_approve_session === true

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

    // 6. Otherwise (table is available), check if we auto-approve or create a pending session
    const newSessionId = crypto.randomUUID()
    const sessionToken = crypto.randomBytes(32).toString('hex')

    if (autoApprove) {
      // Auto-approve: Create an active session and mark table as occupied
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

      // Update table to occupied via connector
      await connector.update('location-resources', resource_id, { status: 'occupied' })

      return NextResponse.json({ session: newSession, table: { ...table, status: 'occupied' } })
    }

    // Otherwise, create a pending approval session
    const { data: pendingSession, error: createError } = await admin
      .from('qr_ordering_sessions')
      .insert({
        id: newSessionId,
        tenant_id: tenantId,
        branch_id: shopId,
        resource_id,
        session_token: sessionToken,
        status: 'pending', // Waiting for receptionists to approve/open
        active: 'TRUE'
      })
      .select()
      .single()

    if (createError) throw createError

    return NextResponse.json({ session: pendingSession, table })
  } catch (e) {
    console.error('[POST qr-sessions]', e)
    const msg = getErrorMessage(e)
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
    const { connector, shop } = await requireShopAccess(shopId, 'pos.use')
    const tenantId = shop.tenant_id

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
    const msg = getErrorMessage(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function getErrorMessage(e: any): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null) {
    try {
      return e.message || e.error || e.details || JSON.stringify(e)
    } catch (_) {
      return String(e)
    }
  }
  return String(e)
}
