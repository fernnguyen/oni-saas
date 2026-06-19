import { mysqlTable, int, bigint, varchar, timestamp, boolean, text, primaryKey, serial, json, index } from 'drizzle-orm/mysql-core';

// Base columns for all tables
const getBaseColumns = () => ({
  tenant_id: varchar('tenant_id', { length: 255 }).notNull(),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow().onUpdateNow(),
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
  print_count: varchar('print_count', { length: 10 }),
  resource_id: varchar('resource_id', { length: 255 }),
  booking_channel_id: varchar('booking_channel_id', { length: 255 }),
  parent_order_id: varchar('parent_order_id', { length: 255 }),
  group_booking_id: varchar('group_booking_id', { length: 255 }),
  override_reason: text('override_reason'),
  shift_id: varchar('shift_id', { length: 255 }),
  metadata: json('metadata'),
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
  tax_group: varchar('tax_group', { length: 255 }),
  line_total: varchar('line_total', { length: 50 }),
  employee_id: varchar('employee_id', { length: 255 }),
  // ── Variant / Modifier context (Sprint 1) ────────────────────────────────
  variant_label: varchar('variant_label', { length: 500 }),
  // Denormalized display: "Size L" — for bill/history, no join needed
  modifiers: text('modifiers'),
  // JSON: [{"group":"Size","option":"Size L","price_adj":8000}, ...] or NULL
  modifier_total: varchar('modifier_total', { length: 50 }).default('0'),
  // Sum of price_adj. line_total = (unit_price + modifier_total) * qty
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
  input_tax_rate: varchar('input_tax_rate', { length: 50 }),
  tax_group: varchar('tax_group', { length: 255 }),
  weight: varchar('weight', { length: 50 }),
  stock_track: varchar('stock_track', { length: 10 }),
  variant_id: varchar('variant_id', { length: 255 }),
  image_url: text('image_url'),
  description: text('description'),
  stock_qty: varchar('stock_qty', { length: 50 }),
  metadata: text('metadata'),
  has_bom: varchar('has_bom', { length: 10 }).default('FALSE'),
  item_class: varchar('item_class', { length: 50 }).default('commercial'),
  // ── Variant / Modifier System (Sprint 1) ──────────────────────────────────
  product_type: varchar('product_type', { length: 20 }).default('simple'),
  // 'simple' | 'variant_parent' | 'variant_child' | 'modifier'
  parent_id: varchar('parent_id', { length: 255 }),
  // NULL for simple/parent. Points to variant_parent id for variant_child.
  variant_options: text('variant_options'),
  // JSON string: variant_child → {"Size":"L"} | variant_parent → {"option_name":"Size"}
  // modifier product → modifier_groups config encoded as JSON
});

export const product_bom = mysqlTable('product_bom', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  parent_product_id: varchar('parent_product_id', { length: 255 }).notNull(), // Thành phẩm (e.g., Bộ máy tính)
  component_product_id: varchar('component_product_id', { length: 255 }).notNull(), // Linh kiện cấu thành (e.g., RAM)
  qty: varchar('qty', { length: 50 }).notNull(), // Số lượng định mức tiêu hao (e.g., "1", "0.02" kg)
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
  prepaid_balance: varchar('prepaid_balance', { length: 50 }).default('0'),
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
  fund_id: varchar('fund_id', { length: 255 }),
  balance_after_transaction: varchar('balance_after_transaction', { length: 50 }),
  department_code: varchar('department_code', { length: 50 }),
  department_id: varchar('department_id', { length: 255 }),
  parent_transaction_id: varchar('parent_transaction_id', { length: 255 }),
  is_virtual: varchar('is_virtual', { length: 10 }).default('FALSE'),
});

export const payment_funds = mysqlTable('payment_funds', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  branch_id: varchar('branch_id', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'cash' | 'bank' | 'wallet'
  account_number: varchar('account_number', { length: 100 }),
  account_name: varchar('account_name', { length: 255 }),
  bank_name: varchar('bank_name', { length: 255 }),
  initial_balance: varchar('initial_balance', { length: 50 }).default('0'),
  current_balance: varchar('current_balance', { length: 50 }).default('0'),
  is_default: varchar('is_default', { length: 10 }).default('FALSE'),
  qr_template: varchar('qr_template', { length: 50 }).default('compact2'),
});

