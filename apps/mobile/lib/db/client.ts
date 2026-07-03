import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let internalExpoDb: any = null;
let internalDb: any = null;
let activeDbName = 'oni_mobile_offline.db';

export function switchDatabaseScope(tenantId: string | null) {
  const newDbName = tenantId ? `oni_offline_${tenantId}.db` : 'oni_mobile_offline.db';
  if (activeDbName !== newDbName) {
    console.log(`[CSDL SQLite] Đang chuyển vùng dữ liệu sang file: ${newDbName}`);
    if (internalExpoDb) {
      try {
        if (typeof internalExpoDb.closeSync === 'function') {
          internalExpoDb.closeSync();
        }
      } catch (err) {
        console.warn('Lỗi khi đóng kết nối CSDL cũ:', err);
      }
    }
    activeDbName = newDbName;
    internalExpoDb = null;
    internalDb = null;
    
    // Tự động chạy tạo bảng cho cơ sở dữ liệu mới vừa mở
    initializeLocalDatabase();
  }
}

// Khởi chạy ngầm tải Tenant ID đã lưu khi nạp module để chuyển đổi database sớm
async function loadActiveTenantDatabase() {
  try {
    const tenantId = await AsyncStorage.getItem('active_tenant_id');
    if (tenantId) {
      switchDatabaseScope(tenantId);
    } else {
      initializeLocalDatabase();
    }
  } catch (err) {
    console.error('Lỗi khi nạp tenant database khởi động:', err);
    initializeLocalDatabase();
  }
}

// Gọi khởi động ngầm
loadActiveTenantDatabase();

const initializedDbs = new Set<string>();

function getExpoDb() {
  if (!internalExpoDb) {
    if (Platform.OS === 'web') {
      try {
        internalExpoDb = openDatabaseSync(activeDbName);
      } catch (err) {
        console.warn(
          `⚠️ Cảnh báo: expo-sqlite không thể khởi tạo đồng bộ database ${activeDbName} trên trình duyệt Web do thiếu cấu hình SharedArrayBuffer/WASM. Đang tự động chuyển sang cơ chế giả lập (Mock DB) để tránh crash giao diện.`,
          err
        );
        // Mock SQLite database interface tối giản để tránh crash
        internalExpoDb = {
          execSync: () => {},
          runSync: () => ({ lastInsertRowId: 0, changes: 0 }),
          getFirstSync: () => null,
          getAllSync: () => [],
        };
      }
    } else {
      internalExpoDb = openDatabaseSync(activeDbName);
    }

    // Đảm bảo chạy khởi tạo bảng và migration ngay khi mở kết nối file database
    if (!initializedDbs.has(activeDbName)) {
      initializedDbs.add(activeDbName);
      initializeLocalDatabase(internalExpoDb);
    }
  }
  return internalExpoDb;
}

function getDb() {
  if (!internalDb) {
    const database = getExpoDb();
    // Nếu là Web và đang dùng Mock database, tạo Proxy để chặn crash các hàm Drizzle
    if (Platform.OS === 'web' && (!database.execSync || database.execSync.toString().includes('() => {}'))) {
      internalDb = new Proxy({}, {
        get(target, prop) {
          // Các hàm query của Drizzle như select, insert, update...
          return () => {
            console.warn(`[SQLite Web Mock] Truy cập tính năng offline "${String(prop)}" đã được chặn trên trình duyệt.`);
            
            // Trả về cấu trúc chain query giả lập tối giản để tránh crash
            const queryChain = {
              from: () => queryChain,
              select: () => queryChain,
              where: () => queryChain,
              values: () => queryChain,
              set: () => queryChain,
              onConflictDoNothing: () => queryChain,
              onConflictDoUpdate: () => queryChain,
              then: (resolve: any) => resolve([]),
            };
            return queryChain;
          };
        }
      });
    } else {
      internalDb = drizzle(database, { schema });
    }
  }
  return internalDb;
}

// 1. Khởi tạo / Mở file cơ sở dữ liệu SQLite dưới dạng Proxy động (Lazy-loaded)
export const expoDb = new Proxy({}, {
  get(target, prop) {
    const dbInstance = getExpoDb();
    const val = dbInstance[prop];
    return typeof val === 'function' ? val.bind(dbInstance) : val;
  }
}) as any;

// 2. Khởi tạo Drizzle ORM wrapper dưới dạng Proxy động (Lazy-loaded)
export const db = new Proxy({}, {
  get(target, prop) {
    const drizzleInstance = getDb();
    const val = drizzleInstance[prop];
    return typeof val === 'function' ? val.bind(drizzleInstance) : val;
  }
}) as any;

