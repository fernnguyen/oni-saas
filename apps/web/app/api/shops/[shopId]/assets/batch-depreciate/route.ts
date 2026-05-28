export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { AssetEngine, Asset } from '@oni/core';
import { invalidate } from '@/lib/server/cache';
import { handleApiError } from '@/app/api/shops/_helpers';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const { connector, userId, permissions } = await requireShopAccess(shopId);

    const hasManageAccess = permissions.includes('assets.manage') || permissions.includes('settings.manage') || permissions.includes('owner') || permissions.includes('admin');
    if (!hasManageAccess) {
      return NextResponse.json({ error: 'Forbidden: no permission to manage assets' }, { status: 403 });
    }

    // 1. Fetch all active assets
    const assetsRes = await connector.list('assets', { limit: 1000 });
    const activeAssets = (assetsRes.data || []).filter(
      (a: any) => a.status === 'active'
    );

    if (activeAssets.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Không có tài sản nào ở trạng thái hoạt động cần trích khấu hao.',
        count: 0,
        totalAmount: 0,
      });
    }

    let processedCount = 0;
    let totalAmount = 0;

    // 2. Loop through all active assets and depreciate them
    for (const assetRow of activeAssets) {
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

      const result = await AssetEngine.processAssetDepreciation(connector, asset, userId);
      if (result.success) {
        processedCount++;
        totalAmount += result.postedAmount;
      }
    }

    // 3. Clear cache
    invalidate(shopId, 'assets');
    invalidate(shopId, 'cashbook');

    return NextResponse.json({
      success: true,
      message: `Đã trích khấu hao thành công cho ${processedCount} tài sản.`,
      count: processedCount,
      totalAmount,
    });
  } catch (e) {
    return handleApiError(e, 'POST batch-depreciate assets');
  }
}
