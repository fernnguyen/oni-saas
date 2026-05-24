import { z } from 'zod'

export const fundAuditCreateSchema = z.object({
  fund_id: z.string().min(1, 'Vui lòng chọn tài khoản quỹ cần kiểm kê'),
  actual_balance: z.number().nonnegative('Số dư thực tế không được nhỏ hơn 0'),
  cash_denominations: z.record(z.number()).optional(),
  note: z.string().optional(),
})

export type FundAuditCreateInput = z.infer<typeof fundAuditCreateSchema>
