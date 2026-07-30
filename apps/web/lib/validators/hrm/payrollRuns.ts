import { z } from 'zod';

const moneyItemSchema = z.object({
  label: z.string().trim().min(1).max(120),
  amount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

export const calculatePayrollRunSchema = z.object({
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Tháng tính lương không hợp lệ.'),
  standard_work_days: z.number().int().min(1).max(31).default(26),
  expected_version: z.number().int().min(1).nullable().default(null),
});

export const adjustPayrollItemSchema = z.object({
  expected_version: z.number().int().min(1),
  additional_allowances: z.array(moneyItemSchema).max(20).default([]),
  bonuses: z.array(moneyItemSchema).max(20).default([]),
  commissions: z.array(moneyItemSchema).max(20).default([]),
  deductions: z.array(moneyItemSchema).max(20).default([]),
  manual_note: z.string().trim().min(3).max(500),
});

export const finalizePayrollRunSchema = z.object({
  expected_version: z.number().int().min(1),
});

export const payPayrollRunSchema = z.object({
  fund_id: z.string().trim().min(1, 'Cần chọn quỹ thanh toán.'),
  expected_version: z.number().int().min(1),
});
