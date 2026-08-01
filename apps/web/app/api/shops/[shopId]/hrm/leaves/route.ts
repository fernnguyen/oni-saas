import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import crypto from 'node:crypto';
import {
  HrmAccessError,
  requireHrmAccess,
} from '@/lib/server/hrm/access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const createLeaveSchema = z.object({
  profile_id: z.string().min(1),
  leave_type: z.enum(['paid', 'unpaid', 'sick', 'maternity', 'compassionate', 'other']),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  half_day_option: z.enum(['full_day', 'morning_only', 'afternoon_only']).default('full_day'),
  reason: z.string().optional(),
  total_days: z.number().positive(),
  paid_days: z.number().min(0),
  unpaid_days: z.number().min(0),
});

function respondError(error: unknown) {
  if (error instanceof HrmAccessError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: { message: error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.' } }, { status: 400 });
  }
  const msg = error instanceof Error ? error.message : 'Lỗi không xác định.';
  return NextResponse.json({ error: { message: msg } }, { status: 500 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.view');
    const canManage = access.permissions.includes('hrm.attendance.manage');
    const selfProfileId = await access.repository.getProfileIdForAuthUser(access.userId);

    const url = request.nextUrl;
    const profileId = url.searchParams.get('profile_id') ?? undefined;
    const status = url.searchParams.get('status') ?? undefined;
    const startDate = url.searchParams.get('start_date') ?? undefined;
    const endDate = url.searchParams.get('end_date') ?? undefined;

    const data = await access.repository.listLeaveRequests({
      profileId,
      status,
      startDate,
      endDate,
      canManage,
      selfProfileId: selfProfileId ?? undefined,
    });
    return NextResponse.json({ data, canManage, selfProfileId });
  } catch (err) {
    return respondError(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    const { shopId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.view');
    const canManage = access.permissions.includes('hrm.attendance.manage');
    const selfProfileId = await access.repository.getProfileIdForAuthUser(access.userId);

    const body = await request.json();
    const input = createLeaveSchema.parse(body);

    if (!canManage && input.profile_id !== selfProfileId) {
      return NextResponse.json({ error: { message: 'Không có quyền tạo đơn cho nhân viên khác.' } }, { status: 403 });
    }

    const id = `HRMLR-${crypto.randomUUID()}`;
    await access.repository.createLeaveRequest({
      id,
      profileId: input.profile_id,
      leaveType: input.leave_type,
      startDate: input.start_date,
      endDate: input.end_date,
      halfDayOption: input.half_day_option,
      totalDays: input.total_days,
      paidDays: input.paid_days,
      unpaidDays: input.unpaid_days,
      reason: input.reason,
      createdBy: access.userId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respondError(err);
  }
}
