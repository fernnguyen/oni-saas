import { z } from 'zod';

export const departmentCreateSchema = z.object({
  name: z.string().min(1, 'Tên phòng ban không được để trống').max(100),
  code: z.string().min(1, 'Mã bộ phận không được để trống').regex(/^[a-z0-9_]+$/, 'Mã bộ phận chỉ được chứa ký tự thường, số và dấu gạch dưới'),
  manager_id: z.string().optional().nullable(),
}).transform((data) => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      result[key] = String(value);
    }
  }
  return result;
});

export const departmentUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z.string().min(1).regex(/^[a-z0-9_]+$/).optional(),
  manager_id: z.string().optional().nullable(),
}).transform((data) => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      result[key] = String(value);
    }
  }
  return result;
});

export const assetCreateSchema = z.object({
  name: z.string().min(1, 'Tên tài sản không được để trống').max(255),
  unit: z.string().min(1, 'Đơn vị tính không được để trống').max(50),
  type: z.enum(['ccdc', 'tscd']),
  original_value: z.string().min(1, 'Nguyên giá không được để trống'),
  salvage_value: z.string().optional().default('0'),
  purchase_date: z.string().min(1, 'Ngày mua không được để trống'),
  depreciation_months: z.string().min(1, 'Số tháng khấu hao không được để trống'),
  serial_no: z.string().optional().nullable(),
  manufacturer: z.string().optional().nullable(),
  warranty_expiry: z.string().optional().nullable(),
  supplier_id: z.string().optional().nullable(),
  status: z.enum(['active', 'depreciated', 'disposed']).optional().default('active'),
}).transform((data) => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      result[key] = String(value);
    }
  }
  return result;
});

export const assetUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  unit: z.string().min(1).max(50).optional(),
  type: z.enum(['ccdc', 'tscd']).optional(),
  original_value: z.string().optional(),
  salvage_value: z.string().optional(),
  purchase_date: z.string().optional(),
  depreciation_months: z.string().optional(),
  depreciated_value: z.string().optional(),
  status: z.enum(['active', 'depreciated', 'disposed']).optional(),
  serial_no: z.string().optional().nullable(),
  manufacturer: z.string().optional().nullable(),
  warranty_expiry: z.string().optional().nullable(),
  supplier_id: z.string().optional().nullable(),
}).transform((data) => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      result[key] = String(value);
    }
  }
  return result;
});

export const assetAllocationCreateSchema = z.object({
  asset_id: z.string().min(1, 'ID tài sản không được để trống'),
  department_code: z.string().min(1, 'Mã bộ phận Cost Center không được để trống'),
  qty: z.string().min(1, 'Số lượng phân bổ không được để trống'),
  allocated_at: z.string().min(1, 'Ngày bàn giao không được để trống'),
}).transform((data) => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      result[key] = String(value);
    }
  }
  return result;
});

export const costAllocationTemplateCreateSchema = z.object({
  name: z.string().min(1, 'Tên mẫu phân bổ không được để trống').max(255),
  rules: z.union([
    z.string(),
    z.array(z.object({
      department_code: z.string().min(1),
      percentage: z.number().min(0).max(100)
    }))
  ])
}).transform((data) => {
  const result: Record<string, any> = {
    name: data.name,
    rules: typeof data.rules === 'string' ? data.rules : JSON.stringify(data.rules)
  };
  return result;
});

export const costAllocationTemplateUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  rules: z.union([
    z.string(),
    z.array(z.object({
      department_code: z.string().min(1),
      percentage: z.number().min(0).max(100)
    }))
  ]).optional()
}).transform((data) => {
  const result: Record<string, any> = {};
  if (data.name !== undefined) result.name = data.name;
  if (data.rules !== undefined) {
    result.rules = typeof data.rules === 'string' ? data.rules : JSON.stringify(data.rules);
  }
  return result;
});

export const warehouseCreateSchema = z.object({
  name: z.string().min(1, 'Tên kho không được để trống').max(255),
  code: z.string().min(1, 'Mã kho không được để trống').regex(/^[a-zA-Z0-9_-]+$/, 'Mã kho chỉ được chứa chữ cái, số, gạch ngang và gạch dưới'),
  type: z.enum(['sale', 'supply', 'asset', 'custom']).optional().default('custom'),
  active: z.enum(['TRUE', 'FALSE']).optional().default('TRUE'),
}).transform((data) => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      result[key] = String(value);
    }
  }
  return result;
});

export const warehouseUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  type: z.enum(['sale', 'supply', 'asset', 'custom']).optional(),
  active: z.enum(['TRUE', 'FALSE']).optional(),
}).transform((data) => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      result[key] = String(value);
    }
  }
  return result;
});

export const assetCommissionSchema = z.object({
  product_id: z.string().min(1, 'ID sản phẩm không được để trống'),
  qty: z.string().min(1, 'Số lượng không được để trống'),
  department_code: z.string().min(1, 'Mã bộ phận Cost Center không được để trống'),
  type: z.enum(['ccdc', 'tscd']).optional().default('ccdc'),
  depreciation_months: z.string().min(1, 'Số tháng khấu hao không được để trống'),
  serial_no: z.string().optional().nullable(),
  manufacturer: z.string().optional().nullable(),
  warranty_expiry: z.string().optional().nullable(),
  supplier_id: z.string().optional().nullable(),
  purchase_date: z.string().optional().nullable(),
}).transform((data) => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      result[key] = String(value);
    }
  }
  return result;
});

