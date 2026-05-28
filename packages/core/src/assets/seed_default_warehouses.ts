import { Pool } from 'pg';
import { PostgresConnector } from '../../../../packages/adapters/src/postgresAdapter';

const connectionUri = 'postgresql://oni_admin:oni_password@localhost:5432/oni_saas_local';

async function seedDefaultWarehouses() {
  console.log('================================================================');
  console.log('🌱 SEEDING DEFAULT WAREHOUSES V2 (3 STANDARD WAREHOUSES FOR ALL)');
  console.log('================================================================\n');

  const pool = new Pool({ connectionString: connectionUri });

  try {
    // 1. Fetch unique tenant/branch combinations from employees
    console.log('Extracting active branches from database...');
    const result = await pool.query(
      'SELECT DISTINCT tenant_id, branch_id FROM employees WHERE branch_id IS NOT NULL AND branch_id != \'\''
    );
    const branches = result.rows;
    console.log(`Found ${branches.length} active branches in database.`);

    for (const branch of branches) {
      const branchId = branch.branch_id;
      const tenantId = branch.tenant_id;
      console.log(`\nChecking branch: ID: ${branchId}, Tenant: ${tenantId}`);

      // Initialize a scoped connector for this specific tenant/branch
      const scopedConnector = new PostgresConnector(connectionUri, tenantId, branchId);

      // Check if standard warehouses exist. If not, seed them.
      const standardWarehouses = [
        { code: 'sale', name: 'Kho Kinh doanh (Bán lẻ)', type: 'sale' },
        { code: 'supply', name: 'Kho Vật tư & Tiêu hao', type: 'supply' },
        { code: 'asset', name: 'Kho Tài sản chờ bàn giao', type: 'asset' }
      ];

      const whIdMap: Record<string, string> = {};

      for (const sw of standardWarehouses) {
        const existing = await scopedConnector.list('warehouses', {
          filters: { code: sw.code },
          limit: 1
        });

        if (existing.total > 0) {
          const wh = existing.data[0];
          whIdMap[sw.code] = wh.id;
          console.log(`   [OK] Warehouse "${sw.name}" already exists with ID: ${wh.id}`);
        } else {
          console.log(`   [SEED] Creating "${sw.name}"...`);
          const newWh = await scopedConnector.create('warehouses', {
            branch_id: branchId,
            name: sw.name,
            code: sw.code,
            type: sw.type,
            active: 'TRUE',
          });
          whIdMap[sw.code] = newWh.id;
          console.log(`   [SEED] Successfully created with ID: ${newWh.id}`);
        }
      }

      // We ensure WH-SALE (Kho Kinh doanh) ID is resolved for inventory fallback migration
      const saleWhId = whIdMap['sale'];
      if (!saleWhId) {
        throw new Error('Critical error: Failed to resolve WH-SALE ID');
      }

      // 2. Self-healing migration: update any inventory rows that have null, empty, 'default' or older linkages to use saleWhId (WH-SALE)
      const inventoryList = await scopedConnector.list('inventory', {
        filters: { branch_id: branchId },
        limit: 10000
      });
      
      const invs = inventoryList.data as any[];
      let updatedCount = 0;
      for (const inv of invs) {
        const currentWhId = inv.warehouse_id || '';
        // If it's empty, or points to the deprecated 'default' string or the legacy 'default' table record
        const needsMigration = !currentWhId || currentWhId === '' || currentWhId === 'default' || currentWhId.startsWith('default');
        
        if (needsMigration) {
          const invId = inv.inventory_id || inv.id;
          await scopedConnector.update('inventory', invId, {
            warehouse_id: saleWhId
          });
          updatedCount++;
        }
      }
      if (updatedCount > 0) {
        console.log(`   [MIGRATE] Updated ${updatedCount} inventory rows to point to WH-SALE (${saleWhId}).`);
      }

      // 3. Clean up the deprecated legacy 'default' warehouse record if it exists in the databases
      const legacyWhCheck = await scopedConnector.list('warehouses', {
        filters: { id: 'default' },
        limit: 1
      });
      if (legacyWhCheck.total > 0) {
        console.log('   [CLEANUP] Deleting legacy "default" warehouse record...');
        await scopedConnector.delete('warehouses', 'default');
      }
    }

    console.log('\n================================================================');
    console.log('🎉 ALL DEFAULT WAREHOUSES SEEDED AND INVENTORIES UPDATED SUCCESSFULLY TO WH-SALE');
    console.log('================================================================\n');
  } catch (e) {
    console.error('Error during seeding:', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedDefaultWarehouses();