export const shop_shifts = mysqlTable('shop_shifts', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  branch_id: varchar('branch_id', { length: 255 }).notNull(),
  user_id: varchar('user_id', { length: 255 }).notNull(),
  opened_at: varchar('opened_at', { length: 50 }).notNull(),
  closed_at: varchar('closed_at', { length: 50 }),
  status: varchar('status', { length: 50 }).default('open'), // 'open' | 'closed'
  opening_cash: varchar('opening_cash', { length: 50 }).default('0'),
  expected_closing_cash: varchar('expected_closing_cash', { length: 50 }).default('0'),
  actual_closing_cash: varchar('actual_closing_cash', { length: 50 }).default('0'),
  cash_variance: varchar('cash_variance', { length: 50 }).default('0'),
  non_cash_revenue: text('non_cash_revenue'), // JSON string
  note: text('note'),
});

export const fund_audits = mysqlTable('fund_audits', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  branch_id: varchar('branch_id', { length: 255 }).notNull(),
  fund_id: varchar('fund_id', { length: 255 }).notNull(),
  audited_by: varchar('audited_by', { length: 255 }).notNull(),
  audited_at: varchar('audited_at', { length: 50 }).notNull(),
  system_balance: varchar('system_balance', { length: 50 }).notNull(),
  actual_balance: varchar('actual_balance', { length: 50 }).notNull(),
  variance: varchar('variance', { length: 50 }).notNull(),
  cash_denominations: text('cash_denominations'), // JSON string
  status: varchar('status', { length: 50 }).default('draft'), // 'draft' | 'confirmed'
  note: text('note'),
});

export const categories = mysqlTable('categories', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }),
  parent_id: varchar('parent_id', { length: 255 }),
  sort_order: varchar('sort_order', { length: 50 }),
  description: text('description'),
  tax_rate: varchar('tax_rate', { length: 50 }),
  tax_group: varchar('tax_group', { length: 255 }),
});

export const inventory = mysqlTable('inventory', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  product_id: varchar('product_id', { length: 255 }),
  sku: varchar('sku', { length: 255 }),
  variant_id: varchar('variant_id', { length: 255 }),
  branch_id: varchar('branch_id', { length: 255 }),
  warehouse_id: varchar('warehouse_id', { length: 255 }),
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
  warehouse_id: varchar('warehouse_id', { length: 255 }),
  to_warehouse_id: varchar('to_warehouse_id', { length: 255 }),
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
  payments: json('payments'),
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
  debt_amount: varchar('debt_amount', { length: 50 }),
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
  variant_label: varchar('variant_label', { length: 500 }),
  modifiers: text('modifiers'),
  modifier_total: varchar('modifier_total', { length: 50 }),
  branch_id: varchar('branch_id', { length: 255 }),
});

// ── Location Resources (tables / courts / rooms) ─────────────────────────
export const location_resources = mysqlTable('location_resources', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }),
  type: varchar('type', { length: 50 }),             // table | court | room
  status: varchar('status', { length: 50 }),          // available | occupied | cleaning | reserved
  current_order_id: varchar('current_order_id', { length: 255 }),
  zone: varchar('zone', { length: 255 }),
  capacity: varchar('capacity', { length: 50 }),
  hourly_rate: varchar('hourly_rate', { length: 50 }),
  sort_order: varchar('sort_order', { length: 50 }),
  branch_id: varchar('branch_id', { length: 255 }),
  metadata: text('metadata'),
});

// ── QR Table Ordering (Plug-and-Play Realtime Module) ────────────────────
export const qr_ordering_sessions = mysqlTable('qr_ordering_sessions', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  branch_id: varchar('branch_id', { length: 255 }).notNull(),
  resource_id: varchar('resource_id', { length: 255 }).notNull(),
  session_token: varchar('session_token', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).default('active'),
});

export const qr_session_carts = mysqlTable('qr_session_carts', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  session_id: varchar('session_id', { length: 255 }).notNull(),
  user_display_name: varchar('user_display_name', { length: 255 }),
  product_id: varchar('product_id', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 255 }),
  variant_id: varchar('variant_id', { length: 255 }),
  product_name: varchar('product_name', { length: 255 }),
  qty: varchar('qty', { length: 50 }).notNull(),
  unit_price: varchar('unit_price', { length: 50 }).notNull(),
  modifiers: text('modifiers'),
});

