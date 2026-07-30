export type PayrollSalaryType = 'monthly' | 'daily' | 'hourly';

export interface PayrollMoneyItem {
  label: string;
  amount: number;
  /** If true (default), prorate by actual days worked. Only applies to recurringAllowances. */
  prorate?: boolean;
}

export interface PayrollCalculationInput {
  salaryType: PayrollSalaryType;
  baseAmount: number;
  standardWorkDays?: number | null;
  standardWorkHoursMilli?: number | null;
  paidWorkDaysMilli?: number;
  workedMinutes?: number;
  overtimeMinutes?: number;
  overtimeMultiplierBasisPoints?: number;
  recurringAllowances?: PayrollMoneyItem[];
  additionalAllowances?: PayrollMoneyItem[];
  bonuses?: PayrollMoneyItem[];
  commissions?: PayrollMoneyItem[];
  deductions?: PayrollMoneyItem[];
}

export interface PayrollBreakdownItem extends PayrollMoneyItem {
  code:
    | 'regular_pay'
    | 'overtime_pay'
    | 'recurring_allowance'
    | 'additional_allowance'
    | 'bonus'
    | 'commission'
    | 'deduction';
}

export interface PayrollCalculationResult {
  regularPay: number;
  overtimePay: number;
  recurringAllowanceTotal: number;
  additionalAllowanceTotal: number;
  bonusTotal: number;
  commissionTotal: number;
  deductionTotal: number;
  grossPay: number;
  netPay: number;
  breakdown: PayrollBreakdownItem[];
}

function assertInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer.`);
  }
  return value;
}

function roundedDivide(
  numeratorFactors: number[],
  denominatorFactors: number[],
): number {
  let numerator = 1n;
  for (const factor of numeratorFactors) {
    numerator *= BigInt(assertInteger(factor, 'payroll numerator'));
  }
  let denominator = 1n;
  for (const factor of denominatorFactors) {
    const value = assertInteger(factor, 'payroll denominator');
    if (value === 0) throw new Error('Invalid payroll division.');
    denominator *= BigInt(value);
  }
  const result = (numerator + denominator / 2n) / denominator;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Payroll result exceeds safe integer range.');
  }
  return Number(result);
}

function sumItems(items: PayrollMoneyItem[] | undefined): number {
  return (items ?? []).reduce(
    (sum, item) => sum + assertInteger(item.amount, item.label),
    0,
  );
}

export function calculatePayroll(
  input: PayrollCalculationInput,
): PayrollCalculationResult {
  const baseAmount = assertInteger(input.baseAmount, 'baseAmount');
  const paidWorkDaysMilli = assertInteger(
    input.paidWorkDaysMilli ?? 0,
    'paidWorkDaysMilli',
  );
  const workedMinutes = assertInteger(
    input.workedMinutes ?? 0,
    'workedMinutes',
  );
  const overtimeMinutes = assertInteger(
    input.overtimeMinutes ?? 0,
    'overtimeMinutes',
  );
  const multiplier = assertInteger(
    input.overtimeMultiplierBasisPoints ?? 10_000,
    'overtimeMultiplierBasisPoints',
  );

  let regularPay = 0;
  if (input.salaryType === 'monthly') {
    const standardDays = assertInteger(
      input.standardWorkDays ?? 0,
      'standardWorkDays',
    );
    if (standardDays === 0) throw new Error('standardWorkDays is required.');
    regularPay = roundedDivide(
      [baseAmount, paidWorkDaysMilli],
      [standardDays, 1000],
    );
  } else if (input.salaryType === 'daily') {
    regularPay = roundedDivide([baseAmount, paidWorkDaysMilli], [1000]);
  } else {
    regularPay = roundedDivide([baseAmount, workedMinutes], [60]);
  }

  let overtimePay = 0;
  if (overtimeMinutes > 0) {
    if (input.salaryType === 'hourly') {
      overtimePay = roundedDivide(
        [baseAmount, overtimeMinutes, multiplier],
        [60, 10_000],
      );
    } else {
      const standardHoursMilli = assertInteger(
        input.standardWorkHoursMilli ?? 0,
        'standardWorkHoursMilli',
      );
      if (standardHoursMilli === 0) {
        throw new Error('standardWorkHoursMilli is required for overtime.');
      }
      overtimePay = roundedDivide(
        [baseAmount, overtimeMinutes, multiplier, 1000],
        [standardHoursMilli, 60, 10_000],
      );
    }
  }

  // Recurring allowances: prorated or fixed depending on the prorate flag.
  // prorate=true (default): scales with paidWorkDays / standardWorkDays (monthly)
  //   or paidWorkDays directly (daily/hourly — rare but consistent).
  // prorate=false: always paid in full, regardless of attendance.
  let recurringAllowanceTotal = 0;
  for (const allowance of input.recurringAllowances ?? []) {
    const shouldProrate = allowance.prorate !== false; // default true
    const fullAmount = assertInteger(allowance.amount, allowance.label);
    if (!shouldProrate || fullAmount === 0) {
      recurringAllowanceTotal += fullAmount;
    } else if (input.salaryType === 'monthly') {
      const standardDays = assertInteger(
        input.standardWorkDays ?? 0,
        'standardWorkDays',
      );
      if (standardDays === 0) throw new Error('standardWorkDays is required.');
      recurringAllowanceTotal += roundedDivide(
        [fullAmount, paidWorkDaysMilli],
        [standardDays, 1000],
      );
    } else if (input.salaryType === 'daily') {
      recurringAllowanceTotal += roundedDivide(
        [fullAmount, paidWorkDaysMilli],
        [1000],
      );
    } else {
      // hourly — prorate by worked minutes vs standard hours (as minutes)
      const standardHoursMilli = assertInteger(
        input.standardWorkHoursMilli ?? 0,
        'standardWorkHoursMilli',
      );
      if (standardHoursMilli === 0) {
        recurringAllowanceTotal += fullAmount; // fallback: pay full
      } else {
        // standardHoursMilli / 1000 = standard hours in milli-hours → convert to minutes
        // prorate = amount * workedMinutes / standardMinutes
        // standardMinutes = standardHoursMilli / 1000 * 60 = standardHoursMilli * 60 / 1000
        recurringAllowanceTotal += roundedDivide(
          [fullAmount, workedMinutes, 1000],
          [standardHoursMilli, 60],
        );
      }
    }
  }
  const additionalAllowanceTotal = sumItems(input.additionalAllowances);
  const bonusTotal = sumItems(input.bonuses);
  const commissionTotal = sumItems(input.commissions);
  const deductionTotal = sumItems(input.deductions);
  const grossPay =
    regularPay +
    overtimePay +
    recurringAllowanceTotal +
    additionalAllowanceTotal +
    bonusTotal +
    commissionTotal;
  const netPay = grossPay - deductionTotal;

  const breakdown: PayrollBreakdownItem[] = [
    { code: 'regular_pay', label: 'Lương theo công', amount: regularPay },
    { code: 'overtime_pay', label: 'Lương tăng ca', amount: overtimePay },
    ...(input.recurringAllowances ?? []).map((item) => ({
      code: 'recurring_allowance' as const,
      ...item,
    })),
    ...(input.additionalAllowances ?? []).map((item) => ({
      code: 'additional_allowance' as const,
      ...item,
    })),
    ...(input.bonuses ?? []).map((item) => ({
      code: 'bonus' as const,
      ...item,
    })),
    ...(input.commissions ?? []).map((item) => ({
      code: 'commission' as const,
      ...item,
    })),
    ...(input.deductions ?? []).map((item) => ({
      code: 'deduction' as const,
      label: item.label,
      amount: -item.amount,
    })),
  ];

  return {
    regularPay,
    overtimePay,
    recurringAllowanceTotal,
    additionalAllowanceTotal,
    bonusTotal,
    commissionTotal,
    deductionTotal,
    grossPay,
    netPay,
    breakdown,
  };
}
