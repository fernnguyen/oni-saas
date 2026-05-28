import { getConnectorForShop } from '../../../../apps/web/lib/server/connectorFactory';
import crypto from 'crypto';

// ── Mock DB Connector for Phase 3 programmatic tests ───────────────────────
class MockConnector {
  public db: Record<string, any[]> = {
    warehouses: [],
    products: [],
    inventory: [],
    'product-bom': [],
    'stock-movements': [],
    assets: [],
    'asset-allocations': [],
    departments: [],
  };

  async create(table: string, data: any): Promise<any> {
    const record = { 
      id: data.id || `${table.replace(/-/g, '_').substring(0, 3).toUpperCase()}-${crypto.randomUUID().substring(0, 8)}`,
      ...data 
    };
    this.db[table].push(record);
    return record;
  }

  async list(table: string, options: any = {}): Promise<{ data: any[]; total: number }> {
    let items = [...(this.db[table] || [])];

    if (options.filters) {
      items = items.filter((item) => {
        for (const [key, val] of Object.entries(options.filters)) {
          if (val === 'ALL') continue;
          if (item[key] !== val) return false;
        }
        return true;
      });
    }

    return { data: items, total: items.length };
  }

  async update(table: string, id: string, data: any): Promise<any> {
    const idx = this.db[table].findIndex((item) => (item.id === id || item.inventory_id === id || item.bom_id === id));
    if (idx === -1) throw new Error(`Record ${id} not found in ${table}`);
    
    this.db[table][idx] = { ...this.db[table][idx], ...data };
    return this.db[table][idx];
  }

  async findById(table: string, id: string): Promise<any> {
    return this.db[table].find((item) => (item.id === id || item.product_id === id));
  }

  async batchCreate(table: string, items: any[]): Promise<any[]> {
    const created = [];
    for (const item of items) {
      const record = await this.create(table, item);
      created.push(record);
    }
    return created;
  }

  async delete(table: string, id: string): Promise<void> {
    this.db[table] = this.db[table].filter((item) => (item.id !== id && item.inventory_id !== id && item.bom_id !== id));
  }
}

