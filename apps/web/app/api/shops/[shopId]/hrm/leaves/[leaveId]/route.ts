import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import {
  HrmAccessError,
  requireHrmAccess,
} from '@/lib/server/hrm/access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const actionSchema = z.object({
  action: z.enum(['approve', 'reject', 'cancel', 'approved', 'rejected', 'cancelled']).optional(),
  status: z.enum(['approve', 'reject', 'cancel', 'approved', 'rejected', 'cancelled']).optional(),
  rejection_reason: z.string().optional(),
  reason: z.string().optional(),
}).refine(data => Boolean(data.action || data.status), {
  message: 'Vui lòng chọn thao tác (action hoặc status).',
});

function respondError(error: unknown) {
  if (error instanceof HrmAccessError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    const detail = error.issues.map(i => i.message).join(', ');
    return NextResponse.json({ error: { message: detail || 'Dữ liệu không hợp lệ.' } }, { status: 400 });
  }
  const msg = error instanceof Error ? error.message : 'Lỗi không xác định.';
  return NextResponse.json({ error: { message: msg } }, { status: 500 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string; leaveId: string }> },
) {
  try {
    const { shopId, leaveId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.view');
    const canManage = access.permissions.includes('hrm.attendance.manage');

    const body = await request.json();
    const parsed = actionSchema.parse(body);
    
    // Normalize raw action/status
    const raw = (parsed.action || parsed.status || '').toLowerCase();
    let action: 'approve' | 'reject' | 'cancel';
    if (raw === 'approved' || raw === 'approve') action = 'approve';
    else if (raw === 'rejected' || raw === 'reject') action = 'reject';
    else action = 'cancel';

    const rejectionReason = parsed.rejection_reason || parsed.reason;

    if (action === 'approve') {
      if (!canManage) return NextResponse.json({ error: { message: 'Không có quyền duyệt đơn.' } }, { status: 403 });
      await access.repository.approveLeaveRequest({ leaveId, actorUserId: access.userId });
    } else if (action === 'reject') {
      if (!canManage) return NextResponse.json({ error: { message: 'Không có quyền từ chối đơn.' } }, { status: 403 });
      await access.repository.rejectLeaveRequest({ leaveId, actorUserId: access.userId, rejectionReason });
    } else if (action === 'cancel') {
      await access.repository.cancelLeaveRequest({ leaveId, actorUserId: access.userId, canManage });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respondError(err);
  }
}

