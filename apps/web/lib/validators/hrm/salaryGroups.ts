import { z } from 'zod';

const recurringAllowanceSchema = z.object({
  label: z.string().trim().min(1).max(120),
  amount: z.coerce.number().int().min(0).max(1_000_000_000_000),
});

export const saveHrmSalaryGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    salary_type: z.enum(['monthly', 'daily', 'hourly']),
    base_amount: z.coerce
      .number()
      .int()
      .min(0)
      .max(1_000_000_000_000),
    standard_work_days: z.coerce.number().int().min(1).max(31).nullable(),
    standard_work_hours: z.coerce.number().min(0.01).max(744).nullable(),
    overtime_multiplier: z.coerce.number().min(0).max(10).default(1),
    recurring_allowances: z
      .array(recurringAllowanceSchema)
      .max(20)
      .default([]),
    is_default: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    if (value.salary_type === 'monthly' && !value.standard_work_days) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['standard_work_days'],
        message: 'Nhóm lương tháng cần số ngày công chuẩn.',
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
    if (value.is_default && !value.active) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['active'],
        message: 'Nhóm lương mặc định phải đang hoạt động.',
      });
    }
  });

export const assignHrmSalaryPolicySchema = z
  .object({
    employee_id: z.string().trim().min(1),
    salary_mode: z.enum(['custom', 'group']),
    salary_group_id: z.string().trim().min(1).nullable(),
  })
  .superRefine((value, context) => {
    if (value.salary_mode === 'group' && !value.salary_group_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['salary_group_id'],
        message: 'Vui lòng chọn nhóm lương.',
      });
    }
    if (value.salary_mode === 'custom' && value.salary_group_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['salary_group_id'],
        message: 'Chế độ tùy chỉnh không nhận nhóm lương.',
      });
    }
  });
