import crypto from 'node:crypto';
import {
  type HrmEmployeeSalaryAssignment,
  type HrmEmployeeSalarySummary,
  type HrmPayrollMoneyItem,
  type HrmPayrollRunDetail,
  type HrmPayrollStoredBreakdown,
  type HrmSalaryConfiguration,
  type HrmSalaryGroup,
  PostgresHrmRepository,
} from '@oni/adapters';
import { calculatePayroll } from '../../hrm/domain/payrollCalculator';

interface PayrollAdjustments {
  additionalAllowances: HrmPayrollMoneyItem[];
  bonuses: HrmPayrollMoneyItem[];
  commissions: HrmPayrollMoneyItem[];
  deductions: HrmPayrollMoneyItem[];
}

type ResolvedSalaryPolicy =
  | {
      source: 'custom';
      configuration: HrmSalaryConfiguration;
      group: null;
    }
  | {
      source: 'group' | 'default';
      configuration: null;
      group: HrmSalaryGroup;
    }
  | { source: 'missing'; configuration: null; group: null };

export class HrmPayrollValidationError extends Error {
  readonly code = 'HRM_PAYROLL_CONFIG_INCOMPLETE';

  constructor(message: string) {
    super(message);
    this.name = 'HrmPayrollValidationError';
  }
}

function currentConfiguration(
  configurations: HrmSalaryConfiguration[],
  effectiveOn: string,
): HrmSalaryConfiguration | null {
  return (
    configurations.find(
      (configuration) =>
        configuration.effectiveFrom <= effectiveOn &&
        (!configuration.effectiveTo ||
          configuration.effectiveTo >= effectiveOn),
    ) ?? null
  );
}

function resolveSalaryPolicy(
  employee: HrmEmployeeSalarySummary,
  groups: HrmSalaryGroup[],
  assignments: HrmEmployeeSalaryAssignment[],
  effectiveOn: string,
): ResolvedSalaryPolicy {
  const assignment = assignments.find(
    (item) => item.employeeId === employee.employeeId,
  );
  if (assignment?.salaryMode === 'group') {
    const group = groups.find(
      (item) => item.id === assignment.salaryGroupId && item.active,
    );
    if (group) return { source: 'group', configuration: null, group };
    const fallback = groups.find((item) => item.active && item.isDefault);
    return fallback
      ? { source: 'default', configuration: null, group: fallback }
      : { source: 'missing', configuration: null, group: null };
  }

  const configuration = currentConfiguration(
    employee.configurations,
    effectiveOn,
  );
  if (assignment?.salaryMode === 'custom') {
    return configuration
      ? { source: 'custom', configuration, group: null }
      : { source: 'missing', configuration: null, group: null };
  }
  if (configuration) {
    return { source: 'custom', configuration, group: null };
  }
  const fallback = groups.find((item) => item.active && item.isDefault);
  return fallback
    ? { source: 'default', configuration: null, group: fallback }
    : { source: 'missing', configuration: null, group: null };
}

function emptyAdjustments(): PayrollAdjustments {
  return {
    additionalAllowances: [],
    bonuses: [],
    commissions: [],
    deductions: [],
  };
}

function getStoredAdjustments(
  run: HrmPayrollRunDetail | null,
  profileId: string,
): {
  itemId: string | null;
  adjustments: PayrollAdjustments;
  manualNote: string | null;
} {
  const existing = run?.items.find((item) => item.profileId === profileId);
  return {
    itemId: existing?.id ?? null,
    adjustments: existing?.breakdown?.adjustments ?? emptyAdjustments(),
    manualNote: existing?.manualNote ?? null,
  };
}

function periodDates(period: string): {
  periodStart: string;
  periodEnd: string;
} {
  const [year, month] = period.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    periodStart: `${period}-01`,
    periodEnd: `${period}-${String(lastDay).padStart(2, '0')}`,
  };
}

