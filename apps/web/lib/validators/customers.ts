import { z } from 'zod'

export const customerCreateSchema = z.object({
  name:           z.string().min(1),
  phone:          z.string().min(1),
  customer_code:  z.string().optional().default(''),
  email:          z.string().optional().default(''),
  address:        z.string().optional().default(''),
  birthday:       z.string().optional().default(''),
  customer_type:  z.string().optional().default('retail'),
  credit_limit:   z.string().optional().default('0'),
  debt_amount:    z.string().optional().default('0'),
  loyalty_points: z.string().optional().default('0'),
  prepaid_balance: z.string().optional().default('0'),
  note:           z.string().optional().default(''),
})

export const customerUpdateSchema = customerCreateSchema.partial()

export type CustomerCreate = z.infer<typeof customerCreateSchema>
export type CustomerUpdate  = z.infer<typeof customerUpdateSchema>
