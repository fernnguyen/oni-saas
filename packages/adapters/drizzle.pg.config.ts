import path from 'path';
import fs from 'fs';

// Safely load dotenv if available in environment (local dev)
try {
  const dotenv = require('dotenv');
  const envLocalPath = path.resolve(__dirname, '../../apps/web/.env.local');
  const envProdPath = path.resolve(__dirname, '../../apps/web/.env');

  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath });
  } else if (fs.existsSync(envProdPath)) {
    dotenv.config({ path: envProdPath });
  }
} catch {
  // Ignored on production standalone server where process.env is already populated
}

export default {
  schema: './src/schema_pg.ts',
  out: './drizzle_pg',
  dialect: 'postgresql' as const,
  dbCredentials: {
    url: process.env.LOCAL_PG_URI || 'postgresql://oni_admin:oni_password@localhost:5432/oni_saas_local',
  },
};
