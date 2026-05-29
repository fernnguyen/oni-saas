import { z } from 'zod'

export const customerCreateSchema = z.object({
  name:            z.string().min(1),
  phone:           z.string().min(1),
  customer_code:   z.string().nullable().optional().default(''),
  email:           z.string().nullable().optional().default(''),
  address:         z.string().nullable().optional().default(''),
  birthday:        z.string().nullable().optional().default(''),
  customer_type:   z.string().nullable().optional().default('retail'),
  credit_limit:    z.string().nullable().optional().default('0'),
  debt_amount:     z.string().nullable().optional().default('0'),
  loyalty_points:  z.string().nullable().optional().default('0'),
  prepaid_balance: z.string().nullable().optional().default('0'),
  note:            z.string().nullable().optional().default(''),
  metadata:        z.union([z.string(), z.record(z.string(), z.any())]).nullable().optional().default({}),
})

export const customerUpdateSchema = customerCreateSchema.partial()

export type CustomerCreate = z.infer<typeof customerCreateSchema>
export type CustomerUpdate  = z.infer<typeof customerUpdateSchema>
