import { PostgresConnector } from '../../../../packages/adapters/src/postgresAdapter';

async function test() {
  const connector = new PostgresConnector(
    'postgresql://oni_admin:oni_password@localhost:5432/oni_saas_local',
    '9f2d7cd3-9215-4dad-8c83-8072550a5c90', // tenant_id from query test
    '00b0bb64-d006-4e71-b41c-979bde62766e'  // branch_id from query test
  );

  try {
    const listResult = await connector.list('employees', { limit: 200 });
    console.log('Connector List Employees:', listResult);
  } catch (e) {
    console.error('Error:', e);
  }
}

test();
