export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { AssetEngine, Asset } from '@oni/core';
import { invalidate } from '@/lib/server/cache';
import { handleApiError } from '../../../../_helpers';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params;
    const { connector, userId, permissions } = await requireShopAccess(shopId);

    // Quyền assets.manage hoặc settings.manage
    const hasManageAccess = permissions.includes('assets.manage') || permissions.includes('settings.manage') || permissions.includes('owner') || permissions.includes('admin');
    if (!hasManageAccess) {
      return NextResponse.json({ error: 'Forbidden: no permission to manage assets' }, { status: 403 });
    }

    // 1. Tìm tài sản trong DB
    const assetRow = await connector.findById('assets', id);
    if (!assetRow) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    // Convert row record to Asset type
    const asset: Asset = {
      id: assetRow.id,
      tenant_id: assetRow.tenant_id,
      branch_id: assetRow.branch_id,
      name: assetRow.name,
      unit: assetRow.unit,
      type: assetRow.type as 'ccdc' | 'tscd',
      original_value: assetRow.original_value,
      salvage_value: assetRow.salvage_value,
      purchase_date: assetRow.purchase_date,
      depreciation_months: assetRow.depreciation_months,
      depreciated_value: assetRow.depreciated_value,
      status: assetRow.status as 'active' | 'depreciated' | 'disposed',
      serial_no: assetRow.serial_no,
      manufacturer: assetRow.manufacturer,
      warranty_expiry: assetRow.warranty_expiry,
      supplier_id: assetRow.supplier_id,
    };

    // 2. Thực hiện trích khấu hao thông qua AssetEngine
    const result = await AssetEngine.processAssetDepreciation(connector, asset, userId);

    if (!result.success) {
      return NextResponse.json({ error: result.message || 'Trích khấu hao thất bại' }, { status: 400 });
    }

    // 3. Khởi chạy dọn dẹp cache
    invalidate(shopId, 'assets');
    invalidate(shopId, 'cashbook');

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, 'POST depreciate asset');
  }
}
