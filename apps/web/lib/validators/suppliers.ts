import { z } from 'zod'

export const supplierCreateSchema = z.object({
  name:          z.string().min(1),
  phone:         z.string().optional().default(''),
  email:         z.string().optional().default(''),
  address:       z.string().optional().default(''),
  payment_terms: z.string().optional().default(''),
  note:          z.string().optional().default(''),
})

export const supplierUpdateSchema = supplierCreateSchema.partial()

export type SupplierCreate = z.infer<typeof supplierCreateSchema>
export type SupplierUpdate  = z.infer<typeof supplierUpdateSchema>
