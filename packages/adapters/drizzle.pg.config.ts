import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../apps/web/.env.local') });

export default defineConfig({
  schema: './src/schema_pg.ts',
  out: './drizzle_pg',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.LOCAL_PG_URI || 'postgresql://oni_admin:oni_password@localhost:5432/oni_saas_local',
  },
});
