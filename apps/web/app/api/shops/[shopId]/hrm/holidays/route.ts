import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { HrmAccessError, requireHrmAccess } from '@/lib/server/hrm/access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function errorResponse(error: unknown) {
  if (error instanceof HrmAccessError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  return NextResponse.json(
    {
      error: {
        code: 'HRM_DATA_PLANE_UNAVAILABLE',
        message: 'Không thể xử lý yêu cầu về ngày lễ.',
      },
    },
    { status: 503 },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.settings.manage');
    
    const url = new URL(request.url);
    const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
    
    const holidays = await access.repository.listHolidays(year);

    return NextResponse.json({ data: holidays });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.settings.manage');
    
    const body = await request.json();
    const { date, name, note } = body;
    
    if (!date || !name) {
      return NextResponse.json({ error: { message: 'Dữ liệu không hợp lệ (cần date và name)' } }, { status: 400 });
    }

    const { getSupabaseServerClient } = await import('@/lib/server/supabaseServer');
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    let createdBy = 'Hệ thống';
    if (user) {
      createdBy = user.user_metadata?.full_name || user.user_metadata?.name || user.email || user.id;
    }

    const id = `HOL-${crypto.randomUUID()}`;
    await access.repository.createHoliday({ id, date, name, note, created_by: createdBy });

    return NextResponse.json({ success: true, data: { id, date, name } });
  } catch (error) {
    return errorResponse(error);
  }
}
