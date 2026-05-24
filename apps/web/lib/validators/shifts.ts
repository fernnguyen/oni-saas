import { z } from 'zod'

export const shiftOpenSchema = z.object({
  branch_id: z.string().min(1, 'Chi nhánh không được để trống'),
  opening_cash: z.number().nonnegative('Tiền mặt đầu ca không được nhỏ hơn 0').default(0),
})

export const shiftCloseSchema = z.object({
  actual_closing_cash: z.number().nonnegative('Tiền mặt thực tế không được nhỏ hơn 0'),
  note: z.string().optional(),
})
export type ShiftOpenInput = z.infer<typeof shiftOpenSchema>
export type ShiftCloseInput = z.infer<typeof shiftCloseSchema>
