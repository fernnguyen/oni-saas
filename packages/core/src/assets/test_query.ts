import { Pool } from 'pg';

async function test() {
  const pool = new Pool({
    connectionString: 'postgresql://oni_admin:oni_password@localhost:5432/oni_saas_local',
  });

  try {
    const employees = await pool.query('SELECT * FROM employees');
    console.log('Employees in DB:', employees.rows);

    const departments = await pool.query('SELECT * FROM departments');
    console.log('Departments in DB:', departments.rows);
  } catch (e) {
    console.error('Error querying:', e);
  } finally {
    await pool.end();
  }
}

test();
