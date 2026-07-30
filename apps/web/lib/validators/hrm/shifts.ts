import { z } from 'zod';

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ ca làm không hợp lệ');

export const createHrmShiftSchema = z.object({
  name: z.string().trim().min(1, 'Tên ca là bắt buộc').max(255),
  start_time: timeSchema,
  end_time: timeSchema,
  break_minutes: z.coerce.number().int().min(0).max(720).default(0),
  late_grace_minutes: z.coerce.number().int().min(0).max(240).default(0),
});

export const updateHrmShiftSchema = createHrmShiftSchema.extend({
  active: z.boolean(),
});
