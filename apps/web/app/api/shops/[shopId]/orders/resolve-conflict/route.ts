import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'
import { getGMT7Time } from '@oni/core'

type ConflictAction = 'merge' | 'keep_server' | 'replace_server'

interface ResolveConflictBody {
  action: ConflictAction
  local_order_id: string
  existing_order_id: string
  resource_id: string
  local_items?: {
    product_id: string
    product_name: string
    qty: number
    unit_price: number
    discount_amount?: number
    line_total: number
    variant_label?: string
    modifiers?: string
    modifier_total?: number
    unit_id?: string
    unit_name?: string
    tax_rate?: string
    tax_amount?: number
  }[]
  local_metadata?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.create')

    const body = (await req.json()) as ResolveConflictBody
    const { action, local_order_id, existing_order_id, resource_id, local_items, local_metadata } = body

    if (!action || !['merge', 'keep_server', 'replace_server'].includes(action)) {
      return NextResponse.json(
        { error: 'action phải là merge | keep_server | replace_server' },
        { status: 400 }
      )
    }

    if (!existing_order_id) {
      return NextResponse.json(
        { error: 'Thiếu existing_order_id' },
        { status: 400 }
      )
    }

    // Validate existing order exists
    const existingOrder = await connector.findById('orders', existing_order_id).catch(() => null)
    if (!existingOrder) {
      return NextResponse.json(
        { error: 'Không tìm thấy đơn hàng hiện tại trên server' },
        { status: 404 }
      )
    }

    // ── keep_server ──
    if (action === 'keep_server') {
      return NextResponse.json({
        ok: true,
        resolved_order_id: existing_order_id,
        action_taken: 'keep_server',
      })
    }

    // ── merge ──
    if (action === 'merge') {
      // Get existing items
      const existingItemsRes = await connector.list('order-items', {
        page: 1,
        limit: 200,
        filters: { order_id: existing_order_id },
      })
      const existingItems = (existingItemsRes.data || []) as Record<string, any>[]

      // Build dedup key set: product_id + variant_label
      const existingKeyMap = new Map<string, Record<string, any>>()
      for (const item of existingItems) {
        const key = `${item.product_id || ''}::${item.variant_label || ''}`
        existingKeyMap.set(key, item)
      }

      let itemsAdded = 0
      let itemsUpdated = 0

      if (local_items && local_items.length > 0) {
        for (const localItem of local_items) {
          const key = `${localItem.product_id || ''}::${localItem.variant_label || ''}`
          const existing = existingKeyMap.get(key)

          if (existing) {
            // Item exists on server — update qty (add local qty to server qty)
            const existingItemId = String(existing.id || existing.order_item_id || '')
            const newQty = Number(existing.qty || 0) + Number(localItem.qty || 0)
            const newLineTotal = newQty * Number(localItem.unit_price || existing.unit_price || 0)
            await connector.update('order-items', existingItemId, {
              qty: String(newQty),
              line_total: String(newLineTotal),
            })
            itemsUpdated++
          } else {
            // New item — create
            await connector.create('order-items', {
              order_id: existing_order_id,
              product_id: localItem.product_id,
              product_name: localItem.product_name,
              qty: String(localItem.qty),
              unit_price: String(localItem.unit_price),
              discount_amount: String(localItem.discount_amount || 0),
              line_total: String(localItem.line_total),
              variant_label: localItem.variant_label || '',
              modifiers: localItem.modifiers || '',
              modifier_total: String(localItem.modifier_total || 0),
              unit_id: localItem.unit_id || '',
              unit_name: localItem.unit_name || '',
              tax_rate: localItem.tax_rate || '',
              tax_amount: String(localItem.tax_amount || 0),
            })
            itemsAdded++
          }
        }
      }

      // Recalculate order totals
      const updatedItemsRes = await connector.list('order-items', {
        page: 1,
        limit: 200,
        filters: { order_id: existing_order_id },
      })
      const allItems = (updatedItemsRes.data || []) as Record<string, any>[]
      const subtotal = allItems.reduce((sum, it) => sum + Number(it.line_total || 0), 0)
      const totalDiscount = allItems.reduce((sum, it) => sum + Number(it.discount_amount || 0), 0)

      await connector.update('orders', existing_order_id, {
        subtotal: String(subtotal),
        total_amount: String(subtotal - totalDiscount),
      })

      invalidate(shopId, 'orders')
      invalidate(shopId, 'order-items')

      return NextResponse.json({
        ok: true,
        resolved_order_id: existing_order_id,
        action_taken: 'merge',
        items_count: itemsAdded + itemsUpdated,
      })
    }

