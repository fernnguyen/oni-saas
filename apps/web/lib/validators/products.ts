import { z } from 'zod'

export const productCreateSchema = z.object({
  sku:         z.string().min(1),
  name:        z.string().min(1),
  category_id: z.string().optional().default(''),
  unit:        z.string().optional().default(''),
  sell_price:  z.string().optional().default('0'),
  cost_price:  z.string().optional().default('0'),
  min_price:   z.string().optional().default('0'),
  tax_rate:    z.string().optional().default(''),
  weight:      z.string().optional().default(''),
  stock_track: z.string().optional().default('TRUE'),
  variant_id:  z.string().optional().default(''),
  image_url:   z.string().optional().default(''),
  description: z.string().optional().default(''),
  barcode:     z.string().optional().default(''),
  active:      z.string().optional().default('TRUE'),
})

export const productUpdateSchema = productCreateSchema.partial()

export type ProductCreate = z.infer<typeof productCreateSchema>
export type ProductUpdate  = z.infer<typeof productUpdateSchema>
