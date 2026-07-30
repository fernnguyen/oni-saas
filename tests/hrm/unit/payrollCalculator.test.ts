import assert from 'node:assert/strict';
import test from 'node:test';

import { calculatePayroll } from '../../../apps/web/lib/hrm/domain/payrollCalculator';

test('monthly payroll returns zero regular pay for zero work days', () => {
  const result = calculatePayroll({
    salaryType: 'monthly',
    baseAmount: 22_000_000,
    standardWorkDays: 22,
    standardWorkHoursMilli: 176_000,
    paidWorkDaysMilli: 0,
  });
  assert.equal(result.regularPay, 0);
  assert.equal(result.netPay, 0);
});

test('monthly payroll calculates full and fractional work days', () => {
  assert.equal(
    calculatePayroll({
      salaryType: 'monthly',
      baseAmount: 22_000_000,
      standardWorkDays: 22,
      paidWorkDaysMilli: 22_000,
    }).regularPay,
    22_000_000,
  );
  assert.equal(
    calculatePayroll({
      salaryType: 'monthly',
      baseAmount: 22_000_000,
      standardWorkDays: 22,
      paidWorkDaysMilli: 21_500,
    }).regularPay,
    21_500_000,
  );
});

test('daily and hourly payroll use integer VND rounding', () => {
  assert.equal(
    calculatePayroll({
      salaryType: 'daily',
      baseAmount: 500_000,
      paidWorkDaysMilli: 10_500,
    }).regularPay,
    5_250_000,
  );
  assert.equal(
    calculatePayroll({
      salaryType: 'hourly',
      baseAmount: 50_000,
      workedMinutes: 95,
    }).regularPay,
    79_167,
  );
});

test('payroll includes overtime, allowances, bonus, commission and deduction', () => {
  const result = calculatePayroll({
    salaryType: 'monthly',
    baseAmount: 22_000_000,
    standardWorkDays: 22,
    standardWorkHoursMilli: 176_000,
    paidWorkDaysMilli: 22_000,
    overtimeMinutes: 120,
    overtimeMultiplierBasisPoints: 15_000,
    recurringAllowances: [{ label: 'Ăn trưa', amount: 500_000 }],
    additionalAllowances: [{ label: 'Điện thoại', amount: 200_000 }],
    bonuses: [{ label: 'Hiệu suất', amount: 1_000_000 }],
    commissions: [{ label: 'Hoa hồng', amount: 300_000 }],
    deductions: [{ label: 'Tạm ứng', amount: 250_000 }],
  });

  assert.equal(result.overtimePay, 375_000);
  assert.equal(result.grossPay, 24_375_000);
  assert.equal(result.netPay, 24_125_000);
  assert.equal(result.breakdown.at(-1)?.amount, -250_000);
});

test('payroll calculator rejects unsafe or missing divisors', () => {
  assert.throws(
    () =>
      calculatePayroll({
        salaryType: 'monthly',
        baseAmount: 10_000_000,
        standardWorkDays: 0,
        paidWorkDaysMilli: 1_000,
      }),
    /standardWorkDays/,
  );
});
