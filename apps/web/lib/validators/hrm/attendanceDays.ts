import { z } from 'zod';

const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ chấm công không hợp lệ');

export const attendanceStatusSchema = z.enum([
  'present',
  'absent',
  'paid_leave',
  'unpaid_leave',
  'holiday',
]);

export const attendanceDayInputSchema = z
  .object({
    employee_id: z.string().trim().min(1),
    work_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày công không hợp lệ'),
    shift_template_id: z.string().trim().min(1).nullable().optional(),
    clock_in: localTimeSchema.nullable().optional(),
    clock_out: localTimeSchema.nullable().optional(),
    status: attendanceStatusSchema.default('present'),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.clock_out && !value.clock_in) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clock_out'],
        message: 'Không thể nhập giờ ra khi chưa có giờ vào.',
      });
    }
  });

export const attendanceDaysUpsertSchema = z.object({
  source: z.enum(['manual', 'import']).default('manual'),
  rows: z.array(attendanceDayInputSchema).min(1).max(500),
});

export const attendanceImportSchema = attendanceDaysUpsertSchema.extend({
  source: z.literal('import'),
  dry_run: z.boolean(),
});

export type AttendanceDayInput = z.infer<typeof attendanceDayInputSchema>;
