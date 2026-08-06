export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { HrmAccessError, requireHrmAccess } from '@/lib/server/hrm/access';

import { handleApiError } from '../../../../_helpers';
import { z } from 'zod';
import { realtimeEngine } from '@/lib/server/realtime';
import {
  HrmFundNotFoundError,
  HrmInsufficientFundBalanceError,
} from '@oni/adapters';
import { getHrmSchemaError } from '@/lib/server/hrm/schemaError';
import { notifySalaryAdvanceEmployee } from '@/lib/server/hrm/salaryAdvanceNotification';

const patchSchema = z.object({
  status: z.enum(['approved', 'disbursed', 'rejected']),
  fund_id: z.string().optional(),
  rejection_reason: z.string().optional(),
  /** Bỏ qua kiểm tra số dư quỹ — chi và cân đối sau */
  force: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; advanceId: string }> }
) {
  try {
    const { shopId, advanceId } = await params;
    const { userId, tenantId, permissions, repository: hrmRepo } = await requireHrmAccess(shopId, 'hrm.payroll.manage');
    const body = await req.json();
    const payload = patchSchema.parse(body);


    const advance = await hrmRepo.getSalaryAdvance(advanceId);
    if (!advance) throw new Error('Không tìm thấy khoản ứng lương.');
    if (!['pending', 'approved'].includes(advance.status)) {
      throw new Error('Yêu cầu này đã được xử lý.');
    }

    if (payload.status === 'rejected') {
      if (advance.status !== 'pending') {
        throw new Error('Phiếu đã duyệt không thể bị từ chối.');
      }
      await hrmRepo.rejectSalaryAdvance({
        advanceId,
        actorUserId: userId,
        rejectionReason: payload.rejection_reason,
      });

      await notifySalaryAdvanceEmployee({
        repository: hrmRepo,
        publisher: realtimeEngine,
        tenantId,
        branchId: shopId,
        profileId: advance.profile_id,
        advanceId,
        title: 'Yêu cầu ứng lương bị từ chối',
        content: `Yêu cầu ứng lương ${parseInt(advance.amount).toLocaleString('vi-VN')}đ đã bị từ chối. Lý do: ${payload.rejection_reason || 'Không có'}`,
      });

      return NextResponse.json({ success: true });
    }

    if (payload.status === 'approved') {
      if (advance.status !== 'pending') {
        throw new Error('Chỉ yêu cầu đang chờ duyệt mới có thể được duyệt.');
      }

      await hrmRepo.markSalaryAdvanceApproved({
        advanceId,
        actorUserId: userId,
      });

      await notifySalaryAdvanceEmployee({
        repository: hrmRepo,
        publisher: realtimeEngine,
        tenantId,
        branchId: shopId,
        profileId: advance.profile_id,
        advanceId,
        title: 'Yêu cầu ứng lương đã được duyệt',
        content: `Yêu cầu ứng lương ${parseInt(advance.amount).toLocaleString('vi-VN')}đ đã được duyệt và đang chờ chi tiền.`,
      });

      return NextResponse.json({ success: true, status: 'approved' });
    }

    if (payload.status === 'disbursed') {
      if (
        !permissions.includes('hrm.payroll.pay') ||
        !permissions.includes('cashbook.manage')
      ) {
        throw new HrmAccessError(
          403,
          'HRM_PERMISSION_DENIED',
          'Bạn không có quyền chi tiền ứng lương từ quỹ.',
        );
      }
      if (!payload.fund_id) {
        throw new Error('Vui lòng chọn quỹ thanh toán để chi tiền ứng lương.');
      }
      const advanceAmount = parseFloat(advance.amount);
      const disbursement = await hrmRepo.approveSalaryAdvance({
        advanceId,
        actorUserId: userId,
        fundId: payload.fund_id,
        force: payload.force,
      });

      await notifySalaryAdvanceEmployee({
        repository: hrmRepo,
        publisher: realtimeEngine,
        tenantId,
        branchId: shopId,
        profileId: advance.profile_id,
        advanceId,
        title: 'Khoản ứng lương đã được chi',
        content: `Khoản ứng lương ${advanceAmount.toLocaleString('vi-VN')}đ đã được duyệt và chi từ quỹ.`,
      });

      return NextResponse.json({
        success: true,
        cashbook_transaction_id: disbursement.cashbookTransactionId,
      });
    }

    return NextResponse.json({ success: false });
  } catch (error) {
    if (error instanceof HrmAccessError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    if (error instanceof HrmFundNotFoundError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 404 },
      );
    }
    if (error instanceof HrmInsufficientFundBalanceError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 409 },
      );
    }
    const schemaError = getHrmSchemaError(error);
    if (schemaError) {
      return NextResponse.json({ error: schemaError }, { status: 503 });
    }
    return handleApiError(error, 'PATCH /hrm/salary-advances/[id]');
  }
}
