export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { assetCommissionSchema } from '@/lib/validators/assets';
import { invalidate } from '@/lib/server/cache';
import { getTenantHash } from '@oni/core';
import { handleApiError } from '../../../_helpers';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const { connector, permissions, userId, shop } = await requireShopAccess(shopId);


    const hasManageAccess =
      permissions.includes('assets.manage') ||
      permissions.includes('settings.manage') ||
      permissions.includes('owner') ||
      permissions.includes('admin');
    if (!hasManageAccess) {
      return NextResponse.json({ error: 'Forbidden: no permission to manage assets' }, { status: 403 });
    }

    const body = await req.json();
    const data = assetCommissionSchema.parse(body);

    // 1. Resolve standard warehouse WH-ASSET (code: 'asset') for the branch
    const whRes = await connector.list('warehouses', {
      filters: { code: 'asset' },
      limit: 1,
    });
    if (whRes.total === 0) {
      return NextResponse.json(
        { error: 'Không tìm thấy kho tài sản WH-ASSET. Vui lòng liên hệ quản trị viên chạy seeder kho.' },
        { status: 400 }
      );
    }
    const assetWh = whRes.data[0];
    const assetWhId = assetWh.id;

    // 2. Fetch product properties (name, unit, costs)
    const product = await connector.findById('products', data.product_id);
    if (!product) {
      return NextResponse.json({ error: 'Không tìm thấy sản phẩm.' }, { status: 404 });
    }

    // 3. Find stock in WH-ASSET
    const invRes = await connector.list('inventory', {
      filters: { product_id: product.id, warehouse_id: assetWhId },
      limit: 1,
    });
    const inv = invRes.total > 0 ? invRes.data[0] : null;
    const currentStock = inv ? parseFloat(inv.stock_qty || '0') : 0;
    const reqQty = parseFloat(data.qty);

    if (currentStock < reqQty) {
      return NextResponse.json(
        {
          error: `Không đủ tồn kho trong WH-ASSET. Tồn kho hiện tại: ${currentStock}, Yêu cầu bàn giao: ${reqQty}`,
        },
        { status: 400 }
      );
    }

    const purchaseDate = data.purchase_date || new Date().toISOString().split('T')[0];
    const unitCost = inv?.unit_cost || product.cost_price || '0';
    const totalOriginalValue = String(parseFloat(unitCost) * reqQty);

    // 4. Create the asset record
    const assetData: Record<string, string> = {
      branch_id: product.branch_id || '',
      name: product.name || '',
      unit: product.unit || 'cái',
      type: data.type || 'ccdc',
      original_value: unitCost, // original cost per single physical unit
      salvage_value: '0',
      purchase_date: purchaseDate,
      depreciation_months: data.depreciation_months || '12',
      depreciated_value: '0',
      status: 'active',
      serial_no: data.serial_no || '',
      manufacturer: data.manufacturer || '',
      warranty_expiry: data.warranty_expiry || '',
      created_by: userId,
      updated_by: userId,
    };
    if (data.supplier_id) {
      assetData.supplier_id = data.supplier_id;
    }

    const createdAsset = await connector.create('assets', assetData);
    const assetId = createdAsset.id || createdAsset.asset_id;

    // 5. Create the asset allocation record
    const allocationData = {
      asset_id: assetId,
      department_code: data.department_code,
      qty: String(reqQty),
      allocated_at: purchaseDate,
      created_by: userId,
      updated_by: userId,
    };
    await connector.create('asset-allocations', allocationData);

    // 6. Write commission stock movement (representing export out of WH-ASSET physical inventory)
    const tenantHash = getTenantHash(shop.tenant_id);
    const movementNo = `SM-${tenantHash}-COMM-${Date.now().toString().slice(-6)}`;

    const movementData = {
      movement_no: movementNo,
      type: 'commission',
      product_id: product.id,
      sku: product.sku || '',
      variant_id: product.variant_id || '',
      qty: `-${reqQty}`, // negative value to decrement stock
      unit_cost: unitCost,
      branch_id: product.branch_id,
      warehouse_id: assetWhId,
      reference_no: assetId,
      reason: `Bàn giao tài sản 2 bước sang bộ phận Cost Center: ${data.department_code}. Mã TS: ${assetId}`,
    };
    await connector.create('stock-movements', movementData);

    // 7. Decrement stock level in inventory
    const newStockQty = currentStock - reqQty;
    if (inv) {
      await connector.update('inventory', inv.id, {
        stock_qty: String(newStockQty),
      });
    }

    // 8. Invalidate relevant caches
    invalidate(shopId, 'assets');
    invalidate(shopId, 'inventory');
    invalidate(shopId, 'stock-movements');

    return NextResponse.json({
      success: true,
      asset: createdAsset,
      allocated_qty: reqQty,
      remaining_stock: newStockQty,
    });
  } catch (e) {
    return handleApiError(e, 'POST assets/commission');
  }
}
