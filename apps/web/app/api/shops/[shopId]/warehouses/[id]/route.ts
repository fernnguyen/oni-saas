export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { warehouseUpdateSchema } from '@/lib/validators/assets';
import { invalidate } from '@/lib/server/cache';
import { handleApiError } from '../../../_helpers';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params;
    const { connector } = await requireShopAccess(shopId, 'settings.manage');

    // 1. Verify warehouse exists and belongs to the active branch
    const warehouse = await connector.findById('warehouses', id);
    if (!warehouse || warehouse.branch_id !== shopId) {
      return NextResponse.json(
        { error: 'Không tìm thấy kho hàng trong chi nhánh này.' },
        { status: 404 }
      );
    }

    const body = await req.json();
    const data = warehouseUpdateSchema.parse(body);

    // Force active branch binding
    data.branch_id = shopId;

    const updated = await connector.update('warehouses', id, data);
    invalidate(shopId, 'warehouses');

    return NextResponse.json(updated);
  } catch (e) {
    return handleApiError(e, 'PATCH warehouse');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params;
    const { connector } = await requireShopAccess(shopId, 'settings.manage');

    const warehouse = await connector.findById('warehouses', id);
    if (!warehouse || warehouse.branch_id !== shopId) {
      return NextResponse.json(
        { error: 'Không tìm thấy kho hàng trong chi nhánh này.' },
        { status: 404 }
      );
    }

    // Prevent deletion of standard warehouses (sale, supply, asset) to preserve database reference integrity
    if (['sale', 'supply', 'asset'].includes(warehouse.type)) {
      return NextResponse.json(
        { error: 'Không thể xóa kho tiêu chuẩn của hệ thống (sale, supply, asset).' },
        { status: 400 }
      );
    }

    await connector.delete('warehouses', id);
    invalidate(shopId, 'warehouses');

    return NextResponse.json({ success: true });
  } catch (e) {
    return handleApiError(e, 'DELETE warehouse');
  }
}
