import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// 1. DANH MỤC SẢN PHẨM (Categories)
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parent_id: text('parent_id'),
  description: text('description'),
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
});

// 5. LỊCH SỬ HÓA ĐƠN (Orders)
export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(), // ORD-SHA-XXXXX
  order_no: text('order_no'),
  status: text('status').notNull().default('completed'), // completed | returning | returned
  customer_id: text('customer_id'),
  customer_name: text('customer_name'),
  total_amount: integer('total_amount').notNull().default(0),
  paid_amount: integer('paid_amount').notNull().default(0),
  payment_method: text('payment_method').notNull().default('Tiền mặt'), // Tiền mặt, Chuyển khoản
  created_at: text('created_at').notNull(), // Lưu ISO string dạng GMT+7
  shift_id: text('shift_id'), // ID ca làm việc gắn liền
  sync_status: text('sync_status').notNull().default('synced'), // synced | pending (đóng offline chờ mạng)
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
