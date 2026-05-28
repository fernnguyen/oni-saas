import { Pool } from 'pg';

const connectionUri = 'postgresql://oni_admin:oni_password@localhost:5432/oni_saas_local';

async function applySepayMigration() {
  console.log('================================================================');
  console.log('🌱 APPLYING SEPAY ADVANCED COLUMNS MIGRATION TO LOCAL DB');
  console.log('================================================================\n');

  const pool = new Pool({ connectionString: connectionUri });

  try {
    const sql = `
      ALTER TABLE public.shop_settings 
      ADD COLUMN IF NOT EXISTS sepay_auth_method text DEFAULT 'token_query',
      ADD COLUMN IF NOT EXISTS sepay_hmac_key text,
      ADD COLUMN IF NOT EXISTS sepay_api_key text,
      ADD COLUMN IF NOT EXISTS sepay_bank_filter text,
      ADD COLUMN IF NOT EXISTS sepay_transaction_type text DEFAULT 'all';
    `;
    
    await pool.query(sql);
    console.log('🎉 SUCCESSFULLY APPLIED ADVANCED SEPAY COLUMNS TO LOCAL DATABASE');
  } catch (err) {
    console.error('Error applying migration:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applySepayMigration();
