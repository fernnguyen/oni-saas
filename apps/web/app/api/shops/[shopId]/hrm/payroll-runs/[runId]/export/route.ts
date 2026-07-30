import crypto from 'node:crypto';
import { HrmPayrollRunNotFoundError } from '@oni/adapters';
import { requireHrmAccess } from '@/lib/server/hrm/access';
import { respondPayrollError } from '@/lib/server/hrm/payrollResponses';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ shopId: string; runId: string }> },
) {
  try {
    const { shopId, runId } = await params;
    const access = await requireHrmAccess(shopId, 'hrm.payroll.view');
    const run = await access.repository.getPayrollRun(runId);
    if (!run) throw new HrmPayrollRunNotFoundError();

    const rows = [
      [
        'Mã nhân viên',
        'Nhân viên',
        'Hình thức lương',
        'Đơn vị công',
        'Lương cơ bản',
        'Lương theo công',
        'Tăng ca',
        'Phụ cấp',
        'Thưởng',
        'Hoa hồng',
        'Khấu trừ',
        'Thực nhận',
        'Ghi chú điều chỉnh',
      ],
      ...run.items.map((item) => [
        item.employeeCode,
        item.employeeName,
        item.salaryType,
        item.workUnits,
        item.baseAmount,
        item.regularPay,
        item.overtimePay,
        item.allowanceTotal,
        item.bonusTotal,
        item.commissionTotal,
        item.deductionTotal,
        item.netPay,
        item.manualNote,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((value) => csvCell(value)).join(','))
      .join('\r\n');

    await access.repository.recordPayrollExport({
      runId,
      actorUserId: access.userId,
      auditId: `HRMAUD-${crypto.randomUUID()}`,
    });
    const period = run.periodStart.slice(0, 7);
    return new Response(`\uFEFF${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="oni-payroll-${period}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return respondPayrollError(error);
  }
}
