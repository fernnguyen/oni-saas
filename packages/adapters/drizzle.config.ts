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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const base = path.resolve(__dirname);
loadEnvFile(path.resolve(base, '../../apps/web/.env.local'));
loadEnvFile(path.resolve(base, '../../apps/web/.env'));

export default {
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'mysql' as const,
  dbCredentials: {
    url: process.env.LOCAL_MYSQL_URI || 'mysql://user:pass@localhost:3306/oni_saas',
  },
};