// 3. Hàm khởi chạy tạo bảng (CREATE TABLE IF NOT EXISTS) đầu phiên
// Chạy SQL thô trực tiếp qua execSync đảm bảo hoạt động 100% ổn định trên Expo Go
// mà không cần bundling/migration riêng phức tạp.
export function initializeLocalDatabase(customDb?: any) {
  // Tránh chạy trùng lặp khi đã được gọi qua getExpoDb
  if (customDb === undefined && initializedDbs.has(activeDbName)) {
    return;
  }

  const targetDb = customDb || expoDb;
  if (customDb === undefined) {
    initializedDbs.add(activeDbName);
  }

  try {
    targetDb.execSync(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        parent_id TEXT,
        description TEXT,
        tax_rate TEXT,
        tax_group TEXT,
        sync_status TEXT NOT NULL DEFAULT 'synced'
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        sku TEXT,
        barcode TEXT,
        category_id TEXT,
        unit TEXT,
        sell_price INTEGER NOT NULL DEFAULT 0,
        cost_price INTEGER NOT NULL DEFAULT 0,
        stock_qty INTEGER NOT NULL DEFAULT 0,
        image_url TEXT,
        description TEXT,
        product_type TEXT DEFAULT 'simple',
        parent_id TEXT,
        variant_options TEXT,
        modifier_groups TEXT,
        active TEXT DEFAULT 'TRUE',
        weight INTEGER,
        item_class TEXT DEFAULT 'commercial',
        tax_rate TEXT,
        input_tax_rate TEXT,
        tax_group TEXT,
        sync_status TEXT NOT NULL DEFAULT 'synced'
      );

      CREATE TABLE IF NOT EXISTS location_resources (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'idle',
        current_order_id TEXT,
        hourly_rate INTEGER NOT NULL DEFAULT 0,
        zone TEXT,
        start_time INTEGER,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        address TEXT,
        customer_code TEXT,
        customer_type TEXT DEFAULT 'Thành viên',
        total_spent INTEGER NOT NULL DEFAULT 0,
        orders_count INTEGER NOT NULL DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'synced',
        credit_limit INTEGER DEFAULT 0,
        note TEXT,
        prepaid_balance INTEGER DEFAULT 0,
        loyalty_points INTEGER DEFAULT 0,
        debt_amount INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY NOT NULL,
        order_no TEXT,
        reference_no TEXT,
        status TEXT NOT NULL DEFAULT 'completed',
        customer_id TEXT,
        customer_name TEXT,
        total_amount INTEGER NOT NULL DEFAULT 0,
        paid_amount INTEGER NOT NULL DEFAULT 0,
        payment_method TEXT NOT NULL DEFAULT 'Tiền mặt',
        created_at TEXT NOT NULL,
        updated_at TEXT,
        shift_id TEXT,
        tax_amount INTEGER DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'synced',
        note TEXT,
        discount_amount INTEGER DEFAULT 0,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY NOT NULL,
        order_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        qty INTEGER NOT NULL DEFAULT 1,
        unit_price INTEGER NOT NULL DEFAULT 0,
        line_total INTEGER NOT NULL DEFAULT 0,
        tax_rate TEXT,
        tax_amount INTEGER DEFAULT 0,
        tax_group TEXT,
        tax_vat_rate TEXT,
        tax_pit_rate TEXT
      );

      -- Auto-migrate newly added columns
      -- Note: SQLite does not support IF NOT EXISTS for ADD COLUMN directly in standard DDL, but expo-sqlite execSync might ignore errors if wrapped in multiple execs.
      -- Actually, we are running multiple statements in one execSync, so if one fails, others might fail.
      -- To be safe, we will run alter table in separate try-catch blocks after the big execSync.

      CREATE TABLE IF NOT EXISTS shop_shifts (
        id TEXT PRIMARY KEY NOT NULL,
        opened_at TEXT NOT NULL,
        closed_at TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        opening_cash INTEGER NOT NULL DEFAULT 0,
        actual_closing_cash INTEGER NOT NULL DEFAULT 0,
        employee_name TEXT,
        sync_status TEXT NOT NULL DEFAULT 'synced'
      );

      CREATE TABLE IF NOT EXISTS payment_funds (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        account_number TEXT,
        account_name TEXT,
        bank_name TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        qr_template TEXT DEFAULT 'compact2',
        initial_balance INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS payment_methods (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        code TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS cashbook (
        id TEXT PRIMARY KEY NOT NULL,
        branch_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL DEFAULT 0,
        method TEXT NOT NULL DEFAULT 'cash',
        category TEXT NOT NULL DEFAULT 'other_expense',
        reference_id TEXT,
        reference_name TEXT,
        employee_id TEXT,
        note TEXT,
        date TEXT NOT NULL,
        fund_id TEXT,
        sync_status TEXT NOT NULL DEFAULT 'synced'
      );

      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY NOT NULL,
        branch_id TEXT NOT NULL,
        type TEXT NOT NULL,
        product_id TEXT NOT NULL,
        sku TEXT,
        variant_id TEXT,
        qty INTEGER NOT NULL DEFAULT 0,
        unit_cost INTEGER NOT NULL DEFAULT 0,
        reference_no TEXT,
        employee_id TEXT,
        reason TEXT,
        workflow_status TEXT NOT NULL DEFAULT 'completed',
        created_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'synced',
        warehouse_id TEXT,
        to_warehouse_id TEXT,
        payment_method TEXT,
        fund_id TEXT,
        supplier_id TEXT
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        address TEXT,
        note TEXT,
        sync_status TEXT NOT NULL DEFAULT 'synced'
      );

      CREATE TABLE IF NOT EXISTS local_caches (
        cache_key TEXT PRIMARY KEY NOT NULL,
        cache_value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    
    // Nâng cấp bổ sung cột cho các DB đã chạy trước đó để không bị mất dữ liệu
    try { targetDb.execSync(`ALTER TABLE orders ADD COLUMN updated_at TEXT;`); } catch (e) {}
    try { targetDb.execSync(`UPDATE orders SET updated_at = created_at WHERE updated_at IS NULL;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE orders ADD COLUMN note TEXT;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE orders ADD COLUMN discount_amount INTEGER DEFAULT 0;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE orders ADD COLUMN metadata TEXT;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE orders ADD COLUMN reference_no TEXT;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE location_resources ADD COLUMN metadata TEXT;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE products ADD COLUMN product_type TEXT DEFAULT 'simple';`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE order_items ADD COLUMN original_price INTEGER;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE order_items ADD COLUMN discount_amount INTEGER DEFAULT 0;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE products ADD COLUMN parent_id TEXT;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE products ADD COLUMN variant_options TEXT;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE products ADD COLUMN modifier_groups TEXT;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE customers ADD COLUMN credit_limit INTEGER DEFAULT 0;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE customers ADD COLUMN note TEXT;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE customers ADD COLUMN prepaid_balance INTEGER DEFAULT 0;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE customers ADD COLUMN loyalty_points INTEGER DEFAULT 0;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE customers ADD COLUMN debt_amount INTEGER DEFAULT 0;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE payment_methods ADD COLUMN code TEXT NOT NULL DEFAULT 'cash';`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE stock_movements ADD COLUMN warehouse_id TEXT;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE stock_movements ADD COLUMN to_warehouse_id TEXT;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE stock_movements ADD COLUMN payment_method TEXT;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE stock_movements ADD COLUMN fund_id TEXT;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE stock_movements ADD COLUMN supplier_id TEXT;`); } catch (e) {}
    
    // Migrations for products and categories sync features
    try { targetDb.execSync(`ALTER TABLE products ADD COLUMN sync_status TEXT DEFAULT 'synced';`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE products ADD COLUMN active TEXT DEFAULT 'TRUE';`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE products ADD COLUMN cost_price INTEGER DEFAULT 0;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE products ADD COLUMN weight INTEGER;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE products ADD COLUMN item_class TEXT DEFAULT 'commercial';`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE categories ADD COLUMN sync_status TEXT DEFAULT 'synced';`); } catch (e) {}
    
    // Migrations for tax properties
    try { targetDb.execSync(`ALTER TABLE categories ADD COLUMN tax_rate TEXT;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE categories ADD COLUMN tax_group TEXT;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE products ADD COLUMN tax_rate TEXT;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE products ADD COLUMN input_tax_rate TEXT;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE products ADD COLUMN tax_group TEXT;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE orders ADD COLUMN tax_amount INTEGER DEFAULT 0;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE order_items ADD COLUMN tax_rate TEXT;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE order_items ADD COLUMN tax_amount INTEGER DEFAULT 0;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE order_items ADD COLUMN tax_group TEXT;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE order_items ADD COLUMN tax_vat_rate TEXT;`); } catch (e) {}
    try { targetDb.execSync(`ALTER TABLE order_items ADD COLUMN tax_pit_rate TEXT;`); } catch (e) {}
    
    console.log(`CSDL SQLite [${activeDbName}]: Khởi tạo các bảng/migrations offline-first thành công!`);
  } catch (error) {
    console.error(`Lỗi nghiêm trọng khi tạo bảng SQLite [${activeDbName}]:`, error);
  }
}