export const qr_order_requests = mysqlTable('qr_order_requests', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  branch_id: varchar('branch_id', { length: 255 }).notNull(),
  session_id: varchar('session_id', { length: 255 }).notNull(),
  resource_id: varchar('resource_id', { length: 255 }).notNull(),
  items: json('items').notNull(),
  status: varchar('status', { length: 50 }).default('pending'),
  reject_reason: text('reject_reason'),
});

// ── Procure-to-Pay (P2P) Enterprise Add-on Tables ────────────────────────
export const purchase_requisitions = mysqlTable('purchase_requisitions', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  requisition_no: varchar('requisition_no', { length: 255 }),
  status: varchar('status', { length: 50 }), // DRAFT | PENDING_KTT | PENDING_GD | APPROVED | REJECTED | CONVERTED_TO_PO
  created_by: varchar('created_by', { length: 255 }),
  estimated_total: varchar('estimated_total', { length: 50 }),
  note: text('note'),
  branch_id: varchar('branch_id', { length: 255 }),
});

export const purchase_requisition_items = mysqlTable('purchase_requisition_items', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  requisition_id: varchar('requisition_id', { length: 255 }),
  product_id: varchar('product_id', { length: 255 }),
  product_name: varchar('product_name', { length: 255 }),
  qty: varchar('qty', { length: 50 }),
  estimated_unit_price: varchar('estimated_unit_price', { length: 50 }),
  line_total: varchar('line_total', { length: 50 }),
});

export const purchase_orders = mysqlTable('purchase_orders', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  purchase_order_no: varchar('purchase_order_no', { length: 255 }),
  requisition_id: varchar('requisition_id', { length: 255 }),
  supplier_id: varchar('supplier_id', { length: 255 }),
  supplier_name: varchar('supplier_name', { length: 255 }),
  purchaser_id: varchar('purchaser_id', { length: 255 }),
  total_amount: varchar('total_amount', { length: 50 }),
  status: varchar('status', { length: 50 }), // DRAFT | PENDING_APPROVAL | APPROVED | REJECTED | PARTIALLY_RECEIVED | RECEIVED | CANCELLED
  branch_id: varchar('branch_id', { length: 255 }),
  note: text('note'),
});

export const purchase_order_items = mysqlTable('purchase_order_items', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  purchase_order_id: varchar('purchase_order_id', { length: 255 }),
  product_id: varchar('product_id', { length: 255 }),
  product_name: varchar('product_name', { length: 255 }),
  qty: varchar('qty', { length: 50 }),
  actual_unit_price: varchar('actual_unit_price', { length: 50 }),
  line_total: varchar('line_total', { length: 50 }),
});

export const goods_receipt_notes = mysqlTable('goods_receipt_notes', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  grn_no: varchar('grn_no', { length: 255 }),
  purchase_order_id: varchar('purchase_order_id', { length: 255 }),
  received_by: varchar('received_by', { length: 255 }),
  warehouse_id: varchar('warehouse_id', { length: 255 }),
  status: varchar('status', { length: 50 }), // DRAFT | COMPLETED
  branch_id: varchar('branch_id', { length: 255 }),
  note: text('note'),
});

export const goods_receipt_note_items = mysqlTable('goods_receipt_note_items', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  grn_id: varchar('grn_id', { length: 255 }),
  product_id: varchar('product_id', { length: 255 }),
  product_name: varchar('product_name', { length: 255 }),
  qty_ordered: varchar('qty_ordered', { length: 50 }),
  qty_received: varchar('qty_received', { length: 50 }),
  unit_cost: varchar('unit_cost', { length: 50 }),
  line_total: varchar('line_total', { length: 50 }),
});

export const product_purchase_history = mysqlTable('product_purchase_history', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  product_id: varchar('product_id', { length: 255 }),
  supplier_id: varchar('supplier_id', { length: 255 }),
  supplier_name: varchar('supplier_name', { length: 255 }),
  unit_price: varchar('unit_price', { length: 50 }),
  purchased_at: varchar('purchased_at', { length: 50 }),
});

// ── Bảng Phòng ban toàn hệ thống (Departments) ───────────────────────────
export const departments = mysqlTable('departments', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  branch_id: varchar('branch_id', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(), // Lễ tân, Buồng phòng, Bếp...
  warehouse_id: varchar('warehouse_id', { length: 255 }), // Kho liên kết của bộ phận
  manager_id: varchar('manager_id', { length: 255 }), // Trưởng bộ phận (user_id)
});

