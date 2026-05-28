import { Pool } from 'pg';

async function test() {
  const pool = new Pool({
    connectionString: 'postgresql://oni_admin:oni_password@localhost:5432/oni_saas_local',
  });

  try {
    const res = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    console.log('Tables in DB:', res.rows.map(r => r.table_name));
  } catch (e) {
    console.error('Error querying:', e);
  } finally {
    await pool.end();
  }
}

test();
