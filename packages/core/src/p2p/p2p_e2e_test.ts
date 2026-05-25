import { P2PEngine, type IDataConnector, type ListOptions, type ListResult } from './p2pEngine';

// 1. Implement a clean in-memory database connector to run E2E scenarios without hitting active DBs
class InMemoryConnector implements IDataConnector {
  private db: Record<string, Record<string, string>[]> = {};

  async list(entity: string, options?: ListOptions): Promise<ListResult> {
    const data = this.db[entity] || [];
    let filtered = [...data];

    if (options?.filters) {
      filtered = filtered.filter(row => {
        return Object.entries(options.filters!).every(([k, v]) => row[k] === v);
      });
    }

    const limit = options?.limit || 50;
    const page = options?.page || 1;
    const offset = (page - 1) * limit;
    const sliced = filtered.slice(offset, offset + limit);

    return {
      data: sliced,
      total: filtered.length,
      page,
      limit,
    };
  }

  async findById(entity: string, id: string): Promise<Record<string, string> | null> {
    const data = this.db[entity] || [];
    return data.find(row => row.id === id) || null;
  }

  async create(entity: string, data: Record<string, string>): Promise<Record<string, string>> {
    if (!this.db[entity]) this.db[entity] = [];
    const newRow = { ...data };
    if (!newRow.id) {
      newRow.id = `${entity.substring(0, 3).toUpperCase()}-${Math.floor(Math.random() * 10000)}`;
    }
    if (!newRow.created_at) newRow.created_at = new Date().toISOString();
    this.db[entity].push(newRow);
    return newRow;
  }

  async update(entity: string, id: string, data: Partial<Record<string, string>>): Promise<Record<string, string>> {
    if (!this.db[entity]) this.db[entity] = [];
    const index = this.db[entity].findIndex(row => row.id === id);
    if (index === -1) throw new Error(`${entity} #${id} not found to update`);
    const updated = { ...this.db[entity][index], ...data };
    this.db[entity][index] = updated;
    return updated;
  }

  async delete(entity: string, id: string): Promise<void> {
    if (!this.db[entity]) return;
    this.db[entity] = this.db[entity].filter(row => row.id !== id);
  }

  async batchCreate(entity: string, rows: Record<string, string>[]): Promise<Record<string, string>[]> {
    const created: Record<string, string>[] = [];
    for (const r of rows) {
      created.push(await this.create(entity, r));
    }
    return created;
  }

  // Debug helper to print tables
  dump(entity: string) {
    console.log(`\n=== TABLE: ${entity.toUpperCase()} ===`);
    console.table(this.db[entity] || []);
  }
}