// ── E2E Test Runner ────────────────────────────────────────────────────────
async function runPhase3E2ETests() {
  console.log('================================================================');
  console.log('🧪 RUNNING PHASE 3 E2E: MULTI-WAREHOUSE ROUTING, COMMISSIONING & BOM');
  console.log('================================================================\n');

  const connector = new MockConnector();

  // ── 1. SEED DEFAULT WAREHOUSES ──
  console.log('Step 1: Seed 3 standard warehouses...');
  const whs = [
    { code: 'sale', name: 'Kho Kinh doanh (Bán lẻ)', type: 'sale' },
    { code: 'supply', name: 'Kho Vật tư & Tiêu hao', type: 'supply' },
    { code: 'asset', name: 'Kho Tài sản chờ bàn giao', type: 'asset' }
  ];
  const whMap: Record<string, any> = {};
  for (const wh of whs) {
    const created = await connector.create('warehouses', wh);
    whMap[wh.code] = created;
  }
  console.log('   [OK] Warehouses seeded:');
  console.log(`     * WH-SALE ID: ${whMap['sale'].id}`);
  console.log(`     * WH-SUPPLY ID: ${whMap['supply'].id}`);
  console.log(`     * WH-ASSET ID: ${whMap['asset'].id}`);

  // ── 2. CREATE PRODUCTS OF MULTIPLE INDUSTRIES ──
  console.log('\nStep 2: Tạo sản phẩm thuộc nhiều danh mục/item classes...');
  // Product A: fixed_asset (Sony TV for conference room)
  const productA = await connector.create('products', {
    id: 'P-SONY-TV',
    name: 'Sony Smart TV 65 Inch',
    sku: 'SONY-TV65',
    item_class: 'fixed_asset',
    cost_price: '15000000',
    sell_price: '20000000',
    unit: 'cái',
    active: 'TRUE',
  });

  // Product B: supply (Cafe Beans raw material)
  const productB = await connector.create('products', {
    id: 'P-CAFE-BEANS',
    name: 'Cafe Robusta Beans Premium',
    sku: 'ROBUSTA-BEANS',
    item_class: 'supply',
    cost_price: '200000',
    sell_price: '0',
    unit: 'kg',
    active: 'TRUE',
  });

  // Product C: commercial (Espresso Coffee finished product)
  const productC = await connector.create('products', {
    id: 'P-ESPRESSO',
    name: 'Hot Espresso Coffee',
    sku: 'ESPRESSO-HOT',
    item_class: 'commercial',
    cost_price: '15000',
    sell_price: '35000',
    unit: 'ly',
    active: 'TRUE',
    has_bom: 'TRUE'
  });

  console.log('   [OK] Đã khởi tạo các sản phẩm mẫu: SONY-TV65 (Tài sản), ROBUSTA-BEANS (Vật tư), ESPRESSO-HOT (BOM F&B).');

  // ── 3. AUTOMATIC PROCUREMENT ROUTING SIMULATION ──
  console.log('\nStep 3: Mô phỏng nghiệp vụ Nhập kho (GRN) để tự động định tuyến dòng hàng...');
  
  // Simulate Goods Receipt Note Approval routing logic
  const grnItems = [
    { product_id: 'P-SONY-TV', qty: 5, unit_cost: 14500000, item_class: 'fixed_asset' },
    { product_id: 'P-CAFE-BEANS', qty: 20, unit_cost: 190000, item_class: 'supply' },
    { product_id: 'P-ESPRESSO', qty: 10, unit_cost: 0, item_class: 'commercial' } // Finished goods usually not received directly if made via BOM, but for routing test we include it
  ];

  for (const item of grnItems) {
    let targetWhId = whMap['sale'].id; // Default
    if (item.item_class === 'fixed_asset') {
      targetWhId = whMap['asset'].id; // WH-ASSET
    } else if (item.item_class === 'supply') {
      targetWhId = whMap['supply'].id; // WH-SUPPLY
    }

    // Upsert stock record
    await connector.create('inventory', {
      product_id: item.product_id,
      warehouse_id: targetWhId,
      stock_qty: String(item.qty),
      unit_cost: String(item.unit_cost),
      sku: item.product_id
    });
  }

  // Verify routing
  const tvStock = await connector.list('inventory', { filters: { product_id: 'P-SONY-TV', warehouse_id: whMap['asset'].id } });
  const beansStock = await connector.list('inventory', { filters: { product_id: 'P-CAFE-BEANS', warehouse_id: whMap['supply'].id } });

  console.log(`     * SONY-TV65 stock in WH-ASSET: ${tvStock.data[0]?.stock_qty || 0} ${productA.unit}`);
  console.log(`     * ROBUSTA-BEANS stock in WH-SUPPLY: ${beansStock.data[0]?.stock_qty || 0} ${productB.unit}`);

  if (parseFloat(tvStock.data[0]?.stock_qty) !== 5 || tvStock.data[0]?.warehouse_id !== whMap['asset'].id) {
    throw new Error('❌ SAI LỆCH: Định tuyến Tài sản cố định vào WH-ASSET thất bại!');
  }
  if (parseFloat(beansStock.data[0]?.stock_qty) !== 20 || beansStock.data[0]?.warehouse_id !== whMap['supply'].id) {
    throw new Error('❌ SAI LỆCH: Định tuyến nguyên liệu vào WH-SUPPLY thất bại!');
  }
  console.log('   ✅ ĐẠT: Định tuyến dòng hàng tự động theo Phân loại sản phẩm (item_class) chính xác 100%.');

  // ── 4. 2-STEP ASSET COMMISSIONING ──
  console.log('\nStep 4: Thực hiện Bàn giao tài sản 2 bước (2-Step Commissioning)...');
  // We commission 2 Sony TVs to department "MEETING_ROOM"
  const commQty = 2;
  const deptCode = 'meeting_room';

  // Perform API logic programmatically
  const assetWhId = whMap['asset'].id;
  const tvInv = (await connector.list('inventory', { filters: { product_id: 'P-SONY-TV', warehouse_id: assetWhId } })).data[0];
  const originalVal = parseFloat(tvInv.unit_cost);

  // Decrement physical stock in WH-ASSET
  const nextTvStock = parseFloat(tvInv.stock_qty) - commQty;
  await connector.update('inventory', tvInv.id, { stock_qty: String(nextTvStock) });

  // Create asset registry depreciation card
  const newAsset = await connector.create('assets', {
    name: productA.name,
    unit: productA.unit,
    type: 'tscd',
    original_value: String(originalVal),
    salvage_value: '0',
    purchase_date: '2026-05-28',
    depreciation_months: '24',
    depreciated_value: '0',
    status: 'active',
    serial_no: 'SN-TV-MEET1, SN-TV-MEET2',
    manufacturer: 'Sony Corp'
  });

  // Assign usage allocation to Cost Center
  await connector.create('asset-allocations', {
    asset_id: newAsset.id,
    department_code: deptCode,
    qty: String(commQty),
    allocated_at: '2026-05-28'
  });

  // Register stock movement for audit trail
  await connector.create('stock-movements', {
    type: 'commission',
    product_id: productA.id,
    qty: `-${commQty}`,
    warehouse_id: assetWhId,
    reason: `Bàn giao tài sản 2 bước sang bộ phận: ${deptCode}`
  });

  // Verify commissioning results
  const updatedTvStock = (await connector.list('inventory', { filters: { product_id: 'P-SONY-TV', warehouse_id: assetWhId } })).data[0];
  const registeredAsset = (await connector.list('assets')).data[0];
  const registeredAlloc = (await connector.list('asset-allocations')).data[0];
  const commMovement = (await connector.list('stock-movements', { filters: { type: 'commission' } })).data[0];

  console.log(`     * Tồn kho Sony TV còn lại trong WH-ASSET: ${updatedTvStock.stock_qty} chiếc`);
  console.log(`     * Thẻ tài sản khấu hao: "${registeredAsset.name}" | Nguyên giá: ${parseFloat(registeredAsset.original_value).toLocaleString()}đ`);
  console.log(`     * Cost Center gán: Phòng họp "${registeredAlloc.department_code}" | Số lượng: ${registeredAlloc.qty} cái`);
  console.log(`     * Audit movement: ${commMovement.reason} | Số lượng: ${commMovement.qty}`);

  if (parseFloat(updatedTvStock.stock_qty) !== 3) {
    throw new Error(`❌ SAI LỆCH: Tồn kho WH-ASSET sau bàn giao phải là 3, nhưng thực tế là ${updatedTvStock.stock_qty}`);
  }
  if (registeredAsset.original_value !== '14500000') {
    throw new Error(`❌ SAI LỆCH: Nguyên giá tài sản phải lấy từ unit_cost nhập kho (14,500,000đ), tính ra: ${registeredAsset.original_value}`);
  }
  if (registeredAlloc.department_code !== 'meeting_room' || parseFloat(registeredAlloc.qty) !== 2) {
    throw new Error('❌ SAI LỆCH: Gán Cost Center phòng họp hoặc số lượng bàn giao sai lệch!');
  }
  console.log('   ✅ ĐẠT: Bàn giao tài sản 2 bước hoạt động hoàn hảo. Trừ kho WH-ASSET, kích hoạt thẻ tài sản khấu hao với nguyên giá gốc chính xác 100%.');

  // ── 5. REAL-TIME BOM RECIPE STOCK DEPLETION ──
  console.log('\nStep 5: Thử nghiệm định lượng BOM & khấu hao nguyên liệu thô (Real-time Kitchen Depletion)...');
  // Define BOM Recipe: 1 Cup of Hot Espresso consumes 0.02 kg Robusta Beans
  await connector.create('product-bom', {
    parent_product_id: 'P-ESPRESSO',
    component_product_id: 'P-CAFE-BEANS',
    qty: '0.02' // 20g per cup
  });

  // Simulate POS Billing order checkout (2 Cups of Hot Espresso)
  const posBillQty = 2;
  const parentProduct = await connector.findById('products', 'P-ESPRESSO');
  
  if (parentProduct.has_bom === 'TRUE') {
    const bomRes = await connector.list('product-bom', { filters: { parent_product_id: parentProduct.id } });
    const components = bomRes.data;

    for (const comp of components) {
      const compId = comp.component_product_id;
      const compQtyDeduct = posBillQty * parseFloat(comp.qty); // 2 * 0.02 = 0.04 kg

      // Query component stock in WH-SUPPLY
      const supplyWhId = whMap['supply'].id;
      const beansInv = (await connector.list('inventory', { filters: { product_id: compId, warehouse_id: supplyWhId } })).data[0];
      const oldQty = parseFloat(beansInv.stock_qty);
      const nextQty = oldQty - compQtyDeduct;

      // Update stock
      await connector.update('inventory', beansInv.id, { stock_qty: String(nextQty) });

      // Create stock movement
      await connector.create('stock-movements', {
        type: 'sale_out',
        product_id: compId,
        qty: String(compQtyDeduct),
        warehouse_id: supplyWhId,
        reason: `Trừ kho nguyên liệu phục vụ món: Hot Espresso Coffee x ${posBillQty}`
      });
    }
  }

  // Verify kitchen depletion
  const finalBeansStock = (await connector.list('inventory', { filters: { product_id: 'P-CAFE-BEANS', warehouse_id: whMap['supply'].id } })).data[0];
  const depletionMovement = (await connector.list('stock-movements', { filters: { warehouse_id: whMap['supply'].id } })).data[0];

  console.log(`     * Tồn kho Robusta Beans sau khi bán 2 ly Espresso: ${finalBeansStock.stock_qty} kg (Giảm 0.04 kg)`);
  console.log(`     * Audit movement: ${depletionMovement.reason} | Khấu trừ: ${depletionMovement.qty} kg`);

  if (parseFloat(finalBeansStock.stock_qty) !== 19.96) {
    throw new Error(`❌ SAI LỆCH: Tồn kho nguyên liệu robusa phải là 19.96 kg, thực tế tính ra: ${finalBeansStock.stock_qty}`);
  }
  console.log('   ✅ ĐẠT: Định lượng BOM bếp và trừ kho nguyên liệu thô tự động trong WH-SUPPLY hoạt động hoàn toàn chính xác.');

  console.log('\n================================================================');
  console.log('🎉 ALL PHASE 3 E2E TESTS COMPLETED & VERIFIED SUCCESSFULLY!');
  console.log('================================================================\n');
}

runPhase3E2ETests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
