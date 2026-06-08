import { z } from 'zod'

export const paymentMethodCreateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Tên phương thức thanh toán không được để trống'),
  type: z.enum(['cash', 'bank', 'wallet', 'prepaid', 'debt']),
  code: z.string().min(1, 'Mã code lưu ở db không được để trống'),
  branch_id: z.string().min(1, 'Chi nhánh không được để trống'),
  is_default: z.boolean().default(false),
})

export type PaymentMethodCreateInput = z.infer<typeof paymentMethodCreateSchema>
