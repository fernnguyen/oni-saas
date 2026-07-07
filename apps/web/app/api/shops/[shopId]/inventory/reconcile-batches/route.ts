import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'

const INBOUND_TYPES = ['purchase_in', 'p2p_purchase_in', 'return_in', 'transfer_in']
const OUTBOUND_TYPES = ['sale_out', 'transfer_out']

function calcDelta(type: string, qty: number): number {
  if (INBOUND_TYPES.includes(type)) return Math.abs(qty)
  if (OUTBOUND_TYPES.includes(type)) return -Math.abs(qty)
  return qty
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  return handleReconcile(req, params)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  return handleReconcile(req, params)
}

async function handleReconcile(
  req: NextRequest,
  params: Promise<{ shopId: string }>
) {
  try {
    const { shopId } = await params
    
    // Parse body for POST request
    let body = {}
    try {
      if (req.method === 'POST') {
        body = await req.json()
      }
    } catch (e) {}
    
    const searchParams = req.nextUrl.searchParams
    const isDryRun = (body as any).dryRun !== false && searchParams.get('dryRun') !== 'false' && searchParams.get('dryRun') !== '0'
    // Default to dry-run true unless explicitly false for safety

    // Require settings.manage to ensure only owner/admin can run this fix
    const { connector, shop, user } = await requireShopAccess(shopId, 'settings.manage')

    // Fetch all stock movements to calculate TRUE inventory
    const movRes = await connector.list('stock-movements', { page: 1, limit: 50000 })
    const movements = movRes.data as Record<string, string>[]

    // Fetch all inventory records
    const invRes = await connector.list('inventory', { page: 1, limit: 10000 })
    const inventory = invRes.data as Record<string, string>[]

    // Fetch all batches
    const batchRes = await connector.list('inventory-batches', { page: 1, limit: 10000 })
    const batches = batchRes.data as Record<string, string>[]

    const results = []
    let fixedCount = 0

    for (const inv of inventory) {
      let invQty = parseFloat(inv.stock_qty || '0')
      let trueSumFromMovements = 0
      
      // 1. Audit and Fix Inventory Total based on Stock Movements
      const productMovements = movements.filter(m => 
        m.product_id === inv.product_id && 
        m.branch_id === inv.branch_id && 
        (m.warehouse_id === inv.warehouse_id || !m.warehouse_id)
      )

      if (productMovements.length > 0) {
        trueSumFromMovements = productMovements.reduce((sum, m) => {
          return sum + calcDelta(m.type || '', parseFloat(m.qty || '0'))
        }, 0)
      } else {
        // If no movements exist (e.g. legacy data without import logs), trust the current invQty
        trueSumFromMovements = invQty
      }

      const simulatedUpdates = []

      if (trueSumFromMovements !== invQty) {
        simulatedUpdates.push({
          action: 'FIX_INVENTORY_TOTAL',
          old_qty: invQty,
          new_qty: trueSumFromMovements,
          diff: Math.abs(trueSumFromMovements - invQty)
        })

        if (!isDryRun) {
          await connector.update('inventory', inv.inventory_id || (inv as any).id, {
            stock_qty: String(trueSumFromMovements)
          })
        }
        
        fixedCount++
        invQty = trueSumFromMovements // Use the corrected true sum for batch reconciliation
      }

      // 2. Audit and Fix Batches based on the (now correct) Inventory Total
      const productBatches = batches.filter(b => 
        b.product_id === inv.product_id && 
        b.branch_id === inv.branch_id &&
        (b.warehouse_id === inv.warehouse_id || !b.warehouse_id)
      )

      const batchSum = productBatches.reduce((sum, b) => sum + parseFloat(b.stock_qty || '0'), 0)

      if (batchSum !== invQty) {
        const diff = invQty - batchSum

      if (diff < 0) { // We need to DEDUCT
        let remainingToSubtract = Math.abs(diff)
        
        // Sort active batches by expiry ascending (FIFO)
        const activeBatches = productBatches.filter(b => parseFloat(b.stock_qty || '0') > 0)
        activeBatches.sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''))

        for (const b of activeBatches) {
          if (remainingToSubtract <= 0) break
          
          const bStock = parseFloat(b.stock_qty || '0')
          const deduct = Math.min(bStock, remainingToSubtract)
          const newBStock = bStock - deduct
          
          simulatedUpdates.push({
            batch_id: b.id || (b as any).batch_id,
            batch_no: b.batch_no,
            old_qty: bStock,
            new_qty: newBStock,
            deducted: deduct
          })

          if (!isDryRun) {
            // Update DB
            await connector.update('inventory-batches', b.id || (b as any).batch_id, {
              stock_qty: String(newBStock)
            })
          }
          
          remainingToSubtract -= deduct
        }

        // If we STILL have remainingToSubtract > 0, we must deduct it from a default batch
        // (meaning creating a negative batch or making default batch negative)
        if (remainingToSubtract > 0) {
          if (!isDryRun) {
            const defaultBatch = productBatches.find(b => !b.batch_no || b.batch_no === 'MẶC ĐỊNH')
            if (defaultBatch) {
              const newBStock = parseFloat(defaultBatch.stock_qty || '0') - remainingToSubtract
              await connector.update('inventory-batches', defaultBatch.id || (defaultBatch as any).batch_id, {
                stock_qty: String(newBStock)
              })
            } else {
              await connector.create('inventory-batches', {
                tenant_id: shop.tenant_id,
                branch_id: inv.branch_id,
                product_id: inv.product_id,
                batch_no: 'MẶC ĐỊNH',
                stock_qty: String(-remainingToSubtract),
                expiry_date: '',
                active: 'TRUE'
              })
            }
          }
          simulatedUpdates.push({
            action: 'CREATE_OR_SUBTRACT_DEFAULT_BATCH',
            deducted: remainingToSubtract
          })
        }

        fixedCount++
        results.push({
          product_id: inv.product_id,
          branch_id: inv.branch_id,
          warehouse_id: inv.warehouse_id,
          true_inventory_qty: invQty,
          previous_batch_sum: batchSum,
          action: 'DEDUCT',
          diff: Math.abs(diff),
          batch_updates: simulatedUpdates
        })
      }
      else if (diff > 0) { // We need to ADD
        if (!isDryRun) {
          // Look for an existing default batch, or just create a new one
          const defaultBatch = productBatches.find(b => !b.batch_no || b.batch_no === 'MẶC ĐỊNH')
          
          if (defaultBatch) {
            const newBStock = parseFloat(defaultBatch.stock_qty || '0') + diff
            await connector.update('inventory-batches', defaultBatch.id || (defaultBatch as any).batch_id, {
              stock_qty: String(newBStock)
            })
          } else {
            // Create a new default batch
            await connector.create('inventory-batches', {
              tenant_id: shop.tenant_id,
              branch_id: inv.branch_id,
              product_id: inv.product_id,
              batch_no: 'MẶC ĐỊNH',
              stock_qty: String(diff),
              expiry_date: '',
              active: 'TRUE'
            })
          }
        }
        
        simulatedUpdates.push({
          action: 'CREATE_OR_ADD_DEFAULT_BATCH',
          added: diff
        })
        fixedCount++

        results.push({
          product_id: inv.product_id,
          branch_id: inv.branch_id,
          warehouse_id: inv.warehouse_id,
          true_inventory_qty: invQty,
          previous_batch_sum: batchSum,
          action: 'ADD_MISSING',
          diff: diff,
          batch_updates: simulatedUpdates
        })
      } // End else if (diff > 0)
      } // End if (batchSum !== invQty)
    } // End for (const inv of inventory)

    return NextResponse.json({
      success: true,
      dryRun: isDryRun,
      message: isDryRun 
        ? `[DRY RUN] Found ${results.length} mismatched products. ${fixedCount} batch records would be updated. To apply changes, append ?dryRun=false`
        : `Reconciliation complete. Checked ${inventory.length} inventory records. Fixed ${fixedCount} batch records across ${results.length} mismatched products.`,
      fixedProducts: results
    })

  } catch (error: any) {
    console.error('Batch reconciliation error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