// ── Bảng Liên kết Nhân sự - Phòng ban (User Departments) ──────────────────
export const user_departments = mysqlTable('user_departments', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  user_id: varchar('user_id', { length: 255 }).notNull(),
  department_id: varchar('department_id', { length: 255 }).notNull(),
  is_manager: varchar('is_manager', { length: 10 }).default('FALSE'),
});

// ── Bảng Quản lý Tài sản dùng chung (Assets) ─────────────────────────────
export const assets = mysqlTable('assets', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  branch_id: varchar('branch_id', { length: 255 }),
  name: varchar('name', { length: 255 }).notNull(), // Máy siêu âm, ga trải giường...
  unit: varchar('unit', { length: 50 }).notNull(), // chiếc, cái, bộ...
  type: varchar('type', { length: 50 }).notNull(), // 'ccdc' | 'tscd'
  original_value: varchar('original_value', { length: 50 }).notNull(), // Nguyên giá
  salvage_value: varchar('salvage_value', { length: 50 }).default('0'), // Giá trị thanh lý
  purchase_date: varchar('purchase_date', { length: 50 }).notNull(),
  depreciation_months: varchar('depreciation_months', { length: 50 }).notNull(), // Số tháng khấu hao
  depreciated_value: varchar('depreciated_value', { length: 50 }).default('0'), // Lũy kế đã khấu hao
  status: varchar('status', { length: 50 }).default('active'), // active | depreciated | disposed
  // ── Mở rộng nghiệp vụ đa ngành ──────────────────────────────────────────
  serial_no: varchar('serial_no', { length: 255 }), // Sê-ri máy
  manufacturer: varchar('manufacturer', { length: 255 }),
  warranty_expiry: varchar('warranty_expiry', { length: 50 }),
  supplier_id: varchar('supplier_id', { length: 255 }), // Link sang bảng suppliers
  created_by: varchar('created_by', { length: 255 }),
  updated_by: varchar('updated_by', { length: 255 }),
});

// ── Bảng Bàn giao Tài sản (Asset Allocations) ────────────────────────────
export const asset_allocations = mysqlTable('asset_allocations', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  asset_id: varchar('asset_id', { length: 255 }).notNull(),
  department_id: varchar('department_id', { length: 255 }).notNull(), // Map trực tiếp sang departments.id (Cost Center)
  department_code: varchar('department_code', { length: 50 }), // Tương thích dữ liệu cũ
  qty: varchar('qty', { length: 50 }).notNull(),
  allocated_at: varchar('allocated_at', { length: 50 }).notNull(),
  note: text('note'),
  recipient_name: varchar('recipient_name', { length: 255 }),
  created_by: varchar('created_by', { length: 255 }),
  updated_by: varchar('updated_by', { length: 255 }),
});

// ── Bảng Lịch sử Khấu hao Tài sản (Asset Depreciations) ─────────────────────
export const asset_depreciations = mysqlTable('asset_depreciations', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  branch_id: varchar('branch_id', { length: 255 }),
  asset_id: varchar('asset_id', { length: 255 }).notNull(),
  depreciation_date: varchar('depreciation_date', { length: 50 }).notNull(), // Ngày trích khấu hao (YYYY-MM-DD)
  amount: varchar('amount', { length: 50 }).notNull(), // Số tiền trích khấu hao kỳ này
  depreciated_value_before: varchar('depreciated_value_before', { length: 50 }).default('0'), // Giá trị lũy kế trước khi trích
  depreciated_value_after: varchar('depreciated_value_after', { length: 50 }).default('0'), // Giá trị lũy kế sau khi trích
  department_id: varchar('department_id', { length: 255 }).notNull(), // Bộ phận gán chi phí (Cost Center)
  department_code: varchar('department_code', { length: 50 }), // Tương thích dữ liệu cũ
  cashbook_id: varchar('cashbook_id', { length: 255 }), // Mã phiếu chi trong Sổ quỹ liên kết
  created_by: varchar('created_by', { length: 255 }),
  updated_by: varchar('updated_by', { length: 255 }),
});

