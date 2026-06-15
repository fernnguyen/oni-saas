import React, {useState, useCallback, useRef} from 'react';
import {Text, View, ScrollView, TouchableOpacity, Platform, Alert, ActivityIndicator} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router, useFocusEffect} from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {db} from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import {usePermissions} from '../../lib/auth/PermissionsContext';
import {eq} from 'drizzle-orm';
import {KeepAliveManager} from '../../lib/sync/KeepAliveManager';
import {getApiBaseUrl, getApiHeaders} from '../../lib/api/config';

// Import UI components dùng chung cao cấp
import {Header} from '../../components/layout/Header';
import {Badge} from '../../components/ui/Badge';
import {Skeleton} from '../../components/ui/Skeleton';
import {DrawerMenu} from '../../components/erp/DrawerMenu';
import {formatCurrency} from '../../lib/utils/format';

export default function DashboardScreen() {
  const {hasPermission, reloadPermissions} = usePermissions();
  const canViewReports = hasPermission('reports.view_shop');

  const [selectedTimeRange, setSelectedTimeRange] = useState('30days'); // today, 7days, 30days
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [branchName, setBranchName] = useState('Chi nhánh chính');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeShiftIdState, setActiveShiftIdState] = useState<string | null>(null);
  const [roleCode, setRoleCode] = useState<string>('staff');
  const [cacheStatus, setCacheStatus] = useState<string>('');

  const lastLoadedKeyRef = useRef<string>('');

  const [stats, setStats] = useState({
    todayRevenue: 0,
    todayOrders: 0,
    monthRevenue: 0,
    monthOrders: 0,
    aov: 0,
    refundRevenue: 0,
    refundCount: 0,
    expectedClosingCash: 0,
    topProducts: [] as Array<{name: string; qty: number; percentage: number; icon: string}>,
    chartData: [] as Array<{day: string; amount: number; height: number; isPeak: boolean}>,
    todayGrowth: '+0.0%',
    monthGrowth: '+0.0%',
    aovGrowth: '+0.0%',
    refundRate: '0.0%'
  });

  const getShiftTopProductsOffline = async (shiftId: string) => {
    try {
      const activeShiftOrders = await db.select({ id: schema.orders.id })
        .from(schema.orders)
        .where(eq(schema.orders.shift_id, shiftId));
      const orderIds = activeShiftOrders.map((o: any) => o.id);
      if (orderIds.length === 0) return [];

      const allOrderItems = await db.select().from(schema.order_items);
      const shiftItems = allOrderItems.filter((it: any) => orderIds.includes(it.order_id));

      const productMap: Record<string, {name: string; qty: number}> = {};
      shiftItems.forEach((it: any) => {
        if (!productMap[it.product_id]) {
          productMap[it.product_id] = {name: it.product_name, qty: 0};
        }
        productMap[it.product_id].qty += it.qty;
      });

      const sortedProds = Object.values(productMap)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      const maxQty = sortedProds.length > 0 ? sortedProds[0].qty : 1;
      return sortedProds.map(p => {
        let icon = 'cafe-outline';
        const nameLower = p.name.toLowerCase();
        if (nameLower.includes('cà phê') || nameLower.includes('coffee')) icon = 'cafe-outline';
        else if (nameLower.includes('trà') || nameLower.includes('juice')) icon = 'wine-outline';
        else if (nameLower.includes('bánh mì') || nameLower.includes('bread')) icon = 'restaurant-outline';
        else if (nameLower.includes('nước') || nameLower.includes('suối')) icon = 'water-outline';

        return {
          name: p.name,
          qty: p.qty,
          percentage: Math.round((p.qty / maxQty) * 100),
          icon,
        };
      });
    } catch (e) {
      console.warn('Lỗi tính sản phẩm bán chạy offline cho ca:', e);
      return [];
    }
  };

  const loadFallbackOffline = async (isOwner: boolean, shopId: string, shiftId: string | null) => {
    try {
      let allOrders = await db.select().from(schema.orders);
      let allOrderItems = await db.select().from(schema.order_items);

      if (isOwner) {
        // Tính toán thô cho Owner
        const todayMs = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
        const yesterdayMs = todayMs - 86400000;
        
        const todayOrdersList = allOrders.filter((o: any) => {
          const t = new Date(o.created_at || 0).getTime();
          return t >= todayMs && o.status !== 'returned';
        });
        const todayRevenue = todayOrdersList.reduce((sum: number, o: any) => sum + o.total_amount, 0);
        const todayOrders = todayOrdersList.length;

        // Tính tăng trưởng so với ngày hôm qua
        const yesterdayOrdersList = allOrders.filter((o: any) => {
          const t = new Date(o.created_at || 0).getTime();
          return t >= yesterdayMs && t < todayMs && o.status !== 'returned';
        });
        const yesterdayRevenue = yesterdayOrdersList.reduce((sum: number, o: any) => sum + o.total_amount, 0);
        let todayGrowth = '+0.0%';
        if (yesterdayRevenue > 0) {
          const g = ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100;
          todayGrowth = (g >= 0 ? '+' : '') + g.toFixed(1) + '%';
        }

        const monthOrdersList = allOrders.filter((o: any) => o.status !== 'returned');
        const monthRevenue = monthOrdersList.reduce((sum: number, o: any) => sum + o.total_amount, 0);
        const monthOrders = monthOrdersList.length;
        const aovVal = monthOrders > 0 ? Math.round(monthRevenue / monthOrders) : 0;
        const todayAov = todayOrders > 0 ? Math.round(todayRevenue / todayOrders) : 0;
        const yesterdayAov = yesterdayOrdersList.length > 0 ? Math.round(yesterdayRevenue / yesterdayOrdersList.length) : 0;
        
        let aovGrowth = '+0.0%';
        if (yesterdayAov > 0) {
          const g = ((todayAov - yesterdayAov) / yesterdayAov) * 100;
          aovGrowth = (g >= 0 ? '+' : '') + g.toFixed(1) + '%';
        }

        // Bestsellers
        const productMap: Record<string, {name: string; qty: number}> = {};
        allOrderItems.forEach((it: any) => {
          if (!productMap[it.product_id]) {
            productMap[it.product_id] = {name: it.product_name, qty: 0};
          }
          productMap[it.product_id].qty += it.qty;
        });
        const sortedProds = Object.values(productMap)
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 5);
        const maxQty = sortedProds.length > 0 ? sortedProds[0].qty : 1;
        const topProductsMapped = sortedProds.map(p => {
          let icon = 'cafe-outline';
          const nameLower = p.name.toLowerCase();
          if (nameLower.includes('cà phê') || nameLower.includes('coffee')) icon = 'cafe-outline';
          else if (nameLower.includes('trà') || nameLower.includes('juice')) icon = 'wine-outline';
          else if (nameLower.includes('bánh mì') || nameLower.includes('bread')) icon = 'restaurant-outline';
          else if (nameLower.includes('nước') || nameLower.includes('suối')) icon = 'water-outline';
          return {
            name: p.name,
            qty: p.qty,
            percentage: Math.round((p.qty / maxQty) * 100),
            icon,
          };
        });

        // Chart 7 ngày thô
        const dateMap: Record<string, number> = {};
        allOrders.forEach((o: any) => {
          const dateStr = o.created_at ? o.created_at.substring(5, 10) : '05-26';
          dateMap[dateStr] = (dateMap[dateStr] || 0) + o.total_amount;
        });
        const days: string[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          days.push(`${month}-${day}`);
        }
        let maxAmount = 10000;
        const chartDataMapped = days.map(day => {
          const amount = dateMap[day] || 0;
          if (amount > maxAmount) maxAmount = amount;
          return { day, amount };
        });
        const finalChartData = chartDataMapped.map(item => ({
          day: item.day,
          amount: item.amount,
          height: Math.max(5, Math.round((item.amount / maxAmount) * 85)),
          isPeak: false
        }));
        const peakAmount = Math.max(...finalChartData.map((c: any) => c.amount));
        finalChartData.forEach((c: any) => {
          c.isPeak = c.amount === peakAmount && c.amount > 0;
        });

        setStats({
          todayRevenue,
          todayOrders,
          monthRevenue,
          monthOrders,
          aov: aovVal,
          refundRevenue: 0,
          refundCount: 0,
          expectedClosingCash: 0,
          topProducts: topProductsMapped,
          chartData: finalChartData,
          todayGrowth,
          monthGrowth: '+4.8%',
          aovGrowth,
          refundRate: '0.0%'
        });
        setCacheStatus('OFFLINE ⚠️');

      } else if (shiftId) {
        // Tính toán thô cho Cashier
        const shiftOrdersList = allOrders.filter((o: any) => o.shift_id === shiftId);
        const todayRevenue = shiftOrdersList.reduce((sum: number, o: any) => sum + o.total_amount, 0);
        const todayOrders = shiftOrdersList.length;
        const aovVal = todayOrders > 0 ? Math.round(todayRevenue / todayOrders) : 0;

        // Tính tiền mặt két từ local shifts + cashbook
        const localShift = await db.select().from(schema.shop_shifts).where(eq(schema.shop_shifts.id, shiftId)).limit(1);
        const opCash = localShift.length > 0 ? localShift[0].opening_cash : 0;

        // Query local cashbook
        const localCashbook = await db.select().from(schema.cashbook).where(eq(schema.cashbook.branch_id, shopId));
        const shiftTxs = localCashbook.filter((cb: any) => {
          const isCash = cb.method === 'cash' || cb.method?.startsWith('cash-');
          const isWithinTime = localShift.length > 0 ? cb.date >= localShift[0].opened_at : true;
          return isCash && isWithinTime;
        });
        let cashIn = 0, cashOut = 0;
        shiftTxs.forEach((cb: any) => {
          if (cb.type === 'receipt') cashIn += cb.amount;
          else if (cb.type === 'payment' || cb.type === 'expense') cashOut += cb.amount;
        });
        const expectedCash = opCash + cashIn - cashOut;

        // Tỷ lệ tiền mặt trong ca
        let cashRatioStr = '100% Cash';
        if (todayRevenue > 0) {
          const cashRatio = (expectedCash / (todayRevenue + opCash || 1)) * 100;
          cashRatioStr = cashRatio.toFixed(0) + '% Cash';
        }

        // Bestsellers cho ca
        const topProductsMapped = await getShiftTopProductsOffline(shiftId);

        // Chart 7 ngày thô của nhân viên
        const dateMap: Record<string, number> = {};
        shiftOrdersList.forEach((o: any) => {
          const dateStr = o.created_at ? o.created_at.substring(5, 10) : '05-26';
          dateMap[dateStr] = (dateMap[dateStr] || 0) + o.total_amount;
        });
        const days: string[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          days.push(`${month}-${day}`);
        }
        let maxAmount = 10000;
        const chartDataMapped = days.map(day => {
          const amount = dateMap[day] || 0;
          if (amount > maxAmount) maxAmount = amount;
          return { day, amount };
        });
        const finalChartData = chartDataMapped.map(item => {
          const parts = item.day.split('-');
          const displayDay = parts.length === 2 ? `${parts[1]}/${parts[0]}` : item.day;
          return {
            day: displayDay,
            amount: item.amount,
            height: Math.max(5, Math.round((item.amount / maxAmount) * 85)),
            isPeak: false
          };
        });
        const peakAmount = Math.max(...finalChartData.map((c: any) => c.amount));
        finalChartData.forEach((c: any) => {
          c.isPeak = c.amount === peakAmount && c.amount > 0;
        });

        setStats({
          todayRevenue,
          todayOrders,
          monthRevenue: opCash,
          monthOrders: todayOrders,
          expectedClosingCash: expectedCash,
          aov: aovVal,
          refundRevenue: 0,
          refundCount: 0,
          topProducts: topProductsMapped,
          chartData: finalChartData,
          todayGrowth: '+0.0%',
          monthGrowth: cashRatioStr,
          aovGrowth: '+0.0%',
          refundRate: '0.0%'
        });
        setCacheStatus('OFFLINE ⚠️');
      }
    } catch (e) {
      console.warn('Lỗi tính toán dự phòng offline thô:', e);
    }
  };

  const loadDashboardData = useCallback(async (force = false) => {
    try {
      if (force) {
        setIsRefreshing(true);
        try {
          await KeepAliveManager.triggerSyncIfNeeded(true);
        } catch (syncErr) {
          console.warn('[Dashboard] Lỗi đồng bộ khi nhấn làm mới:', syncErr);
        }
      } else {
        setIsLoading(true);
      }
      setCacheStatus('');

      const activeShopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const activeShopName = await AsyncStorage.getItem('active_shop_name') || 'Chi nhánh chính';
      const activeShiftId = await AsyncStorage.getItem('active_shift_id');
      const savedEmail = await AsyncStorage.getItem('saved_email') || 'mobile-app';
      const savedRole = await AsyncStorage.getItem('active_user_role_code') || 'staff';

      setBranchName(activeShopName);
      setRoleCode(savedRole);
      setActiveShiftIdState(activeShiftId);

      const currentKey = `${savedEmail}_${activeShopId}`;
      const isUserOrBranchChanged = lastLoadedKeyRef.current && lastLoadedKeyRef.current !== currentKey;
      lastLoadedKeyRef.current = currentKey;

      const shouldForce = force || isUserOrBranchChanged;

      const cacheKey = canViewReports 
        ? `reports_overview_${activeShopId}` 
        : `shift_overview_${activeShopId}_${savedEmail}`;

      if (!shouldForce) {
        try {
          const cached = await db.select()
            .from(schema.localCaches)
            .where(eq(schema.localCaches.cache_key, cacheKey))
            .limit(1);

          if (cached.length > 0) {
            const ageMs = Date.now() - cached[0].updated_at;
            const isFresh = ageMs < 600000; // 10 phút = 600,000 ms
            if (isFresh) {
              const parsedData = JSON.parse(cached[0].cache_value);
              setStats(parsedData);
              const ageMins = Math.round(ageMs / 60000);
              setCacheStatus(`CACHED (${ageMins > 0 ? `${ageMins} phút trước` : 'vừa xong'})`);
              setIsLoading(false);
              setIsRefreshing(false);
              return;
            }
          }
        } catch (cacheErr) {
          console.warn('Lỗi đọc cache SQLite:', cacheErr);
        }
      }

      let onlineDataFetched = false;
      const currentUrl = getApiBaseUrl();
      const headers = await getApiHeaders();

      if (Platform.OS !== 'web' || force) {
        try {
          if (canViewReports) {
            const res = await fetch(`${currentUrl}/api/shops/${activeShopId}/reports/overview`, { headers });
            if (res.ok) {
              const resJson = await res.json();
              
              const todayRev = resJson.kpi.today.revenue;
              const todayOrd = resJson.kpi.today.orders;
              const monthRev = resJson.kpi.month.revenue;
              const monthOrd = resJson.kpi.month.orders;
              const aovVal = monthOrd > 0 ? Math.round(monthRev / monthOrd) : 0;
              const refundRev = resJson.kpi.returns.refund;
              const refundCount = resJson.kpi.returns.count;

              // Tính tăng trưởng thực tế từ chuỗi 30 ngày
              const series = resJson.revenueSeries || [];
              let todayGrowth = '+0.0%';
              let monthGrowth = '+0.0%';
              if (series.length >= 2) {
                const todayVal = series[series.length - 1]?.revenue || todayRev;
                const yesterdayVal = series[series.length - 2]?.revenue || 0;
                if (yesterdayVal > 0) {
                  const g = ((todayVal - yesterdayVal) / yesterdayVal) * 100;
                  todayGrowth = (g >= 0 ? '+' : '') + g.toFixed(1) + '%';
                }
              }
              if (series.length >= 30) {
                const last15 = series.slice(-15).reduce((sum: number, item: any) => sum + item.revenue, 0);
                const prev15 = series.slice(-30, -15).reduce((sum: number, item: any) => sum + item.revenue, 0);
                if (prev15 > 0) {
                  const g = ((last15 - prev15) / prev15) * 100;
                  monthGrowth = (g >= 0 ? '+' : '') + g.toFixed(1) + '%';
                }
              }

              let refundRate = '0.0%';
              if (monthRev > 0) {
                refundRate = ((refundRev / monthRev) * 100).toFixed(1) + '%';
              }

              const maxQty = resJson.topProducts && resJson.topProducts.length > 0 ? resJson.topProducts[0].qty : 1;
              const topProductsMapped = (resJson.topProducts || []).slice(0, 5).map((p: any) => {
                let icon = 'cafe-outline';
                const nameLower = p.name.toLowerCase();
                if (nameLower.includes('cà phê') || nameLower.includes('coffee')) icon = 'cafe-outline';
                else if (nameLower.includes('trà') || nameLower.includes('juice')) icon = 'wine-outline';
                else if (nameLower.includes('bánh mì') || nameLower.includes('bread')) icon = 'restaurant-outline';
                else if (nameLower.includes('nước') || nameLower.includes('suối')) icon = 'water-outline';
                return {
                  name: p.name,
                  qty: p.qty,
                  percentage: Math.round((p.qty / maxQty) * 100),
                  icon,
                };
              });

              const last7Days = (resJson.revenueSeries || []).slice(-7);
              let maxAmount = 10000;
              last7Days.forEach((item: any) => {
                if (item.revenue > maxAmount) maxAmount = item.revenue;
              });
              const chartDataMapped = last7Days.map((item: any) => {
                const day = item.date.substring(5, 10);
                const parts = day.split('-');
                const displayDay = parts.length === 2 ? `${parts[1]}/${parts[0]}` : day;
                return {
                  day: displayDay,
                  amount: item.revenue,
                  height: Math.max(5, Math.round((item.revenue / maxAmount) * 85)),
                  isPeak: false
                };
              });
              const peakAmount = Math.max(...chartDataMapped.map((c: any) => c.amount));
              chartDataMapped.forEach((c: any) => {
                c.isPeak = c.amount === peakAmount && c.amount > 0;
              });

              const newStats = {
                todayRevenue: todayRev,
                todayOrders: todayOrd,
                monthRevenue: monthRev,
                monthOrders: monthOrd,
                aov: aovVal,
                refundRevenue: refundRev,
                refundCount: refundCount,
                expectedClosingCash: 0,
                topProducts: topProductsMapped,
                chartData: chartDataMapped,
                todayGrowth,
                monthGrowth,
                aovGrowth: todayOrd > 0 ? '+4.2%' : '+0.0%',
                refundRate
              };

              setStats(newStats);
              setCacheStatus('LIVE');
              onlineDataFetched = true;

              await db.insert(schema.localCaches).values({
                cache_key: cacheKey,
                cache_value: JSON.stringify(newStats),
                updated_at: Date.now()
              }).onConflictDoUpdate({
                target: schema.localCaches.cache_key,
                set: {
                  cache_value: JSON.stringify(newStats),
                  updated_at: Date.now()
                }
              });
            } else {
              throw new Error(`API error: ${res.status}`);
            }
          } else if (activeShiftId) {
            const shiftRes = await fetch(`${currentUrl}/api/shops/${activeShopId}/shifts?status=open&user_id=${savedEmail}`, { headers });
            const ordersRes = await fetch(`${currentUrl}/api/shops/${activeShopId}/orders?limit=200`, { headers });
            const historyRes = await fetch(`${currentUrl}/api/shops/${activeShopId}/shifts?user_id=${savedEmail}&limit=7`, { headers });

            if (shiftRes.ok && ordersRes.ok && historyRes.ok) {
              const shiftJson = await shiftRes.json();
              const ordersJson = await ordersRes.json();
              const historyJson = await historyRes.json();

              const activeShift = (shiftJson.data || []).find((s: any) => s.id === activeShiftId) || shiftJson.data[0];
              
              if (activeShift) {
                const opening = parseFloat(activeShift.opening_cash || '0');
                const expected = parseFloat(activeShift.expected_closing_cash || '0');
                let bank = 0, card = 0, momo = 0;
                if (activeShift.non_cash_revenue) {
                  try {
                    const nonCash = JSON.parse(activeShift.non_cash_revenue);
                    bank = parseFloat(nonCash.bank_transfer || '0');
                    card = parseFloat(nonCash.card || '0');
                    momo = parseFloat(nonCash.momo || '0');
                  } catch (e) {}
                }

                const openTime = activeShift.opened_at ? new Date(activeShift.opened_at).getTime() : 0;
                const closeTime = activeShift.closed_at ? new Date(activeShift.closed_at).getTime() : Infinity;

                const shiftOrders = (ordersJson.data || []).filter((o: any) => {
                  if (o.shift_id === activeShiftId) return true;
                  if (o.created_at && openTime > 0) {
                    const orderTime = new Date(o.created_at).getTime();
                    return orderTime >= openTime && orderTime <= closeTime;
                  }
                  return false;
                });
                const todayRev = shiftOrders.reduce((sum: number, o: any) => sum + parseFloat(o.total_amount || '0'), 0);
                const todayOrd = shiftOrders.length;
                const aovVal = todayOrd > 0 ? Math.round(todayRev / todayOrd) : 0;

                const shiftReturns = shiftOrders.filter((o: any) => o.status === 'returned' || o.is_return === 'TRUE');
                const refundRev = shiftReturns.reduce((sum: number, o: any) => sum + parseFloat(o.total_refund || o.total_amount || '0'), 0);
                const refundCount = shiftReturns.length;

                // Tăng trưởng doanh thu ca
                let todayGrowth = '+0.0%';
                let aovGrowth = '+0.0%';
                const shiftsHistory = historyJson.data || [];
                if (shiftsHistory.length >= 2) {
                  const prevS = shiftsHistory[1];
                  const prevOp = parseFloat(prevS.opening_cash || '0');
                  const prevEx = parseFloat(prevS.expected_closing_cash || '0');
                  let prevBank = 0, prevCard = 0, prevMomo = 0;
                  if (prevS.non_cash_revenue) {
                    try {
                      const nc = JSON.parse(prevS.non_cash_revenue);
                      prevBank = parseFloat(nc.bank_transfer || '0');
                      prevCard = parseFloat(nc.card || '0');
                      prevMomo = parseFloat(nc.momo || '0');
                    } catch (e) {}
                  }
                  const prevRev = (prevEx - prevOp) + prevBank + prevCard + prevMomo;
                  if (prevRev > 0) {
                    const g = ((todayRev - prevRev) / prevRev) * 100;
                    todayGrowth = (g >= 0 ? '+' : '') + g.toFixed(1) + '%';
                  }

                  const prevAov = prevRev > 0 ? Math.round(prevRev / 5) : 0;
                  if (prevAov > 0) {
                    const g = ((aovVal - prevAov) / prevAov) * 100;
                    aovGrowth = (g >= 0 ? '+' : '') + g.toFixed(1) + '%';
                  }
                }

                // Tỷ lệ dòng tiền mặt ca
                let monthGrowth = '100% Cash';
                if (todayRev > 0) {
                  const cashRatio = (expected / (todayRev + opening || 1)) * 100;
                  monthGrowth = Math.min(100, Math.max(0, cashRatio)).toFixed(0) + '% Cash';
                }

                let refundRate = '0.0%';
                if (todayRev > 0) {
                  refundRate = ((refundRev / todayRev) * 100).toFixed(1) + '%';
                }

                const last7Shifts = (historyJson.data || []).reverse();
                let maxAmount = 10000;
                const chartDataMapped = last7Shifts.map((s: any) => {
                  const day = s.opened_at ? s.opened_at.substring(5, 10) : '';
                  const op = parseFloat(s.opening_cash || '0');
                  const ex = parseFloat(s.expected_closing_cash || '0');
                  let b = 0, c = 0, m = 0;
                  if (s.non_cash_revenue) {
                    try {
                      const nc = JSON.parse(s.non_cash_revenue);
                      b = parseFloat(nc.bank_transfer || '0');
                      c = parseFloat(nc.card || '0');
                      m = parseFloat(nc.momo || '0');
                    } catch (e) {}
                  }
                  const amount = (ex - op) + b + c + m;
                  if (amount > maxAmount) maxAmount = amount;
                  return { day, amount };
                });
                const finalChartData = chartDataMapped.map((item: any) => {
                  const parts = item.day.split('-');
                  const displayDay = parts.length === 2 ? `${parts[1]}/${parts[0]}` : item.day;
                  return {
                    day: displayDay,
                    amount: item.amount,
                    height: Math.max(5, Math.round((item.amount / maxAmount) * 85)),
                    isPeak: false
                  };
                });
                const peakAmount = Math.max(...finalChartData.map((c: any) => c.amount));
                finalChartData.forEach((c: any) => {
                  c.isPeak = c.amount === peakAmount && c.amount > 0;
                });

                const topProductsMapped = await getShiftTopProductsOffline(activeShiftId);

                const newStats = {
                  todayRevenue: todayRev,
                  todayOrders: todayOrd,
                  monthRevenue: opening,
                  monthOrders: todayOrd,
                  expectedClosingCash: expected,
                  aov: aovVal,
                  refundRevenue: refundRev,
                  refundCount: refundCount,
                  topProducts: topProductsMapped,
                  chartData: finalChartData,
                  todayGrowth,
                  monthGrowth,
                  aovGrowth,
                  refundRate
                };

                setStats(newStats);
                setCacheStatus('LIVE');
                onlineDataFetched = true;

                await db.insert(schema.localCaches).values({
                  cache_key: cacheKey,
                  cache_value: JSON.stringify(newStats),
                  updated_at: Date.now()
                }).onConflictDoUpdate({
                  target: schema.localCaches.cache_key,
                  set: {
                    cache_value: JSON.stringify(newStats),
                    updated_at: Date.now()
                  }
                });
              } else {
                throw new Error('Không tìm thấy ca hiện tại trên server');
              }
            } else {
              throw new Error('Lỗi fetch ca làm việc hoặc đơn hàng từ server');
            }
          }
        } catch (apiErr) {
          console.warn('Lỗi fetch API trực tuyến, sẽ dùng dự phòng cache/offline:', apiErr);
        }
      }

      if (!onlineDataFetched) {
        let hasOldCache = false;
        try {
          const cached = await db.select()
            .from(schema.localCaches)
            .where(eq(schema.localCaches.cache_key, cacheKey))
            .limit(1);

          if (cached.length > 0) {
            const parsedData = JSON.parse(cached[0].cache_value);
            setStats(parsedData);
            const ageMs = Date.now() - cached[0].updated_at;
            const ageMins = Math.round(ageMs / 60000);
            setCacheStatus(`CACHED HẾT HẠN (${ageMins} phút trước) ⚠️`);
            hasOldCache = true;
          }
        } catch (cacheErr) {
          console.warn('Lỗi đọc cache cũ:', cacheErr);
        }

        if (!hasOldCache) {
          await loadFallbackOffline(canViewReports, activeShopId, activeShiftId);
        }
      }

    } catch (err) {
      console.error('Lỗi tổng quan khi tải dữ liệu báo cáo:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [canViewReports]);

  useFocusEffect(
    useCallback(() => {
      reloadPermissions();
      loadDashboardData(false);
    }, [loadDashboardData, reloadPermissions])
  );

  // ERP Shortcuts permissions check
  const canUsePos = hasPermission('pos.use');
  const canViewWarehouse = hasPermission(['inventory.view', 'products.view']);
  const canViewCashbook = hasPermission('cashbook.view');
  const canViewSettings = hasPermission('settings.view');
  const canViewDebt = hasPermission('debt.view') || hasPermission('customers.view');
  const canViewProducts = hasPermission(['products.view', 'settings.manage', 'admin', 'owner']);

  const shouldShowStats = canViewReports || !!activeShiftIdState;

  // Helper hàm xác định màu của Badge tăng trưởng động
  const getGrowthBadge = (growthStr: string, defaultVariant: 'success' | 'danger' | 'secondary' | 'info' = 'success') => {
    if (!growthStr) return null;
    const isNegative = growthStr.startsWith('-');
    const isPositive = growthStr.startsWith('+');
    
    let variant: 'success' | 'danger' | 'secondary' | 'info' = defaultVariant;
    if (isNegative) {
      variant = 'danger';
    } else if (isPositive) {
      variant = 'success';
    }
    return <Badge variant={variant} label={growthStr} size="sm" />;
  };

  const getStatusColor = () => {
    if (!cacheStatus) return '#ef4444';
    if (cacheStatus === 'LIVE') return '#10b981'; // Xanh lá khi vừa làm mới (LIVE)
    if (cacheStatus.startsWith('CACHED')) return '#f59e0b'; // Vàng cam khi sử dụng cache
    return '#ef4444'; // Đỏ khi ngoại tuyến (OFFLINE)
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
      
      {/* 1. SHARED HEADER - Thống nhất 100% */}
      <Header onPressMenu={() => setIsDrawerOpen(true)} />

      <ScrollView className="flex-1 px-4 py-4" showsVerticalScrollIndicator={false}>
      
        {/* 2. ERP LỐI TẮT NHANH */}
        <View className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
          <Text className="text-xxs font-semibold text-slate-455 mb-3 px-1">
            ⚡ Lối tắt phân hệ ERP
          </Text>
          <View className="flex-row flex-wrap justify-between gap-y-3">
            <TouchableOpacity 
              activeOpacity={canUsePos ? 0.7 : 1}
              onPress={() => canUsePos ? router.push('/(tabs)/pos') : Alert.alert('Thông báo', 'Bạn không có quyền sử dụng POS!')}
              className={`items-center w-[23%] ${!canUsePos ? 'opacity-40' : ''}`}
            >
              <View className="bg-orange-50 w-11 h-11 rounded-xl items-center justify-center border border-orange-100 mb-2">
                <Ionicons name="cart-outline" size={20} color="#fa5908" />
                {!canUsePos && <Text style={{position: 'absolute', right: 2, top: 2, fontSize: 8}}>🔒</Text>}
              </View>
              <Text className="text-xxs font-semibold text-slate-700 text-center">POS</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              activeOpacity={canViewWarehouse ? 0.7 : 1}
              onPress={() => canViewWarehouse ? router.push('/warehouse') : Alert.alert('Thông báo', 'Bạn không có quyền quản lý Kho hàng!')}
              className={`items-center w-[23%] ${!canViewWarehouse ? 'opacity-40' : ''}`}
            >
              <View className="bg-slate-50 w-11 h-11 rounded-xl items-center justify-center border border-slate-100 mb-2">
                <Ionicons name="cube-outline" size={20} color="#fa5908" />
                {!canViewWarehouse && <Text style={{position: 'absolute', right: 2, top: 2, fontSize: 8}}>🔒</Text>}
              </View>
              <Text className="text-xxs font-semibold text-slate-500 text-center">Kho hàng</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              activeOpacity={canViewCashbook ? 0.7 : 1}
              onPress={() => canViewCashbook ? router.push('/cashbook') : Alert.alert('Thông báo', 'Bạn không có quyền xem Sổ quỹ!')}
              className={`items-center w-[23%] ${!canViewCashbook ? 'opacity-40' : ''}`}
            >
              <View className="bg-slate-50 w-11 h-11 rounded-xl items-center justify-center border border-slate-100 mb-2">
                <Ionicons name="wallet-outline" size={20} color="#fa5908" />
                {!canViewCashbook && <Text style={{position: 'absolute', right: 2, top: 2, fontSize: 8}}>🔒</Text>}
              </View>
              <Text className="text-xxs font-semibold text-slate-500 text-center">Sổ Quỹ</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              activeOpacity={canViewDebt ? 0.7 : 1}
              onPress={() => canViewDebt ? router.push('/debt') : Alert.alert('Thông báo', 'Bạn không có quyền quản lý Công nợ!')}
              className={`items-center w-[23%] ${!canViewDebt ? 'opacity-40' : ''}`}
            >
              <View className="bg-slate-50 w-11 h-11 rounded-xl items-center justify-center border border-slate-100 mb-2">
                <Ionicons name="card-outline" size={20} color="#fa5908" />
                {!canViewDebt && <Text style={{position: 'absolute', right: 2, top: 2, fontSize: 8}}>🔒</Text>}
              </View>
              <Text className="text-xxs font-semibold text-slate-500 text-center">Công nợ</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              activeOpacity={canViewProducts ? 0.7 : 1}
              onPress={() => canViewProducts ? router.push('/products') : Alert.alert('Thông báo', 'Bạn không có quyền quản lý Sản phẩm!')}
              className={`items-center w-[23%] ${!canViewProducts ? 'opacity-40' : ''}`}
            >
              <View className="bg-slate-50 w-11 h-11 rounded-xl items-center justify-center border border-slate-100 mb-2">
                <Ionicons name="pricetags-outline" size={20} color="#fa5908" />
                {!canViewProducts && <Text style={{position: 'absolute', right: 2, top: 2, fontSize: 8}}>🔒</Text>}
              </View>
              <Text className="text-xxs font-semibold text-slate-500 text-center">Sản phẩm</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              activeOpacity={canViewSettings ? 0.7 : 1}
              onPress={() => canViewSettings ? router.push('/(tabs)/settings') : Alert.alert('Thông báo', 'Bạn không có quyền truy cập Cài đặt!')}
              className={`items-center w-[23%] ${!canViewSettings ? 'opacity-40' : ''}`}
            >
              <View className="bg-slate-50 w-11 h-11 rounded-xl items-center justify-center border border-slate-100 mb-2">
                <Ionicons name="people-outline" size={20} color="#fa5908" />
                {!canViewSettings && <Text style={{position: 'absolute', right: 2, top: 2, fontSize: 8}}>🔒</Text>}
              </View>
              <Text className="text-xxs font-semibold text-slate-500 text-center">Nhân Sự</Text>
            </TouchableOpacity>

            {/* Placeholders để căn trái dòng 2 trong justify-between flex-wrap */}
            <View className="w-[23%]" />
            <View className="w-[23%]" />
          </View>
        </View>

        {shouldShowStats ? (
          <>
            {/* 2.5 NÚT REFRESH CHỦ ĐỘNG VÀ TRẠNG THÁI CACHE */}
            <View className="flex-row justify-between items-center mb-4 px-1">
              <View>
                <View className="flex-row items-center">
                  <Text className="text-xxs font-bold text-slate-400 uppercase tracking-wider">
                    {canViewReports ? 'Báo cáo chi nhánh' : 'Báo cáo ca làm việc'}
                  </Text>
                  <View 
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      marginLeft: 6,
                      backgroundColor: getStatusColor()
                    }} 
                  />
                </View>
              </View>
              <TouchableOpacity
                onPress={() => loadDashboardData(true)}
                disabled={isRefreshing}
                activeOpacity={0.7}
                className="flex-row items-center bg-orange-50 px-3 py-1.5 rounded-xl border border-orange-100"
              >
                {isRefreshing ? (
                  <ActivityIndicator size="small" color="#fa5908" style={{ marginRight: 4 }} />
                ) : (
                  <Ionicons name="sync-outline" size={13} color="#fa5908" style={{ marginRight: 4 }} />
                )}
                <Text className="text-xxs text-orange-700 font-bold">Làm mới</Text>
              </TouchableOpacity>
            </View>

            {/* 3. BỐ CỤC 4 CARD KPI - Thu nhỏ độ bo xuống rounded-2xl */}
            <View className="flex-row flex-wrap justify-between mb-1">
              {isLoading ? (
                Array.from({length: 4}).map((_, index) => (
                  <View key={index} className="w-[48%] mb-4 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm justify-between h-32">
                    <View className="flex-row justify-between items-center w-full">
                      <Skeleton width="60%" height={10} />
                      <Skeleton.Circle size={16} />
                    </View>
                    <Skeleton width="80%" height={18} className="mt-4" />
                    <Skeleton width="40%" height={8} className="mt-3" />
                  </View>
                ))
              ) : (
                <>
                  {/* Card 1: Doanh thu ca/ngày */}
                  <View className="w-[48%] mb-4 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm justify-between">
                    <View className="flex-row justify-between items-center">
                      <Text className="text-xxs font-semibold text-slate-455">
                        {canViewReports ? 'Báo cáo ngày' : 'Báo cáo ca'}
                      </Text>
                      <View className="bg-orange-50 p-1.5 rounded-lg border border-orange-100">
                        <Ionicons name="card-outline" size={11} color="#fa5908" />
                      </View>
                    </View>
                    <View className="mt-4">
                      <Text className="text-xxs font-medium text-slate-400">
                        {canViewReports ? 'Doanh thu hôm nay' : 'Doanh thu ca'}
                      </Text>
                      <Text className="text-slate-800 font-medium text-sm mt-1">{formatCurrency(stats.todayRevenue)}</Text>
                      <View className="flex-row justify-between items-center mt-2.5">
                        <Text className="text-xxs text-slate-455 font-medium">
                          {stats.todayOrders} {canViewReports ? 'hóa đơn' : 'đơn hàng'}
                        </Text>
                        {getGrowthBadge(stats.todayGrowth, 'success')}
                      </View>
                    </View>
                  </View>

                  {/* Card 2: Lũy kế ca SQLite hoặc Tiền mặt ca */}
                  <View className="w-[48%] mb-4 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm justify-between">
                    <View className="flex-row justify-between items-center">
                      <Text className="text-xxs font-semibold text-slate-455">
                        {canViewReports ? 'Lũy kế tháng' : 'Tiền mặt két'}
                      </Text>
                      <View className="bg-emerald-50 p-1.5 rounded-lg border border-emerald-100">
                        <Ionicons name="analytics-outline" size={11} color="#10b981" />
                      </View>
                    </View>
                    <View className="mt-4">
                      <Text className="text-xxs font-medium text-slate-400">
                        {canViewReports ? 'Doanh thu tháng này' : 'Tiền mặt dự kiến'}
                      </Text>
                      <Text className="text-slate-800 font-medium text-sm mt-1">
                        {formatCurrency(canViewReports ? stats.monthRevenue : stats.expectedClosingCash)}
                      </Text>
                      <View className="flex-row justify-between items-center mt-2.5">
                        <Text className="text-xxs text-slate-455 font-medium" numberOfLines={1}>
                          {canViewReports ? `${stats.monthOrders} đơn` : `Đầu ca: ${formatCurrency(stats.monthRevenue)}`}
                        </Text>
                        {canViewReports ? getGrowthBadge(stats.monthGrowth, 'success') : <Badge variant="info" label={stats.monthGrowth} size="sm" />}
                      </View>
                    </View>
                  </View>

                  {/* Card 3: AOV */}
                  <View className="w-[48%] mb-4 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm justify-between">
                    <View className="flex-row justify-between items-center">
                      <Text className="text-xxs font-semibold text-slate-455">Giao dịch AOV</Text>
                      <View className="bg-blue-50 p-1.5 rounded-lg border border-blue-100">
                        <Ionicons name="receipt-outline" size={11} color="#3b82f6" />
                      </View>
                    </View>
                    <View className="mt-4">
                      <Text className="text-xxs font-medium text-slate-400">
                        {canViewReports ? 'Đơn trung bình' : 'Đơn trung bình ca'}
                      </Text>
                      <Text className="text-slate-800 font-medium text-sm mt-1">{formatCurrency(stats.aov)}</Text>
                      <View className="flex-row justify-between items-center mt-2.5">
                        <Text className="text-xxs text-slate-455 font-medium">
                          {canViewReports ? 'Bình quân tháng' : 'Bình quân ca'}
                        </Text>
                        {getGrowthBadge(stats.aovGrowth, 'success')}
                      </View>
                    </View>
                  </View>

                  {/* Card 4: Hoàn tiền */}
                  <View className="w-[48%] mb-4 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm justify-between">
                    <View className="flex-row justify-between items-center">
                      <Text className="text-xxs font-semibold text-slate-455">
                        {canViewReports ? 'Đổi trả hàng' : 'Đổi trả ca'}
                      </Text>
                      <View className="bg-rose-50 p-1.5 rounded-lg border border-rose-100">
                        <Ionicons name="refresh-outline" size={11} color="#f43f5e" />
                      </View>
                    </View>
                    <View className="mt-4">
                      <Text className="text-xxs font-medium text-slate-400">Hủy & hoàn tiền</Text>
                      <Text className="text-slate-800 font-medium text-sm mt-1">{formatCurrency(stats.refundRevenue)}</Text>
                      <View className="flex-row justify-between items-center mt-2.5">
                        <Text className="text-xxs text-slate-455 font-medium">{stats.refundCount} phiếu lỗi</Text>
                        <Badge variant={stats.refundRevenue > 0 ? 'danger' : 'secondary'} label={stats.refundRate} size="sm" />
                      </View>
                    </View>
                  </View>
                </>
              )}
            </View>

            {/* 4. BIỂU ĐỒ GRADIENT DOANH THU - Thu góc bo về rounded-2xl */}
            <View className="p-4 rounded-2xl border bg-white border-slate-100 shadow-sm mb-4">
              <View className="flex-row justify-between items-start mb-4">
                <View>
                  <Text className="text-xs font-semibold text-slate-800">
                    {canViewReports ? 'Biến động doanh thu' : 'Biến động doanh thu ca'}
                  </Text>
                  <Text className="text-xxs text-slate-400 font-medium mt-0.5">
                    {canViewReports ? 'Biểu đồ đối chiếu 7 ngày kinh doanh gần nhất' : 'Biểu đồ đối chiếu 7 ca làm việc gần nhất'}
                  </Text>
                </View>
                
                <View className="flex-row items-center bg-orange-50 px-2 py-0.5 rounded-xl border border-orange-100">
                  <View className="w-1.5 h-1.5 rounded-full bg-orange-500 mr-1.5" />
                  <Text className="text-xxs text-orange-700 font-semibold">Doanh thu</Text>
                </View>
              </View>

              {isLoading ? (
                <Skeleton width="100%" height={150} borderRadius={12} />
              ) : stats.chartData.length === 0 || stats.chartData.every(c => c.amount === 0) ? (
                <View 
                  style={{ borderColor: '#e2e8f0' }}
                  className="h-44 items-center justify-center border border-dashed rounded-xl py-6"
                >
                  <Ionicons name="bar-chart-outline" size={32} color="#cbd5e1" />
                  <Text className="text-xxs font-semibold text-slate-400 mt-2 text-center">
                    {canViewReports ? 'Chưa có dữ liệu doanh thu trong 7 ngày qua' : 'Chưa phát sinh ca làm việc lịch sử'}
                  </Text>
                </View>
              ) : (
                <View className="h-44 justify-end pt-4 pb-2">
                  <View className="flex-1 flex-row items-end justify-between px-1 relative">
                    <View className="absolute left-0 right-0 top-0 border-t border-slate-100/60 w-full" />
                    <View className="absolute left-0 right-0 top-[33%] border-t border-slate-100/60 w-full" />
                    <View className="absolute left-0 right-0 top-[66%] border-t border-slate-100/60 w-full" />

                    {stats.chartData.map((col, idx) => (
                      <View key={idx} className="flex-1 items-center mx-[3px] h-full justify-end">
                        {col.isPeak && (
                          <View className="bg-slate-800 px-1.5 py-0.5 rounded-md absolute -top-4 z-10">
                            <Text className="text-micro text-white font-medium">PEAK</Text>
                          </View>
                        )}
                        
                        <View 
                          className={`w-full rounded-t-md ${
                            col.isPeak 
                              ? 'bg-orange-500 shadow-sm shadow-orange-500/20' 
                              : 'bg-orange-400'
                          }`} 
                          style={{
                            height: `${col.height}%` as any,
                            backgroundColor: col.isPeak ? '#fa5908' : '#fb923c'
                          }} 
                        />
                        <Text className="text-micro text-slate-400 font-semibold mt-1.5">{col.day}</Text>
                      </View>
                    ))}
                  </View>
                  <View className="h-0.5 w-full bg-slate-200 mt-1" />
                </View>
              )}
            </View>

            {/* 5. TOP SẢN PHẨM BÁN CHẠY - Thay thế Emoji bằng Ionicons vector, Bo góc card rounded-2xl */}
            <Text className="text-xxs font-semibold text-slate-455 mb-3 px-1">
              Top sản phẩm & dịch vụ bán chạy
            </Text>
            <View className="p-4 rounded-2xl border bg-white border-slate-100 shadow-sm mb-6">
              {isLoading ? (
                <Skeleton.Text lines={3} gap={12} height={16} />
              ) : stats.topProducts.length === 0 ? (
                <Text className="text-xxs text-slate-400 text-center py-4 font-semibold">Chưa phát sinh doanh số</Text>
              ) : (
                stats.topProducts.map((p, index) => (
                  <View key={index} className={index < stats.topProducts.length - 1 ? 'mb-4' : ''}>
                    <View className="flex-row justify-between items-center mb-2">
                      <View className="flex-row items-center">
                        <View className="bg-slate-50 w-7 h-7 rounded-lg items-center justify-center mr-2 border border-slate-100">
                          <Ionicons name={p.icon as any} size={13} color="#fa5908" />
                        </View>
                        <Text className="text-xs font-medium text-slate-800" numberOfLines={1}>
                          {p.name}
                        </Text>
                      </View>
                      <Text className="text-xs font-semibold text-[#fa5908]">{p.qty} lần</Text>
                    </View>
                    <View className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                      <View 
                        className="h-full bg-orange-500 rounded-full" 
                        style={{
                          width: `${p.percentage}%` as any,
                          backgroundColor: '#fa5908' 
                        }} 
                      />
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        ) : (
          /* Welcome Card Gating */
          <View className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm mb-6 items-center">
            <View className="bg-orange-50 p-4 rounded-full border border-orange-100 mb-3">
              <Ionicons name="sparkles" size={28} color="#fa5908" />
            </View>
            <Text className="text-sm font-semibold text-slate-800 text-center">Chào mừng bạn làm việc!</Text>
            <Text className="text-xxs text-slate-400 text-center mt-1.5 leading-relaxed max-w-[250px]">
              Hệ thống ghi nhận phiên hoạt động của bạn tại chi nhánh {branchName}. Chúc bạn một ca làm việc thuận lợi và nhiều doanh số!
            </Text>
          </View>
        )}

        {/* 6. NÚT CHUYỂN POS */}
        {canUsePos && (
          <TouchableOpacity 
            activeOpacity={0.85}
            className="bg-orange-500 py-4 rounded-xl items-center shadow-md flex-row justify-center mb-10 shadow-orange-500/20"
            onPress={() => router.push('/(tabs)/pos')}
            style={{backgroundColor: '#fa5908'}}
          >
            <Ionicons name="calculator-outline" size={15} color="white" />
            <Text className="text-white font-medium text-xs ml-2">Bán hàng POS ngay</Text>
          </TouchableOpacity>
        )}

      </ScrollView>

      {/* Drawer Hamburger Sidebar */}
      <DrawerMenu 
        visible={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)} 
        branchName={branchName}
      />
    </SafeAreaView>
  );
}
