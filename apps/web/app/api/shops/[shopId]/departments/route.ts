export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { departmentCreateSchema } from '@/lib/validators/assets';
import { invalidate } from '@/lib/server/cache';
import { handleApiError } from '../../_helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    // Bất kỳ ai có quyền truy cập cửa hàng đều xem được phòng ban để chọn Cost Center hoặc phân quyền
    const { connector } = await requireShopAccess(shopId);

    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'));
    const limit = Math.min(500, Math.max(1, parseInt(sp.get('limit') ?? '200')));

    const filters = { branch_id: shopId };
    const result = await connector.list('departments', { page, limit, filters, sortDesc: false });

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, 'GET departments');
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    // Chỉ người quản trị có quyền settings.manage hoặc departments.manage mới tạo được phòng ban
    const { connector } = await requireShopAccess(shopId, 'settings.manage');

    const body = await req.json();
    const data = departmentCreateSchema.parse(body);
    data.branch_id = shopId; // Force the department to belong to the active shop!

    // Kiểm tra tính độc nhất của mã phòng ban trong chi nhánh
    const existing = await connector.list('departments', {
      filters: { code: data.code, branch_id: shopId }
    });

    if (existing.data && existing.data.length > 0) {
      return NextResponse.json({ error: 'Mã bộ phận đã tồn tại trong chi nhánh này. Vui lòng chọn mã khác.' }, { status: 400 });
    }

    const created = await connector.create('departments', data);
    invalidate(shopId, 'departments');
    
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return handleApiError(e, 'POST departments');
  }
}