// ── Bảng Mẫu Phân bổ Chi phí (Cost Allocation Templates) ──────────────────
export const cost_allocation_templates = mysqlTable('cost_allocation_templates', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  branch_id: varchar('branch_id', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(), // Tên mẫu (ví dụ: "Phân bổ Điện nước")
  rules: text('rules').notNull(), // Mảng JSON chứa stringified [{ department_id: string, percentage: number }]
});

// ── Bảng Kho hàng (Warehouses) ──────────────────────────────────────────
export const warehouses = mysqlTable('warehouses', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  branch_id: varchar('branch_id', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).default('custom'), // 'sale' | 'supply' | 'asset' | 'custom'
  active: varchar('active', { length: 10 }).default('TRUE'),
});

// ── Bảng Nhật ký Đối soát Webhook SePay (SePay Webhook Logs) ─────────────
export const sepayWebhookLogs = mysqlTable('sepay_webhook_logs', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  branch_id: varchar('branch_id', { length: 255 }),
  transaction_id: varchar('transaction_id', { length: 255 }),
  bank_account: varchar('bank_account', { length: 255 }),
  transfer_amount: varchar('transfer_amount', { length: 50 }),
  transfer_type: varchar('transfer_type', { length: 50 }),
  content: text('content'),
  gateway: varchar('gateway', { length: 255 }),
  reference_code: varchar('reference_code', { length: 255 }),
  status: varchar('status', { length: 50 }), // success, ignored, failed, disabled
  error_message: text('error_message'),
});

export const customer_branch_stats = mysqlTable('customer_branch_stats', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  customer_id: varchar('customer_id', { length: 255 }).notNull(),
  branch_id: varchar('branch_id', { length: 255 }).notNull(),
  debt_amount: varchar('debt_amount', { length: 50 }).default('0'),
  loyalty_points: varchar('loyalty_points', { length: 50 }).default('0'),
  prepaid_balance: varchar('prepaid_balance', { length: 50 }).default('0'),
  note: text('note'),
}, (table) => ({
  idxBranch: index('idx_cbs_branch').on(table.branch_id),
  idxCustomerBranch: index('idx_cbs_customer_branch').on(table.customer_id, table.branch_id),
}));

// ── Bảng Đặt phòng / Giữ chỗ trước (Reservations Table)
export const reservations = mysqlTable('reservations', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  reservation_no: varchar('reservation_no', { length: 255 }).notNull(),
  branch_id: varchar('branch_id', { length: 255 }),
  group_booking_id: varchar('group_booking_id', { length: 255 }),
  
  // CRM & Guest Profile
  customer_id: varchar('customer_id', { length: 255 }).notNull(),
  customer_name: varchar('customer_name', { length: 255 }),
  customer_phone: varchar('customer_phone', { length: 50 }),
  
  // Booking Source & OTA Details
  channel_id: varchar('channel_id', { length: 255 }).default('direct'),
  ota_booking_code: varchar('ota_booking_code', { length: 255 }),
  
  // Stay Duration
  expected_checkin: timestamp('expected_checkin').notNull(),
  expected_checkout: timestamp('expected_checkout').notNull(),
  
  // Block Room
  room_category_id: varchar('room_category_id', { length: 255 }),
  resource_id: varchar('resource_id', { length: 255 }),
  
  // Financials & Deposit
  num_guests: int('num_guests').default(1),
  daily_rate: varchar('daily_rate', { length: 50 }),
  deposit_amount: varchar('deposit_amount', { length: 50 }).default('0'),
  deposit_fund_id: varchar('deposit_fund_id', { length: 255 }),
  
  status: varchar('status', { length: 50 }).default('confirmed'),
  note: text('note'),
  created_by: varchar('created_by', { length: 255 }),
  metadata: json('metadata'),
});

// ── Định mức vật tư tiêu chuẩn phòng minibar (Minibar Setup)
export const minibar_setup = mysqlTable('minibar_setup', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  resource_id: varchar('resource_id', { length: 255 }).notNull(),
  product_id: varchar('product_id', { length: 255 }).notNull(),
  standard_qty: int('standard_qty').notNull().default(0),
  branch_id: varchar('branch_id', { length: 255 }),
});

