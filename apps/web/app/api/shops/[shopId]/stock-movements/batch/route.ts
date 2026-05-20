export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { shopTag, invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../../_helpers'
import { RollbackContext, type IDataConnector } from '@oni/adapters'

const INBOUND_TYPES = ['purchase_in', 'return_in', 'transfer_in']
const OUTBOUND_TYPES = ['sale_out', 'transfer_out']

const MOVEMENT_NO_PREFIX: Record<string, string> = {
  purchase_in:  'PN',
  sale_out:     'PX',
  return_in:    'PTH',
  transfer_in:  'CKV',
  transfer_out: 'CKX',
  adjustment:   'PDK',
}

function calcDelta(type: string, qty: number): number {
  if (INBOUND_TYPES.includes(type)) return Math.abs(qty)
  if (OUTBOUND_TYPES.includes(type)) return -Math.abs(qty)
  return qty // adjustment: signed
}

function getGMT7Time() {
  const d = new Date()
  d.setUTCHours(d.getUTCHours() + 7)
  return d.toISOString().replace('Z', '')
}

async function generateMovementNo(connector: IDataConnector, type: string): Promise<string> {
  const prefix = MOVEMENT_NO_PREFIX[type] ?? 'PKH'
  const result = await connector.list('stock-movements', { page: 1, limit: 5000, filters: { type } })
  const existing = result.data as Record<string, string>[]
  const nums = existing
    .map(r => r.movement_no)
    .filter((n): n is string => !!n && n.startsWith(`${prefix}-`))
    .map(n => parseInt(n.slice(prefix.length + 1), 10))
    .filter(n => !isNaN(n))
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
  return `${prefix}-${String(next).padStart(3, '0')}`
}

interface BatchItem {
  product_id?: string
  qty: string
  unit_cost: string
  sku?: string
  
  // Quick inline creation
  is_new?: boolean
  product_name?: string
  category_name?: string
  sell_price?: string
  min_price?: string
  unit?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  let tx: RollbackContext | undefined
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'products.create')
    tx = new RollbackContext()

    const body = await req.json()
    const {
      type = 'purchase_in',
      branch_id = '',
      supplier_id = '',
      reference_no = '',
      employee_id = '',
      reason = '',
      discount = '0',
      payments = [],
      workflow_status = 'completed',
      payment_status = 'paid',
      items = []
    } = body as {
      type: string
      branch_id?: string
      supplier_id?: string
      reference_no?: string
      employee_id?: string
      reason?: string
      discount?: string
      payments?: { amount: string; method: string }[]
      workflow_status?: 'draft' | 'completed'
      payment_status?: string
      items: BatchItem[]
    }

    if (items.length === 0) {
      return NextResponse.json({ error: 'Danh sách sản phẩm trống.' }, { status: 400 })
    }

    // 1. Generate sequential movement_no for the batch
    const movementNo = await generateMovementNo(connector, type)

    // Cache to prevent duplicate category lookups/creates within this request
    const categoryCache = new Map<string, string>()

    const processedItems: {
      productId: string
      qty: number
      unitCost: string
      sku: string
    }[] = []

    // 2. Loop and process inline product creations
    for (const item of items) {
      let productId = item.product_id
      let finalSku = item.sku || ''

      if (item.is_new) {
        if (!item.product_name || !item.product_name.trim()) {
          return NextResponse.json({ error: 'Tên sản phẩm trống cho dòng sản phẩm mới.' }, { status: 400 })
        }

        // Prevent duplicate product names within database
        const existingProdRes = await connector.list('products', { page: 1, limit: 50, search: item.product_name })
        const matchedProd = (existingProdRes.data as Record<string, string>[]).find(
          p => p.name?.toLowerCase().trim() === item.product_name?.toLowerCase().trim()
        )
        if (matchedProd) {
          return NextResponse.json({ error: `Sản phẩm "${item.product_name}" đã tồn tại trên hệ thống để tránh trùng lặp.` }, { status: 400 })
        }

        // Prevent duplicate SKU
        if (item.sku && item.sku.trim()) {
          const existingSkuRes = await connector.list('products', { page: 1, limit: 10, filters: { sku: item.sku } })
          if (existingSkuRes.data.length > 0) {
            return NextResponse.json({ error: `Mã SKU "${item.sku}" đã được sử dụng.` }, { status: 400 })
          }
        }

        // Resolve or create category inline
        let categoryId = ''
        if (item.category_name && item.category_name.trim()) {
          const catNameTrimmed = item.category_name.trim()
          const catNameLower = catNameTrimmed.toLowerCase()

          if (categoryCache.has(catNameLower)) {
            categoryId = categoryCache.get(catNameLower)!
          } else {
            const catRes = await connector.list('categories', { page: 1, limit: 100, search: catNameTrimmed })
            const existingCat = (catRes.data as Record<string, string>[]).find(
              c => c.name?.toLowerCase().trim() === catNameLower
            )
            if (existingCat) {
              categoryId = existingCat.category_id || existingCat.id
              categoryCache.set(catNameLower, categoryId)
            } else {
              const createdCat = await connector.create('categories', {
                name: catNameTrimmed,
                active: 'TRUE'
              })
              categoryId = (createdCat as any).category_id || (createdCat as any).id
              categoryCache.set(catNameLower, categoryId)
              tx.add(async () => {
                await connector.delete('categories', categoryId).catch(() => {})
              })
            }
          }
        }

        // Create the product
        const isTempSku = !item.sku || item.sku.startsWith('TEMP-') || item.sku.match(/^P-\d{13}-\d+$/)
        const productSku = isTempSku ? '' : (item.sku || '')

        const createdProduct = await connector.create('products', {
          name: item.product_name.trim(),
          sku: productSku,
          category_id: categoryId,
          sell_price: item.sell_price || '0',
          cost_price: item.unit_cost || '0',
          min_price: item.min_price || '0',
          stock_track: 'TRUE',
          active: 'TRUE',
          unit: item.unit || 'Cái'
        }) as Record<string, string>

        productId = createdProduct.product_id || createdProduct.id
        finalSku = createdProduct.sku || createdProduct.id
        tx.add(async () => {
          await connector.delete('products', productId!).catch(() => {})
        })
      }

      if (!productId) {
        return NextResponse.json({ error: 'Không xác định được ID sản phẩm.' }, { status: 400 })
      }

      const qtyVal = parseFloat(item.qty)
      if (isNaN(qtyVal)) {
        return NextResponse.json({ error: 'Số lượng không hợp lệ.' }, { status: 400 })
      }

      processedItems.push({
        productId,
        qty: qtyVal,
        unitCost: item.unit_cost || '0',
        sku: finalSku
      })
    }

    // 3. Create stock movements and update inventory quantities
    const totalPaidAmt = payments.reduce((sum: number, p: { amount: string }) => sum + parseFloat(p.amount || '0'), 0)
    
    // Save movements
    const createdMovements: Record<string, string>[] = []
    for (const pItem of processedItems) {
      let sku = pItem.sku
      if (!sku) {
        const prod = await connector.findById('products', pItem.productId)
        sku = prod ? (prod as any).sku : ''
      }

      const smPayload = {
        type,
        movement_no: movementNo,
        product_id: pItem.productId,
        sku: sku || '',
        qty: String(pItem.qty),
        unit_cost: pItem.unitCost,
        branch_id: branch_id,
        supplier_id: supplier_id,
        reference_no: reference_no,
        reason: reason,
        discount: discount,
        paid_amount: String(totalPaidAmt),
        payments: JSON.stringify(payments),
        payment_status: payment_status,
        workflow_status: workflow_status,
        created_at: getGMT7Time()
      }

      const createdSM = await connector.create('stock-movements', smPayload) as Record<string, string>
      createdMovements.push(createdSM)
      tx.add(async () => {
        await connector.delete('stock-movements', (createdSM as any).movement_id || createdSM.id).catch(() => {})
      })

      // If completed, update inventory stock_qty and cost_price
      if (workflow_status === 'completed') {
        const delta = calcDelta(type, pItem.qty)

        let invListResult = await connector.list('inventory', {
          page: 1, limit: 10,
          filters: { product_id: pItem.productId }
        })
        const allInv = invListResult.data as Record<string, string>[]
        let invRow = allInv.find(i => i.branch_id === branch_id)
        if (!invRow && branch_id !== '') {
          invRow = allInv.find(i => i.branch_id === '')
        }
        if (!invRow) {
          invRow = allInv[0]
        }

        if (invRow) {
          const oldQty = parseFloat(invRow.stock_qty || '0')
          const newQty = oldQty + delta
          await connector.update('inventory', invRow.inventory_id as string, {
            stock_qty: String(newQty)
          })
          tx.add(async () => {
            await connector.update('inventory', invRow.inventory_id as string, { stock_qty: String(oldQty) }).catch(() => {})
          })
        } else {
          // Create inventory row
          const createdInv = await connector.create('inventory', {
            product_id: pItem.productId,
            branch_id: branch_id || '',
            stock_qty: String(delta),
            min_stock: '0',
            sku: sku || ''
          } as Record<string, string>)
          tx.add(async () => {
            await connector.delete('inventory', (createdInv as any).inventory_id).catch(() => {})
          })
        }

        // Update product cost price on inbound
        if (pItem.unitCost && INBOUND_TYPES.includes(type) && parseFloat(pItem.unitCost) > 0) {
          const prod = await connector.findById('products', pItem.productId)
          if (prod) {
            const oldCost = (prod as any).cost_price || '0'
            await connector.update('products', pItem.productId, { cost_price: pItem.unitCost })
            tx.add(async () => {
              await connector.update('products', pItem.productId, { cost_price: oldCost }).catch(() => {})
            })
          }
        }
      }
    }

    // 4. Financial tracking: Sổ quỹ (Cashbook) & Công nợ Nhà cung cấp (Supplier Debt)
    if (type === 'purchase_in') {
      let totalCost = 0
      for (const pItem of processedItems) {
        totalCost += parseFloat(pItem.unitCost) * Math.abs(pItem.qty)
      }
      const discountAmt = parseFloat(discount || '0')
      const debtAmt = Math.max(0, totalCost - discountAmt - totalPaidAmt)

      let supplierName = 'Khách lẻ / Không xác định'
      if (supplier_id) {
        try {
          const supplier = await connector.findById('suppliers', supplier_id) as Record<string, string> | null
          if (supplier) {
            supplierName = supplier.name || 'Nhà cung cấp'

            if (debtAmt > 0 && workflow_status === 'completed') {
              const currentDebt = parseFloat(supplier.debt_amount || '0')
              await connector.update('suppliers', supplier_id, {
                debt_amount: String(currentDebt + debtAmt)
              })
              tx.add(async () => {
                await connector.update('suppliers', supplier_id, { debt_amount: String(currentDebt) }).catch(() => {})
              })
            }
          }
        } catch (err) {
          console.error('Failed to update supplier debt in batch:', err)
        }
      }

      // Add Cashbook records for payments (Consolidated once per payment method)
      if (payments.length > 0 && payment_status !== 'unpaid' && workflow_status === 'completed') {
        for (const payment of payments) {
          const pAmt = parseFloat(payment.amount || '0')
          if (pAmt > 0) {
            const createdCb = await connector.create('cashbook', {
              type:           'payment',
              amount:         String(pAmt),
              method:         payment.method || 'cash',
              category:       'inventory',
              reference_id:   movementNo,
              reference_name: supplierName,
              note:           `Thanh toán phiếu nhập kho ${movementNo}`,
              employee_id:    employee_id || '',
              branch_id:      branch_id || '',
            })
            tx.add(async () => {
              await connector.delete('cashbook', (createdCb as any).transaction_id).catch(() => {})
            })
          }
        }
      }
    }

    // Invalidate caches
    invalidate(shopId, 'products')
    invalidate(shopId, 'categories')
    invalidate(shopId, 'inventory')
    invalidate(shopId, 'stock-movements')
    if (type === 'purchase_in' && supplier_id) {
      invalidate(shopId, 'suppliers')
    }

    return NextResponse.json({ ok: true, movement_no: movementNo, movements: createdMovements })
  } catch (e) {
    if (tx) {
      await tx.rollback()
    }
    return handleApiError(e, 'POST stock-movements/batch')
  }
}
