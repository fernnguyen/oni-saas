import { z } from 'zod'

export const employeeCreateSchema = z.object({
  name:           z.string().min(1),
  employee_code:  z.string().optional().default(''),
  phone:          z.string().optional().default(''),
  role:           z.string().optional().default(''),
  branch_id:      z.string().optional().default(''),
  commission_pct: z.string().optional().default(''),
  hire_date:      z.string().optional().default(''),
  note:           z.string().optional().default(''),
  active:         z.string().optional().default('TRUE'),
})

export const employeeUpdateSchema = employeeCreateSchema.partial()

export type EmployeeCreate = z.infer<typeof employeeCreateSchema>
export type EmployeeUpdate  = z.infer<typeof employeeUpdateSchema>