// ── Số lượng tồn thực tế trong phòng hiện tại (Room Stock Track)
export const room_minibar_stock = mysqlTable('room_minibar_stock', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  resource_id: varchar('resource_id', { length: 255 }).notNull(),
  product_id: varchar('product_id', { length: 255 }).notNull(),
  current_qty: int('current_qty').notNull().default(0),
  branch_id: varchar('branch_id', { length: 255 }),
});

// ── Nhật ký công việc và đếm tiêu hao buồng phòng (Housekeeping Logs)
export const housekeeping_logs = mysqlTable('housekeeping_logs', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  resource_id: varchar('resource_id', { length: 255 }).notNull(),
  employee_id: varchar('employee_id', { length: 255 }),
  status: varchar('status', { length: 50 }),
  check_type: varchar('check_type', { length: 50 }),
  consumption_details: text('consumption_details'),
  topup_status: varchar('topup_status', { length: 50 }),
  note: text('note'),
  branch_id: varchar('branch_id', { length: 255 }),
});

// ── Thẻ Đặt phòng OTA & Khấu khấu hoa hồng (OTA Bookings Mapping)
export const ota_bookings = mysqlTable('ota_bookings', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  order_id: varchar('order_id', { length: 255 }).notNull(),
  agency_id: varchar('agency_id', { length: 255 }).notNull(),
  booking_code: varchar('booking_code', { length: 255 }),
  payment_flow: varchar('payment_flow', { length: 50 }),
  gross_amount: varchar('gross_amount', { length: 50 }),
  commission_rate: varchar('commission_rate', { length: 50 }),
  commission_amount: varchar('commission_amount', { length: 50 }),
  net_payout: varchar('net_payout', { length: 50 }),
  reconciliation_status: varchar('reconciliation_status', { length: 50 }),
  branch_id: varchar('branch_id', { length: 255 }),
});

// ── Kênh đặt phòng lưu trú (Booking Channels)
export const booking_channels = mysqlTable('booking_channels', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 100 }),
  commission_rate: varchar('commission_rate', { length: 50 }).default('0'),
  color: varchar('color', { length: 50 }).default('#3b82f6'),
  notes: text('notes'),
  branch_id: varchar('branch_id', { length: 255 }),
});

// ── Bảng Khách lưu trú thực tế tại phòng / bàn (Resource Occupants)
export const resource_occupants = mysqlTable('resource_occupants', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  branch_id: varchar('branch_id', { length: 255 }).notNull(),
  order_id: varchar('order_id', { length: 255 }),
  reservation_id: varchar('reservation_id', { length: 255 }),
  resource_id: varchar('resource_id', { length: 255 }).notNull(),
  
  guest_name: varchar('guest_name', { length: 255 }).notNull(),
  guest_phone: varchar('guest_phone', { length: 50 }),
  identity_card: varchar('identity_card', { length: 100 }),       // CCCD/Passport
  nationality: varchar('nationality', { length: 100 }).default('Vietnam'),
  birthday: varchar('birthday', { length: 50 }),
  gender: varchar('gender', { length: 20 }),
  is_primary: varchar('is_primary', { length: 10 }).default('FALSE'), // Khách đại diện
  note: text('note'),                                              // Ghi chú phòng
  metadata: json('metadata'),                                      // Mở rộng sau này
});

export const payment_methods = mysqlTable('payment_methods', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  branch_id: varchar('branch_id', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'cash' | 'bank' | 'wallet' | 'prepaid' | 'debt'
  code: varchar('code', { length: 255 }).notNull(), // Code stored in db, e.g. 'cash', 'bank_transfer', 'momo'
  is_default: varchar('is_default', { length: 10 }).default('FALSE'),
});

export const tax_locked_periods = mysqlTable('tax_locked_periods', {
  ...getBaseColumns(),
  id: varchar('id', { length: 255 }).primaryKey(),
  branch_id: varchar('branch_id', { length: 255 }).notNull(),
  period_name: varchar('period_name', { length: 255 }).notNull(), // e.g. "Tháng 05/2026"
  start_date: varchar('start_date', { length: 50 }).notNull(),    // e.g. "2026-05-01"
  end_date: varchar('end_date', { length: 50 }).notNull(),        // e.g. "2026-05-31"
  status: varchar('status', { length: 50 }).default('locked'),    // 'locked' | 'unlocked'
  locked_at: varchar('locked_at', { length: 50 }),
  locked_by: varchar('locked_by', { length: 255 }),
});




