import { z } from 'zod';

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().default('');

export const createHrmEmployeeSchema = z.object({
  name: z.string().trim().min(1, 'Họ tên là bắt buộc').max(255),
  employee_code: optionalText(100),
  phone: optionalText(50),
  job_title: optionalText(255),
  department_id: optionalText(255),
  default_shift_template_id: optionalText(255),
  employment_type: z
    .enum(['monthly', 'daily', 'hourly'])
    .default('monthly'),
  joined_at: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày vào làm không hợp lệ')
    .optional()
    .or(z.literal(''))
    .default(''),
  email: z.string().trim().email('Email không hợp lệ').optional().or(z.literal('')).default(''),
  address: optionalText(1000),
  ethnicity: optionalText(50),
  tax_code: optionalText(20),
  insurance_code: optionalText(20),
  bank_name: optionalText(255),
  bank_account: optionalText(50),
  custom_data: z.record(z.unknown()).default({}),
});
