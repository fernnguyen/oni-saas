import { z } from 'zod'

export const cashbookCreateSchema = z.object({
  type: z.enum(['receipt', 'payment']),
  amount: z.number().positive('Số tiền phải lớn hơn 0'),
  method: z.enum(['cash', 'bank_transfer', 'card', 'momo', 'vnpay', 'zalopay']),
  category: z.string().min(1, 'Vui lòng chọn loại chứng từ'),
  reference_id: z.string().optional(),
  reference_name: z.string().optional(),
  note: z.string().optional(),
  branch_id: z.string().optional(), // usually injected by server
  employee_id: z.string().optional(), // usually injected by server
  fund_id: z.string().optional(),
  // Cost allocation fields
  department_id: z.string().optional(),
  apply_allocation: z.boolean().optional(),
  allocation_template_id: z.string().optional(),
  custom_rules: z.array(z.object({
    department_id: z.string(),
    percentage: z.number()
  })).optional(),
})

export type CashbookCreateInput = z.infer<typeof cashbookCreateSchema>