    // ── replace_server ──
    if (action === 'replace_server') {
      // 1. Cancel existing order
      await connector.update('orders', existing_order_id, {
        status: 'cancelled',
        note: 'Thay thế bởi đơn từ thiết bị khác',
      })

      // 2. Delete existing items
      const existingItemsRes = await connector.list('order-items', {
        page: 1,
        limit: 200,
        filters: { order_id: existing_order_id },
      })
      const existingItems = (existingItemsRes.data || []) as Record<string, any>[]
      for (const item of existingItems) {
        const itemId = String(item.id || item.order_item_id || '')
        if (itemId) {
          await connector.delete('order-items', itemId).catch(() => {})
        }
      }

      // 3. Create new order from local data
      let subtotal = 0
      let totalDiscount = 0
      if (local_items && local_items.length > 0) {
        subtotal = local_items.reduce((sum, it) => sum + Number(it.line_total || 0), 0)
        totalDiscount = local_items.reduce((sum, it) => sum + Number(it.discount_amount || 0), 0)
      }

      const createData: Record<string, string> = {
        status: 'in_progress',
        channel: 'pos',
        customer_id: String(existingOrder.customer_id || ''),
        customer_name: String(existingOrder.customer_name || ''),
        branch_id: String(existingOrder.branch_id || ''),
        employee_id: String(existingOrder.employee_id || ''),
        subtotal: String(subtotal),
        discount_amount: String(totalDiscount),
        tax_amount: '0',
        total_amount: String(subtotal - totalDiscount),
        paid_amount: '0',
        debt_amount: '0',
        note: '',
        payment_method: 'cash',
        reference_no: local_order_id || '',
        created_at: getGMT7Time(),
      }
      if (resource_id) {
        createData.resource_id = resource_id
      }
      if (local_metadata) {
        createData.metadata = local_metadata
      }

      const created = await connector.create('orders', createData)
      const newOrderId = String((created as Record<string, string>).order_id || (created as Record<string, string>).id || '')

      // 4. Create items for the new order
      if (local_items && local_items.length > 0) {
        for (const item of local_items) {
          await connector.create('order-items', {
            order_id: newOrderId,
            product_id: item.product_id,
            product_name: item.product_name,
            qty: String(item.qty),
            unit_price: String(item.unit_price),
            discount_amount: String(item.discount_amount || 0),
            line_total: String(item.line_total),
            variant_label: item.variant_label || '',
            modifiers: item.modifiers || '',
            modifier_total: String(item.modifier_total || 0),
            unit_id: item.unit_id || '',
            unit_name: item.unit_name || '',
            tax_rate: item.tax_rate || '',
            tax_amount: String(item.tax_amount || 0),
          })
        }
      }

      // 5. Update resource to point to new order
      if (resource_id) {
        await connector.update('location-resources', resource_id, {
          status: 'occupied',
          current_order_id: newOrderId,
        }).catch(() => {})
        invalidate(shopId, 'location-resources')
      }

      invalidate(shopId, 'orders')
      invalidate(shopId, 'order-items')

      return NextResponse.json({
        ok: true,
        resolved_order_id: newOrderId,
        action_taken: 'replace_server',
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (e) {
    return handleApiError(e, 'POST orders/resolve-conflict')
  }
}
