import { pgTable, varchar, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

// Base columns for all tables
const getBaseColumns = () => ({
  tenant_id: varchar('tenant_id', { length: 255 }).notNull(),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
  active: varchar('active', { length: 10 }).default('TRUE'),
});

export const orders = pgTable('orders', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  order_no: varchar('order_no', { length: 255 }),
  status: varchar('status', { length: 50 }),
  customer_id: varchar('customer_id', { length: 255 }),
  customer_name: varchar('customer_name', { length: 255 }),
  branch_id: varchar('branch_id', { length: 255 }),
  employee_id: varchar('employee_id', { length: 255 }),
  channel: varchar('channel', { length: 50 }),
  subtotal: varchar('subtotal', { length: 50 }),
  discount_amount: varchar('discount_amount', { length: 50 }),
  shipping_fee: varchar('shipping_fee', { length: 50 }),
  tax_amount: varchar('tax_amount', { length: 50 }),
  total_amount: varchar('total_amount', { length: 50 }),
  paid_amount: varchar('paid_amount', { length: 50 }),
  debt_amount: varchar('debt_amount', { length: 50 }),
  is_return: varchar('is_return', { length: 10 }),
  original_order_id: varchar('original_order_id', { length: 255 }),
  points_earned: varchar('points_earned', { length: 50 }),
  points_redeemed: varchar('points_redeemed', { length: 50 }),
  note: text('note'),
  payment_method: varchar('payment_method', { length: 50 }),
  reference_no: varchar('reference_no', { length: 255 }),
  print_count: varchar('print_count', { length: 10 }),
  resource_id: varchar('resource_id', { length: 255 }),
  metadata: jsonb('metadata'),
});

export const order_items = pgTable('order_items', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  order_id: varchar('order_id', { length: 255 }),
  order_no: varchar('order_no', { length: 255 }),
  branch_id: varchar('branch_id', { length: 255 }),
  line_no: varchar('line_no', { length: 50 }),
  product_id: varchar('product_id', { length: 255 }),
  sku: varchar('sku', { length: 255 }),
  variant_id: varchar('variant_id', { length: 255 }),
  product_name: varchar('product_name', { length: 255 }),
  qty: varchar('qty', { length: 50 }),
  unit_price: varchar('unit_price', { length: 50 }),
  discount_pct: varchar('discount_pct', { length: 50 }),
  line_discount: varchar('line_discount', { length: 50 }),
  tax_rate: varchar('tax_rate', { length: 50 }),
  tax_amount: varchar('tax_amount', { length: 50 }),
  line_total: varchar('line_total', { length: 50 }),
  employee_id: varchar('employee_id', { length: 255 }),
  // ── Variant / Modifier context (Sprint 1) ────────────────────────────────
  variant_label: varchar('variant_label', { length: 500 }),
  modifiers: text('modifiers'),
  modifier_total: varchar('modifier_total', { length: 50 }).default('0'),
});

export const payments = pgTable('payments', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  order_id: varchar('order_id', { length: 255 }),
  order_no: varchar('order_no', { length: 255 }),
  branch_id: varchar('branch_id', { length: 255 }),
  method: varchar('method', { length: 50 }),
  amount: varchar('amount', { length: 50 }),
  paid_at: varchar('paid_at', { length: 50 }),
  cashier_id: varchar('cashier_id', { length: 255 }),
  reference_no: varchar('reference_no', { length: 255 }),
  note: text('note'),
});

export const products = pgTable('products', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  branch_id: varchar('branch_id', { length: 255 }),
  name: varchar('name', { length: 255 }),
  sku: varchar('sku', { length: 255 }),
  barcode: varchar('barcode', { length: 255 }),
  category_id: varchar('category_id', { length: 255 }),
  unit: varchar('unit', { length: 50 }),
  sell_price: varchar('sell_price', { length: 50 }),
  cost_price: varchar('cost_price', { length: 50 }),
  min_price: varchar('min_price', { length: 50 }),
  tax_rate: varchar('tax_rate', { length: 50 }),
  weight: varchar('weight', { length: 50 }),
  stock_track: varchar('stock_track', { length: 10 }),
  variant_id: varchar('variant_id', { length: 255 }),
  image_url: text('image_url'),
  description: text('description'),
  stock_qty: varchar('stock_qty', { length: 50 }),
  metadata: jsonb('metadata'),
  has_bom: varchar('has_bom', { length: 10 }).default('FALSE'),
  // ── Variant / Modifier System (Sprint 1) ──────────────────────────────────
  product_type: varchar('product_type', { length: 20 }).default('simple'),
  parent_id: varchar('parent_id', { length: 255 }),
  variant_options: text('variant_options'),
});

