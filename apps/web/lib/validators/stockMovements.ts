import { z } from 'zod'

const MOVEMENT_TYPES = [
  'purchase_in',
  'sale_out',
  'transfer_in',
  'transfer_out',
  'adjustment',
  'return_in',
] as const

export const stockMovementCreateSchema = z.object({
  type:         z.enum(MOVEMENT_TYPES),
  product_id:   z.string().min(1),
  sku:          z.string().optional().default(''),
  variant_id:   z.string().optional().default(''),
  qty:          z.string().min(1),
  unit_cost:    z.string().optional().default(''),
  branch_id:    z.string().optional().default(''),
  supplier_id:  z.string().optional().default(''),
  reference_no: z.string().optional().default(''),
  employee_id:  z.string().optional().default(''),
  reason:       z.string().optional().default(''),
  batch_no:     z.string().optional().default(''),
  shipment_no:  z.string().optional().default(''),
  workflow_status: z.enum(['draft', 'completed']).optional().default('completed'),
  payment_status: z.enum(['paid', 'partial', 'unpaid']).optional().default('paid'),
  paid_amount:  z.string().optional().default('0'),
  payment_method: z.string().optional().default('cash'),
  discount: z.string().optional().default('0'),
  payments: z.array(z.object({
    amount: z.string(),
    method: z.string()
  })).optional().default([]),
})

export const stockMovementUpdateSchema = stockMovementCreateSchema.partial()

export type StockMovementCreate = z.infer<typeof stockMovementCreateSchema>
export type StockMovementUpdate  = z.infer<typeof stockMovementUpdateSchema>
