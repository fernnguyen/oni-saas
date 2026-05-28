export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireShopAccess } from '@/lib/server/shopAccess';
import { AssetEngine, Asset } from '@oni/core';
import { invalidate } from '@/lib/server/cache';
import { handleApiError } from '@/app/api/shops/_helpers';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const { connector, userId, permissions } = await requireShopAccess(shopId);

    const body = await req.json().catch(() => ({}));
    const { transaction_name } = body;

    const hasManageAccess = permissions.includes('assets.manage') || permissions.includes('settings.manage') || permissions.includes('owner') || permissions.includes('admin');
    if (!hasManageAccess) {
      return NextResponse.json({ error: 'Forbidden: no permission to manage assets' }, { status: 403 });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonthPrefix = todayStr.substring(0, 7); // "YYYY-MM"
    const periodStr = `${todayStr.substring(5, 7)}/${todayStr.substring(0, 4)}`; // "MM/YYYY"

    // Fetch existing logs for the current month
    const existingLogsRes = await connector.list('asset-depreciations', { limit: 10000 });
    const existingLogs = existingLogsRes.data || [];
    const depreciatedAssetIdsThisMonth = new Set(
      existingLogs
        .filter((log: any) => log.depreciation_date && log.depreciation_date.startsWith(currentMonthPrefix))
        .map((log: any) => log.asset_id)
    );

    // 1. Fetch all active assets and exclude those already depreciated in the current month
    const assetsRes = await connector.list('assets', { limit: 1000 });
    const activeAssets = (assetsRes.data || []).filter(
      (a: any) => a.status === 'active' && !depreciatedAssetIdsThisMonth.has(a.id)
    );

    if (activeAssets.length === 0) {
      const allActiveCount = (assetsRes.data || []).filter((a: any) => a.status === 'active').length;
      const msg = allActiveCount > 0 
        ? `Tất cả tài sản hoạt động (${allActiveCount} tài sản) đã được trích khấu hao cho Kỳ ${periodStr}. Không cần thực hiện lại.`
        : 'Không có tài sản nào ở trạng thái hoạt động cần trích khấu hao.';
      return NextResponse.json({
        success: true,
        message: msg,
        count: 0,
        totalAmount: 0,
      });
    }

    // 2. Fetch all allocations and departments
    const [allocationsRes, departmentsRes] = await Promise.all([
      connector.list('asset-allocations', { limit: 1000 }),
      connector.list('departments', { limit: 100 }),
    ]);

    const allocations = allocationsRes.data || [];
    const departmentNameMap = new Map(
      departmentsRes?.data?.map((d: any) => [d.code, d.name]) || []
    );

    // Group expenses by department code
    // Map: department_code -> { totalAmount: number, items: Array<{ name: string, serial: string, amount: number }> }
    const departmentGroup = new Map<string, { totalAmount: number, items: Array<{ name: string, serial: string, amount: number }> }>();

    let processedCount = 0;
    let totalBatchAmount = 0;
    const logsToCreate: any[] = [];

    // 3. Process each asset (calculate depreciation and update asset DB, but accumulate cashbook entries)
    for (const assetRow of activeAssets) {
      const asset: Asset = {
        id: assetRow.id,
        tenant_id: assetRow.tenant_id,
        branch_id: assetRow.branch_id,
        name: assetRow.name,
        unit: assetRow.unit,
        type: assetRow.type as 'ccdc' | 'tscd',
        original_value: assetRow.original_value,
        salvage_value: assetRow.salvage_value,
        purchase_date: assetRow.purchase_date,
        depreciation_months: assetRow.depreciation_months,
        depreciated_value: assetRow.depreciated_value,
        status: assetRow.status as 'active' | 'depreciated' | 'disposed',
        serial_no: assetRow.serial_no,
        manufacturer: assetRow.manufacturer,
        warranty_expiry: assetRow.warranty_expiry,
        supplier_id: assetRow.supplier_id,
      };

      // Calculate monthly depreciation
      const { depreciationAmount, isLastPeriod, nextDepreciatedValue } =
        AssetEngine.calculateMonthlyDepreciation(asset);

      if (depreciationAmount <= 0) {
        // Update status if fully depreciated but active
        await connector.update('assets', asset.id, {
          status: 'depreciated',
          depreciated_value: asset.original_value,
        });
        continue;
      }

      processedCount++;
      totalBatchAmount += depreciationAmount;

      // Find allocations for this specific asset
      const assetAllocs = allocations.filter((alloc: any) => alloc.asset_id === asset.id);
      const totalAllocatedQty = assetAllocs.reduce((sum: number, item: any) => sum + (Number(item.qty) || 0), 0);

      if (assetAllocs.length > 0 && totalAllocatedQty > 0) {
        // Distribute cost to departments
        assetAllocs.forEach((alloc: any) => {
          const allocQty = Number(alloc.qty) || 0;
          if (allocQty <= 0) return;

          const ratio = allocQty / totalAllocatedQty;
          const allocatedAmount = Math.round(depreciationAmount * ratio);

          if (allocatedAmount <= 0) return;

          const deptCode = alloc.department_code;
          if (!departmentGroup.has(deptCode)) {
            departmentGroup.set(deptCode, { totalAmount: 0, items: [] });
          }
          const group = departmentGroup.get(deptCode)!;
          group.totalAmount += allocatedAmount;
          group.items.push({
            name: asset.name,
            serial: asset.serial_no || 'Không có S/N',
            amount: allocatedAmount,
          });

          // Accumulate logs in memory to save with the cashbook ID later
          logsToCreate.push({
            id: `DEP-LOG-${asset.id}-${deptCode}-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(-3)}`,
            tenant_id: asset.tenant_id,
            branch_id: asset.branch_id,
            asset_id: asset.id,
            depreciation_date: todayStr,
            amount: String(allocatedAmount),
            depreciated_value_before: String(asset.depreciated_value || '0'),
            depreciated_value_after: String(nextDepreciatedValue),
            department_code: deptCode,
            created_by: userId,
            updated_by: userId,
          });
        });
      } else {
        // Put in general management
        const deptCode = 'general_management';
        if (!departmentGroup.has(deptCode)) {
          departmentGroup.set(deptCode, { totalAmount: 0, items: [] });
        }
        const group = departmentGroup.get(deptCode)!;
        group.totalAmount += depreciationAmount;
        group.items.push({
          name: asset.name,
          serial: asset.serial_no || 'Không có S/N',
          amount: depreciationAmount,
        });

        // Accumulate logs in memory to save with the cashbook ID later
        logsToCreate.push({
          id: `DEP-LOG-${asset.id}-GEN-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(-3)}`,
          tenant_id: asset.tenant_id,
          branch_id: asset.branch_id,
          asset_id: asset.id,
          depreciation_date: todayStr,
          amount: String(depreciationAmount),
          depreciated_value_before: String(asset.depreciated_value || '0'),
          depreciated_value_after: String(nextDepreciatedValue),
          department_code: deptCode,
          created_by: userId,
          updated_by: userId,
        });
      }

      // Update asset depreciated value and status in the DB
      const newStatus = isLastPeriod ? 'depreciated' : 'active';
      await connector.update('assets', asset.id, {
        depreciated_value: String(nextDepreciatedValue),
        status: newStatus,
      });
    }

    // 4. Create summarized Cashbook entries for each department
    const tenantId = activeAssets[0]?.tenant_id || '';
    const branchId = activeAssets[0]?.branch_id || '';

    // Keep track of department cashbook IDs
    const departmentCashbookIds = new Map<string, string>();

    for (const [deptCode, group] of departmentGroup.entries()) {
      if (group.totalAmount <= 0) continue;

      const deptName = departmentNameMap.get(deptCode) || (deptCode === 'general_management' ? 'Quản lý chung' : deptCode);
      const cashbookId = `CSB-DEP-BATCH-${deptCode.toUpperCase()}-${Date.now().toString().slice(-6)}`;
      departmentCashbookIds.set(deptCode, cashbookId);

      // Build a beautiful, high-fidelity list of equipment
      let note = `[Khấu hao hàng loạt - Kỳ ${periodStr}] Chi phí hao mòn tài sản phân bổ cho Bộ phận: ${deptName.toUpperCase()}.\n\n`;
      note += `Danh sách thiết bị đóng góp chi tiết:\n`;
      group.items.forEach((item, index) => {
        note += `${index + 1}. ${item.name} (${item.serial}) - Số tiền trích: ${item.amount.toLocaleString('vi-VN')} đ\n`;
      });
      note += `\n--------------------------------------------------\n`;
      note += `Tổng chi phí trích khấu hao Kỳ ${periodStr}: ${group.totalAmount.toLocaleString('vi-VN')} đ`;

      const cashbookEntry = {
        id: cashbookId,
        tenant_id: tenantId,
        branch_id: branchId,
        type: 'expense',
        amount: String(group.totalAmount),
        method: 'cash',
        category: 'depreciation_expense',
        reference_id: 'BATCH-DEPRECIATION',
        reference_name: `${transaction_name || 'Hao mòn Kỳ ' + periodStr} - BP ${deptName}`,
        note,
        date: todayStr,
        fund_id: 'SYSTEM',
        employee_id: userId,
        department_code: deptCode,
        is_virtual: 'FALSE', // Set to FALSE so it is visible in Sổ quỹ (Cashbook) by default!
      };

      await connector.create('cashbook', cashbookEntry);
    }

    // 4.5. Write the individual asset depreciation log records linked to their respective Cashbook ID
    if (logsToCreate.length > 0) {
      const logsWithCashbook = logsToCreate.map(log => ({
        ...log,
        cashbook_id: departmentCashbookIds.get(log.department_code) || null,
      }));
      await connector.batchCreate('asset-depreciations', logsWithCashbook);
    }

    // 5. Clear cache
    invalidate(shopId, 'assets');
    invalidate(shopId, 'cashbook');
    invalidate(shopId, 'asset-depreciations');

    return NextResponse.json({
      success: true,
      message: `Đã trích khấu hao hàng loạt thành công cho ${processedCount} tài sản.`,
      count: processedCount,
      totalAmount: totalBatchAmount,
    });
  } catch (e) {
    return handleApiError(e, 'POST batch-depreciate assets');
  }
}
