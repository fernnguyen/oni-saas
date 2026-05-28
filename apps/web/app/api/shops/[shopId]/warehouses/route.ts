export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { warehouseCreateSchema } from '@/lib/validators/assets';
import { invalidate } from '@/lib/server/cache';
import { handleApiError } from '../../_helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const { connector } = await requireShopAccess(shopId);

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
