export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireHrmAccess } from '@/lib/server/hrm/access';
import { requireShopAccess } from '@/lib/server/shopAccess';

import { handleApiError } from '../../../../_helpers';
import { z } from 'zod';
import { realtimeEngine } from '@/lib/server/realtime';
import { RollbackContext } from '@oni/adapters';

const patchSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  fund_id: z.string().optional(),
  rejection_reason: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string; advanceId: string }> }
) {
  let tx = new RollbackContext();
  try {
    const { shopId, advanceId } = await params;
    const { userId, tenantId, permissions, repository: hrmRepo } = await requireHrmAccess(shopId, 'hrm.payroll.manage');
    const { connector } = await requireShopAccess(shopId, 'hrm.payroll.manage');
    const body = await req.json();
    const payload = patchSchema.parse(body);


    const advance = await hrmRepo.getSalaryAdvance(advanceId);
    if (!advance) throw new Error('Không tìm thấy khoản ứng lương.');
    if (advance.status !== 'pending') throw new Error('Yêu cầu này đã được xử lý.');

    if (payload.status === 'rejected') {
      await hrmRepo.rejectSalaryAdvance({
        advanceId,
        actorUserId: userId,
        rejectionReason: payload.rejection_reason,
      });

      // Notify employee
      await realtimeEngine.sendNotification({
        tenantId,
        branchId: shopId,
        type: 'system',
        recipientId: advance.profile_id,
        title: 'Yêu cầu ứng lương bị từ chối',
        content: `Yêu cầu ứng lương ${parseInt(advance.amount).toLocaleString('vi-VN')}đ đã bị từ chối. Lý do: ${payload.rejection_reason || 'Không có'}`,
        metadata: { path: '/hrm/salary-advances' },
      });

      return NextResponse.json({ success: true });
    }

    if (payload.status === 'approved') {
      if (!payload.fund_id) {
        throw new Error('Vui lòng chọn quỹ thanh toán để chi tiền ứng lương.');
      }

      // 1. Lấy thông tin quỹ
      const fund = await connector.findById('payment-funds', payload.fund_id);
      if (!fund) throw new Error('Không tìm thấy tài khoản quỹ thanh toán.');
      
      const currentFundBalance = parseFloat(fund.current_balance || '0');
      const advanceAmount = parseFloat(advance.amount);
      const newFundBalance = currentFundBalance - advanceAmount;

      // 2. Cập nhật số dư quỹ
      await connector.update('payment-funds', payload.fund_id, {
        current_balance: String(newFundBalance)
      });
      tx.add(async () => {
        await connector.update('payment-funds', payload.fund_id!, {
          current_balance: String(currentFundBalance)
        }).catch(() => {});
      });

      // 3. Tạo phiếu chi Cashbook
      const createdCb = await connector.create('cashbook', {
        type: 'payment',
        amount: String(advanceAmount),
        method: fund.type === 'cash' ? 'cash' : 'bank_transfer',
        category: 'salary_advance',
        reference_id: advanceId,
        reference_name: `Ứng lương nhân viên ${advance.employee_name} (${advance.employee_code})`,
        note: advance.reason || `Giải ngân ứng lương kỳ ${advance.pay_period}`,
        branch_id: shopId,
        employee_id: userId || '',
        fund_id: payload.fund_id,
        balance_after_transaction: String(newFundBalance),
        is_virtual: 'FALSE',
      });
      const cashbookTxId = (createdCb as any).transaction_id || (createdCb as any).id;
      tx.add(async () => {
        await connector.delete('cashbook', cashbookTxId).catch(() => {});
      });

      // 4. Cập nhật HRM repository
      await hrmRepo.approveSalaryAdvance({
        advanceId,
        actorUserId: userId,
        fundId: payload.fund_id,
        cashbookTransactionId: cashbookTxId,
      });

      // Notify employee
      await realtimeEngine.sendNotification({
        tenantId,
        branchId: shopId,
        type: 'system',
        recipientId: advance.profile_id,
        title: 'Yêu cầu ứng lương đã được duyệt',
        content: `Yêu cầu ứng lương ${advanceAmount.toLocaleString('vi-VN')}đ đã được duyệt và giải ngân.`,
        metadata: { path: '/hrm/salary-advances' },
      });

      return NextResponse.json({ success: true, cashbook_transaction_id: cashbookTxId });
    }

    return NextResponse.json({ success: false });
  } catch (error) {
    await tx.rollback();
    return handleApiError(error, 'PATCH /hrm/salary-advances/[id]');
  }
}
