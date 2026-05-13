import { z } from 'zod'

export const categoryCreateSchema = z.object({
  name:        z.string().min(1),
  parent_id:   z.string().optional().default(''),
  description: z.string().optional().default(''),
  sort_order:  z.string().optional().default(''),
  active:      z.string().optional().default('TRUE'),
})

export const categoryUpdateSchema = categoryCreateSchema.partial()

export type CategoryCreate = z.infer<typeof categoryCreateSchema>
export type CategoryUpdate  = z.infer<typeof categoryUpdateSchema>
