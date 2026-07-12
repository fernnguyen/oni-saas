export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { checkFeatureAccess } from '@/lib/server/features'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { getConnectorForShop } from '@/lib/server/connectorFactory'
import { NotificationDispatcher } from '@/lib/server/notificationDispatcher'
import crypto from 'crypto'
import { getGMT7Time } from '@oni/core'


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
      tenantId = access.shop.tenant_id
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

      if (!session || (session.status !== 'active' && session.status !== 'completed') || session.active !== 'TRUE') {
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
    const { session_id, session_token, items, customer_name, customer_phone, note } = body

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
        active: 'TRUE',
        customer_name: customer_name || null,
        customer_phone: customer_phone || null,
        note: note || null
      })
      .select()
      .single()

    if (createError) throw createError

    // Bắn thông báo gọi món QR mới
    try {
      const { data: shopInfo } = await admin
        .from('shops')
        .select('name, slug, industry_type')
        .eq('id', shopId)
        .maybeSingle()

      if (shopInfo) {
        const connector = await getConnectorForShop(shopId, tenantId)
        const table = await connector.findById('location-resources', session.resource_id)

        await NotificationDispatcher.sendQrOrderCreated(tenantId, {
          id: shopId,
          name: shopInfo.name,
          slug: shopInfo.slug,
          industry_type: shopInfo.industry_type || 'fnb'
        }, {
          id: orderRequest.id,
          resource_id: session.resource_id,
          table_name: table?.name,
          item_count: items.length
        })
      }
    } catch (err) {
      console.error('Failed to dispatch QR order notification:', err);
    }

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
    const { shop } = await requireShopAccess(shopId, 'pos.use')
    const tenantId = shop.tenant_id

    const body = await req.json()
    const { request_id, action, reject_reason, items } = body

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
      // 1. Get connector via shop access
      const { connector } = await requireShopAccess(shopId, 'pos.use')
      
      const resourceId = request.resource_id
      if (!resourceId) {
        return NextResponse.json({ error: 'Yêu cầu gọi món không gắn với bàn ăn nào.' }, { status: 400 })
      }

      // 2. Fetch table status
      const table = await connector.findById('location-resources', resourceId)
      if (!table) {
        return NextResponse.json({ error: 'Bàn ăn không tồn tại trong hệ thống.' }, { status: 404 })
      }

      const requestItems = Array.isArray(items) ? items : (Array.isArray(request.items) ? request.items : [])
      let finalOrderId = ''

      const existingOrderId = table.current_order_id || ''
      let currentOrder = null
      if (existingOrderId) {
        try {
          currentOrder = await connector.findById('orders', existingOrderId)
        } catch (err) {
          console.error('[Accept QR Order] Failed to fetch current order:', err)
        }
      }

      // Helper to check if two items are identical (same product + variant + modifiers)
      const isSameItem = (it1: any, it2: any) => {
        const m1 = typeof it1.modifiers === 'string' ? it1.modifiers : JSON.stringify(it1.modifiers || {});
        const m2 = typeof it2.modifiers === 'string' ? it2.modifiers : JSON.stringify(it2.modifiers || {});
        return it1.product_id === it2.product_id && 
               (it1.variant_label || '') === (it2.variant_label || '') &&
               m1 === m2;
      }

      if (currentOrder && currentOrder.status === 'in_progress') {
        // --- CASE 1: MERGE INTO EXISTING IN-PROGRESS ORDER ---
        finalOrderId = existingOrderId

        // Fetch current order items
        const existingItemsResult = await connector.list('order-items', {
          page: 1, limit: 200,
          filters: { order_id: finalOrderId }
        })
        const existingItems = existingItemsResult.data || []

        for (const newItem of requestItems) {
          const matchedItem = existingItems.find((ei: any) => isSameItem(ei, newItem))
          
          if (matchedItem) {
            // Update quantity of existing order item
            const newQty = Number(matchedItem.qty) + Number(newItem.qty)
            const newLineTotal = newQty * Number(matchedItem.unit_price)
            await connector.update('order-items', matchedItem.item_id || matchedItem.id, {
              qty: String(newQty),
              line_total: String(newLineTotal)
            })
          } else {
            // Create a new order item in this order
            const lineNo = existingItems.length + 1
            await connector.create('order-items', {
              order_id: finalOrderId,
              order_no: currentOrder.order_no || '',
              line_no: String(lineNo),
              product_id: newItem.product_id,
              sku: newItem.sku || '',
              product_name: newItem.product_name,
              qty: String(newItem.qty),
              unit_price: String(newItem.unit_price),
              original_price: String(newItem.original_price ?? newItem.unit_price),
              line_discount: '0',
              line_total: String(newItem.line_total),
              variant_label: newItem.variant_label || '',
              modifiers: typeof newItem.modifiers === 'object' ? JSON.stringify(newItem.modifiers) : (newItem.modifiers || ''),
              modifier_total: String(newItem.modifier_total || 0),
              unit_id: newItem.unit_id || '',
              unit_name: newItem.unit_name || '',
              conversion_rate: String(newItem.conversion_rate || 1)
            })
          }
        }

        // Recalculate order totals
        const updatedItemsResult = await connector.list('order-items', {
          page: 1, limit: 200,
          filters: { order_id: finalOrderId }
        })
        const updatedItems = updatedItemsResult.data || []
        const newSubtotal = updatedItems.reduce((acc: number, it: any) => acc + Number(it.line_total || 0), 0)
        const newTotalAmount = newSubtotal - Number(currentOrder.discount_amount || 0) + Number(currentOrder.tax_amount || 0)

        await connector.update('orders', finalOrderId, {
          subtotal: String(newSubtotal),
          total_amount: String(newTotalAmount)
        })

      } else {
        // --- CASE 2: CREATE NEW DINE-IN ORDER ---
        const newSubtotal = requestItems.reduce((acc: number, it: any) => acc + Number(it.line_total || 0), 0)
        const orderNo = 'QR-' + Date.now().toString().slice(-6) + Math.floor(100 + Math.random() * 900)

        const createdOrder = await connector.create('orders', {
          status: 'in_progress',
          channel: 'qr',
          customer_id: 'C-DEFAULT-RETAIL',
          customer_name: request.customer_name || 'Khách lẻ',
          branch_id: shopId,
          subtotal: String(newSubtotal),
          discount_amount: '0',
          tax_amount: '0',
          total_amount: String(newSubtotal),
          paid_amount: '0',
          debt_amount: '0',
          note: request.note 
            ? `Gọi món tại bàn ${table.name || table.resource_id} | Ghi chú: ${request.note}` 
            : `Gọi món tại bàn ${table.name || table.resource_id}`,
          order_no: orderNo,
          created_at: getGMT7Time()
        })

        finalOrderId = createdOrder.order_id || createdOrder.id

        // Create all order items in batch
        const itemsToCreate = requestItems.map((newItem: any, idx: number) => ({
          order_id: finalOrderId,
          order_no: orderNo,
          line_no: String(idx + 1),
          product_id: newItem.product_id,
          sku: newItem.sku || '',
          product_name: newItem.product_name,
          qty: String(newItem.qty),
          unit_price: String(newItem.unit_price),
          original_price: String(newItem.original_price ?? newItem.unit_price),
          line_discount: '0',
          line_total: String(newItem.line_total),
          variant_label: newItem.variant_label || '',
          modifiers: typeof newItem.modifiers === 'object' ? JSON.stringify(newItem.modifiers) : (newItem.modifiers || ''),
          modifier_total: String(newItem.modifier_total || 0),
          unit_id: newItem.unit_id || '',
          unit_name: newItem.unit_name || '',
          conversion_rate: String(newItem.conversion_rate || 1)
        }))

        if (itemsToCreate.length > 0) {
          await connector.batchCreate('order-items', itemsToCreate)
        }

        // Update location resource to occupied and bind to new order
        await connector.update('location-resources', resourceId, {
          status: 'occupied',
          current_order_id: finalOrderId
        })
      }

      // Update Supabase request status
      const updateData: any = {
        status: 'accepted',
        updated_at: new Date().toISOString()
      }
      
      if (Array.isArray(items)) {
        updateData.items = items // Save only the accepted items to the DB
        if (reject_reason) {
          updateData.reject_reason = reject_reason // Write the automatic partial reject reason
        }
      }

      const { data: updatedRequest, error: updateError } = await admin
        .from('qr_order_requests')
        .update(updateData)
        .eq('id', request_id)
        .select()
        .single()

      if (updateError) throw updateError
      return NextResponse.json({ request: updatedRequest, order_id: finalOrderId })
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
