import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import {
  HrmAccessError,
  requireHrmAccess,
} from '@/lib/server/hrm/access';
import { HRM_NOTIFICATION_EVENTS } from '@/lib/notifications/eventCatalog';
import { notifyLeaveManagers } from '@/lib/server/hrm/leaveManagerNotification';
import { notifyHrmStatusChange } from '@/lib/server/hrm/statusNotification';
import { realtimeEngine } from '@/lib/server/realtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const actionSchema = z.object({
  action: z.enum([
    'approve',
    'reject',
    'cancel',
    'request_cancel',
    'reject_cancel',
    'approved',
    'rejected',
    'cancelled',
  ]).optional(),
  status: z.enum([
    'approve',
    'reject',
    'cancel',
    'request_cancel',
    'reject_cancel',
    'approved',
    'rejected',
    'cancelled',
  ]).optional(),
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
    let action: 'approve' | 'reject' | 'cancel' | 'request_cancel' | 'reject_cancel';
    if (raw === 'approved' || raw === 'approve') action = 'approve';
    else if (raw === 'rejected' || raw === 'reject') action = 'reject';
    else if (raw === 'request_cancel') action = 'request_cancel';
    else if (raw === 'reject_cancel') action = 'reject_cancel';
    else action = 'cancel';

    const rejectionReason = parsed.rejection_reason || parsed.reason;
    let title = '';
    let content = '';
    let notifyStatus = false;
    let notifyManager = false;

    // Fetch the leave request to get profileId for notification
    const leaveProfile = await access.repository.getLeaveRequestDetails(leaveId);
    const employeePrefix = leaveProfile?.employeeName
      ? `${leaveProfile.employeeName}: `
      : '';

    if (action === 'approve') {
      if (!canManage) return NextResponse.json({ error: { message: 'Không có quyền duyệt đơn.' } }, { status: 403 });
      await access.repository.approveLeaveRequest({ leaveId, actorUserId: access.userId });
      notifyStatus = true;
      title = 'Đơn xin nghỉ phép đã được duyệt';
      content = `${employeePrefix}đơn xin nghỉ phép ${leaveProfile?.totalDays || ''} ngày đã được duyệt.`;
    } else if (action === 'reject') {
      if (!canManage) return NextResponse.json({ error: { message: 'Không có quyền từ chối đơn.' } }, { status: 403 });
      await access.repository.rejectLeaveRequest({ leaveId, actorUserId: access.userId, rejectionReason });
      notifyStatus = true;
      title = 'Đơn xin nghỉ phép bị từ chối';
      content = `${employeePrefix}đơn xin nghỉ phép đã bị từ chối. Lý do: ${rejectionReason || 'Không có lý do'}.`;
    } else if (action === 'cancel') {
      await access.repository.cancelLeaveRequest({ leaveId, actorUserId: access.userId, canManage });
      notifyStatus = true;
      title = 'Đơn nghỉ phép đã bị huỷ';
      content = canManage
        ? `${employeePrefix}đơn xin nghỉ phép đã bị quản lý huỷ.`
        : `${employeePrefix}nhân viên đã huỷ đơn xin nghỉ phép.`;
    } else if (action === 'request_cancel') {
      await access.repository.requestCancelLeaveRequest({ leaveId, actorUserId: access.userId, reason: rejectionReason });
      notifyManager = true;
      title = 'Yêu cầu huỷ đơn nghỉ phép';
      content = `Có một yêu cầu huỷ đơn nghỉ phép đã duyệt cần xử lý.`;
    } else if (action === 'reject_cancel') {
      if (!canManage) return NextResponse.json({ error: { message: 'Không có quyền từ chối yêu cầu huỷ.' } }, { status: 403 });
      await access.repository.rejectCancelLeaveRequest({ leaveId, actorUserId: access.userId, rejectionReason });
      notifyStatus = true;
      title = 'Yêu cầu huỷ đơn bị từ chối';
      content = `${employeePrefix}yêu cầu huỷ đơn nghỉ phép đã bị từ chối. Lý do: ${rejectionReason || 'Không có lý do'}.`;
    }

    // Notification delivery must never roll back a completed leave action.
    if (notifyStatus && leaveProfile?.profileId) {
      await notifyHrmStatusChange({
        repository: access.repository,
        publisher: realtimeEngine,
        tenantId: access.tenantId,
        branchId: access.shopId,
        eventName: HRM_NOTIFICATION_EVENTS.leaveStatusChanged,
        actorUserId: access.userId,
        profileId: leaveProfile.profileId,
        path: '/hrm/leaves',
        title,
        content,
        metadata: { leaveId },
      });
    }
    if (notifyManager && leaveProfile?.profileId) {
      await notifyLeaveManagers({
        tenantId: access.tenantId,
        branchId: access.shopId,
        requesterUserId: access.userId,
        profileId: leaveProfile.profileId,
        leaveId,
        title,
        content,
        departmentDirectory: access.repository,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return respondError(err);
  }
}
