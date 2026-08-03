export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { HrmAccessError, requireHrmAccess } from '@/lib/server/hrm/access';

import { handleApiError } from '../../../_helpers';
import { z } from 'zod';
import { realtimeEngine } from '@/lib/server/realtime';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { RollbackContext } from '@oni/adapters';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getHrmSchemaError } from '@/lib/server/hrm/schemaError';

const createSchema = z.object({
  profile_id: z.string().min(1, "Vui lòng chọn nhân sự"),
  amount: z.number().min(1, "Số tiền ứng phải lớn hơn 0"),
  pay_period: z.string().min(1, "Vui lòng chọn kỳ lương"),
  request_date: z.string().min(1, "Vui lòng chọn ngày ứng"),
  reason: z.string().optional(),
  fund_id: z.string().min(1, "Vui lòng chọn quỹ chi tiền").optional(),
  action: z.enum(['approve', 'disburse']).optional(),
});

function respondError(error: unknown, label: string) {
  if (error instanceof HrmAccessError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  const schemaError = getHrmSchemaError(error);
  if (schemaError) {
    return NextResponse.json({ error: schemaError }, { status: 503 });
  }
  return handleApiError(error, label);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params;
    const { repository: hrmRepo, permissions, userId, tenantId } = await requireHrmAccess(shopId, 'hrm.view');
    const canManage = permissions.includes('hrm.payroll.manage');
    const selfProfileId = await hrmRepo.getProfileIdForAuthUser(userId);
    const { searchParams } = new URL(req.url);
    const payPeriod = searchParams.get('pay_period') || undefined;
    const profileId = searchParams.get('profile_id') || undefined;

    const [advances, employees] = await Promise.all([
      hrmRepo.listSalaryAdvances({
        payPeriod,
        profileId,
        canManage,
        selfProfileId: selfProfileId || undefined,
      }),
      canManage ? hrmRepo.listSalaryAdvanceEmployees() : Promise.resolve([]),
    ]);

    const actorIds = Array.from(
      new Set(
        advances
          .flatMap((advance) => [advance.approvedBy, advance.disbursedBy])
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const actorNames = new Map<string, string>();
    if (actorIds.length > 0) {
      const admin = getSupabaseAdminClient();
      const { data: actorProfiles, error: actorProfilesError } = await admin
        .from('tenant_user_profiles')
        .select('user_id, display_name, login_email')
        .eq('tenant_id', tenantId)
        .in('user_id', actorIds);

      if (actorProfilesError) {
        console.error(
          'Failed to resolve salary advance actor names:',
          actorProfilesError,
        );
      } else {
        for (const profile of actorProfiles ?? []) {
          actorNames.set(
            profile.user_id,
            profile.display_name || profile.login_email || profile.user_id,
          );
        }
      }
    }

    const data = advances.map((advance) => {
      const { approvedBy, disbursedBy, ...salaryAdvance } = advance;
      return {
        ...salaryAdvance,
        approvedByName: approvedBy
          ? actorNames.get(approvedBy) ||
            `Người dùng (${approvedBy.slice(0, 8)})`
          : null,
        disbursedByName: disbursedBy
          ? actorNames.get(disbursedBy) ||
            `Người dùng (${disbursedBy.slice(0, 8)})`
          : null,
      };
    });

    return NextResponse.json({ data, employees });
  } catch (error) {
    return respondError(error, 'GET /hrm/salary-advances');
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const tx = new RollbackContext();
  try {
    const { shopId } = await params;
    const {
      userId,
      tenantId,
      permissions,
      repository: hrmRepo,
    } = await requireHrmAccess(shopId, 'hrm.view');
    const body = await req.json();
    const payload = createSchema.parse(body);
    const canManage = permissions.includes('hrm.payroll.manage');
    const selfProfileId = await hrmRepo.getProfileIdForAuthUser(userId);
    const profileId = canManage ? payload.profile_id : selfProfileId;

    if (!profileId) {
      throw new HrmAccessError(
        403,
        'HRM_PERMISSION_DENIED',
        'Tài khoản chưa được liên kết với hồ sơ nhân viên.',
      );
    }
    if (!canManage && payload.profile_id !== selfProfileId) {
      throw new HrmAccessError(
        403,
        'HRM_PERMISSION_DENIED',
        'Bạn chỉ được tạo yêu cầu ứng lương cho chính mình.',
      );
    }
    let targetEmployee: Awaited<ReturnType<typeof hrmRepo.listSalaryAdvanceEmployees>>[number] | undefined;
    if (canManage) {
      const employees = await hrmRepo.listSalaryAdvanceEmployees();
      targetEmployee = employees.find((employee) => employee.profileId === profileId);
      if (!targetEmployee) {
        throw new HrmAccessError(
          403,
          'HRM_PERMISSION_DENIED',
          'Nhân viên không thuộc chi nhánh hiện tại.',
        );
      }
    }

    const id = crypto.randomUUID();
    const ownerAction = canManage ? (payload.action ?? 'disburse') : null;
    const autoApprove = ownerAction === 'approve' || ownerAction === 'disburse';
    let disbursement:
      | { fundId: string; cashbookTransactionId: string }
      | undefined;

    if (ownerAction === 'disburse') {
      if (!payload.fund_id) {
        return NextResponse.json(
          {
            error: {
              code: 'HRM_VALIDATION_ERROR',
              message: 'Vui lòng chọn quỹ chi tiền ứng lương.',
            },
          },
          { status: 400 },
        );
      }

      const { connector } = await requireShopAccess(
        shopId,
        'hrm.payroll.manage',
      );
      const fund = await connector.findById('payment-funds', payload.fund_id);
      if (!fund || (fund.branch_id && fund.branch_id !== shopId)) {
        return NextResponse.json(
          {
            error: {
              code: 'HRM_FUND_NOT_FOUND',
              message: 'Không tìm thấy quỹ chi tiền trong chi nhánh hiện tại.',
            },
          },
          { status: 404 },
        );
      }

      const currentFundBalance = Number(fund.current_balance || 0);
      const newFundBalance = currentFundBalance - payload.amount;
      await connector.update('payment-funds', payload.fund_id, {
        current_balance: String(newFundBalance),
      });
      tx.add(async () => {
        await connector
          .update('payment-funds', payload.fund_id!, {
            current_balance: String(currentFundBalance),
          })
          .catch(() => {});
      });

      const createdCashbookEntry = await connector.create('cashbook', {
        type: 'payment',
        amount: String(payload.amount),
        method: fund.type === 'cash' ? 'cash' : 'bank_transfer',
        category: 'salary_advance',
        reference_id: id,
        reference_name: `Ứng lương nhân viên ${targetEmployee?.employeeName ?? ''}${targetEmployee?.employeeCode ? ` (${targetEmployee.employeeCode})` : ''}`,
        note: payload.reason || `Ứng lương kỳ ${payload.pay_period}`,
        branch_id: shopId,
        employee_id: userId,
        fund_id: payload.fund_id,
        balance_after_transaction: String(newFundBalance),
        is_virtual: 'FALSE',
      });
      const cashbookTransactionId =
        (createdCashbookEntry as any).transaction_id ||
        (createdCashbookEntry as any).id;
      if (!cashbookTransactionId) {
        throw new Error('Không thể xác định mã phiếu chi ứng lương.');
      }
      tx.add(async () => {
        await connector
          .delete('cashbook', cashbookTransactionId)
          .catch(() => {});
      });
      disbursement = {
        fundId: payload.fund_id,
        cashbookTransactionId,
      };
    }
    
    await hrmRepo.createSalaryAdvance({
      id,
      profileId,
      amount: payload.amount,
      requestDate: payload.request_date,
      payPeriod: payload.pay_period,
      reason: payload.reason,
      createdBy: userId,
      autoApprove,
      disbursement,
    });

    if (!autoApprove) {
      await realtimeEngine.sendNotification({
        tenantId,
        branchId: shopId,
        type: 'system',
        title: 'Yêu cầu ứng lương mới',
        content: `Có một yêu cầu ứng lương mới ${payload.amount.toLocaleString('vi-VN')}đ cho kỳ lương ${payload.pay_period}.`,
        metadata: { path: '/hrm/salary-advances', advanceId: id },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id,
        status: disbursement
          ? 'disbursed'
          : autoApprove
            ? 'approved'
            : 'pending',
        cashbook_transaction_id: disbursement?.cashbookTransactionId ?? null,
      },
    });
  } catch (error) {
    await tx.rollback();
    return respondError(error, 'POST /hrm/salary-advances');
  }
}
