import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import path from 'path';

import fs from 'fs';

const envLocalPath = path.resolve(__dirname, '../../apps/web/.env.local');
const envProdPath = path.resolve(__dirname, '../../apps/web/.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else if (fs.existsSync(envProdPath)) {
  dotenv.config({ path: envProdPath });
}
export default defineConfig({
  schema: './src/schema_pg.ts',
  out: './drizzle_pg',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.LOCAL_PG_URI || 'postgresql://oni_admin:oni_password@localhost:5432/oni_saas_local',
  },
});
