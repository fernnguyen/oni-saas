export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { departmentUpdateSchema } from '@/lib/validators/assets';
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
    const data = departmentUpdateSchema.parse(body);

    if (data.code) {
      const existing = await connector.list('departments', {
        filters: { code: data.code }
      });
      const other = existing.data?.find((d: any) => d.id !== id);
      if (other) {
        return NextResponse.json({ error: 'Mã bộ phận đã tồn tại trong chi nhánh này. Vui lòng chọn mã khác.' }, { status: 400 });
      }
    }

    const updated = await connector.update('departments', id, data);
    invalidate(shopId, 'departments');

    return NextResponse.json(updated);
  } catch (e) {
    return handleApiError(e, 'PATCH department');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; id: string }> }
) {
  try {
    const { shopId, id } = await params;
    const { connector } = await requireShopAccess(shopId, 'settings.manage');

    await connector.delete('departments', id);
    invalidate(shopId, 'departments');

    return NextResponse.json({ success: true });
  } catch (e) {
    return handleApiError(e, 'DELETE department');
  }
}
