export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { HrmAccessError, requireHrmAccess } from '@/lib/server/hrm/access';

import { handleApiError } from '../../../_helpers';
import { z } from 'zod';
import {
  HrmFundNotFoundError,
  HrmInsufficientFundBalanceError,
} from '@oni/adapters';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getHrmSchemaError } from '@/lib/server/hrm/schemaError';
import { notifySalaryAdvanceManagers } from '@/lib/server/hrm/salaryAdvanceManagerNotification';
import { notifySalaryAdvanceEmployee } from '@/lib/server/hrm/salaryAdvanceNotification';
import { realtimeEngine } from '@/lib/server/realtime';
import { formatHrmPayPeriod } from '@/lib/hrm/formatDate';

const createSchema = z.object({
  profile_id: z.string().min(1, "Vui lòng chọn nhân sự"),
  amount: z.number().min(1, "Số tiền ứng phải lớn hơn 0"),
  pay_period: z.string().min(1, "Vui lòng chọn kỳ lương"),
  request_date: z.string().min(1, "Vui lòng chọn ngày ứng"),
  reason: z.string().optional(),
  fund_id: z.string().min(1, "Vui lòng chọn quỹ chi tiền").optional(),
  action: z.enum(['approve', 'disburse']).optional(),
  /** Bỏ qua kiểm tra số dư quỹ — chi và cân đối sau */
  force: z.boolean().optional(),
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
    let disbursement: { fundId: string } | undefined;

    if (ownerAction === 'disburse') {
      const canDisburse =
        permissions.includes('hrm.payroll.pay') &&
        permissions.includes('cashbook.manage');
      if (!canDisburse) {
        throw new HrmAccessError(
          403,
          'HRM_PERMISSION_DENIED',
          'Bạn không có quyền chi tiền ứng lương từ quỹ.',
        );
      }
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

      disbursement = {
        fundId: payload.fund_id,
        force: payload.force,
      };
    }
    
    const created = await hrmRepo.createSalaryAdvance({
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

    // convert yyyy-mm thành mm/yyyy
    const payPeriodFormatted = formatHrmPayPeriod(payload.pay_period);
    if (!autoApprove) {
      await notifySalaryAdvanceManagers({
        tenantId,
        branchId: shopId,
        requesterUserId: userId,
        profileId,
        departmentDirectory: hrmRepo,
        advanceId: id,
        amount: payload.amount,
        payPeriod: payPeriodFormatted,
      });
    } else {
      await notifySalaryAdvanceEmployee({
        repository: hrmRepo,
        publisher: realtimeEngine,
        tenantId,
        branchId: shopId,
        profileId,
        advanceId: id,
        title: disbursement
          ? 'Khoản ứng lương đã được chi'
          : 'Yêu cầu ứng lương đã được duyệt',
        content: disbursement
          ? `Khoản ứng lương ${payload.amount.toLocaleString('vi-VN')}đ đã được duyệt và chi từ quỹ.`
          : `Yêu cầu ứng lương ${payload.amount.toLocaleString('vi-VN')}đ đã được duyệt và đang chờ chi tiền.`,
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
        cashbook_transaction_id: created.cashbookTransactionId,
      },
    });
  } catch (error) {
    return respondError(error, 'POST /hrm/salary-advances');
  }
}