export async function calculatePayrollRun(input: {
  repository: PostgresHrmRepository;
  period: string;
  standardWorkDays: number;
  expectedVersion: number | null;
  actorUserId: string;
}): Promise<HrmPayrollRunDetail> {
  const { periodStart, periodEnd } = periodDates(input.period);
  const [employees, groups, assignments, attendance, runs, advancesList] = await Promise.all([
    input.repository.listEmployeeSalaryConfigurations(),
    input.repository.listSalaryGroups(),
    input.repository.listEmployeeSalaryAssignments(),
    input.repository.listMonthlyAttendance({ periodStart, periodEnd }),
    input.repository.listPayrollRuns(),
    input.repository.listSalaryAdvances({ payPeriod: input.period, canManage: true }),
  ]);

  const existingSummary = runs.find(
    (run) =>
      run.periodStart === periodStart && run.periodEnd === periodEnd,
  );
  const existingRun = existingSummary
    ? await input.repository.getPayrollRun(existingSummary.id)
    : null;

  const missingEmployees: string[] = [];
  const attendanceByEmployee = new Map<
    string,
    {
      paidWorkDays: number;
      workedMinutes: number;
      overtimeMinutes: number;
    }
  >();
  for (const row of attendance) {
    const aggregate = attendanceByEmployee.get(row.employeeId) ?? {
      paidWorkDays: 0,
      workedMinutes: 0,
      overtimeMinutes: 0,
    };
    if (
      row.status === 'present' ||
      row.status === 'paid_leave' ||
      row.status === 'holiday'
    ) {
      aggregate.paidWorkDays += 1;
    }
    aggregate.workedMinutes += row.workedMinutes;
    aggregate.overtimeMinutes += row.overtimeMinutes;
    attendanceByEmployee.set(row.employeeId, aggregate);
  }

  const items = employees.flatMap((employee) => {
    const resolved = resolveSalaryPolicy(
      employee,
      groups,
      assignments,
      periodEnd,
    );
    const policy = resolved.configuration ?? resolved.group;
    if (!employee.profileId || !policy) {
      missingEmployees.push(employee.employeeName || employee.employeeId);
      return [];
    }

    const aggregate = attendanceByEmployee.get(employee.employeeId) ?? {
      paidWorkDays: 0,
      workedMinutes: 0,
      overtimeMinutes: 0,
    };
    const stored = getStoredAdjustments(existingRun, employee.profileId);
    
    // Inject Salary Advances (approved ones only)
    const employeeAdvances = advancesList.filter(
      a => a.profileId === employee.profileId && a.status === 'approved'
    );
    
    const existingAdvanceDeductions = stored.adjustments.deductions.filter(d => d.label.startsWith('Hoàn ứng: '));
    const manualDeductions = stored.adjustments.deductions.filter(d => !d.label.startsWith('Hoàn ứng: '));
    
    const advanceDeductions = employeeAdvances.map(a => ({
      amount: a.amount,
      label: `Hoàn ứng: ${a.reason || 'Kỳ ' + input.period}`,
    }));
    
    const finalAdjustments = {
      ...stored.adjustments,
      deductions: [...manualDeductions, ...advanceDeductions],
    };

    const calculationInput = {
      salaryType: policy.salaryType,
      baseAmount: policy.baseAmount,
      standardWorkDays: policy.standardWorkDays,
      standardWorkHoursMilli:
        policy.standardWorkHours === null
          ? null
          : Math.round(policy.standardWorkHours * 1000),
      paidWorkDaysMilli: aggregate.paidWorkDays * 1000,
      workedMinutes: aggregate.workedMinutes,
      overtimeMinutes: aggregate.overtimeMinutes,
      overtimeMultiplierBasisPoints: Math.round(
        policy.overtimeMultiplier * 10_000,
      ),
      recurringAllowances: policy.recurringAllowances,
    };
    const calculation = calculatePayroll({
      ...calculationInput,
      ...finalAdjustments,
    });
    const breakdown: HrmPayrollStoredBreakdown = {
      calculationInput,
      adjustments: finalAdjustments,
      lines: calculation.breakdown,
    };

    return [
      {
        id: stored.itemId ?? `HRMPI-${crypto.randomUUID()}`,
        profileId: employee.profileId,
        employeeName: employee.employeeName,
        employeeCode: employee.employeeCode,
        departmentId: employee.departmentId,
        salaryType: policy.salaryType,
        baseAmount: policy.baseAmount,
        workUnits:
          policy.salaryType === 'hourly'
            ? Math.round((aggregate.workedMinutes / 60) * 10_000) / 10_000
            : aggregate.paidWorkDays,
        regularPay: calculation.regularPay,
        overtimePay: calculation.overtimePay,
        allowanceTotal:
          calculation.recurringAllowanceTotal +
          calculation.additionalAllowanceTotal,
        bonusTotal: calculation.bonusTotal,
        commissionTotal: calculation.commissionTotal,
        deductionTotal: calculation.deductionTotal,
        netPay: calculation.netPay,
        breakdown,
        manualNote: stored.manualNote,
      },
    ];
  });

  if (missingEmployees.length > 0) {
    const preview = missingEmployees.slice(0, 3).join(', ');
    const suffix =
      missingEmployees.length > 3
        ? ` và ${missingEmployees.length - 3} nhân viên khác`
        : '';
    throw new HrmPayrollValidationError(
      `Cần cấu hình lương cho ${preview}${suffix} trước khi tạo kỳ lương.`,
    );
  }
  if (items.length === 0) {
    throw new HrmPayrollValidationError(
      'Chưa có nhân viên để tạo kỳ lương.',
    );
  }

  return input.repository.savePayrollRunDraft({
    id: existingRun?.id ?? `HRMPR-${crypto.randomUUID()}`,
    periodStart,
    periodEnd,
    standardWorkDays: input.standardWorkDays,
    expectedVersion: input.expectedVersion,
    actorUserId: input.actorUserId,
    auditId: `HRMAUD-${crypto.randomUUID()}`,
    items,
  });
}

