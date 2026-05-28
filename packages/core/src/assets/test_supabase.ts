import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ddkjsthxnskdncefnuhi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRka2pzdGh4bnNrZG5jZWZudWhpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA1NzM4MiwiZXhwIjoyMDkzNjMzMzgyfQ.QKxY8gNH0qTuidFheORowx93OAtyyF9YK5wISkoX5Nc'; // service role

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  try {
    const { data, error } = await supabase.from('shop_settings').select('*').limit(1);
    if (error) {
      console.error('Error fetching shop_settings:', error);
    } else if (data && data.length > 0) {
      console.log('Columns in Supabase shop_settings:', Object.keys(data[0]));
    } else {
      console.log('No rows in shop_settings, but query succeeded.');
    }
  } catch (e) {
    console.error('Error:', e);
  }
}

test();
