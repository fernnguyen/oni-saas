export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { warehouseCreateSchema } from '@/lib/validators/assets';
import { invalidate } from '@/lib/server/cache';
import { handleApiError } from '../../_helpers';

async function unifyLegacyWarehouses(connector: any, shopId: string) {
  try {
    // 1. Fetch all warehouses in this branch
    const whRes = await connector.list('warehouses', { limit: 200 });
    const whs = whRes.data as any[];

    // 2. Find WH-SALE (Kho Kinh doanh)
    let saleWh = whs.find((w: any) => w.code === 'sale');
    
    // If not found by code, look by type
    if (!saleWh) {
      saleWh = whs.find((w: any) => w.type === 'sale');
    }

    // If still not found, create standard WH-SALE
    if (!saleWh) {
      console.log(`[SELF-HEALING] WH-SALE not found for shop ${shopId}. Creating...`);
      saleWh = await connector.create('warehouses', {
        branch_id: shopId,
        name: 'Kho Kinh doanh (Bán lẻ)',
        code: 'sale',
        type: 'sale',
        active: 'TRUE'
      });
    }

    const saleWhId = saleWh.id;

    // 3. Find any legacy/duplicate warehouses (code 'default', 'Default', or name containing 'mặc định' or 'default')
    const legacyWarehouses = whs.filter((w: any) => {
      if (w.id === saleWhId || w.code === 'sale') return false;
      const codeLower = (w.code || '').toLowerCase();
      const nameLower = (w.name || '').toLowerCase();
      return (
        codeLower === 'default' ||
        codeLower === 'default_warehouse' ||
        nameLower.includes('mặc định') ||
        nameLower.includes('default')
      );
    });

    if (legacyWarehouses.length === 0) return;

    console.log(`[SELF-HEALING] Found ${legacyWarehouses.length} legacy/duplicate warehouses to merge for shop ${shopId}.`);

    for (const legacyWh of legacyWarehouses) {
      const legacyWhId = legacyWh.id;
      console.log(`[SELF-HEALING] Merging legacy warehouse ${legacyWh.name} (ID: ${legacyWhId}) into WH-SALE (ID: ${saleWhId})`);

      // A. Migrate inventory rows
      const invRes = await connector.list('inventory', {
        filters: { warehouse_id: legacyWhId },
        limit: 10000
      });
      const invs = invRes.data as any[];
      for (const inv of invs) {
        const invId = inv.id || inv.inventory_id;
        const prodId = inv.product_id;

        // Check if there is already an inventory record in WH-SALE for this product
        const saleInvRes = await connector.list('inventory', {
          filters: { product_id: prodId, warehouse_id: saleWhId },
          limit: 1
        });

        if (saleInvRes.total > 0) {
          const saleInv = saleInvRes.data[0];
          const mergedQty = (parseFloat(saleInv.stock_qty || '0') + parseFloat(inv.stock_qty || '0')).toString();
          
          await connector.update('inventory', saleInv.id, {
            stock_qty: mergedQty
          });
          
          // Delete duplicate legacy row
          await connector.delete('inventory', invId);
        } else {
          // Point to WH-SALE
          await connector.update('inventory', invId, {
            warehouse_id: saleWhId
          });
        }
      }

      // B. Migrate stock_movements
      const movementsFromRes = await connector.list('stock-movements', {
        filters: { warehouse_id: legacyWhId },
        limit: 10000
      });
      for (const mov of (movementsFromRes.data as any[])) {
        await connector.update('stock-movements', mov.id, {
          warehouse_id: saleWhId
        });
      }

      const movementsToRes = await connector.list('stock-movements', {
        filters: { to_warehouse_id: legacyWhId },
        limit: 10000
      });
      for (const mov of (movementsToRes.data as any[])) {
        await connector.update('stock-movements', mov.id, {
          to_warehouse_id: saleWhId
        });
      }

      // C. Delete the legacy warehouse row
      await connector.delete('warehouses', legacyWhId);
      console.log(`[SELF-HEALING] Deleted legacy warehouse ${legacyWhId} successfully.`);
    }

    // Invalidate caches
    invalidate(shopId, 'warehouses');
    invalidate(shopId, 'inventory');
  } catch (err) {
    console.error('[SELF-HEALING] Error during warehouse unification:', err);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const { connector } = await requireShopAccess(shopId);

    // Run self-healing to merge legacy warehouses into WH-SALE
    await unifyLegacyWarehouses(connector, shopId);

    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'));
    const limit = Math.min(500, Math.max(1, parseInt(sp.get('limit') ?? '200')));

    const result = await connector.list('warehouses', { page, limit, sortDesc: false });

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, 'GET warehouses');
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const { connector } = await requireShopAccess(shopId, 'settings.manage');

    const sp = req.nextUrl.searchParams;
    const action = sp.get('action');

    if (action === 'seed') {
      // Auto-provision standard warehouses
      const existingRes = await connector.list('warehouses', { limit: 100 });
      const existing = existingRes.data as any[];

      const standardWarehouses = [
        { code: 'sale', name: 'Kho Kinh doanh (Bán lẻ)', type: 'sale' },
        { code: 'supply', name: 'Kho Vật tư & Tiêu hao', type: 'supply' },
        { code: 'asset', name: 'Kho Tài sản chờ bàn giao', type: 'asset' }
      ];

      const created: any[] = [];
      for (const sw of standardWarehouses) {
        const found = existing.find((w: any) => w.code === sw.code);
        if (!found) {
          const newWh = await connector.create('warehouses', {
            branch_id: shopId,
            name: sw.name,
            code: sw.code,
            type: sw.type,
            active: 'TRUE',
          });
          created.push(newWh);
        } else {
          created.push(found);
        }
      }

      invalidate(shopId, 'warehouses');
      return NextResponse.json({ success: true, warehouses: created }, { status: 201 });
    }

    const body = await req.json();
    const data = warehouseCreateSchema.parse(body);

    // Ensure unique warehouse code within the branch
    const existing = await connector.list('warehouses', {
      filters: { code: data.code }
    });

    if (existing.data && existing.data.length > 0) {
      return NextResponse.json(
        { error: 'Mã kho đã tồn tại trong chi nhánh này. Vui lòng chọn mã khác.' },
        { status: 400 }
      );
    }

    const created = await connector.create('warehouses', data);
    invalidate(shopId, 'warehouses');
    
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return handleApiError(e, 'POST warehouses');
  }
}
