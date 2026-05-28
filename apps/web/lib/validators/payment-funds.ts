import { z } from 'zod'

export const paymentFundCreateSchema = z.object({
  name: z.string().min(1, 'Tên quỹ/tài khoản không được để trống'),
  type: z.enum(['cash', 'bank', 'wallet']),
  branch_id: z.string().min(1, 'Chi nhánh không được để trống'),
  account_number: z.string().optional(),
  account_name: z.string().optional(),
  bank_name: z.string().optional(),
  initial_balance: z.number().nonnegative('Số dư ban đầu không được nhỏ hơn 0').default(0),
  is_default: z.boolean().default(false),
  qr_template: z.string().optional().default('compact2'),
})

export type PaymentFundCreateInput = z.infer<typeof paymentFundCreateSchema>
