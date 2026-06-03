export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'

function getGMT7Time() {
  const d = new Date()
  d.setUTCHours(d.getUTCHours() + 7)
  return d.toISOString().replace('Z', '')
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, user } = await requireShopAccess(shopId, 'housekeeping.edit')

    const body = await req.json()
    const { resource_id, items, employee_id, employee_name } = body // items: array of { product_id, current_qty } (Remaining quantities in room)

    if (!resource_id || !items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Missing parameters resource_id or items array' }, { status: 400 })
    }

    // 1. Fetch room resource to ensure it is occupied and get active order id
    const room = await connector.findById('location-resources', resource_id)
    if (!room) return NextResponse.json({ error: 'Room resource not found' }, { status: 404 })
    if (room.status !== 'occupied' || !room.current_order_id) {
      return NextResponse.json({ error: 'Phòng hiện đang trống, không thể báo cáo tiêu hao minibar!' }, { status: 400 })
    }

    // Fetch the active order
    const order = await connector.findById('orders', room.current_order_id)
    if (!order) return NextResponse.json({ error: 'Active order not found for room' }, { status: 404 })

    // 2. Fetch minibar setup for this room to compare
    const setupRes = await connector.list('minibar-setup', {
      filters: { resource_id, branch_id: shopId },
      limit: 100
    })
    const setups = setupRes.data || []
    if (setups.length === 0) {
      return NextResponse.json({ error: 'Phòng này chưa được cài đặt định mức Minibar mặc định!' }, { status: 400 })
    }

    // 3. Resolve warehouse via employee department link or find default Buồng phòng department
    let warehouseId = ''
    const resolvedEmpId = employee_id || user.id
    
    // A. Check employee's department link first
    const userDeptRes = await connector.list('user-departments', {
      filters: { user_id: resolvedEmpId },
      limit: 1
    })
    const userDept = userDeptRes.data && userDeptRes.data[0]
    if (userDept && userDept.department_id) {
      const dept = await connector.findById('departments', userDept.department_id)
      if (dept && dept.warehouse_id) {
        warehouseId = dept.warehouse_id
      }
    }

    // B. Fallback: search for department named 'Buồng phòng' or 'Housekeeping'
    if (!warehouseId) {
      const deptList = await connector.list('departments', {
        filters: { branch_id: shopId },
        limit: 100
      })
      const depts = deptList.data || []
      const hskpDept = depts.find((d: any) => {
        const nameLower = (d.name || '').trim().toLowerCase()
        return nameLower.includes('buồng phòng') || nameLower.includes('housekeeping') || nameLower === 'dọn phòng'
      })

      if (!hskpDept) {
        return NextResponse.json(
          { error: 'Không tìm thấy phòng ban "Buồng phòng" trong hệ thống. Vui lòng vào Thiết lập -> Phòng ban để tạo phòng ban này.' },
          { status: 400 }
        )
      }

      if (!hskpDept.warehouse_id) {
        return NextResponse.json(
          { error: `Phòng ban "${hskpDept.name}" chưa được cấu hình Kho liên kết. Vui lòng vào Thiết lập -> Phòng ban để chọn kho hàng tương ứng.` },
          { status: 400 }
        )
      }

      warehouseId = hskpDept.warehouse_id
    }

    // 4. Calculate consumption & process
    const consumptionDetails: any[] = []
    let totalAddedFee = 0

    for (const setupItem of setups) {
      const reported = items.find(it => it.product_id === setupItem.product_id)
      if (!reported) continue // No count provided for this item

      const standardQty = parseInt(setupItem.standard_qty || '0', 10)
      const currentQty = parseInt(reported.current_qty || '0', 10)
      const consumedQty = Math.max(0, standardQty - currentQty)

      if (consumedQty > 0) {
        // Fetch product details
        const product = await connector.findById('products', setupItem.product_id)
        if (!product) continue

        const unitPrice = parseFloat(product.sell_price || '0')
        const lineTotal = consumedQty * unitPrice
        totalAddedFee += lineTotal

        // A. Add to active room order items
        await connector.create('order-items', {
          order_id: order.id,
          order_no: order.order_no || '',
          branch_id: shopId,
          product_id: product.id,
          sku: product.sku || '',
          product_name: product.name || '',
          qty: String(consumedQty),
          unit_price: String(unitPrice),
          line_total: String(lineTotal),
          variant_label: product.item_class === 'room_asset' ? 'Bồi thường tài sản' : 'Tiêu hao Minibar'
        })

        // B. Create inventory stock movement (MINIBAR_CONSUMPTION or ASSET_LOSS)
        if (warehouseId) {
          await connector.create('stock-movements', {
            type: 'issue',
            product_id: product.id,
            sku: product.sku || '',
            qty: String(consumedQty),
            unit_cost: product.cost_price || '0',
            branch_id: shopId,
            warehouse_id: warehouseId,
            reason: product.item_class === 'room_asset'
              ? `Bồi thường hao hụt/hư hỏng tài sản Phòng ${room.name}`
              : `Tiêu hao Minibar Phòng ${room.name}`,
            reference_no: order.order_no || '',
            workflow_status: 'COMPLETED'
          })

          // Update inventory stock quantity
          const invRes = await connector.list('inventory', {
            filters: { branch_id: shopId, product_id: product.id, warehouse_id: warehouseId },
            limit: 1
          })
          if (invRes.total > 0) {
            const currentStock = parseFloat(invRes.data[0].stock_qty || '0')
            await connector.update('inventory', invRes.data[0].id, {
              stock_qty: String(Math.max(0, currentStock - consumedQty))
            })
          }
        }

        // Keep detail log
        consumptionDetails.push({
          product_id: product.id,
          product_name: product.name,
          consumed_qty: consumedQty,
          unit_price: unitPrice
        })
      }

      // C. Restore the room's minibar stock back to standard (top-up done physically by HK)
      const stockRes = await connector.list('room-minibar-stock', {
        filters: { resource_id, product_id: setupItem.product_id, branch_id: shopId },
        limit: 1
      })
      if (stockRes.total > 0) {
        await connector.update('room-minibar-stock', stockRes.data[0].id, {
          current_qty: String(standardQty)
        })
      } else {
        await connector.create('room-minibar-stock', {
          resource_id,
          product_id: setupItem.product_id,
          current_qty: String(standardQty),
          branch_id: shopId
        })
      }
    }

    // 5. Update order totals
    const currentSubtotal = parseFloat(order.subtotal || '0')
    const currentTotal = parseFloat(order.total_amount || '0')
    const newSubtotal = currentSubtotal + totalAddedFee
    const newTotal = currentTotal + totalAddedFee

    await connector.update('orders', order.id, {
      subtotal: String(newSubtotal),
      total_amount: String(newTotal)
    })

    // 6. Create Housekeeping log
    const hkLog = await connector.create('housekeeping-logs', {
      branch_id: shopId,
      resource_id,
      employee_id: employee_id || user.email || 'system',
      employee_name: employee_name || user.email || 'System',
      status: 'clean_inspected',
      check_type: 'checkout_check',
      consumption_details: JSON.stringify(consumptionDetails),
      topup_status: 'completed',
      note: `Khách tiêu dùng Minibar: ${consumptionDetails.map(d => `${d.product_name} x ${d.consumed_qty}`).join(', ') || 'Không tiêu dùng gì'}`
    })

    invalidate(shopId, 'orders')
    invalidate(shopId, 'order-items')
    invalidate(shopId, 'inventory')
    invalidate(shopId, 'stock-movements')
    invalidate(shopId, 'room-minibar-stock')

    return NextResponse.json({
      success: true,
      log: hkLog,
      consumption: consumptionDetails,
      totalAddedFee
    })
  } catch (e) {
    return handleApiError(e, 'POST report-consumption')
  }
}
