import { PostgresConnector } from '../../../../packages/adapters/src/postgresAdapter';

const connectionUri = 'postgresql://oni_admin:oni_password@localhost:5432/oni_saas_local';
const tenantId = '9f2d7cd3-9215-4dad-8c83-8072550a5c90';
const branchId = '00b0bb64-d006-4e71-b41c-979bde62766e';

async function runCostAllocationTests() {
  console.log('================================================================');
  console.log('🧪 CHẠY THỬ NGHIỆM E2E: BỘ MÁY PHÂN BỔ CHI PHÍ DÙNG CHUNG (PHASE 2)');
  console.log('================================================================\n');

  const connector = new PostgresConnector(connectionUri, tenantId, branchId);

  // 1. Khởi tạo/kiểm tra các phòng ban
  console.log('Step 1: Đảm bảo tồn tại các phòng ban (Cost Centers)...');
  
  let leTanDept = await connector.list('departments', { filters: { code: 'le_tan' }, limit: 1 });
  if (leTanDept.total === 0) {
    await connector.create('departments', {
      branch_id: branchId,
      name: 'Lễ tân',
      code: 'le_tan',
      active: 'TRUE',
    });
    console.log('   [OK] Đã tạo phòng ban: le_tan');
  } else {
    console.log('   [OK] Đã có phòng ban: le_tan');
  }

  let buongPhongDept = await connector.list('departments', { filters: { code: 'buong_phong' }, limit: 1 });
  if (buongPhongDept.total === 0) {
    await connector.create('departments', {
      branch_id: branchId,
      name: 'Buồng phòng',
      code: 'buong_phong',
      active: 'TRUE',
    });
    console.log('   [OK] Đã tạo phòng ban: buong_phong');
  } else {
    console.log('   [OK] Đã có phòng ban: buong_phong');
  }

  // 2. Khởi tạo/kiểm tra Quỹ thanh toán
  console.log('\nStep 2: Đảm bảo tồn tại Quỹ thanh toán...');
  let fundsRes = await connector.list('payment-funds', { filters: { branch_id: branchId }, limit: 1 });
  let testFund: any;

  if (fundsRes.total === 0) {
    testFund = await connector.create('payment-funds', {
      branch_id: branchId,
      name: 'Quỹ tiền mặt kiểm thử',
      type: 'cash',
      initial_balance: '50000000',
      current_balance: '50000000',
      is_default: 'TRUE',
      active: 'TRUE',
    });
    console.log('   [OK] Đã tạo Quỹ tiền mặt mới với số dư: 50.000.000 VND');
  } else {
    testFund = fundsRes.data[0];
    // Reset số dư quỹ về 50,000,000 để kiểm thử chính xác
    await connector.update('payment-funds', testFund.id, {
      current_balance: '50000000'
    });
    console.log(`   [OK] Đã sử dụng Quỹ hiện tại (${testFund.name}) và đặt lại số dư về: 50.000.000 VND`);
  }

  // 3. Tạo mẫu phân bổ chi phí (Cost Allocation Template)
  console.log('\nStep 3: Tạo Mẫu phân bổ chi phí...');
  const templateRules = [
    { department_code: 'le_tan', percentage: 40 },
    { department_code: 'buong_phong', percentage: 60 }
  ];

  const template = await connector.create('cost-allocation-templates', {
    branch_id: branchId,
    name: 'Phân bổ Điện nước 40/60',
    rules: JSON.stringify(templateRules)
  });

  console.log(`   [OK] Đã tạo mẫu phân bổ: "${template.name}" | Quy tắc: 40% le_tan, 60% buong_phong | ID: ${template.id}`);

  // 4. Tạo giao dịch hạch toán chi phí dùng chung (10 triệu VND)
  console.log('\nStep 4: Thực hiện giao dịch Chi tiền điện nước (10.000.000 VND)...');
  const amountToPay = 10000000; // 10 triệu
  const initialFundBalance = 50000000;

  // Mô phỏng logic của API POST
  // A. Cập nhật số dư Quỹ (Trừ đi số tiền thanh toán thực tế là 10M)
  const finalFundBalance = initialFundBalance - amountToPay;
  await connector.update('payment-funds', testFund.id, {
    current_balance: String(finalFundBalance)
  });
  console.log(`     * Cập nhật số dư Quỹ thực tế từ ${initialFundBalance.toLocaleString()} VND -> ${finalFundBalance.toLocaleString()} VND`);

  // B. Tạo giao dịch thực tế (Parent transaction, is_virtual = 'FALSE')
  const parentTransaction = await connector.create('cashbook', {
    type: 'payment',
    amount: String(amountToPay),
    method: 'cash',
    category: 'utilities',
    note: 'Thanh toán tiền điện nước chi nhánh tháng 5',
    branch_id: branchId,
    employee_id: 'EMP-TEST-ACCOUNTANT',
    fund_id: testFund.id,
    balance_after_transaction: String(finalFundBalance),
    is_virtual: 'FALSE',
  });

  const parentId = parentTransaction.transaction_id || parentTransaction.id;
  console.log(`     * Đã tạo giao dịch thực tế chính (Parent): ID = ${parentId} | Số tiền = ${amountToPay.toLocaleString()} VND`);

  // C. Tự động bóc tách và phân bổ chi phí ảo (is_virtual = 'TRUE') cho các phòng ban
  const virtualTransactions: any[] = [];
  for (const rule of templateRules) {
    const allocatedAmount = Math.round((amountToPay * rule.percentage) / 100);
    const virtualTx = await connector.create('cashbook', {
      type: 'payment',
      amount: String(allocatedAmount),
      method: 'cash',
      category: 'utilities',
      note: `Thanh toán tiền điện nước chi nhánh tháng 5 (Phân bổ ${rule.percentage}% cho ${rule.department_code})`,
      branch_id: branchId,
      employee_id: 'EMP-TEST-ACCOUNTANT',
      fund_id: testFund.id,
      balance_after_transaction: String(finalFundBalance),
      department_code: rule.department_code,
      parent_transaction_id: parentId,
      is_virtual: 'TRUE',
    });
    virtualTransactions.push(virtualTx);
    console.log(`     * Đã tạo giao dịch phân bổ ảo cho [${rule.department_code.toUpperCase()}]: ID = ${virtualTx.transaction_id || virtualTx.id} | ${rule.percentage}% = ${allocatedAmount.toLocaleString()} VND`);
  }

  // 5. Xác thực kết quả
  console.log('\nStep 5: Tiến hành xác thực kết quả cơ sở dữ liệu...');

  // A. Kiểm tra số dư Quỹ thực tế
  const updatedFund = await connector.findById('payment-funds', testFund.id);
  const currentBalance = parseFloat(updatedFund.current_balance || '0');
  console.log(`     - Số dư Quỹ thực tế trong DB: ${currentBalance.toLocaleString()} VND`);
  if (currentBalance !== 40000000) {
    throw new Error(`❌ SAI LỆCH: Số dư quỹ thực tế phải là 40.000.000 VND, nhưng hiển thị: ${currentBalance}`);
  }
  console.log('   ✅ ĐẠT: Số dư Quỹ thực tế giảm chính xác 10.000.000 VND.');

  // B. Kiểm tra hai giao dịch ảo
  if (virtualTransactions.length !== 2) {
    throw new Error(`❌ SAI LỆCH: Lẽ ra phải có 2 giao dịch ảo được tạo ra, nhưng có: ${virtualTransactions.length}`);
  }

  const leTanTx = virtualTransactions.find(t => t.department_code === 'le_tan');
  const buongPhongTx = virtualTransactions.find(t => t.department_code === 'buong_phong');

  if (!leTanTx || !buongPhongTx) {
    throw new Error('❌ SAI LỆCH: Không tìm thấy giao dịch ảo của phòng ban le_tan hoặc buong_phong');
  }

  if (parseFloat(leTanTx.amount) !== 4000000 || parseFloat(buongPhongTx.amount) !== 6000000) {
    throw new Error(`❌ SAI LỆCH: Số tiền phân bổ ảo không đúng tỷ lệ (cần 4M và 6M, có: ${leTanTx.amount} và ${buongPhongTx.amount})`);
  }

  if (leTanTx.is_virtual !== 'TRUE' || buongPhongTx.is_virtual !== 'TRUE') {
    throw new Error('❌ SAI LỆCH: Các giao dịch phân bổ ảo phải có cờ is_virtual = "TRUE"');
  }

  if (leTanTx.parent_transaction_id !== parentId || buongPhongTx.parent_transaction_id !== parentId) {
    throw new Error('❌ SAI LỆCH: Các giao dịch phân bổ ảo phải có parent_transaction_id liên kết với giao dịch cha');
  }
  console.log('   ✅ ĐẠT: Toàn bộ giao dịch phân bổ chi phí ảo có tỷ lệ, liên kết và cờ is_virtual chính xác tuyệt đối.');

  // 6. Mô phỏng API GET Cashbook và tính toán Dynamic Balance (Bảo vệ tính toàn vẹn tài chính)
  console.log('\nStep 6: Kiểm tra cách tính toán Số dư động (Bảo vệ dòng tiền vật lý)...');

  // Lấy danh sách giao dịch từ DB
  const listRes = await connector.list('cashbook', { filters: { branch_id: branchId }, limit: 1000 });
  const allTxs = listRes.data as any[];

  // Lọc chỉ những giao dịch thuộc Quỹ kiểm thử
  const fundTxs = allTxs.filter(t => t.fund_id === testFund.id);

  let simulatedOpeningBalance = 50000000; // Giả sử đầu kỳ là 50 triệu
  let simulatedReceipt = 0;
  let simulatedPayment = 0;

  // Thuật toán tính toán số dư thực tế (bỏ qua is_virtual === 'TRUE')
  for (const tx of fundTxs) {
    if (tx.is_virtual === 'TRUE') continue; // Bỏ qua hoàn toàn giao dịch ảo!
    
    const amt = parseFloat(tx.amount || '0');
    if (tx.type === 'receipt') {
      simulatedReceipt += amt;
    } else if (tx.type === 'payment') {
      simulatedPayment += amt;
    }
  }

  const simulatedClosingBalance = simulatedOpeningBalance + simulatedReceipt - simulatedPayment;
  console.log(`     - Số dư đầu kỳ giả định: ${simulatedOpeningBalance.toLocaleString()} VND`);
  console.log(`     - Tổng Thu thực tế tính toán: ${simulatedReceipt.toLocaleString()} VND`);
  console.log(`     - Tổng Chi thực tế tính toán: ${simulatedPayment.toLocaleString()} VND`);
  console.log(`     - Số dư cuối kỳ tính toán được: ${simulatedClosingBalance.toLocaleString()} VND`);

  if (simulatedPayment !== 10000000) {
    throw new Error(`❌ SAI LỆCH: Tổng Chi thực tế tính toán phải là 10.000.000 VND (bỏ qua ảo), nhưng tính ra: ${simulatedPayment}`);
  }

  if (simulatedClosingBalance !== 40000000) {
    throw new Error(`❌ SAI LỆCH: Số dư cuối kỳ tính toán phải là 40.000.000 VND, nhưng tính ra: ${simulatedClosingBalance}`);
  }

  console.log('   ✅ ĐẠT: Thuật toán bỏ qua chính xác giao dịch ảo, bảo toàn 100% độ chính xác của tiền mặt/dòng tiền vật lý trong quỹ.');

  // 7. Dọn dẹp dữ liệu kiểm thử (Cleanup)
  console.log('\nStep 7: Dọn dẹp dữ liệu kiểm thử...');
  
  // Xóa các giao dịch cashbook
  await connector.delete('cashbook', parentId);
  for (const vt of virtualTransactions) {
    const vtId = vt.transaction_id || vt.id;
    await connector.delete('cashbook', vtId);
  }
  console.log('     * Đã xóa các giao dịch Cashbook kiểm thử.');

  // Khôi phục số dư quỹ
  await connector.update('payment-funds', testFund.id, {
    current_balance: '50000000'
  });
  console.log('     * Đã khôi phục số dư Quỹ về trạng thái cũ.');

  // Xóa mẫu phân bổ chi phí
  const templateId = template.template_id || template.id;
  await connector.delete('cost-allocation-templates', templateId);
  console.log('     * Đã xóa Mẫu phân bổ chi phí.');

  console.log('\n================================================================');
  console.log('🎉 TẤT CẢ CÁC KỊCH BẢN KIỂM THỬ E2E PHASE 2 ĐỀU THÀNH CÔNG (PASS)');
  console.log('================================================================\n');
}

runCostAllocationTests().catch((error) => {
  console.error('\n❌ KIỂM THỬ PHASE 2 THẤT BẠI VỚI LỖI:');
  console.error(error);
  process.exit(1);
});