export const product_bom = pgTable('product_bom', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  parent_product_id: varchar('parent_product_id', { length: 255 }).notNull(), // Thành phẩm (e.g., Bộ máy tính)
  component_product_id: varchar('component_product_id', { length: 255 }).notNull(), // Linh kiện cấu thành (e.g., RAM)
  qty: varchar('qty', { length: 50 }).notNull(), // Số lượng định mức tiêu hao (e.g., "1", "0.02" kg)
});

export const customers = pgTable('customers', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  branch_id: varchar('branch_id', { length: 255 }),
  name: varchar('name', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  address: text('address'),
  customer_code: varchar('customer_code', { length: 255 }),
  birthday: varchar('birthday', { length: 50 }),
  customer_type: varchar('customer_type', { length: 50 }),
  credit_limit: varchar('credit_limit', { length: 50 }),
  debt_amount: varchar('debt_amount', { length: 50 }),
  loyalty_points: varchar('loyalty_points', { length: 50 }),
  note: text('note'),
});

export const cashbook = pgTable('cashbook', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  branch_id: varchar('branch_id', { length: 255 }),
  type: varchar('type', { length: 50 }),
  amount: varchar('amount', { length: 50 }),
  method: varchar('method', { length: 50 }),
  category: varchar('category', { length: 255 }),
  reference_id: varchar('reference_id', { length: 255 }),
  reference_name: varchar('reference_name', { length: 255 }),
  employee_id: varchar('employee_id', { length: 255 }),
  note: text('note'),
  date: varchar('date', { length: 50 }),
});

export const categories = pgTable('categories', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }),
  parent_id: varchar('parent_id', { length: 255 }),
  sort_order: varchar('sort_order', { length: 50 }),
  description: text('description'),
});

export const inventory = pgTable('inventory', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  product_id: varchar('product_id', { length: 255 }),
  sku: varchar('sku', { length: 255 }),
  variant_id: varchar('variant_id', { length: 255 }),
  branch_id: varchar('branch_id', { length: 255 }),
  stock_qty: varchar('stock_qty', { length: 50 }),
  min_stock: varchar('min_stock', { length: 50 }),
  unit_cost: varchar('unit_cost', { length: 50 }),
  last_received_at: varchar('last_received_at', { length: 50 }),
  last_updated: varchar('last_updated', { length: 50 }),
});

export const stock_movements = pgTable('stock_movements', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  movement_no: varchar('movement_no', { length: 255 }),
  type: varchar('type', { length: 50 }),
  product_id: varchar('product_id', { length: 255 }),
  sku: varchar('sku', { length: 255 }),
  variant_id: varchar('variant_id', { length: 255 }),
  qty: varchar('qty', { length: 50 }),
  unit_cost: varchar('unit_cost', { length: 50 }),
  branch_id: varchar('branch_id', { length: 255 }),
  supplier_id: varchar('supplier_id', { length: 255 }),
  reference_no: varchar('reference_no', { length: 255 }),
  employee_id: varchar('employee_id', { length: 255 }),
  reason: text('reason'),
  batch_no: varchar('batch_no', { length: 255 }),
  shipment_no: varchar('shipment_no', { length: 255 }),
  workflow_status: varchar('workflow_status', { length: 50 }),
  payment_status: varchar('payment_status', { length: 50 }),
  paid_amount: varchar('paid_amount', { length: 50 }),
  payment_method: varchar('payment_method', { length: 50 }),
  discount: varchar('discount', { length: 50 }),
  payments: jsonb('payments'),
});

