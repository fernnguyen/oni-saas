export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireHrmAccess } from '@/lib/server/hrm/access';

import { handleApiError } from '../../../_helpers';
import { z } from 'zod';
import { realtimeEngine } from '@/lib/server/realtime';

const createSchema = z.object({
  profile_id: z.string().min(1, "Vui lòng chọn nhân sự"),
  amount: z.number().min(1, "Số tiền ứng phải lớn hơn 0"),
  pay_period: z.string().min(1, "Vui lòng chọn kỳ lương"),
  request_date: z.string().min(1, "Vui lòng chọn ngày ứng"),
  reason: z.string().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params;
    const { repository: hrmRepo, permissions, userId } = await requireHrmAccess(shopId, 'hrm.view');
    const canManage = permissions.includes('hrm.payroll.manage');
    const selfProfileId = await hrmRepo.getProfileIdForAuthUser(userId);
    const { searchParams } = new URL(req.url);
    const payPeriod = searchParams.get('pay_period') || undefined;
    const profileId = searchParams.get('profile_id') || undefined;

    const advances = await hrmRepo.listSalaryAdvances({ 
      payPeriod, 
      profileId,
      canManage,
      selfProfileId: selfProfileId || undefined
    });
    return NextResponse.json({ data: advances });
  } catch (error) {
    return handleApiError(error, 'GET /hrm/salary-advances');
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params;
    const { userId, tenantId, repository: hrmRepo } = await requireHrmAccess(shopId, 'hrm.view');
    const body = await req.json();
    const payload = createSchema.parse(body);


    const id = crypto.randomUUID();
    
    await hrmRepo.createSalaryAdvance({
      id,
      profileId: payload.profile_id,
      amount: payload.amount,
      requestDate: payload.request_date,
      payPeriod: payload.pay_period,
      reason: payload.reason,
      createdBy: userId,
    });

    // Notify managers
    await realtimeEngine.sendNotification({
      tenantId,
      branchId: shopId,
      type: 'system',
      title: 'Yêu cầu ứng lương mới',
      content: `Có một yêu cầu ứng lương mới ${payload.amount.toLocaleString('vi-VN')}đ cho kỳ lương ${payload.pay_period}.`,
      metadata: { path: '/hrm/salary-advances', advanceId: id },
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    return handleApiError(error, 'POST /hrm/salary-advances');
  }
}
