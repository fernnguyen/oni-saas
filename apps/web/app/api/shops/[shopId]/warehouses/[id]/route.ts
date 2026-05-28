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

    const body = await req.json();
    const data = warehouseUpdateSchema.parse(body);

    if (data.code) {
      const existing = await connector.list('warehouses', {
        filters: { code: data.code }
      });
      const other = existing.data?.find((w: any) => w.id !== id);
      if (other) {
        return NextResponse.json(
          { error: 'Mã kho đã tồn tại trong chi nhánh này. Vui lòng chọn mã khác.' },
          { status: 400 }
        );
      }
    }

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

    // Prevent deletion of standard warehouses (sale, supply, asset, default) to preserve database reference integrity
    const warehouse = await connector.findById('warehouses', id);
    if (warehouse && ['sale', 'supply', 'asset', 'default'].includes(warehouse.code)) {
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
