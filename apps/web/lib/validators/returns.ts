import { z } from 'zod'

const RETURN_STATUSES = ['pending', 'approved', 'processed', 'rejected'] as const
const RETURN_REASONS  = ['defective', 'damaged', 'wrong_item', 'changed_mind', 'other'] as const
const REFUND_METHODS  = ['cash', 'bank_transfer', 'store_credit', 'none'] as const

export const returnCreateSchema = z.object({
  return_no:       z.string().optional().default(''),
  order_id:        z.string().min(1),
  order_no:        z.string().optional().default(''),
  customer_id:     z.string().optional().default(''),
  customer_name:   z.string().optional().default(''),
  reason:          z.enum(RETURN_REASONS).default('other'),
  status:          z.enum(RETURN_STATUSES).default('pending'),
  total_refund:    z.string().optional().default('0'),
  refund_method:   z.enum(REFUND_METHODS).default('cash'),
  processed_by:    z.string().optional().default(''),
  processed_at:    z.string().optional().default(''),
  note:            z.string().optional().default(''),
})

export const returnUpdateSchema = returnCreateSchema.partial()

export const returnItemCreateSchema = z.object({
  return_id:      z.string().min(1),
  return_no:      z.string().optional().default(''),
  order_item_id:  z.string().optional().default(''),
  product_id:     z.string().min(1),
  product_name:   z.string().optional().default(''),
  sku:            z.string().optional().default(''),
  qty_returned:   z.string().min(1),
  unit_price:     z.string().optional().default('0'),
  line_total:     z.string().optional().default('0'),
})

export const returnItemUpdateSchema = returnItemCreateSchema.partial()

export type ReturnCreate     = z.infer<typeof returnCreateSchema>
export type ReturnUpdate     = z.infer<typeof returnUpdateSchema>
export type ReturnItemCreate = z.infer<typeof returnItemCreateSchema>
