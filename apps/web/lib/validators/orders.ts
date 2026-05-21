import { z } from 'zod'

const ORDER_STATUSES = ['draft', 'in_progress', 'confirmed', 'processing', 'completed', 'cancelled', 'returning', 'partially_refunded', 'refunded'] as const
const ORDER_CHANNELS = ['pos', 'online', 'phone', 'zalo'] as const
const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'momo', 'vnpay', 'zalopay', 'debt'] as const

export const orderCreateSchema = z.object({
  order_no:          z.string().optional().default(''),
  status:            z.enum(ORDER_STATUSES).default('draft'),
  customer_id:       z.string().optional().default(''),
  customer_name:     z.string().optional().default(''),
  branch_id:         z.string().optional().default(''),
  employee_id:       z.string().optional().default(''),
  channel:           z.enum(ORDER_CHANNELS).default('pos'),
  subtotal:          z.string().optional().default('0'),
  discount_amount:   z.string().optional().default('0'),
  shipping_fee:      z.string().optional().default('0'),
  tax_amount:        z.string().optional().default('0'),
  total_amount:      z.string().optional().default('0'),
  paid_amount:       z.string().optional().default('0'),
  debt_amount:       z.string().optional().default('0'),
  is_return:         z.string().optional().default('FALSE'),
  original_order_id: z.string().optional().default(''),
  points_earned:     z.string().optional().default('0'),
  points_redeemed:   z.string().optional().default('0'),
  note:              z.string().optional().default(''),
  payment_method:    z.string().optional().default(''),
  print_count:       z.string().optional().default('0'),
  // Session-based POS fields
  resource_id:       z.string().optional().default(''),
  metadata:          z.string().optional().default('{}'),
})

export const orderUpdateSchema = orderCreateSchema.partial()

export const orderItemCreateSchema = z.object({
  order_id:       z.string().min(1),
  order_no:       z.string().optional().default(''),
  line_no:        z.string().min(1),
  product_id:     z.string().min(1),
  sku:            z.string().optional().default(''),
  variant_id:     z.string().optional().default(''),
  product_name:   z.string().min(1),
  qty:            z.string().min(1),
  unit_price:     z.string().min(1),
  discount_pct:   z.string().optional().default('0'),
  line_discount:  z.string().optional().default('0'),
  tax_rate:       z.string().optional().default('0'),
  tax_amount:     z.string().optional().default('0'),
  line_total:     z.string().min(1),
  employee_id:    z.string().optional().default(''),
  // ── Unit Conversion ──────────────────────────────────────────────
  unit_id:        z.string().optional().default(''),
  unit_name:      z.string().optional().default(''),
  conversion_rate:z.string().optional().default('1'),
  // ── Variant / Modifier context (Sprint 1) ────────────────────────
  variant_label:  z.string().optional().default(''),
  // Denormalized display: "Size L" — used in bill/history
  modifiers:      z.string().optional().default(''),
  // JSON: [{group, option, price_adj}] or empty string
  modifier_total: z.string().optional().default('0'),
  // Sum of modifier price_adj. line_total = (unit_price + modifier_total) * qty
})

export const paymentCreateSchema = z.object({
  id:           z.string().optional().default(''),
  order_id:     z.string().min(1),
  order_no:     z.string().optional().default(''),
  method:       z.enum(PAYMENT_METHODS),
  amount:       z.string().min(1),
  paid_at:      z.string().optional().default(''),
  cashier_id:   z.string().optional().default(''),
  reference_no: z.string().optional().default(''),
  note:         z.string().optional().default(''),
})

export type OrderCreate = z.infer<typeof orderCreateSchema>
export type OrderUpdate = z.infer<typeof orderUpdateSchema>
export type OrderItemCreate = z.infer<typeof orderItemCreateSchema>
export type PaymentCreate = z.infer<typeof paymentCreateSchema>
