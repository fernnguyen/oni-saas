import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// 1. DANH MỤC SẢN PHẨM (Categories)
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parent_id: text('parent_id'),
  description: text('description'),
});

// BẢNG QUỸ/TÀI KHOẢN THANH TOÁN (PAYMENT FUNDS)
export const paymentFunds = sqliteTable('payment_funds', {
  id: text('id').primaryKey(), // Kế thừa từ backend
  name: text('name').notNull(),
  type: text('type').notNull(), // cash, bank, wallet
  branch_id: text('branch_id').notNull(),
  account_number: text('account_number'),
  account_name: text('account_name'),
  bank_name: text('bank_name'),
  is_default: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  qr_template: text('qr_template').default('compact2'),
  initial_balance: integer('initial_balance').notNull().default(0),
});

// BẢNG PHƯƠNG THỨC THANH TOÁN (PAYMENT METHODS)
export const paymentMethods = sqliteTable('payment_methods', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // cash, bank, wallet, prepaid, debt
  code: text('code').notNull(),
  branch_id: text('branch_id').notNull(),
  is_default: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

// 2. SẢN PHẨM & DỊCH VỤ (Products)
export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sku: text('sku'),
  barcode: text('barcode'),
  category_id: text('category_id'),
  unit: text('unit'),
  sell_price: integer('sell_price').notNull().default(0), // Đổi về integer để đồng bộ tiền tệ Việt Nam
  stock_qty: integer('stock_qty').notNull().default(0),
  image_url: text('image_url'),
  description: text('description'),
  product_type: text('product_type').default('simple'), // simple | variant_parent | variant_child | modifier
  parent_id: text('parent_id'),
  variant_options: text('variant_options'), // JSON string
  modifier_groups: text('modifier_groups'), // JSON string
});

// 3. SƠ ĐỒ PHÒNG BÀN (Location Resources / Billiards Tables)
export const location_resources = sqliteTable('location_resources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // table | court | room
  status: text('status').notNull().default('idle'), // idle (trống) | playing (đang hoạt động)
  current_order_id: text('current_order_id'),
  hourly_rate: integer('hourly_rate').notNull().default(0),
  zone: text('zone'),
  startTime: integer('start_time'), // Lưu timestamp bắt đầu chơi để tính giờ lẻ
  metadata: text('metadata'), // Lưu JSON cấu hình nâng cao (overnight_rate, advanced_pricing,...) ngoại tuyến
});

// 4. DANH SÁCH KHÁCH HÀNG (Customers)
export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  address: text('address'),
  customer_code: text('customer_code'),
  customer_type: text('customer_type').default('Thành viên'), // VIP, Thân thiết, Khách sỉ
  total_spent: integer('total_spent').notNull().default(0), // Tổng tích lũy
  orders_count: integer('orders_count').notNull().default(0), // Số đơn hàng đã giao dịch
  sync_status: text('sync_status').notNull().default('synced'), // synced | pending (thêm mới offline)
  credit_limit: integer('credit_limit').default(0),
  note: text('note'),
  prepaid_balance: integer('prepaid_balance').default(0),
  loyalty_points: integer('loyalty_points').default(0),
  debt_amount: integer('debt_amount').default(0),
});

// 5. LỊCH SỬ HÓA ĐƠN (Orders)
export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(), // ORD-SHA-XXXXX (replaced with server ID after sync)
  order_no: text('order_no'),
  reference_no: text('reference_no'), // Original local ID (e.g. ORD-R-...) preserved for traceability
  status: text('status').notNull().default('completed'), // completed | returning | returned
  customer_id: text('customer_id'),
  customer_name: text('customer_name'),
  total_amount: integer('total_amount').notNull().default(0),
  paid_amount: integer('paid_amount').notNull().default(0),
  payment_method: text('payment_method').notNull().default('Tiền mặt'), // Tiền mặt, Chuyển khoản
  created_at: text('created_at').notNull(), // Lưu ISO string dạng GMT+7
  shift_id: text('shift_id'), // ID ca làm việc gắn liền
  sync_status: text('sync_status').notNull().default('synced'), // synced | pending (đóng offline chờ mạng)
  note: text('note'),
  discount_amount: integer('discount_amount').default(0),
  metadata: text('metadata'),
});

// 6. CHI TIẾT DÒNG HÓA ĐƠN (Order Items)
export const order_items = sqliteTable('order_items', {
  id: text('id').primaryKey(),
  order_id: text('order_id').notNull(),
  product_id: text('product_id').notNull(),
  product_name: text('product_name').notNull(),
  qty: integer('qty').notNull().default(1),
  unit_price: integer('unit_price').notNull().default(0),
  line_total: integer('line_total').notNull().default(0),
});

// 7. CA LÀM VIỆC DI ĐỘNG (Shop Shifts)
export const shop_shifts = sqliteTable('shop_shifts', {
  id: text('id').primaryKey(),
  opened_at: text('opened_at').notNull(),
  closed_at: text('closed_at'),
  status: text('status').notNull().default('open'), // open | closed
  opening_cash: integer('opening_cash').notNull().default(0),
  actual_closing_cash: integer('actual_closing_cash').notNull().default(0),
  employee_name: text('employee_name'),
  sync_status: text('sync_status').notNull().default('synced'), // synced | pending
});

// 8. SỔ QUỸ (Cashbook)
export const cashbook = sqliteTable('cashbook', {
  id: text('id').primaryKey(),
  branch_id: text('branch_id').notNull(),
  type: text('type').notNull(), // receipt | payment
  amount: integer('amount').notNull().default(0),
  method: text('method').notNull().default('cash'), // cash | bank_transfer
  category: text('category').notNull().default('other_expense'), // debt_collection, debt_payment, salary, rent, utilities, other_revenue, other_expense, inventory
  reference_id: text('reference_id'),
  reference_name: text('reference_name'),
  employee_id: text('employee_id'),
  note: text('note'),
  date: text('date').notNull(), // YYYY-MM-DD
  fund_id: text('fund_id'),
  sync_status: text('sync_status').notNull().default('synced'), // synced | pending
});

// 9. LỊCH SỬ KHO / ĐIỀU CHỈNH KHO (Stock Movements)
export const stockMovements = sqliteTable('stock_movements', {
  id: text('id').primaryKey(),
  branch_id: text('branch_id').notNull(),
  type: text('type').notNull(), // adjustment | sale_out | purchase_in
  product_id: text('product_id').notNull(),
  sku: text('sku'),
  variant_id: text('variant_id'),
  qty: integer('qty').notNull().default(0), // chênh lệch (+/-)
  unit_cost: integer('unit_cost').notNull().default(0),
  reference_no: text('reference_no'),
  employee_id: text('employee_id'),
  reason: text('reason'),
  workflow_status: text('workflow_status').notNull().default('completed'), // draft | completed
  created_at: text('created_at').notNull(),
  sync_status: text('sync_status').notNull().default('synced'), // synced | pending
  warehouse_id: text('warehouse_id'),
  to_warehouse_id: text('to_warehouse_id'),
});

// 10. BỘ NHỚ ĐỆM CỤC BỘ (Local Caches)
export const localCaches = sqliteTable('local_caches', {
  cache_key: text('cache_key').primaryKey(),
  cache_value: text('cache_value').notNull(),
  updated_at: integer('updated_at').notNull(),
});


