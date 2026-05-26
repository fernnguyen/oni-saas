import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

// 1. Khởi tạo / Mở file cơ sở dữ liệu SQLite nội địa đồng bộ
export const expoDb = openDatabaseSync('oni_mobile_offline.db');

// 2. Khởi tạo Drizzle ORM wrapper trên SQLite di động
export const db = drizzle(expoDb, { schema });

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