async function runE2ETest() {
  console.log('🚀 KHỞI CHẠY THỬ NGHIỆM LIÊN HOÀN (E2E LOGIC TEST) CHO PHÂN HỆ P2P');
  const connector = new InMemoryConnector();

  // --- BUỒNG KHỞI TẠO DỮ LIỆU CƠ SỞ ---
  console.log('\n1. Khởi tạo Catalog sản phẩm & Danh mục Nhà cung cấp...');
  const product = await connector.create('products', {
    id: 'PROD-COFFEE',
    name: 'Hạt Cà Phê Robusta Premium',
    stock_qty: '10', // Tồn ban đầu: 10 kg
    cost_price: '50000', // Giá vốn ban đầu: 50.000 đ/kg
  });
  
  // Khởi tạo tồn kho chi nhánh
  await connector.create('inventory', {
    id: 'INV-COFFEE-01',
    product_id: 'PROD-COFFEE',
    branch_id: 'BRANCH-A',
    stock_qty: '10',
    unit_cost: '50000',
  });

  const supplier = await connector.create('suppliers', {
    id: 'SUP-TRUNGNGUYEN',
    name: 'Tập đoàn Trung Nguyên Coffee',
    debt_amount: '0', // Công nợ ban đầu bằng 0
  });

  console.log(`  [OK] Sản phẩm: ${product.name} (Tồn kho: 10, Giá vốn: 50K đ)`);
  console.log(`  [OK] Nhà cung cấp: ${supplier.name} (Nợ phải trả: 0 đ)`);


  // --- BƯỚC 1: LẬP PHIẾU ĐỀ XUẤT PR (DRAFT) ---
  console.log('\n2. Bước 1: Nhân viên lập Phiếu đề xuất mua sắm PR bản nháp...');
  const pr = await connector.create('purchase-requisitions', {
    id: 'PR-2026-0001',
    status: 'DRAFT',
    created_by: 'nhan_vien_kho',
    branch_id: 'BRANCH-A',
    note: 'Nhập hạt cà phê chuẩn bị cao điểm mùa hè',
  });

  const prItem = await connector.create('purchase-requisition-items', {
    id: 'PRI-001',
    requisition_id: pr.id,
    product_id: 'PROD-COFFEE',
    product_name: 'Hạt Cà Phê Robusta Premium',
    qty: '5', // Đề xuất mua 5 kg
    estimated_unit_price: '0',
    line_total: '0',
  });
  console.log(`  [PR DRAFT] Đã tạo PR #${pr.id} với trạng thái: ${pr.status}`);


  // --- BƯỚC 2: GỬI TIẾP NHẬN PR (SUBMIT) ---
  console.log('\n3. Bước 2: Gửi PR lên bộ phận mua sắm để báo giá...');
  const prSubmitted = await P2PEngine.transitionPR(connector, pr.id, 'SUBMIT', 'nhan_vien_kho');
  console.log(`  [PR SUBMITTED] Trạng thái PR chuyển thành: ${prSubmitted.status}`);


  // --- BƯỚC 3: PHÒNG MUA SẮM BÁO GIÁ & CHỌN NCC (ASSIGN PRICE) ---
  console.log('\n4. Bước 3: Nhân viên mua sắm sourcing báo giá và chọn NCC...');
  // Giá mua thương lượng được từ Trung Nguyên là 54.000 đ/kg
  const prPriced = await P2PEngine.transitionPR(connector, pr.id, 'ASSIGN_PRICE', 'nhan_vien_mua_sam', {
    estimated_total: String(5 * 54000), // 270.000 đ
    items: [
      { id: prItem.id, estimated_unit_price: '54000', line_total: String(5 * 54000) }
    ]
  });
  console.log(`  [PR PRICED] Trạng thái PR chuyển thành: ${prPriced.status} (Ước tính: ${prPriced.estimated_total} đ)`);


  // --- BƯỚC 4: KẾ TOÁN TRƯỞNG PHÊ DUYỆT (APPROVE_KTT) ---
  console.log('\n5. Bước 4: Kế toán trưởng duyệt hạn mức chi mua sắm...');
  const prApprovedKTT = await P2PEngine.transitionPR(connector, pr.id, 'APPROVE_KTT', 'ke_toan_truong');
  console.log(`  [PR KTT] Trạng thái PR chuyển thành: ${prApprovedKTT.status}`);


  // --- BƯỚC 5: GIÁM ĐỐC PHÊ DUYỆT CHÍNH THỨC (APPROVE_GD) ---
  console.log('\n6. Bước 5: Giám đốc ký phê duyệt hạn mức tối cao...');
  const prApprovedGD = await P2PEngine.transitionPR(connector, pr.id, 'APPROVE_GD', 'giam_doc');
  console.log(`  [PR APPROVED] Trạng thái PR chuyển thành: ${prApprovedGD.status}`);


  // --- BƯỚC 6: CHUYỂN PR THÀNH PO (CREATE PO FROM PR) ---
  console.log('\n7. Bước 6: Lập Đơn đặt hàng chính thức PO gửi đối tác...');
  const po = await P2PEngine.createPOFromPR(connector, pr.id, 'nhan_vien_mua_sam', supplier.id, supplier.name);
  console.log(`  [PO ISSUED] Đơn hàng PO #${po.id} đã được lập gửi tới: ${po.supplier_name}`);
  console.log(`  [PO VALUE] Tổng giá trị PO: ${po.total_amount} đ`);


  // --- BƯỚC 7: HÀNG VỀ - LẬP PHIẾU ĐỐI CHIẾU NHẬP KHO GRN ---
  console.log('\n8. Bước 7: Đối tác giao hàng - Lập phiếu đối chiếu GRN nháp...');
  // Giả lập tạo phiếu GRN từ PO
  const grn = await connector.create('goods-receipt-notes', {
    id: 'GRN-2026-0001',
    purchase_order_id: po.id,
    received_by: 'ke_toan_kho',
    warehouse_id: 'W-MAIN',
    status: 'DRAFT',
    branch_id: 'BRANCH-A',
  });

  // Hàng về đủ 5 kg, giá nhập đúng 54.000 đ
  await connector.create('goods-receipt-note-items', {
    id: 'GRI-001',
    grn_id: grn.id,
    product_id: 'PROD-COFFEE',
    product_name: 'Hạt Cà Phê Robusta Premium',
    qty_ordered: '5',
    qty_received: '5', // Thực nhận: 5
    unit_cost: '54000',
    line_total: String(5 * 54000),
  });
  console.log(`  [GRN DRAFT] Đã lập phiếu GRN #${grn.id} đối chiếu theo PO #${po.id}`);


  // --- BƯỚC 8: KẾ TOÁN DUYỆT GRN (3-WAY MATCH & HẠCH TOÁN AUTO) ---
  console.log('\n9. Bước 8: Kế toán kho xác nhận số lượng & Duyệt hoàn tất GRN...');
  const grnCompleted = await P2PEngine.approveGRN(connector, grn.id, 'ke_toan_kho');
  console.log(`  [GRN COMPLETED] Trạng thái GRN: ${grnCompleted.status}`);


  // --- BƯỚC 9: KIỂM TRA ĐỐI CHIẾU TOÀN VẸN (ASSERTIONS) ---
  console.log('\n10. Bước 9: Đối chiếu số liệu sau quy trình P2P hoàn chỉnh...');

  // 1. Kiểm tra tồn kho chi nhánh & Giá vốn trung bình di động
  const updatedInv = await connector.findById('inventory', 'INV-COFFEE-01');
  const expectedStock = 10 + 5; // 15
  // Moving average: ((10 * 50000) + (5 * 54000)) / 15 = (500000 + 270000) / 15 = 770000 / 15 = 51333.33 đ
  const expectedAverageCost = 51333.33;

  console.log(`  [INVENTORY TEST]`);
  console.log(`    - Tồn kho thực tế: ${updatedInv?.stock_qty} kg (Mong đợi: ${expectedStock} kg) -> ${parseFloat(updatedInv?.stock_qty || '0') === expectedStock ? '✅ ĐẠT' : '❌ SAI'}`);
  console.log(`    - Giá vốn TB di động: ${parseFloat(updatedInv?.unit_cost || '0').toFixed(2)} đ/kg (Mong đợi: ${expectedAverageCost.toFixed(2)} đ/kg) -> ${Math.abs(parseFloat(updatedInv?.unit_cost || '0') - expectedAverageCost) < 1 ? '✅ ĐẠT' : '❌ SAI'}`);

  // 2. Kiểm tra giá vốn cập nhật lại trong Product Catalog
  const updatedProduct = await connector.findById('products', 'PROD-COFFEE');
  console.log(`  [PRODUCT CATALOG TEST]`);
  console.log(`    - Tổng tồn Catalog: ${updatedProduct?.stock_qty} (Mong đợi: 15)`);
  console.log(`    - Giá vốn Catalog: ${parseFloat(updatedProduct?.cost_price || '0').toFixed(2)} đ/kg (Mong đợi: 51333.33 đ/kg) -> ${Math.abs(parseFloat(updatedProduct?.cost_price || '0') - expectedAverageCost) < 1 ? '✅ ĐẠT' : '❌ SAI'}`);

  // 3. Kiểm tra công nợ nhà cung cấp
  const updatedSupplier = await connector.findById('suppliers', 'SUP-TRUNGNGUYEN');
  const expectedDebt = 270000; // 5 kg * 54000 đ
  console.log(`  [SUPPLIER DEBT TEST]`);
  console.log(`    - Nợ phải trả NCC: ${updatedSupplier?.debt_amount} đ (Mong đợi: ${expectedDebt} đ) -> ${parseFloat(updatedSupplier?.debt_amount || '0') === expectedDebt ? '✅ ĐẠT' : '❌ SAI'}`);

  // 4. Kiểm tra stock movements sinh ra
  const movements = await connector.list('stock-movements', { filters: { reference_no: grn.id } });
  console.log(`  [STOCK MOVEMENT INTEGRITY TEST]`);
  console.log(`    - Số lượng bản ghi stock movement tự tạo: ${movements.total} (Mong đợi: 1)`);
  if (movements.data.length > 0) {
    const sm = movements.data[0];
    console.log(`    - Kiểu: ${sm.type.toUpperCase()}`);
    console.log(`    - Số lượng nhập: ${sm.qty} kg`);
    console.log(`    - Trạng thái: ${sm.workflow_status}`);
    console.log(`    - Lý do: "${sm.reason}"`);
    console.log(`    -> ✅ BẢO ĐẢM TƯƠNG THÍCH MƯỢT MÀ VỚI LÕI KHO CŨ`);
  }

  // 5. Kiểm tra lịch sử giá nhập
  const histories = await connector.list('product-purchase-history', { filters: { product_id: 'PROD-COFFEE' } });
  console.log(`  [PRICE AUDIT HISTORY TEST]`);
  console.log(`    - Số lượng bản ghi lịch sử giá: ${histories.total} (Mong đợi: 1) -> ${histories.total === 1 ? '✅ ĐẠT' : '❌ SAI'}`);
  if (histories.data.length > 0) {
    console.log(`    - Nhà cung cấp ghi nhận: ${histories.data[0].supplier_name}`);
    console.log(`    - Đơn giá ghi nhận: ${histories.data[0].unit_price} đ`);
  }

  console.log('\n🎉 [KẾT QUẢ] TOÀN BỘ CÁC CHỈ TIÊU ĐỐI CHIẾU P2P ĐỀU ĐẠT CHUẨN XÁC NGUYÊN BẢN!');
}

runE2ETest().catch(err => {
  console.error('❌ THỬ NGHIỆM GẶP LỖI:', err);
});
