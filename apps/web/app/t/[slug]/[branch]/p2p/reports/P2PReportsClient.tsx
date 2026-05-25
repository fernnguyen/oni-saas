'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TagBadge } from '@/app/components/ui/TagBadge';
import { CopyableId } from '@/app/components/ui/CopyableId';
import { SearchBar } from '@/app/components/ui/SearchBar';

interface Props {
  shopId: string;
  shopName: string;
  userId: string;
}

type Tab = '3-way-match' | 'savings' | 'spend';

export function P2PReportsClient({ shopId, userId, shopName }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('3-way-match');
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Fetch user permissions inside tenant
  const { data: permissionsData, isLoading: isLoadingPermissions } = useQuery({
    queryKey: ['user-permissions', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/settings`);
      return res.json();
    },
  });

  const canViewPricing = useMemo(() => {
    return permissionsData?.permissions?.some((p: string) =>
      ['admin', 'owner', 'purchaser', 'purchasing.manage', 'chief_accountant', 'settings.manage'].includes(p)
    ) || false;
  }, [permissionsData]);

  const hasReportPermission = useMemo(() => {
    return permissionsData?.permissions?.some((p: string) =>
      ['admin', 'owner', 'purchaser', 'purchasing.manage', 'chief_accountant', 'settings.manage', 'reports.view_shop'].includes(p)
    ) || false;
  }, [permissionsData]);

  // 2. Fetch real database entities for true P2P reports calculation
  const { data: posData, isLoading: isLoadingPOs } = useQuery({
    queryKey: ['p2p-reports-pos', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/p2p?entity=purchase-orders&limit=200`);
      if (!res.ok) throw new Error('Không tải được danh sách đơn PO');
      return res.json() as Promise<{ data: Record<string, string>[] }>;
    },
  });

  const { data: grnsData, isLoading: isLoadingGRNs } = useQuery({
    queryKey: ['p2p-reports-grns', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/p2p?entity=goods-receipt-notes&limit=200`);
      if (!res.ok) throw new Error('Không tải được danh sách phiếu GRN');
      return res.json() as Promise<{ data: Record<string, string>[] }>;
    },
  });

  const { data: productsData, isLoading: isLoadingProducts } = useQuery({
    queryKey: ['p2p-reports-products', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/products?limit=500`);
      if (!res.ok) throw new Error('Không tải được danh sách sản phẩm');
      return res.json() as Promise<{ data: Record<string, any>[] }>;
    },
  });

  const { data: poItemsData, isLoading: isLoadingPOItems } = useQuery({
    queryKey: ['p2p-reports-po-items', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/p2p?entity=purchase-order-items&limit=1000`);
      if (!res.ok) throw new Error('Không tải được danh sách mặt hàng đơn PO');
      return res.json() as Promise<{ data: Record<string, string>[] }>;
    },
  });

  const { data: grnItemsData, isLoading: isLoadingGRNItems } = useQuery({
    queryKey: ['p2p-reports-grn-items', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/p2p?entity=goods-receipt-note-items&limit=1000`);
      if (!res.ok) throw new Error('Không tải được danh sách mặt hàng phiếu GRN');
      return res.json() as Promise<{ data: Record<string, string>[] }>;
    },
  });

  // 3. Compute 100% dynamic 3-Way Match discrepancy records from database
  const real3WayMatches = useMemo(() => {
    const pos = posData?.data || [];
    const grns = grnsData?.data || [];
    const grnItems = grnItemsData?.data || [];
    const poItems = poItemsData?.data || [];

    const list: any[] = [];

    grns.forEach(grn => {
      // Find associated PO
      const po = pos.find(p => p.id === grn.purchase_order_id);
      if (!po) return;

      // Find items belonging to this GRN
      const itemsInGrn = grnItems.filter(gi => gi.grn_id === grn.id);

      itemsInGrn.forEach(grnItem => {
        // Find matching item in PO
        const poItem = poItems.find(pi => pi.purchase_order_id === po.id && pi.product_id === grnItem.product_id);

        const qtyPo = parseFloat(poItem?.qty || grnItem.qty_ordered || '0');
        const qtyGrn = parseFloat(grnItem.qty_received || '0');
        const pricePo = parseFloat(poItem?.actual_unit_price || '0');
        const priceGrn = parseFloat(grnItem.unit_cost || '0');

        let status = 'MATCH';
        let label = 'Khớp 100%';
        let color: 'green' | 'yellow' | 'red' = 'green';

        if (priceGrn !== pricePo) {
          status = 'PRICE_DISCREPANCY';
          label = 'Lệch giá NCC';
          color = 'red';
        } else if (qtyGrn < qtyPo) {
          status = 'SHORTAGE';
          label = 'Giao thiếu hàng';
          color = 'yellow';
        }

        list.push({
          id: grn.id,
          grnNo: grn.grn_no || grn.id,
          poId: po.id,
          product: grnItem.product_name || poItem?.product_name || 'Hàng hóa',
          qtyPo,
          qtyGrn,
          pricePo,
          priceGrn,
          status,
          label,
          color
        });
      });
    });

    return list;
  }, [posData, grnsData, grnItemsData, poItemsData]);

  // 4. Compute 100% dynamic cost savings by comparing PO items and catalog retail prices
  const realSavingsList = useMemo(() => {
    const pos = posData?.data || [];
    const poItems = poItemsData?.data || [];
    const products = productsData?.data || [];

    const list: any[] = [];

    pos.forEach(po => {
      if (po.status !== 'RECEIVED' && po.status !== 'APPROVED') return;

      const itemsInPo = poItems.filter(pi => pi.purchase_order_id === po.id);

      itemsInPo.forEach(poItem => {
        const qty = parseFloat(poItem.qty || '0');
        const buyPrice = parseFloat(poItem.actual_unit_price || '0');
        if (qty === 0 || buyPrice === 0) return;

        // Find the actual product in store product catalog to pull standard retail price
        const product = products.find(p => p.id === poItem.product_id);
        const mktPrice = product?.price ? parseFloat(product.price) : buyPrice;

        const diffPct = mktPrice > buyPrice ? ((mktPrice - buyPrice) / mktPrice) * 100 : 0;
        const totalSaved = mktPrice > buyPrice ? (mktPrice - buyPrice) * qty : 0;

        list.push({
          id: poItem.id,
          productId: poItem.product_id,
          name: poItem.product_name || product?.name || 'Sản phẩm',
          category: product?.category_name || 'Linh kiện & Hàng hóa',
          mktPrice,
          buyPrice,
          qty,
          diffPct,
          totalSaved,
          supplier: po.supplier_name || 'Nhà cung cấp'
        });
      });
    });

    return list;
  }, [posData, poItemsData, productsData]);

  // 5. Compute real spend breakdowns grouped by Supplier
  const supplierSpendBreakdown = useMemo(() => {
    const pos = posData?.data || [];
    const spendMap = new Map<string, number>();

    let grandTotal = 0;
    pos.forEach(po => {
      if (po.status !== 'RECEIVED' && po.status !== 'APPROVED') return;
      const amt = parseFloat(po.total_amount || '0');
      const supplier = po.supplier_name || 'Nhà cung cấp khác';
      spendMap.set(supplier, (spendMap.get(supplier) || 0) + amt);
      grandTotal += amt;
    });

    const list: any[] = [];
    spendMap.forEach((amt, supplier) => {
      const pct = grandTotal > 0 ? (amt / grandTotal) * 100 : 0;
      list.push({
        name: supplier,
        amount: amt,
        pct
      });
    });

    return list.sort((a, b) => b.amount - a.amount).slice(0, 4);
  }, [posData]);

  // 6. Overall global dynamic metrics
  const aggregatedStats = useMemo(() => {
    const pos = posData?.data || [];
    const grns = grnsData?.data || [];

    const totalSpend = pos
      .filter(p => p.status === 'RECEIVED' || p.status === 'APPROVED')
      .reduce((sum, p) => sum + parseFloat(p.total_amount || '0'), 0);

    const approvedCount = pos.filter(p => p.status === 'APPROVED').length;
    const completedGrnMatches = grns.filter(g => g.status === 'COMPLETED').length;

    const totalSavings = realSavingsList.reduce((sum, item) => sum + item.totalSaved, 0);
    const avgSavingsPct = realSavingsList.length > 0 
      ? realSavingsList.reduce((sum, item) => sum + item.diffPct, 0) / realSavingsList.length 
      : 0;

    return {
      totalSpend,
      approvedCount,
      completedGrnMatches,
      totalSavings,
      avgSavingsPct
    };
  }, [posData, grnsData, realSavingsList]);

  // Filter 3-Way Matches table rows by query
  const filteredMatches = useMemo(() => {
    if (!searchQuery) return real3WayMatches;
    const q = searchQuery.toLowerCase();
    return real3WayMatches.filter(
      item =>
        item.id.toLowerCase().includes(q) ||
        item.poId.toLowerCase().includes(q) ||
        item.product.toLowerCase().includes(q)
    );
  }, [searchQuery, real3WayMatches]);

  if (isLoadingPermissions || isLoadingPOs || isLoadingGRNs || isLoadingProducts || isLoadingPOItems || isLoadingGRNItems) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
          <span className="text-sm font-medium text-slate-500 animate-pulse">Đang kết nối hệ thống dữ liệu P2P...</span>
        </div>
      </div>
    );
  }

  if (!hasReportPermission) {
    return (
      <div className="flex h-96 items-center justify-center rounded-2xl border border-dashed border-red-200 bg-red-50/10 p-8 shadow-sm max-w-2xl mx-auto my-8">
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          </div>
          <h3 className="text-lg font-bold text-red-800">Quyền truy cập Báo cáo bị hạn chế</h3>
          <p className="text-sm text-red-600 max-w-md">
            Tài khoản của bạn không được phân quyền xem Báo cáo Quản trị Mua hàng (`reports.view_shop`). Vui lòng liên hệ Owner hoặc Quản trị viên chi nhánh để cấp quyền truy cập.
          </p>
        </div>
      </div>
    );
  }

  const isDatabaseEmpty = posData?.data.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Báo cáo Vận hành Mua hàng & Phê duyệt P2P</h1>
          <p className="mt-1 text-sm text-slate-500">
            Báo cáo chi tiết hoạt động đặt hàng, đối soát nhập kho và phân tích chi tiêu với các nhà cung cấp tại chi nhánh <strong className="font-semibold text-slate-800">{shopName}</strong>.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Tổng chi mua sắm thực</span>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {canViewPricing ? (
                `${aggregatedStats.totalSpend.toLocaleString('vi-VN')} đ`
              ) : (
                '***.*** đ'
              )}
            </h3>
            <p className="mt-1 text-[11px] text-slate-500 flex items-center gap-1">
              <span className="font-semibold text-emerald-600">+{aggregatedStats.approvedCount} đơn PO</span> chờ giao hàng
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Tiền tiết kiệm đàm phán</span>
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-extrabold text-blue-600 tracking-tight">
              {canViewPricing ? (
                `+${aggregatedStats.totalSavings.toLocaleString('vi-VN')} đ`
              ) : (
                '***.*** đ'
              )}
            </h3>
            <p className="mt-1 text-[11px] text-slate-500 flex items-center gap-1">
              Tối ưu ngân sách thực tế trong kho
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Đã nhập đối soát (GRN)</span>
            <div className="rounded-lg bg-purple-500/10 p-2 text-purple-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {aggregatedStats.completedGrnMatches} Phiếu
            </h3>
            <p className="mt-1 text-[11px] text-slate-500 flex items-center gap-1">
              Khớp <span className="font-semibold text-emerald-600">100%</span> thủ kho thực nhận
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Tỷ lệ tiết kiệm bình quân</span>
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-extrabold text-amber-600 tracking-tight">
              {canViewPricing ? `${aggregatedStats.avgSavingsPct.toFixed(1)}%` : '***%'}
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">
              So với giá niêm yết bán lẻ trong danh mục
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100">
        <div className="flex space-x-6">
          <button
            onClick={() => setActiveTab('3-way-match')}
            className={`pb-4 text-sm font-semibold border-b-2 transition-all ${
              activeTab === '3-way-match'
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Đối chiếu chéo 3 bên (3-Way Match)
          </button>
          <button
            onClick={() => setActiveTab('savings')}
            className={`pb-4 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'savings'
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Hiệu quả tiết kiệm chi tiêu
          </button>
          <button
            onClick={() => setActiveTab('spend')}
            className={`pb-4 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'spend'
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Phân bổ chi tiêu & NCC
          </button>
        </div>
      </div>

      {/* Report Body */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
        {isDatabaseEmpty ? (
          <div className="text-center py-12 space-y-4 max-w-lg mx-auto">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            </div>
            <h3 className="text-lg font-bold text-slate-800">Chưa có giao dịch mua sắm P2P</h3>
            <p className="text-sm text-slate-500">
              Hệ thống sẽ tự động cập nhật dữ liệu báo cáo ngay sau khi chi nhánh phát sinh các giao dịch Đề xuất mua hàng (PR), Đơn đặt hàng (PO) hoặc Phiếu nhập kho đối chiếu (GRN).
            </p>
          </div>
        ) : (
          <>
            {activeTab === '3-way-match' && (
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Kiểm soát chênh lệch 3 bên thực tế (PR vs PO vs GRN)</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Đối soát chênh lệch số lượng thực tế nhận được và đơn giá NCC tính tiền so với PO gốc được duyệt ban đầu.
                    </p>
                  </div>
                  <div className="w-full md:w-72">
                    <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Tìm mã phiếu, sản phẩm..." />
                  </div>
                </div>

                {filteredMatches.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 italic text-sm">Không tìm thấy phiếu đối soát chênh lệch nào phù hợp.</div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
                    <table className="min-w-full divide-y divide-slate-100 text-sm">
                      <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-400 text-left">
                        <tr>
                          <th className="px-4 py-3">Mã phiếu GRN</th>
                          <th className="px-4 py-3">PO liên kết</th>
                          <th className="px-4 py-3">Sản phẩm đối chiếu</th>
                          <th className="px-4 py-3 text-center">Đặt (PO)</th>
                          <th className="px-4 py-3 text-center">Thực nhận (GRN)</th>
                          <th className="px-4 py-3 text-right">Chênh lệch giá trị</th>
                          <th className="px-4 py-3 text-center">Kết quả đối soát</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {filteredMatches.map((row, idx) => {
                          const diffQty = row.qtyGrn - row.qtyPo;
                          const diffPrice = row.priceGrn - row.pricePo;
                          const isPriceDiff = diffPrice !== 0;

                          let diffLabel = '0 đ';
                          let diffClass = 'text-slate-500 font-medium';

                          if (isPriceDiff) {
                            const totalDiff = diffPrice * row.qtyGrn;
                            diffLabel = `${totalDiff > 0 ? '+' : ''}${totalDiff.toLocaleString('vi-VN')} đ (Lệch giá)`;
                            diffClass = 'text-red-500 font-bold';
                          } else if (diffQty < 0) {
                            diffLabel = `${(diffQty * row.pricePo).toLocaleString('vi-VN')} đ (Thiếu ${Math.abs(diffQty)})`;
                            diffClass = 'text-amber-600 font-bold';
                          }

                          return (
                            <tr key={`${row.id}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3 font-semibold text-slate-800"><CopyableId id={row.grnNo} className="text-xs" /></td>
                              <td className="px-4 py-3 text-slate-650"><CopyableId id={row.poId} className="text-xs" /></td>
                              <td className="px-4 py-3 font-medium text-slate-800">{row.product}</td>
                              <td className="px-4 py-3 text-center font-bold text-slate-600">{row.qtyPo}</td>
                              <td className="px-4 py-3 text-center font-bold text-slate-800">{row.qtyGrn}</td>
                              <td className={`px-4 py-3 text-right ${diffClass}`}>
                                {canViewPricing ? diffLabel : '***.***'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <TagBadge label={row.label} color={row.color} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="rounded-xl bg-amber-50 p-4 border border-amber-200/50 text-xs text-amber-800 flex gap-2.5 items-start mt-2 shadow-sm">
                  <div className="mt-0.5 shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-amber-600"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="9" x2="12.01" y2="9"/></svg>
                  </div>
                  <div>
                    <span className="font-bold flex items-center gap-1 mb-0.5">Cơ chế kiểm soát chênh lệch:</span>
                    Hệ thống tự động đối chiếu số lượng thực tế nhận được và đơn giá nhà cung cấp tính tiền so với đơn đặt hàng đã duyệt ban đầu (<strong>3-Way Match</strong>). Nếu phát hiện thiếu hụt số lượng hoặc sai lệch đơn giá, hệ thống sẽ cảnh báo ngăn chặn thanh toán đầu ra.
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'savings' && (
              <div className="space-y-4">
                <div className="pb-2">
                  <h3 className="text-base font-bold text-slate-800">Hiệu quả tiết kiệm chi tiêu mua sắm thực tiễn</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Thống kê tỷ lệ thương lượng và giảm thiểu chi phí đầu vào so với đơn giá niêm yết bán lẻ trong danh mục sản phẩm của hệ thống.
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
                  <table className="min-w-full divide-y divide-slate-100 text-sm">
                    <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-400 text-left">
                      <tr>
                        <th className="px-4 py-3">Tên sản phẩm</th>
                        <th className="px-4 py-3">Nhà cung cấp giao</th>
                        <th className="px-4 py-3 text-center">Số lượng</th>
                        <th className="px-4 py-3 text-right">Giá niêm yết (Danh mục)</th>
                        <th className="px-4 py-3 text-right">Giá mua thực tế (PO)</th>
                        <th className="px-4 py-3 text-center">Tiết kiệm (%)</th>
                        <th className="px-4 py-3 text-right">Tổng tiền tiết kiệm</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {realSavingsList.map((row, idx) => (
                        <tr key={`${row.id}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-800">{row.name}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs font-medium">{row.supplier}</td>
                          <td className="px-4 py-3 text-center font-bold text-slate-600">{row.qty}</td>
                          <td className="px-4 py-3 text-right text-slate-500 font-medium">
                            {canViewPricing ? `${Math.round(row.mktPrice).toLocaleString('vi-VN')} đ` : '***.***'}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-emerald-600">
                            {canViewPricing ? `${Math.round(row.buyPrice).toLocaleString('vi-VN')} đ` : '***.***'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600">
                              ↓ {row.diffPct.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-extrabold text-emerald-600">
                            {canViewPricing ? `+${Math.round(row.totalSaved).toLocaleString('vi-VN')} đ` : '***.***'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="text-[11px] text-slate-400 italic">
                  * Giá niêm yết (Danh mục) được đối soát tự động từ trường giá bán lẻ (Retail Price) được cấu hình trong danh mục sản phẩm của chi nhánh.
                </div>

                <div className="rounded-xl bg-emerald-50 p-4 border border-emerald-200/50 text-xs text-emerald-800 flex gap-2.5 items-start mt-2 shadow-sm">
                  <div className="mt-0.5 shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-emerald-600"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="9" x2="12.01" y2="9"/></svg>
                  </div>
                  <div>
                    <span className="font-bold flex items-center gap-1 mb-0.5">Hiệu quả kiểm soát chi phí:</span>
                    Dữ liệu chứng minh năng lực đàm phán tối ưu đơn giá đầu vào so với đơn giá bán lẻ niêm yết trong danh mục. Giá trị tiết kiệm này trực tiếp gia tăng biên lợi nhuận gộp và tự động cập nhật vào giá vốn bình quân di động (MAC).
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'spend' && (
              <div className="space-y-4">
                <div className="pb-2">
                  <h3 className="text-base font-bold text-slate-800">Báo cáo phân bổ dòng tiền chi mua theo Nhà cung cấp</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Phân tích chi tiết tỷ trọng ngân sách chi mua sắm thực tiễn chảy về các nhà cung cấp khác nhau, giúp đàm phán hợp đồng giá sỉ đặc quyền.
                  </p>
                </div>

                {supplierSpendBreakdown.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 italic text-sm">Chưa có giao dịch chi tiêu mua sắm được ghi nhận trên hệ thống.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    <div className="space-y-4 rounded-xl border border-slate-100 p-5 bg-white shadow-sm flex flex-col justify-center">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Phân bổ chi tiêu thực tế theo Nhà cung cấp</h4>
                      <div className="space-y-3.5">
                        {supplierSpendBreakdown.map((row, idx) => (
                          <div key={`${row.name}-${idx}`}>
                            <div className="flex justify-between text-xs text-slate-600 mb-1 font-semibold">
                              <span>{row.name}</span>
                              <span>{row.pct.toFixed(1)}% ({canViewPricing ? `${row.amount.toLocaleString('vi-VN')} đ` : '***.*** đ'})</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2.5">
                              <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: `${row.pct}%` }}></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-100 p-5 bg-white shadow-sm flex flex-col justify-between">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Thông số đối soát công nợ & giá vốn di động (BOM)</h4>
                        <p className="text-xs text-slate-500">
                          Mỗi giao dịch mua sắm khi hoàn tất qua phiếu nhập kho đối chiếu GRN sẽ ngay lập tức:
                        </p>
                      </div>
                      
                      <div className="space-y-2.5 my-4">
                        <div className="flex items-center gap-2 text-xs text-slate-700 font-medium">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 font-bold text-[10px]">1</span>
                          <span>Tự động cập nhật công nợ phải trả Nhà cung cấp</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-700 font-medium">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 font-bold text-[10px]">2</span>
                          <span>Tự động tăng số lượng tồn kho theo chi nhánh nhận</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-700 font-medium">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 font-bold text-[10px]">3</span>
                          <span>Tính toán lại giá vốn bình quân di động (MAC) thời gian thực</span>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400 italic">
                        * Giá trị được tính toán và ghi nhận chính xác từ cơ sở dữ liệu Postgres ERP của hệ thống ONI.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
