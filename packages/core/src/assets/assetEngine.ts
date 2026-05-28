export interface Asset {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  unit: string;
  type: 'ccdc' | 'tscd';
  original_value: string;
  salvage_value: string;
  purchase_date: string;
  depreciation_months: string;
  depreciated_value: string;
  status: 'active' | 'depreciated' | 'disposed';
  serial_no?: string;
  manufacturer?: string;
  warranty_expiry?: string;
  supplier_id?: string;
}

export interface AssetAllocation {
  id: string;
  tenant_id: string;
  asset_id: string;
  department_code: string;
  qty: string;
  allocated_at: string;
}

export interface CashbookEntryInput {
  id: string;
  tenant_id: string;
  branch_id: string;
  type: 'income' | 'expense';
  amount: string;
  method: string; // 'cash' | 'bank'
  category: string; // 'depreciation_expense'
  reference_id: string; // asset_id
  reference_name: string; // asset_name
  note: string;
  date: string;
  fund_id: string;
  employee_id: string;
}

/**
 * Lớp xử lý nghiệp vụ Khấu hao / Phân bổ tài sản chung toàn hệ thống
 */
export class AssetEngine {
  /**
   * Tính toán giá trị khấu hao hàng tháng cho một tài sản cụ thể
   */
  static calculateMonthlyDepreciation(asset: Asset): {
    depreciationAmount: number;
    isLastPeriod: boolean;
    nextDepreciatedValue: number;
  } {
    const original = Math.max(0, Number(asset.original_value) || 0);
    const salvage = Math.max(0, Number(asset.salvage_value) || 0);
    const months = Math.max(1, Number(asset.depreciation_months) || 1);
    const currentDepreciated = Math.max(0, Number(asset.depreciated_value) || 0);

    const totalDepreciable = original - salvage;
    if (totalDepreciable <= 0 || currentDepreciated >= totalDepreciable) {
      return { depreciationAmount: 0, isLastPeriod: true, nextDepreciatedValue: currentDepreciated };
    }

    // Giá trị khấu hao chuẩn hàng tháng
    const standardMonthly = Math.floor(totalDepreciable / months);

    // Kiểm tra xem đây có phải là kỳ cuối cùng không (hoặc số tiền tích lũy vượt quá tổng khấu hao)
    const remaining = totalDepreciable - currentDepreciated;
    if (standardMonthly >= remaining || currentDepreciated + standardMonthly >= totalDepreciable) {
      return {
        depreciationAmount: remaining,
        isLastPeriod: true,
        nextDepreciatedValue: totalDepreciable,
      };
    }

    return {
      depreciationAmount: standardMonthly,
      isLastPeriod: false,
      nextDepreciatedValue: currentDepreciated + standardMonthly,
    };
  }

