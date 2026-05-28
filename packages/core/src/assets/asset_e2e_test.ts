import { AssetEngine, Asset, AssetAllocation, CashbookEntryInput } from './assetEngine';

// ── Lớp Mock Connector Giả lập Cơ sở Dữ liệu ──────────────────────────────
class MockConnector {
  private db: Record<string, any[]> = {
    departments: [],
    assets: [],
    'asset-allocations': [],
    cashbook: [],
  };

  async create(table: string, data: any): Promise<any> {
    const record = { ...data };
    this.db[table].push(record);
    return record;
  }

  async list(table: string, options: any = {}): Promise<{ items: any[] }> {
    let items = [...this.db[table]];

    if (options.filter) {
      items = items.filter((item) => {
        for (const key of Object.keys(options.filter)) {
          if (item[key] !== options.filter[key]) return false;
        }
        return true;
      });
    }

    return { items };
  }

  async update(table: string, id: string, data: any): Promise<any> {
    const idx = this.db[table].findIndex((item) => item.id === id);
    if (idx === -1) throw new Error(`Record ${id} not found in ${table}`);
    
    this.db[table][idx] = { ...this.db[table][idx], ...data };
    return this.db[table][idx];
  }

  getDb() {
    return this.db;
  }
}

// ── Kịch bản Kiểm thử Liên hoàn (E2E Test Suite) ──────────────────────────
async function runAssetE2ETests() {
  console.log('================================================================');
  console.log('🧪 CHẠY THỬ NGHIỆM E2E: PHÂN HỆ QUẢN LÝ TÀI SẢN & KHẤU HAO (PHASE 1)');
  console.log('================================================================\n');

  const connector = new MockConnector();

  // 1. Tạo các Phòng ban mặc định (Departments)
  console.log('Step 1: Tạo các Phòng ban làm Cost Center...');
  const hskpDept = await connector.create('departments', {
    id: 'DEP-HSKP-01',
    branch_id: 'BR-MAIN',
    tenant_id: 'TNT-HOTEL',
    name: 'Bộ phận Buồng phòng',
    code: 'lodging_hskp',
  });
  const kitchenDept = await connector.create('departments', {
    id: 'DEP-KTN-01',
    branch_id: 'BR-MAIN',
    tenant_id: 'TNT-HOTEL',
    name: 'Bộ phận Bếp & Nhà hàng',
    code: 'fnb_kitchen',
  });
  console.log('   [OK] Đã tạo phòng ban:', hskpDept.code, 'và', kitchenDept.code);

  // 2. Tạo tài sản mới (Asset)
  console.log('\nStep 2: Tạo Tài sản cố định Máy giặt công nghiệp...');
  const washingMachineInput: Asset = {
    id: 'AST-LG-001',
    tenant_id: 'TNT-HOTEL',
    branch_id: 'BR-MAIN',
    name: 'Máy giặt công nghiệp LG Smart',
    unit: 'chiếc',
    type: 'tscd',
    original_value: '36000000', // Nguyên giá 36 triệu
    salvage_value: '0',
    purchase_date: '2026-05-28',
    depreciation_months: '36', // Khấu hao 36 tháng (1 triệu/tháng)
    depreciated_value: '0',
    status: 'active',
    serial_no: 'SN-LG-WASH-12345',
    manufacturer: 'LG Electronics',
    warranty_expiry: '2028-05-28',
  };

  const asset = await connector.create('assets', washingMachineInput);
  console.log(`   [OK] Đã tạo tài sản: "${asset.name}" | Hãng: ${asset.manufacturer} | Sê-ri: ${asset.serial_no}`);

  // 3. Phân bổ bàn giao tài sản (Asset Allocation)
  console.log('\nStep 3: Phân bổ bàn giao tài sản cho các bộ phận...');
  // Bàn giao 2 cái cho buồng phòng, 1 cái cho nhà hàng bếp (Tổng cộng 3 cái)
  await connector.create('asset-allocations', {
    id: 'ATA-001',
    tenant_id: 'TNT-HOTEL',
    asset_id: asset.id,
    department_code: 'lodging_hskp',
    qty: '2',
    allocated_at: '2026-05-28',
  });
  await connector.create('asset-allocations', {
    id: 'ATA-002',
    tenant_id: 'TNT-HOTEL',
    asset_id: asset.id,
    department_code: 'fnb_kitchen',
    qty: '1',
    allocated_at: '2026-05-28',
  });
  console.log('   [OK] Bàn giao: 2 chiếc cho lodging_hskp (66.6%), 1 chiếc cho fnb_kitchen (33.3%)');

  // 4. Trích khấu hao kỳ đầu tiên (Month 1)
  console.log('\nStep 4: Chạy trích khấu hao kỳ đầu tiên (Tháng 1)...');
  const resultMonth1 = await AssetEngine.processAssetDepreciation(connector, asset, 'EMP-ACCOUNTANT');
  
  // Xác thực kết quả Tháng 1
  console.log('   Kết quả xử lý:');
  console.log(`     - Thành công: ${resultMonth1.success}`);
  console.log(`     - Số tiền khấu hao trích: ${resultMonth1.postedAmount.toLocaleString()} VND`);
  console.log(`     - Trạng thái tài sản mới: ${resultMonth1.assetStatus}`);

  if (resultMonth1.postedAmount !== 1000000) {
    throw new Error(`❌ SAI LỆCH: Khấu hao kỳ đầu phải là 1.000.000 VND, nhưng tính ra: ${resultMonth1.postedAmount}`);
  }
  console.log('   ✅ ĐẠT: Số tiền khấu hao tính toán chính xác 1.000.000 VND.');

  // Kiểm tra bóc tách chi phí trong Sổ Quỹ (Cashbook)
  const db = connector.getDb();
  const cashbookMonth1 = db.cashbook.filter((entry: CashbookEntryInput) => entry.reference_id === asset.id);
  console.log(`     - Tổng số phiếu chi tạo ra trong cashbook: ${cashbookMonth1.length}`);
  
  const hskpEntry = cashbookMonth1.find((entry: CashbookEntryInput) => entry.note.includes('LODGING_HSKP'));
  const kitchenEntry = cashbookMonth1.find((entry: CashbookEntryInput) => entry.note.includes('FNB_KITCHEN'));

  console.log(`       * Phân bổ Buồng phòng (lodging_hskp): ${Number(hskpEntry?.amount).toLocaleString()} VND`);
  console.log(`       * Phân bổ Bếp & Nhà hàng (fnb_kitchen): ${Number(kitchenEntry?.amount).toLocaleString()} VND`);

  if (Number(hskpEntry?.amount) !== 666667 || Number(kitchenEntry?.amount) !== 333333) {
    throw new Error(`❌ SAI LỆCH: Tỷ lệ phân bổ chi phí không đúng (phải là 666,667 VND và 333,333 VND)`);
  }
  console.log('   ✅ ĐẠT: Bóc tách và phân bổ chi phí khấu hao theo phòng ban chính xác tuyệt đối (Tỷ lệ 2/3 vs 1/3).');

  // Kiểm tra cập nhật giá trị tài sản
  const updatedAssetMonth1 = db.assets.find((ast: Asset) => ast.id === asset.id);
  console.log(`     - Giá trị lũy kế khấu hao mới của tài sản: ${Number(updatedAssetMonth1.depreciated_value).toLocaleString()} VND`);
  if (Number(updatedAssetMonth1.depreciated_value) !== 1000000) {
    throw new Error(`❌ SAI LỆCH: Giá trị lũy kế đã khấu hao phải là 1.000.000 VND`);
  }
  console.log('   ✅ ĐẠT: Tài sản được cập nhật giá trị tích lũy khấu hao chính xác.');

  // 5. Mô phỏng trích khấu hao đến kỳ cuối cùng (Month 36)
  console.log('\nStep 5: Mô phỏng trích khấu hao liên tục các kỳ tiếp theo...');
  
  // Thiết lập giả lập tài sản đã khấu hao 35 tháng (đã khấu hao 35 triệu)
  console.log('     * Giả lập tài sản đã đi qua 35 tháng khấu hao...');
  await connector.update('assets', asset.id, {
    depreciated_value: '35000000',
  });

  const currentAsset = db.assets.find((ast: Asset) => ast.id === asset.id);
  console.log(`     * Khấu hao kỳ 36 (Kỳ cuối)...`);
  const resultMonth36 = await AssetEngine.processAssetDepreciation(connector, currentAsset, 'EMP-ACCOUNTANT');

  console.log(`     - Số tiền khấu hao trích kỳ cuối: ${resultMonth36.postedAmount.toLocaleString()} VND`);
  console.log(`     - Trạng thái tài sản sau kỳ cuối: ${resultMonth36.assetStatus}`);

  const finalAsset = db.assets.find((ast: Asset) => ast.id === asset.id);
  console.log(`     - Giá trị khấu hao lũy kế chung cuộc: ${Number(finalAsset.depreciated_value).toLocaleString()} VND`);

  if (resultMonth36.postedAmount !== 1000000 || finalAsset.status !== 'depreciated' || Number(finalAsset.depreciated_value) !== 36000000) {
    throw new Error(`❌ SAI LỆCH: Khấu hao kỳ cuối hoặc trạng thái tài sản chung cuộc không chính xác!`);
  }
  
  console.log('   ✅ ĐẠT: Hoàn thành trích khấu hao kỳ cuối chính xác, tự động đóng và chuyển trạng thái tài sản sang "depreciated" (Đã khấu hao hết).');

  console.log('\n================================================================');
  console.log('🎉 TẤT CẢ CÁC KỊCH BẢN KIỂM THỬ E2E PHASE 1 ĐỀU THÀNH CÔNG (PASS)');
  console.log('================================================================\n');
}

runAssetE2ETests().catch((error) => {
  console.error('\n❌ KIỂM THỬ THẤT BẠI VỚI LỖI:');
  console.error(error);
  process.exit(1);
});
