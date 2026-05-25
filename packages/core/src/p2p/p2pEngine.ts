export interface ListOptions {
  page?: number;
  limit?: number;
  search?: string;
  filters?: Record<string, string>;
  sortDesc?: boolean;
}

export interface ListResult {
  data: Record<string, string>[];
  total: number;
  page: number;
  limit: number;
}

export interface IDataConnector {
  list(entity: string, options?: ListOptions): Promise<ListResult>;
  findById(entity: string, id: string): Promise<Record<string, string> | null>;
  create(entity: string, data: Record<string, string>): Promise<Record<string, string>>;
  update(entity: string, id: string, data: Partial<Record<string, string>>): Promise<Record<string, string>>;
  delete(entity: string, id: string): Promise<void>;
  batchCreate(entity: string, rows: Record<string, string>[]): Promise<Record<string, string>[]>;
}

// Let's define the types locally for safety and simplicity
export type PRAction = 'SUBMIT' | 'ASSIGN_PRICE' | 'APPROVE_KTT' | 'APPROVE_GD' | 'REJECT' | 'RECALL';

export interface PRPayload {
  estimated_total?: string;
  items?: Array<{ id: string; estimated_unit_price: string; line_total: string }>;
  note?: string;
}

export class P2PEngine {
  /**
   * Transition a Purchase Requisition (PR) through the approval flow.
   * State Machine: DRAFT -> PENDING_PRICING -> PENDING_KTT -> PENDING_GD -> APPROVED / REJECTED
   */
  static async transitionPR(
    connector: IDataConnector,
    prId: string,
    action: PRAction,
    userId: string,
    payload?: PRPayload
  ): Promise<Record<string, string>> {
    const pr = await connector.findById('purchase-requisitions', prId);
    if (!pr) throw new Error(`Purchase Requisition #${prId} not found.`);

    const currentStatus = pr.status || 'DRAFT';
    let nextStatus = currentStatus;

    switch (action) {
      case 'SUBMIT':
        if (currentStatus !== 'DRAFT') {
          throw new Error(`Cannot submit PR in status: ${currentStatus}`);
        }
        nextStatus = 'PENDING_PRICING';
        break;

      case 'ASSIGN_PRICE':
        if (currentStatus !== 'PENDING_PRICING') {
          throw new Error(`Cannot assign pricing to PR in status: ${currentStatus}`);
        }
        nextStatus = 'PENDING_KTT';
        
        // Update price estimates for items if provided
        if (payload?.items) {
          for (const item of payload.items) {
            await connector.update('purchase-requisition-items', item.id, {
              estimated_unit_price: item.estimated_unit_price,
              line_total: item.line_total,
            });
          }
        }
        if (payload?.estimated_total) {
          pr.estimated_total = payload.estimated_total;
        }
        break;

      case 'APPROVE_KTT':
        if (currentStatus !== 'PENDING_KTT') {
          throw new Error(`KTT cannot approve PR in status: ${currentStatus}`);
        }
        // Move to Giám đốc approval
        nextStatus = 'PENDING_GD';
        break;

      case 'APPROVE_GD':
        if (currentStatus !== 'PENDING_GD') {
          throw new Error(`Giám đốc cannot approve PR in status: ${currentStatus}`);
        }
        nextStatus = 'APPROVED';
        break;

      case 'REJECT':
        if (currentStatus !== 'PENDING_KTT' && currentStatus !== 'PENDING_GD') {
          throw new Error(`Cannot reject PR in status: ${currentStatus}`);
        }
        nextStatus = 'REJECTED';
        break;

      case 'RECALL':
        if (currentStatus !== 'PENDING_PRICING') {
          throw new Error(`Cannot recall PR in status: ${currentStatus}`);
        }
        nextStatus = 'DRAFT';
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    const updatedPr = await connector.update('purchase-requisitions', prId, {
      status: nextStatus,
      estimated_total: pr.estimated_total,
      note: payload?.note !== undefined ? payload.note : pr.note,
    });

    return updatedPr;
  }

  /**
   * Convert an APPROVED PR into an official Purchase Order (PO) for a specified Supplier.
   */
  static async createPOFromPR(
    connector: IDataConnector,
    prId: string,
    purchaserId: string,
    supplierId: string,
    supplierName: string
  ): Promise<Record<string, string>> {
    const pr = await connector.findById('purchase-requisitions', prId);
    if (!pr) throw new Error(`PR #${prId} not found.`);
    if (pr.status !== 'APPROVED') {
      throw new Error(`Cannot issue Purchase Order from an unapproved PR (Current: ${pr.status}).`);
    }

    // Fetch PR Items
    const itemsResult = await connector.list('purchase-requisition-items', {
      filters: { requisition_id: prId },
      limit: 100,
    });

    // Create the PO Header
    const poData = {
      requisition_id: prId,
      supplier_id: supplierId,
      supplier_name: supplierName,
      purchaser_id: purchaserId,
      total_amount: pr.estimated_total || '0',
      status: 'APPROVED', // Since PR was pre-approved by Director, PO starts as APPROVED directly
      branch_id: pr.branch_id || '',
      note: `Tự động tạo từ đề xuất mua sắm PR #${pr.requisition_no || prId}`,
    };
    const po = await connector.create('purchase-orders', poData);
    
    // Copy items to PO items
    for (const prItem of itemsResult.data) {
      await connector.create('purchase-order-items', {
        purchase_order_id: po.id,
        product_id: prItem.product_id || '',
        product_name: prItem.product_name || '',
        qty: prItem.qty || '0',
        actual_unit_price: prItem.estimated_unit_price || '0',
        line_total: prItem.line_total || '0',
      });
    }

    // Mark PR as converted
    await connector.update('purchase-requisitions', prId, { status: 'CONVERTED_TO_PO' });

    return po;
  }

  /**
   * Finalize and approve a Goods Receipt Note (GRN), triggering the 3-Way Match,
   * updating supplier debts, price histories, and recalculating moving average costs.
   */
  static async approveGRN(
    connector: IDataConnector,
    grnId: string,
    userId: string
  ): Promise<Record<string, string>> {
    const grn = await connector.findById('goods-receipt-notes', grnId);
    if (!grn) throw new Error(`Goods Receipt Note #${grnId} not found.`);
    if (grn.status === 'COMPLETED') {
      throw new Error(`GRN #${grnId} has already been completed and stock is locked.`);
    }

    const poId = grn.purchase_order_id;
    if (!poId) throw new Error(`GRN #${grnId} is not linked to any Purchase Order.`);

    const po = await connector.findById('purchase-orders', poId);
    if (!po) throw new Error(`Purchase Order #${poId} linked to GRN not found.`);

    // Fetch GRN Items
    const grnItemsResult = await connector.list('goods-receipt-note-items', {
      filters: { grn_id: grnId },
      limit: 100,
    });

    if (grnItemsResult.data.length === 0) {
      throw new Error(`GRN #${grnId} does not contain any product items.`);
    }

    const branchId = grn.branch_id || po.branch_id || '';
    let grnTotal = 0;

    // Loop through each item in GRN, apply changes non-invasively
    for (const item of grnItemsResult.data) {
      const productId = item.product_id || '';
      const qtyReceived = parseFloat(item.qty_received || '0');
      const unitCost = parseFloat(item.unit_cost || '0');
      const lineTotal = qtyReceived * unitCost;
      grnTotal += lineTotal;

      if (qtyReceived <= 0) continue;

      // 1. Write the clean standard stock_movement record (Zero-friction with legacy warehouse)
      const stockMovementData = {
        type: 'purchase_in',
        product_id: productId,
        qty: String(qtyReceived),
        unit_cost: String(unitCost),
        branch_id: branchId,
        supplier_id: po.supplier_id || '',
        reference_no: grnId,
        employee_id: userId,
        reason: `Nhập kho đối chiếu theo chứng từ GRN #${grn.grn_no || grnId}`,
        workflow_status: 'COMPLETED',
      };
      await connector.create('stock-movements', stockMovementData);

      // 2. Load and recalculate Moving Average Cost in the inventory cache
      const inventoryList = await connector.list('inventory', {
        filters: { product_id: productId, branch_id: branchId },
        limit: 1,
      });

      let currentStockQty = 0;
      let currentUnitCost = unitCost; // Default to incoming unit cost if no history
      let invId = '';

      if (inventoryList.data.length > 0) {
        const invRecord = inventoryList.data[0];
        invId = invRecord.id;
        currentStockQty = parseFloat(invRecord.stock_qty || '0');
        currentUnitCost = parseFloat(invRecord.unit_cost || '0');
      }

      const nextStockQty = currentStockQty + qtyReceived;
      let nextUnitCost = currentUnitCost;
      
      if (nextStockQty > 0) {
        // Moving Average Formula
        nextUnitCost = ((currentStockQty * currentUnitCost) + (qtyReceived * unitCost)) / nextStockQty;
      }

      const todayIso = new Date().toISOString();

      if (invId) {
        // Update existing inventory record
        await connector.update('inventory', invId, {
          stock_qty: String(nextStockQty),
          unit_cost: String(nextUnitCost),
          last_received_at: todayIso,
          last_updated: todayIso,
        });
      } else {
        // Create new inventory record
        await connector.create('inventory', {
          product_id: productId,
          branch_id: branchId,
          stock_qty: String(nextStockQty),
          min_stock: '0',
          unit_cost: String(nextUnitCost),
          last_received_at: todayIso,
          last_updated: todayIso,
        });
      }

      // 3. Update the global aggregate product stock count inside products table
      const product = await connector.findById('products', productId);
      if (product) {
        const currentProdStock = parseFloat(product.stock_qty || '0');
        await connector.update('products', productId, {
          stock_qty: String(currentProdStock + qtyReceived),
          cost_price: String(nextUnitCost), // Sync average cost back to catalog cost price
        });
      }

      // 4. Log price to purchase history (price audit tracking)
      await connector.create('product-purchase-history', {
        product_id: productId,
        supplier_id: po.supplier_id || '',
        supplier_name: po.supplier_name || '',
        unit_price: String(unitCost),
        purchased_at: todayIso,
      });
    }

    // 5. Update Supplier Debt in internal ledger
    const supplierId = po.supplier_id;
    if (supplierId) {
      const supplier = await connector.findById('suppliers', supplierId);
      if (supplier) {
        const oldDebt = parseFloat(supplier.debt_amount || '0');
        const newDebt = oldDebt + grnTotal;
        await connector.update('suppliers', supplierId, {
          debt_amount: String(newDebt),
        });
      }
    }

    // 6. Complete the GRN and update PO status to fully received
    const updatedGrn = await connector.update('goods-receipt-notes', grnId, {
      status: 'COMPLETED',
    });

    await connector.update('purchase-orders', poId, {
      status: 'RECEIVED',
    });

    return updatedGrn;
  }
}