  /**
   * Thực hiện trích khấu hao tháng cho một tài sản và tự động ghi nhận vào Sổ quỹ
   * Giao tiếp trực tiếp thông qua DataSource connector (đảm bảo tính plug-n-play)
   */
  static async processAssetDepreciation(
    connector: any,
    asset: Asset,
    executingEmployeeId: string = 'SYSTEM'
  ): Promise<{
    success: boolean;
    postedAmount: number;
    assetStatus: string;
    cashbookId?: string;
    message?: string;
  }> {
    if (asset.status !== 'active') {
      return { success: false, postedAmount: 0, assetStatus: asset.status };
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonthPrefix = todayStr.substring(0, 7); // "YYYY-MM"
    const periodStr = `${todayStr.substring(5, 7)}/${todayStr.substring(0, 4)}`; // "MM/YYYY"

    // Kiểm tra xem tài sản đã được trích khấu hao trong tháng này chưa
    try {
      const existingLogsResult = await connector.list('asset-depreciations', {
        filters: { asset_id: asset.id },
        limit: 100,
      });
      const existingLogs = existingLogsResult.data || existingLogsResult.items || [];
      const alreadyDepreciatedThisMonth = existingLogs.some((log: any) => 
        log.depreciation_date && log.depreciation_date.startsWith(currentMonthPrefix)
      );

      if (alreadyDepreciatedThisMonth) {
        return { 
          success: false, 
          postedAmount: 0, 
          assetStatus: asset.status,
          message: `Tài sản này đã được trích khấu hao trong Kỳ ${periodStr}. Không thể thực hiện lại.`
        };
      }
    } catch (err) {
      console.error('Failed to pre-check existing depreciation logs:', err);
    }

    const { depreciationAmount, isLastPeriod, nextDepreciatedValue } =
      this.calculateMonthlyDepreciation(asset);
    
    const currentDepreciated = Number(asset.depreciated_value) || 0;

    if (depreciationAmount <= 0) {
      // Đã khấu hao hết nhưng chưa đổi status
      await connector.update('assets', asset.id, {
        status: 'depreciated',
        depreciated_value: asset.original_value,
      });
      return { success: true, postedAmount: 0, assetStatus: 'depreciated' };
    }

    // 1. Truy xuất phân bổ tài sản để phân tách chi phí cho các phòng ban (Cost Center)
    const allocationsResult = await connector.list('asset-allocations', {
      filters: { asset_id: asset.id },
      limit: 100,
    });
    const allocations: AssetAllocation[] = allocationsResult.data || allocationsResult.items || [];
    const totalAllocatedQty = allocations.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

    const assetTypeName = asset.type === 'ccdc' ? 'CCDC' : 'TSCĐ';
    const cashbookIds: string[] = [];

    // 2. Ghi nhận chi phí khấu hao vào Sổ Quỹ (Cashbook)
    if (allocations.length > 0 && totalAllocatedQty > 0) {
      // Bóc tách chi phí khấu hao cho từng bộ phận thụ hưởng theo tỷ lệ số lượng bàn giao
      for (const allocation of allocations) {
        const allocQty = Number(allocation.qty) || 0;
        if (allocQty <= 0) continue;

        const allocRatio = allocQty / totalAllocatedQty;
        const allocatedAmount = Math.round(depreciationAmount * allocRatio);

        if (allocatedAmount <= 0) continue;

        const cashbookId = `CSB-DEP-${asset.id}-${allocation.department_code}-${Date.now().toString().slice(-6)}`;
        const note = `[Khấu hao ${assetTypeName} - Kỳ ${periodStr}] Phân bổ tài sản "${asset.name}" cho Bộ phận ${allocation.department_code.toUpperCase()} (SL bàn giao: ${allocQty}/${totalAllocatedQty} chiếc)`;

        const cashbookEntry: CashbookEntryInput = {
          id: cashbookId,
          tenant_id: asset.tenant_id,
          branch_id: asset.branch_id,
          type: 'expense',
          amount: String(allocatedAmount),
          method: 'cash',
          category: 'depreciation_expense',
          reference_id: asset.id,
          reference_name: `Hao mòn Kỳ ${periodStr} - ${asset.name}`,
          note,
          date: todayStr,
          fund_id: 'SYSTEM',
          employee_id: executingEmployeeId,
        };

        // Ghi nhận trực tiếp vào cơ sở dữ liệu qua connector
        await connector.create('cashbook', cashbookEntry);
        cashbookIds.push(cashbookId);

        // Ghi lịch sử khấu hao chi tiết
        await connector.create('asset-depreciations', {
          id: `DEP-LOG-${asset.id}-${allocation.department_code}-${Date.now().toString().slice(-6)}`,
          tenant_id: asset.tenant_id,
          branch_id: asset.branch_id,
          asset_id: asset.id,
          depreciation_date: todayStr,
          amount: String(allocatedAmount),
          depreciated_value_before: String(currentDepreciated),
          depreciated_value_after: String(nextDepreciatedValue),
          department_code: allocation.department_code,
          cashbook_id: cashbookId,
          created_by: executingEmployeeId,
          updated_by: executingEmployeeId,
        });
      }
    } else {
      // Trường hợp tài sản chưa bàn giao sử dụng, khấu hao mặc định tính vào chi phí quản lý chi nhánh
      const cashbookId = `CSB-DEP-${asset.id}-${Date.now().toString().slice(-6)}`;
      const note = `[Khấu hao ${assetTypeName} - Kỳ ${periodStr}] Tài sản "${asset.name}" chưa phân bổ sử dụng (tính vào chi phí quản lý chung)`;

      const cashbookEntry: CashbookEntryInput = {
        id: cashbookId,
        tenant_id: asset.tenant_id,
        branch_id: asset.branch_id,
        type: 'expense',
        amount: String(depreciationAmount),
        method: 'cash',
        category: 'depreciation_expense',
        reference_id: asset.id,
        reference_name: `Hao mòn Kỳ ${periodStr} - ${asset.name}`,
        note,
        date: todayStr,
        fund_id: 'SYSTEM',
        employee_id: executingEmployeeId,
      };

      await connector.create('cashbook', cashbookEntry);
      cashbookIds.push(cashbookId);

      // Ghi lịch sử khấu hao chi tiết cho quản lý chung
      await connector.create('asset-depreciations', {
        id: `DEP-LOG-${asset.id}-GEN-${Date.now().toString().slice(-6)}`,
        tenant_id: asset.tenant_id,
        branch_id: asset.branch_id,
        asset_id: asset.id,
        depreciation_date: todayStr,
        amount: String(depreciationAmount),
        depreciated_value_before: String(currentDepreciated),
        depreciated_value_after: String(nextDepreciatedValue),
        department_code: 'general_management',
        cashbook_id: cashbookId,
        created_by: executingEmployeeId,
        updated_by: executingEmployeeId,
      });
    }

    // 3. Cập nhật lại giá trị đã khấu hao và trạng thái của Tài sản
    const newStatus = isLastPeriod ? 'depreciated' : 'active';
    await connector.update('assets', asset.id, {
      depreciated_value: String(nextDepreciatedValue),
      status: newStatus,
    });

    return {
      success: true,
      postedAmount: depreciationAmount,
      assetStatus: newStatus,
      cashbookId: cashbookIds.join(','),
    };
  }
}
export default AssetEngine;