export async function adjustPayrollItem(input: {
  repository: PostgresHrmRepository;
  runId: string;
  itemId: string;
  expectedVersion: number;
  actorUserId: string;
  adjustments: PayrollAdjustments;
  manualNote: string;
}): Promise<HrmPayrollRunDetail> {
  const run = await input.repository.getPayrollRun(input.runId);
  const item = run?.items.find((candidate) => candidate.id === input.itemId);
  if (!run || !item) {
    throw new HrmPayrollValidationError(
      'Không tìm thấy dòng lương cần điều chỉnh.',
    );
  }

  const calculation = calculatePayroll({
    ...item.breakdown.calculationInput,
    ...input.adjustments,
  });
  if (calculation.netPay < 0) {
    throw new HrmPayrollValidationError(
      'Tổng khấu trừ không được lớn hơn thu nhập của nhân viên.',
    );
  }
  return input.repository.updatePayrollItem({
    runId: input.runId,
    itemId: input.itemId,
    expectedVersion: input.expectedVersion,
    actorUserId: input.actorUserId,
    auditId: `HRMAUD-${crypto.randomUUID()}`,
    regularPay: calculation.regularPay,
    overtimePay: calculation.overtimePay,
    allowanceTotal:
      calculation.recurringAllowanceTotal +
      calculation.additionalAllowanceTotal,
    bonusTotal: calculation.bonusTotal,
    commissionTotal: calculation.commissionTotal,
    deductionTotal: calculation.deductionTotal,
    netPay: calculation.netPay,
    breakdown: {
      calculationInput: item.breakdown.calculationInput,
      adjustments: input.adjustments,
      lines: calculation.breakdown,
    },
    manualNote: input.manualNote,
  });
}
