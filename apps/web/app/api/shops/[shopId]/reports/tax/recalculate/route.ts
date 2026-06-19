export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { handleApiError } from '../../../../_helpers'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.edit')

    const body = await req.json()
    const { fromDate, toDate } = body // Expected format: YYYY-MM-DD

    if (!fromDate || !toDate) {
      return NextResponse.json(
        { error: 'Thiếu thông tin khoảng thời gian từ ngày - đến ngày!' },
        { status: 400 }
      )
    }

    // 1. Kiểm tra xem có kỳ khóa sổ nào đè lên khoảng thời gian cần recalculate hay không
    const lockedRes = await connector.list('tax-locked-periods', {
      filters: { branch_id: shopId, status: 'locked' },
      limit: 200,
    })
    const lockedPeriods = lockedRes.data as Array<{
      start_date: string
      end_date: string
      period_name: string
    }>

    for (const period of lockedPeriods) {
      // Overlap condition: start_date <= toDate && end_date >= fromDate
      if (period.start_date <= toDate && period.end_date >= fromDate) {
        return NextResponse.json(
          {
            error: `Khoảng thời gian này trùng với kỳ thuế đã khóa sổ (${period.period_name}). Vui lòng mở khóa trước khi đồng bộ lại!`,
          },
          { status: 400 }
        )
      }
    }

    // 2. Quét các đơn hàng trong khoảng thời gian từ fromDate đến toDate
    const ordersResult = await connector.list('orders', { limit: 5000 })
    const filteredOrders = (ordersResult.data as any[]).filter((o) => {
      const orderDate = o.created_at?.slice(0, 10)
      return orderDate && orderDate >= fromDate && orderDate <= toDate
    })

    if (filteredOrders.length === 0) {
      return NextResponse.json({ ok: true, message: 'Không tìm thấy đơn hàng nào trong khoảng thời gian này.' })
    }

    // Cache để tránh truy vấn db lặp đi lặp lại cho cùng 1 sản phẩm/danh mục
    const productCache = new Map<string, any>()
    const categoryCache = new Map<string, any>()

    let updatedItemsCount = 0
    let updatedOrdersCount = 0

    for (const order of filteredOrders) {
      // Lấy chi tiết các items của đơn hàng này
      const itemsRes = await connector.list('order-items', {
        filters: { order_id: order.id },
        limit: 100,
      })
      const items = itemsRes.data as any[]

      let orderTaxTotal = 0
      let orderModified = false

      for (const item of items) {
        let taxRate = '0'
        let taxGroup = ''

        // Tra cứu sản phẩm (sử dụng cache)
        let product = productCache.get(item.product_id)
        if (product === undefined) {
          try {
            product = await connector.findById('products', item.product_id)
            productCache.set(item.product_id, product || null)
          } catch (e) {
            product = null
            productCache.set(item.product_id, null)
          }
        }

        if (product) {
          taxRate = product.tax_rate || '0'
          taxGroup = product.tax_group || ''
        }

        // Nếu sản phẩm không có cấu hình thuế, thử tra cứu danh mục (sử dụng cache)
        if ((taxRate === '0' || !taxGroup) && product?.category_id) {
          let category = categoryCache.get(product.category_id)
          if (category === undefined) {
            try {
              category = await connector.findById('categories', product.category_id)
              categoryCache.set(product.category_id, category || null)
            } catch (e) {
              category = null
              categoryCache.set(product.category_id, null)
            }
          }
          if (category) {
            taxRate = taxRate && taxRate !== '0' ? taxRate : (category.tax_rate || '0')
            taxGroup = taxGroup || category.tax_group || ''
          }
        }

        const rateVal = parseFloat(taxRate) || 0
        const totalVal = parseFloat(item.line_total) || 0
        const calculatedTaxAmount = (totalVal * rateVal) / 100

        orderTaxTotal += calculatedTaxAmount

        // Cập nhật item nếu có sự thay đổi
        if (
          item.tax_rate !== taxRate ||
          item.tax_group !== taxGroup ||
          parseFloat(item.tax_amount || '0') !== calculatedTaxAmount
        ) {
          await connector.update('order-items', item.id, {
            tax_rate: taxRate,
            tax_group: taxGroup,
            tax_amount: String(calculatedTaxAmount),
          })
          updatedItemsCount++
          orderModified = true
        }
      }

      // Cập nhật lại tổng thuế ở đơn hàng nếu có thay đổi
      if (orderModified || parseFloat(order.tax_amount || '0') !== orderTaxTotal) {
        await connector.update('orders', order.id, {
          tax_amount: String(orderTaxTotal),
        })
        updatedOrdersCount++
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Đã đồng bộ lại lịch sử thuế thành công.`,
      details: {
        ordersChecked: filteredOrders.length,
        ordersUpdated: updatedOrdersCount,
        itemsUpdated: updatedItemsCount,
      },
    })
  } catch (e) {
    return handleApiError(e, 'POST tax recalculate')
  }
}
