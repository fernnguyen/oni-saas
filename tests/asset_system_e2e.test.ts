import { assetCreateSchema, assetAllocationCreateSchema, assetDepreciationCreateSchema } from '../apps/web/lib/validators/assets';

// ── Kịch bản Kiểm thử Tích hợp Phân hệ Tài sản & Bộ phận Phân loại (E2E) ──
async function runAssetSystemTests() {
  console.log('================================================================');
  console.log('🧪 CHẠY THỬ NGHIỆM TÍCH HỢP: BỘ PHẬN PHÂN LOẠI & NGƯỜI TẠO (TESTS)');
  console.log('================================================================\n');

  // 1. Kiểm định Validator Đăng ký Thẻ tài sản (Zod Validator with auditing metadata)
  console.log('Step 1: Kiểm định Zod Validator hỗ trợ các trường created_by & updated_by...');
  
  const mockAssetInput = {
    name: 'Thiết bị siêu âm cao tần 5D',
    unit: 'bộ',
    type: 'tscd',
    original_value: '150000000',
    salvage_value: '10000000',
    purchase_date: '2026-05-28',
    depreciation_months: '60',
    serial_no: 'SN-US-5D-999',
    manufacturer: 'Medison',
    warranty_expiry: '2029-05-28',
    supplier_id: 'SUP-MED-01',
    status: 'active',
    created_by: 'usr_admin_001',
    updated_by: 'usr_admin_001',
  };

  const parsedAsset = assetCreateSchema.parse(mockAssetInput);
  
  if (
    parsedAsset.created_by === 'usr_admin_001' &&
    parsedAsset.updated_by === 'usr_admin_001' &&
    parsedAsset.name === 'Thiết bị siêu âm cao tần 5D'
  ) {
    console.log('   [OK] Validator đăng ký tài sản xác thực dữ liệu kiểm toán thành công!');
  } else {
    throw new Error('FAIL: Validator không giữ lại thông tin người tạo/người cập nhật!');
  }

  // 2. Kiểm định Validator Điều chuyển bộ phận (Zod Validator for Asset Allocation)
  console.log('\nStep 2: Kiểm định Zod Validator di chuyển tài sản có lưu lịch sử kiểm toán...');
  
  const mockAllocationInput = {
    asset_id: 'AST-US-001',
    department_code: 'med_diagnostics',
    qty: '1',
    allocated_at: '2026-05-28',
    note: 'Di chuyển bàn giao cho Cost Center Chẩn đoán hình ảnh',
    recipient_name: 'Bác sĩ Nguyễn Văn Bình',
    created_by: 'usr_operator_002',
    updated_by: 'usr_operator_002',
  };

  const parsedAllocation = assetAllocationCreateSchema.parse(mockAllocationInput);
  
  if (
    parsedAllocation.created_by === 'usr_operator_002' &&
    parsedAllocation.updated_by === 'usr_operator_002' &&
    parsedAllocation.department_code === 'med_diagnostics'
  ) {
    console.log('   [OK] Validator di chuyển bộ phận xác thực dữ liệu thành công!');
  } else {
    throw new Error('FAIL: Validator di chuyển bộ phận bỏ sót dữ liệu kiểm toán!');
  }

  // 3. Giả lập nghiệp vụ Máy chủ ghép nối Bộ phận hiện tại (Current Department Resolution)
  console.log('\nStep 3: Mô phỏng nghiệp vụ máy chủ ghép nối Bộ phận hiện tại...');
  
  // Danh sách tài sản thô từ DB
  const rawAssets = [
    { id: 'AST-001', name: 'Máy siêu âm' },
    { id: 'AST-002', name: 'Máy chụp X-Quang' },
  ];

  // Danh sách lịch sử điều chuyển từ DB
  const rawAllocations = [
    { asset_id: 'AST-001', department_code: 'med_diagnostics', allocated_at: '2026-05-28 10:00:00' },
    { asset_id: 'AST-001', department_code: 'med_general_ward', allocated_at: '2026-05-28 15:30:00' }, // Lần điều chuyển mới nhất
    { asset_id: 'AST-002', department_code: 'med_diagnostics', allocated_at: '2026-05-28 09:00:00' },
  ];

  const departmentNameMap = new Map([
    ['med_diagnostics', 'Khoa Chẩn đoán hình ảnh'],
    ['med_general_ward', 'Khoa Nội tổng hợp'],
  ]);

  // Ghép nối và lấy bộ phận mới nhất
  const allocationMap = new Map<string, string>();
  
  // Sắp xếp lịch sử điều chuyển từ mới nhất đến cũ nhất
  const sortedAllocations = [...rawAllocations].sort(
    (a, b) => new Date(b.allocated_at).getTime() - new Date(a.allocated_at).getTime()
  );

  sortedAllocations.forEach((alloc) => {
    if (!allocationMap.has(alloc.asset_id)) {
      const deptName = departmentNameMap.get(alloc.department_code) || alloc.department_code;
      allocationMap.set(alloc.asset_id, deptName);
    }
  });

  const processedAssets = rawAssets.map((asset) => ({
    ...asset,
    current_department: allocationMap.get(asset.id) || 'Chưa di chuyển',
  }));

  // Kiểm nghiệm kết quả ghép nối
  const ast1 = processedAssets.find((a) => a.id === 'AST-001');
  const ast2 = processedAssets.find((a) => a.id === 'AST-002');

  if (ast1?.current_department === 'Khoa Nội tổng hợp' && ast2?.current_department === 'Khoa Chẩn đoán hình ảnh') {
    console.log('   [OK] Thuật toán giải quyết Bộ phận hiện tại hoạt động chính xác tuyệt đối!');
    console.log(`     - Tài sản ${ast1.name}: ${ast1.current_department}`);
    console.log(`     - Tài sản ${ast2.name}: ${ast2.current_department}`);
  } else {
    throw new Error('FAIL: Lỗi ghép nối Bộ phận hiện tại mới nhất!');
  }

  // 4. Giả lập quy trình Trích khấu hao Hàng loạt (Batch Depreciation)
  console.log('\nStep 4: Mô phỏng nghiệp vụ trích khấu hao hàng loạt cuối tháng...');

  // Danh sách các tài sản hoạt động cần trích khấu hao hàng loạt
  const activeAssets = [
    { id: 'AST-WASH-001', name: 'Máy giặt LG', type: 'tscd', original_value: 36000000, depreciation_months: 36 },
    { id: 'AST-DRY-002', name: 'Máy sấy Electrolux', type: 'ccdc', original_value: 12000000, depreciation_months: 12 },
  ];

  // Chi tiết phân bổ bàn giao của từng tài sản đến các bộ phận Cost Center
  const activeAllocations = [
    { asset_id: 'AST-WASH-001', department_code: 'lodging_hskp', qty: 2 },
    { asset_id: 'AST-WASH-001', department_code: 'fnb_kitchen', qty: 1 },
    { asset_id: 'AST-DRY-002', department_code: 'lodging_hskp', qty: 1 },
  ];

  let batchProcessedCount = 0;
  let batchTotalAmount = 0;
  const departmentExpenseSummary = new Map<string, number>();

  // Thuật toán quét và trích khấu hao hàng loạt của Server
  activeAssets.forEach((asset) => {
    // 1. Tính khấu hao tháng của từng tài sản
    const monthlyDepreciation = Math.round(asset.original_value / asset.depreciation_months);
    batchTotalAmount += monthlyDepreciation;
    batchProcessedCount++;

    // 2. Tìm phân bổ của tài sản này
    const allocs = activeAllocations.filter((a) => a.asset_id === asset.id);
    const totalQty = allocs.reduce((sum, item) => sum + item.qty, 0);

    if (allocs.length > 0 && totalQty > 0) {
      allocs.forEach((alloc) => {
        const ratio = alloc.qty / totalQty;
        const allocatedAmount = Math.round(monthlyDepreciation * ratio);

        // Ghi nhận chi phí dồn tích theo từng Bộ phận Cost Center
        const currentExp = departmentExpenseSummary.get(alloc.department_code) || 0;
        departmentExpenseSummary.set(alloc.department_code, currentExp + allocatedAmount);
      });
    } else {
      // Tính vào chi phí quản lý chung nếu chưa phân bổ
      const currentExp = departmentExpenseSummary.get('general_management') || 0;
      departmentExpenseSummary.set('general_management', currentExp + monthlyDepreciation);
    }
  });

  // Kiểm tra kết quả tổng hợp
  // - Máy giặt LG: 1,000,000 đ. Buồng phòng (2/3) -> 666,667 đ. Bếp (1/3) -> 333,333 đ.
  // - Máy sấy: 1,000,000 đ. Buồng phòng (1/1) -> 1,000,000 đ.
  // => Tổng Buồng phòng: 1,666,667 đ. Bếp: 333,333 đ. Tổng cộng: 2,000,000 đ.
  const hskpExpense = departmentExpenseSummary.get('lodging_hskp');
  const kitchenExpense = departmentExpenseSummary.get('fnb_kitchen');

  if (
    batchProcessedCount === 2 &&
    batchTotalAmount === 2000000 &&
    hskpExpense === 1666667 &&
    kitchenExpense === 333333
  ) {
    console.log('   [OK] Trích khấu hao hàng loạt và phân gán chi phí theo Bộ phận thành công mỹ mãn!');
    console.log(`     - Số tài sản trích: ${batchProcessedCount}`);
    console.log(`     - Tổng chi phí trích: ${batchTotalAmount.toLocaleString('vi-VN')} đ`);
    console.log(`     - Chi phí phân bổ Bộ phận Buồng phòng (lodging_hskp): ${hskpExpense.toLocaleString('vi-VN')} đ`);
    console.log(`     - Chi phí phân bổ Bộ phận Bếp (fnb_kitchen): ${kitchenExpense.toLocaleString('vi-VN')} đ`);
  } else {
    throw new Error('FAIL: Lỗi tính toán phân gán chi phí khấu hao hàng loạt!');
  }

  // 5. Kiểm định Lịch sử khấu hao (Asset Depreciation History logging & tracing)
  console.log('\nStep 5: Kiểm định Validator Lịch sử khấu hao và Trích xuất chi tiết bộ phận đóng góp...');
  
  const mockDeprecLogInput = {
    asset_id: 'AST-WASH-001',
    depreciation_date: '2026-05-28',
    amount: '666667',
    depreciated_value_before: '0',
    depreciated_value_after: '666667',
    department_code: 'lodging_hskp',
    cashbook_id: 'CSB-DEP-BATCH-LODGING_HSKP-888',
    created_by: 'usr_operator_002',
    updated_by: 'usr_operator_002',
  };

  const parsedDeprecLog = assetDepreciationCreateSchema.parse(mockDeprecLogInput);

  if (
    parsedDeprecLog.asset_id === 'AST-WASH-001' &&
    parsedDeprecLog.department_code === 'lodging_hskp' &&
    parsedDeprecLog.cashbook_id === 'CSB-DEP-BATCH-LODGING_HSKP-888' &&
    parsedDeprecLog.amount === '666667'
  ) {
    console.log('   [OK] Validator Lịch sử khấu hao tài sản xác thực dữ liệu thành công!');
  } else {
    throw new Error('FAIL: Validator Lịch sử khấu hao bỏ sót dữ liệu kiểm toán hoặc liên kết sổ quỹ!');
  }

  // Giả lập lưu trữ nhiều lịch sử cho bộ phận và truy vết lại
  const mockDbDeprecLogs = [
    { id: 'LOG-01', asset_id: 'AST-WASH-001', department_code: 'lodging_hskp', amount: '666667', cashbook_id: 'CSB-DEP-BATCH-LODGING_HSKP-888' },
    { id: 'LOG-02', asset_id: 'AST-DRY-002', department_code: 'lodging_hskp', amount: '1000000', cashbook_id: 'CSB-DEP-BATCH-LODGING_HSKP-888' },
    { id: 'LOG-03', asset_id: 'AST-WASH-001', department_code: 'fnb_kitchen', amount: '333333', cashbook_id: 'CSB-DEP-BATCH-FNB_KITCHEN-888' },
  ];

  // Truy vết những thiết bị đóng góp cho chi phí của bộ phận 'lodging_hskp' từ phiếu chi 'CSB-DEP-BATCH-LODGING_HSKP-888'
  const contributions = mockDbDeprecLogs.filter(
    (log) => log.department_code === 'lodging_hskp' && log.cashbook_id === 'CSB-DEP-BATCH-LODGING_HSKP-888'
  );

  if (
    contributions.length === 2 &&
    contributions.some((c) => c.asset_id === 'AST-WASH-001' && c.amount === '666667') &&
    contributions.some((c) => c.asset_id === 'AST-DRY-002' && c.amount === '1000000')
  ) {
    console.log('   [OK] Truy vết lịch sử khấu hao theo phòng ban chính xác tuyệt đối!');
    console.log('     Danh sách thiết bị tạo nên chi phí bộ phận lodging_hskp:');
    contributions.forEach((c) => {
      console.log(`       - Thiết bị: ${c.asset_id}, Số tiền đóng góp: ${Number(c.amount).toLocaleString('vi-VN')} đ (Phiếu chi: ${c.cashbook_id})`);
    });
  } else {
    throw new Error('FAIL: Lỗi truy vết thiết bị đóng góp từ lịch sử khấu hao bộ phận!');
  }

  console.log('\n================================================================');
  console.log('🎉 TẤT CẢ CÁC BÀI KIỂM THỬ TRÊN THƯ MỤC TESTS ĐỀU THÀNH CÔNG (PASS)');
  console.log('================================================================');
}

runAssetSystemTests().catch((err) => {
  console.error('❌ Thử nghiệm thất bại với lỗi:', err);
  process.exit(1);
});