export const price_lists = pgTable('price_lists', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  product_id: varchar('product_id', { length: 255 }),
  sku: varchar('sku', { length: 255 }),
  price_type: varchar('price_type', { length: 50 }),
  sell_price: varchar('sell_price', { length: 50 }),
  effective_from: varchar('effective_from', { length: 50 }),
  effective_to: varchar('effective_to', { length: 50 }),
});

export const discounts = pgTable('discounts', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }),
  type: varchar('type', { length: 50 }),
  value: varchar('value', { length: 50 }),
  min_qty: varchar('min_qty', { length: 50 }),
  min_order_value: varchar('min_order_value', { length: 50 }),
  applicable_type: varchar('applicable_type', { length: 50 }),
  applicable_ref: varchar('applicable_ref', { length: 255 }),
  start_date: varchar('start_date', { length: 50 }),
  end_date: varchar('end_date', { length: 50 }),
});

export const employees = pgTable('employees', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  employee_code: varchar('employee_code', { length: 255 }),
  name: varchar('name', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  role: varchar('role', { length: 50 }),
  branch_id: varchar('branch_id', { length: 255 }),
  commission_pct: varchar('commission_pct', { length: 50 }),
  hire_date: varchar('hire_date', { length: 50 }),
  note: text('note'),
});

export const suppliers = pgTable('suppliers', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  address: text('address'),
  payment_terms: varchar('payment_terms', { length: 255 }),
  debt_amount: varchar('debt_amount', { length: 50 }),
  note: text('note'),
});

export const returns = pgTable('returns', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  return_no: varchar('return_no', { length: 255 }),
  order_id: varchar('order_id', { length: 255 }),
  order_no: varchar('order_no', { length: 255 }),
  customer_id: varchar('customer_id', { length: 255 }),
  customer_name: varchar('customer_name', { length: 255 }),
  reason: varchar('reason', { length: 50 }),
  status: varchar('status', { length: 50 }),
  total_refund: varchar('total_refund', { length: 50 }),
  refund_method: varchar('refund_method', { length: 50 }),
  processed_by: varchar('processed_by', { length: 255 }),
  processed_at: varchar('processed_at', { length: 50 }),
  note: text('note'),
  previous_order_status: varchar('previous_order_status', { length: 50 }),
  branch_id: varchar('branch_id', { length: 255 }),
});

export const return_items = pgTable('return_items', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  return_id: varchar('return_id', { length: 255 }),
  return_no: varchar('return_no', { length: 255 }),
  order_item_id: varchar('order_item_id', { length: 255 }),
  product_id: varchar('product_id', { length: 255 }),
  product_name: varchar('product_name', { length: 255 }),
  sku: varchar('sku', { length: 255 }),
  qty_returned: varchar('qty_returned', { length: 50 }),
  unit_price: varchar('unit_price', { length: 50 }),
  line_total: varchar('line_total', { length: 50 }),
  variant_label: varchar('variant_label', { length: 500 }),
  modifiers: text('modifiers'),
  modifier_total: varchar('modifier_total', { length: 50 }),
  branch_id: varchar('branch_id', { length: 255 }),
});

// ── Location Resources (tables / courts / rooms) ─────────────────────────
export const location_resources = pgTable('location_resources', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }),
  type: varchar('type', { length: 50 }),
  status: varchar('status', { length: 50 }),
  current_order_id: varchar('current_order_id', { length: 255 }),
  zone: varchar('zone', { length: 255 }),
  capacity: varchar('capacity', { length: 50 }),
  hourly_rate: varchar('hourly_rate', { length: 50 }),
  sort_order: varchar('sort_order', { length: 50 }),
  branch_id: varchar('branch_id', { length: 255 }),
  metadata: jsonb('metadata'),
});

// ── Pharmacy Batches & Expiry (Simple) ───────────────────────────────────
export const inventory_batches = pgTable('inventory_batches', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  product_id: varchar('product_id', { length: 255 }).notNull(),
  branch_id: varchar('branch_id', { length: 255 }).notNull(),
  batch_no: varchar('batch_no', { length: 255 }).notNull(),
  expiry_date: varchar('expiry_date', { length: 50 }).notNull(), // Định dạng YYYY-MM-DD
  stock_qty: varchar('stock_qty', { length: 50 }).notNull(),
});
