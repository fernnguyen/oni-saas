import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from apps/web/.env.local
dotenv.config({ path: path.resolve(__dirname, '../../../../apps/web/.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSupabase() {
  console.log('Connecting to Supabase at:', supabaseUrl);
  
  // 1. Fetch one row from shop_settings to see its columns
  const { data, error } = await supabase.from('shop_settings').select('*').limit(1);
  
  if (error) {
    console.error('Error fetching shop_settings:', error);
  } else if (data && data.length > 0) {
    console.log('Columns in shop_settings on cloud DB:', Object.keys(data[0]));
    console.log('Row values:', data[0]);
  } else {
    console.log('No rows in shop_settings on cloud DB, but query succeeded.');
  }

  // 2. Try doing a mock upsert with all SePay fields to see the exact error
  const mockShopId = '11111111-1111-1111-1111-111111111111'; // dummy UUID
  const testPayload = {
    shop_id: mockShopId,
    bank_code: 'ICB',
    bank_account_number: '0984666002',
    bank_account_name: 'NGUYEN VIET LINH',
    qr_template: 'compact2',
    sepay_webhook_token: 'sepay_test_token',
    sepay_auth_method: 'token_query',
    sepay_hmac_key: null,
    sepay_api_key: null,
    sepay_bank_filter: null,
    sepay_transaction_type: 'all',
    updated_at: new Date().toISOString()
  };

  console.log('\nTrying to upsert mock payload...');
  const res = await supabase.from('shop_settings').upsert(testPayload);
  if (res.error) {
    console.log('Upsert failed with code:', res.error.code);
    console.log('Upsert failed with message:', res.error.message);
    console.log('Upsert failed with details:', res.error.details);
  } else {
    console.log('Upsert succeeded! (Dummy row inserted or updated)');
    // Cleanup
    await supabase.from('shop_settings').delete().eq('shop_id', mockShopId);
  }
}

testSupabase();
