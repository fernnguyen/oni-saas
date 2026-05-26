import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';
import { Platform } from 'react-native';

let internalExpoDb: any = null;
let internalDb: any = null;

function getExpoDb() {
  if (!internalExpoDb) {
    if (Platform.OS === 'web') {
      try {
        internalExpoDb = openDatabaseSync('oni_mobile_offline.db');
      } catch (err) {
        console.warn(
          '⚠️ Cảnh báo: expo-sqlite không thể khởi tạo đồng bộ trên trình duyệt Web do thiếu cấu hình SharedArrayBuffer/WASM. Đang tự động chuyển sang cơ chế giả lập (Mock DB) để tránh crash giao diện.',
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
      internalExpoDb = openDatabaseSync('oni_mobile_offline.db');
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
export function initializeLocalDatabase() {
  try {
    expoDb.execSync(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        parent_id TEXT,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        sku TEXT,
        barcode TEXT,
        category_id TEXT,
        unit TEXT,
        sell_price INTEGER NOT NULL DEFAULT 0,
        stock_qty INTEGER NOT NULL DEFAULT 0,
        image_url TEXT,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS location_resources (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'idle',
        current_order_id TEXT,
        hourly_rate INTEGER NOT NULL DEFAULT 0,
        zone TEXT,
        start_time INTEGER
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
        sync_status TEXT NOT NULL DEFAULT 'synced'
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY NOT NULL,
        order_no TEXT,
        status TEXT NOT NULL DEFAULT 'completed',
        customer_id TEXT,
        customer_name TEXT,
        total_amount INTEGER NOT NULL DEFAULT 0,
        paid_amount INTEGER NOT NULL DEFAULT 0,
        payment_method TEXT NOT NULL DEFAULT 'Tiền mặt',
        created_at TEXT NOT NULL,
        shift_id TEXT,
        sync_status TEXT NOT NULL DEFAULT 'synced'
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY NOT NULL,
        order_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        qty INTEGER NOT NULL DEFAULT 1,
        unit_price INTEGER NOT NULL DEFAULT 0,
        line_total INTEGER NOT NULL DEFAULT 0
      );

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
    `);
    console.log('ONI SQLite Database: Khởi tạo các bảng offline-first thành công!');
  } catch (error) {
    console.error('Lỗi nghiêm trọng khi tạo bảng SQLite nội địa:', error);
  }
}
