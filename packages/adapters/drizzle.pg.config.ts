import path from 'path';
import fs from 'fs';

// Đọc .env thủ công không cần dotenv (tránh phụ thuộc package)
function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

// Load env: ưu tiên .env.local (dev), sau đó .env (production via symlink tới shared/.env)
const base = path.resolve(__dirname);
const envLocalPath = path.resolve(base, '../../apps/web/.env.local');
const envProdPath = path.resolve(base, '../../apps/web/.env');

if (fs.existsSync(envLocalPath)) {
  loadEnvFile(envLocalPath);
} else if (fs.existsSync(envProdPath)) {
  loadEnvFile(envProdPath);
}

// Hỗ trợ nhiều tên biến PG URI phổ biến
const dbUrl =
  process.env.LOCAL_PG_URI ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.PG_URI ||
  'postgresql://oni_admin:oni_password@localhost:5432/oni_saas_local';

export default {
  schema: './src/schema_pg.ts',
  out: './drizzle_pg',
  dialect: 'postgresql' as const,
  dbCredentials: {
    url: dbUrl,
  },
};
