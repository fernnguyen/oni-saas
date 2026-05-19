import { z } from 'zod'

export const productCreateSchema = z.object({
  sku:             z.string().optional().default(''),
  name:            z.string().min(1),
  category_id:     z.string().optional().default(''),
  unit:            z.string().optional().default(''),
  sell_price:      z.string().optional().default('0'),
  cost_price:      z.string().optional().default('0'),
  min_price:       z.string().optional().default('0'),
  tax_rate:        z.string().optional().default(''),
  weight:          z.string().optional().default(''),
  stock_track:     z.string().optional().default('TRUE'),
  variant_id:      z.string().optional().default(''),
  image_url:       z.string().optional().default(''),
  description:     z.string().optional().default(''),
  barcode:         z.string().optional().default(''),
  active:          z.string().optional().default('TRUE'),
  // ── Variant / Modifier System (Sprint 1) ────────────────────────
  product_type:    z.string().optional().default('simple'),
  // 'simple' | 'variant_parent' | 'variant_child' | 'modifier'
  parent_id:       z.string().optional().default(''),
  variant_options: z.string().optional().default(''),
  // JSON string for variant_child / modifier config
})

export const productUpdateSchema = productCreateSchema.partial()

export type ProductCreate = z.infer<typeof productCreateSchema>
export type ProductUpdate  = z.infer<typeof productUpdateSchema>
