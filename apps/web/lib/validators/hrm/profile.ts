import { z } from 'zod';

export const updateHrmEmployeeProfileSchema = z.object({
  auth_user_id: z.string().uuid().nullable().optional(),
  employee_code: z.string().trim().max(100).optional().default(''),
  name: z.string().trim().min(1, 'Họ tên là bắt buộc').max(255),
  phone: z.string().trim().max(50).optional().default(''),
  job_title: z.string().trim().max(255).optional().default(''),
  employment_status: z.enum(['active', 'probation', 'inactive']),
  employment_type: z.enum(['monthly', 'daily', 'hourly']),
  joined_at: z.string().trim().optional().default(''),
  email: z.string().trim().email('Email không hợp lệ').or(z.literal('')).default(''),
  address: z.string().trim().max(1000).optional().default(''),
  ethnicity: z.string().trim().max(50).optional().default(''),
  tax_code: z.string().trim().max(20).optional().default(''),
  insurance_code: z.string().trim().max(20).optional().default(''),
  bank_name: z.string().trim().max(255).optional().default(''),
  bank_account: z.string().trim().max(50).optional().default(''),
  department_id: z.string().trim().max(255).optional().default(''),
  default_shift_template_id: z.string().trim().max(255).optional().default(''),
  custom_data: z.record(z.unknown()).default({}),
});

export const createHrmCustomFieldSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1, 'Mã field là bắt buộc')
      .max(100)
      .regex(
        /^[a-z][a-z0-9_]*$/,
        'Mã field chỉ gồm chữ thường, số và dấu gạch dưới',
      ),
    label: z.string().trim().min(1, 'Tên field là bắt buộc').max(255),
    group_name: z.string().trim().max(255).optional().default(''),
    field_type: z.enum([
      'text',
      'number',
      'date',
      'boolean',
      'select',
      'multiselect',
      'upload',
    ]),
    options: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
    new_tab: z.boolean().default(false),
    required: z.boolean().default(false),
    tenant_wide: z.boolean().default(false),
    metadata: z.object({
      width: z.enum(['100%', '50%']).optional().default('100%'),
      placeholder: z.string().trim().max(100).optional().default(''),
      description: z.string().trim().max(255).optional().default(''),
    }).default({ width: '100%', placeholder: '', description: '' }),
  })
  .superRefine((input, context) => {
    if (
      (input.field_type === 'select' ||
        input.field_type === 'multiselect') &&
      input.options.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Trường lựa chọn cần ít nhất một giá trị.',
      });
    }
  });

export const attendanceActionSchema = z.object({
  action: z.enum(['check_in', 'check_out']),
  employee_id: z.string().trim().min(1).optional(),
  custom_time: z.string().optional(),
});

export const updateHrmCustomFieldSchema = z
  .object({
    label: z.string().trim().min(1, 'Tên field là bắt buộc').max(255),
    group_name: z.string().trim().max(255).optional().default(''),
    field_type: z.enum([
      'text',
      'number',
      'date',
      'boolean',
      'select',
      'multiselect',
      'upload',
    ]),
    options: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
    new_tab: z.boolean().default(false),
    required: z.boolean(),
    active: z.boolean(),
    sort_order: z.number().int().min(0).optional(),
    metadata: z.object({
      width: z.enum(['100%', '50%']).optional().default('100%'),
      placeholder: z.string().trim().max(100).optional().default(''),
      description: z.string().trim().max(255).optional().default(''),
    }).default({ width: '100%', placeholder: '', description: '' }),
  })
  .superRefine((input, context) => {
    if (
      (input.field_type === 'select' ||
        input.field_type === 'multiselect') &&
      input.options.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Trường lựa chọn cần ít nhất một giá trị.',
      });
    }
  });
