import { mysqlTable, int, bigint, varchar, timestamp, boolean, text, primaryKey, serial } from 'drizzle-orm/mysql-core';

// Base columns for all tables
const getBaseColumns = () => ({
  tenant_id: varchar('tenant_id', { length: 255 }).notNull(),
  created_at: timestamp('created_at').defaultNow(),
  active: varchar('active', { length: 10 }).default('TRUE'),
});

export const orders = mysqlTable('orders', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(), // e.g. ORD-001
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
});

export const orderItems = mysqlTable('order_items', {
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
});

export const payments = mysqlTable('payments', {
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

export const products = mysqlTable('products', {
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
});

export const customers = mysqlTable('customers', {
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

export const cashbook = mysqlTable('cashbook', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  branch_id: varchar('branch_id', { length: 255 }),
  type: varchar('type', { length: 50 }), // income / expense
  amount: varchar('amount', { length: 50 }),
  method: varchar('method', { length: 50 }),
  category: varchar('category', { length: 255 }),
  reference_id: varchar('reference_id', { length: 255 }),
  reference_name: varchar('reference_name', { length: 255 }),
  employee_id: varchar('employee_id', { length: 255 }),
  note: text('note'),
  date: varchar('date', { length: 50 }),
});

export const categories = mysqlTable('categories', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }),
  parent_id: varchar('parent_id', { length: 255 }),
  sort_order: varchar('sort_order', { length: 50 }),
  description: text('description'),
});

export const inventory = mysqlTable('inventory', {
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

export const stock_movements = mysqlTable('stock_movements', {
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
});

export const price_lists = mysqlTable('price_lists', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  product_id: varchar('product_id', { length: 255 }),
  sku: varchar('sku', { length: 255 }),
  price_type: varchar('price_type', { length: 50 }),
  sell_price: varchar('sell_price', { length: 50 }),
  effective_from: varchar('effective_from', { length: 50 }),
  effective_to: varchar('effective_to', { length: 50 }),
});

export const discounts = mysqlTable('discounts', {
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

export const employees = mysqlTable('employees', {
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

export const suppliers = mysqlTable('suppliers', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  address: text('address'),
  payment_terms: varchar('payment_terms', { length: 255 }),
  note: text('note'),
});

export const returns = mysqlTable('returns', {
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

export const return_items = mysqlTable('return_items', {
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
  branch_id: varchar('branch_id', { length: 255 }),
});

