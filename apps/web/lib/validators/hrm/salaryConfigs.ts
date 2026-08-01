import { z } from 'zod';

const allowanceSchema = z.object({
  label: z.string().trim().min(1, 'Tên phụ cấp là bắt buộc').max(100),
  amount: z.coerce.number().int().min(0).max(1_000_000_000),
});

export const createHrmSalaryConfigSchema = z
  .object({
    employee_id: z.string().trim().min(1),
    salary_type: z.enum(['monthly', 'daily', 'hourly']),
    base_amount: z.coerce
      .number()
      .int()
      .min(0)
      .max(1_000_000_000_000),
    standard_work_days: z.coerce.number().int().min(1).max(31).nullable(),
    standard_work_hours: z.coerce.number().min(0.01).max(744).nullable(),
    overtime_multiplier: z.coerce.number().min(0).max(10).default(1),
    recurring_allowances: z.array(allowanceSchema).max(20).default([]),
    effective_from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày hiệu lực không hợp lệ'),
    shift_template_id: z.string().trim().min(1).nullable().optional(),
    annual_leave_days: z.coerce.number().int().min(0).max(365).default(12),
  })
  .superRefine((value, context) => {
    if (value.salary_type === 'monthly' && !value.standard_work_days) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['standard_work_days'],
        message: 'Lương tháng cần số ngày công chuẩn.',
      });
    }
    if (
      value.salary_type !== 'hourly' &&
      !value.standard_work_hours
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['standard_work_hours'],
        message: 'Cần số giờ chuẩn để tính tăng ca.',
      });
    }
  });
