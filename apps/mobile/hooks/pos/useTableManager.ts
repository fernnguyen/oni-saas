import React, { useState, useCallback, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { db } from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getApiBaseUrl, getApiHeaders } from '../../lib/api/config';
import { SyncManager } from '../../lib/sync/SyncManager';
import { getSystemTaxGroups } from '../../lib/utils/tax';


export interface UseTableManagerProps {
  tables: any[];
  setTables: React.Dispatch<React.SetStateAction<any[]>>;
  shopVertical: string;
  activeShopId: string;

  showToast: (msg: string, type: 'success'|'error'|'info') => void;
  setCart: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  setDiscountAmount: React.Dispatch<React.SetStateAction<number>>;
  setOrderNote: React.Dispatch<React.SetStateAction<string>>;
  setSelectedCustomer: React.Dispatch<React.SetStateAction<any>>;
  setIsPreviewModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isNavReady: boolean;
  isLoading: boolean;
  isOnline: boolean;
  checkIsQrPayment: (method: string) => boolean;
  currentUserEmail: string;
  productsList: any[];
  paymentFundsList: any[];
  setIsQrModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setQrPayload: React.Dispatch<React.SetStateAction<any>>;
  setIsCartModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleCheckoutPress: (action?: any) => void;
  setPaymentRows: React.Dispatch<React.SetStateAction<any[]>>;
  selectedCustomer: any;
  customersList: any[];
  broadcastSync?: (payload: any) => void;
  /** Table sync v2 client (useTableSyncV2). Inert/absent → legacy table flow. */
  tableSync?: MobileTableSyncV2Api;
  /** Re-pull the table layout from the server (used by table sync v2) */
  refreshTables?: () => void;
  /** In-app dialog (PosDialog) used instead of native Alert in the table / checkout flows */
  dialog: PosDialogApi;
}

import { CartItem } from '../../app/(tabs)/pos';
import { TableConflict } from '../../components/pos/ConflictResolutionModal';
import { calculateHourlyBilling, isTimeChargeProduct, getTimeChargeProductId, buildTablePricingSnapshot, computeTableTimeCharge, generateClientId } from '@oni/core';
import { callTableSessionApi } from '../../lib/pos/tableSyncV2';
import { diffCartToOps, v2LinesToCart } from '../../lib/pos/tableCartV2';
import type { MobileTableSyncV2Api } from './useTableSyncV2';
import { LodgingGuest } from '../../components/pos/LodgingGuestsForm';
import type { PosDialogApi } from '../../components/pos/PosDialog';
import { getResourceDisplayName, getResourceNouns } from '../../lib/pos/resourceLabels';

// Phân tích mốc check_in (ms). Chuỗi naive (không Z/offset) có thể là giờ GMT+7 hoặc UTC
// tuỳ nơi ghi -> trả về cả 2 cách hiểu để so sánh không bị lệch 7 tiếng.
const parseCheckInCandidatesMs = (value: any): number[] => {
  if (value === null || value === undefined || value === '') return [];
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? [value] : [];
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? [value.getTime()] : [];
  let str = String(value).trim();
  if (!str) return [];
  if (!str.includes('T') && str.includes(' ')) str = str.replace(' ', 'T');
  const hasTz = /(Z|[+-]\d{2}:?\d{2})$/i.test(str);
  if (hasTz) {
    const ms = new Date(str).getTime();
    return Number.isFinite(ms) ? [ms] : [];
  }
  return [new Date(`${str}+07:00`).getTime(), new Date(`${str}Z`).getTime()].filter(ms => Number.isFinite(ms));
};

// So khớp 2 mốc check_in với dung sai ±2 giây
const isSameCheckIn = (a: any, b: any, toleranceMs = 2000): boolean => {
  const aList = parseCheckInCandidatesMs(a);
  const bList = parseCheckInCandidatesMs(b);
  return aList.some(x => bList.some(y => Math.abs(x - y) <= toleranceMs));
};

// Tập ID món trên server mà CHÍNH MÁY NÀY đã từng thấy cho một đơn.
// syncOrderItemsOnline chỉ được xoá món nằm trong tập này (không xoá món máy khác thêm).
const knownServerItemsKey = (orderId: string) => `known_server_items:${orderId}`;
const loadKnownServerItemIds = async (orderId: string): Promise<Set<string>> => {
  if (!orderId) return new Set();
  try {
    const raw = await AsyncStorage.getItem(knownServerItemsKey(orderId));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map((v: any) => String(v)) : []);
  } catch {
    return new Set();
  }
};
const saveKnownServerItemIds = async (orderId: string, ids: Set<string>) => {
  if (!orderId) return;
  try {
    await AsyncStorage.setItem(knownServerItemsKey(orderId), JSON.stringify(Array.from(ids)));
  } catch {}
};
const addKnownServerItemIds = async (orderId: string, ids: any[]) => {
  if (!orderId || String(orderId).startsWith('ORD-T-INPROG-')) return;
  const valid = ids.filter(Boolean).map((v: any) => String(v));
  if (valid.length === 0) return;
  const set = await loadKnownServerItemIds(orderId);
  let changed = false;
  for (const id of valid) {
    if (!set.has(id)) { set.add(id); changed = true; }
  }
  if (changed) await saveKnownServerItemIds(orderId, set);
};

export function useTableManager(props: UseTableManagerProps) {
  const { 
    tables, setTables, shopVertical, activeShopId, 
    showToast, setCart, setDiscountAmount, setOrderNote, setSelectedCustomer, setIsPreviewModalOpen,
    isNavReady, isLoading, isOnline, checkIsQrPayment, currentUserEmail, productsList, paymentFundsList, customersList, selectedCustomer, setPaymentRows, handleCheckoutPress, setIsCartModalOpen, setQrPayload, setIsQrModalOpen, broadcastSync, tableSync, refreshTables, dialog } = props;
  const resourceNouns = getResourceNouns(shopVertical);

  const [activeTable, setActiveTable] = useState<any>(null);

  const [isUpdatingGuestsLoading, setIsUpdatingGuestsLoading] = useState(false);
  const [roomRentalType, setRoomRentalType] = useState<'hourly' | 'daily'>('hourly');
  const [pickerTargetIndex, setPickerTargetIndex] = useState<number | null>(null);
  const [pickerTargetField, setPickerTargetField] = useState<'dob' | 'expiry_date' | null>(null);
  const [pickerDay, setPickerDay] = useState('');
  const [pickerMonth, setPickerMonth] = useState('');
  const [pickerYear, setPickerYear] = useState('');
  const [datePickerView, setDatePickerView] = useState<'day' | 'month' | 'year'>('day');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isPayingTableLoading, setIsPayingTableLoading] = useState(false);


  const [isTableOpenDialogVisible, setIsTableOpenDialogVisible] = useState(false);
  const [selectedTableForOpen, setSelectedTableForOpen] = useState<any>(null);
  const [checkInTab, setCheckInTab] = useState<'info' | 'guests'>('info');

  const [roomGuestCount, setRoomGuestCount] = useState<number>(1);
  const [tableCarts, setTableCarts] = useState<{ [tableId: string]: { [cartItemId: string]: CartItem } }>({});
  const [cartOwnerTable, setCartOwnerTable] = useState<any | null>(null);
  const [tableCustomers, setTableCustomers] = useState<{ [tableId: string]: any }>({});

  const [activeTableTab, setActiveTableTab] = useState<'billing' | 'guests'>('billing');
  const [lodgingGuests, setLodgingGuests] = useState<LodgingGuest[]>([{ name: '', id_type: 'CCCD', id_number: '', expiry_date: '', nationality: 'Việt Nam', dob: '', gender: '', address: '', note: '' }]);
  const [isSyncingTableSession, setIsSyncingTableSession] = useState<boolean>(false);
  const [isOpeningTable, setIsOpeningTable] = useState<boolean>(false);
  // "Nhận bàn" dialog: inline error + double-tap guard + hand-off to the table detail modal
  const [openTableError, setOpenTableError] = useState<string | null>(null);
  const openTableInFlightRef = React.useRef(false);
  const openHandoffTableRef = React.useRef<any>(null);
  const openHandoffTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tableOpenHandoff, setTableOpenHandoff] = useState(false);
  // "Thanh toán" on a table: flush + server quote before the checkout modal appears
  const [isPreparingTablePay, setIsPreparingTablePay] = useState(false);
  const payPrepInFlightRef = React.useRef(false);
  // Theo dõi các bàn đang trong quá trình mở/chuyển để chống race condition thoát bàn khi Cloud chưa kịp cập nhật
  const openingTableIdsRef = React.useRef<Set<string>>(new Set());
  // Theo dõi các bàn đang đẩy món lên Server để tránh poll ngầm ghi đè lúc đang lưu
  const syncingItemsTableIdsRef = React.useRef<Set<string>>(new Set());
  // Theo dõi các order_id đang có món gọi lúc offline chờ đẩy lên Server (khóa theo order_id để không bao giờ lẫn giữa Khách A và Khách B)
  const pendingItemSyncByOrderRef = React.useRef<Map<string, { tableId: string; cartItems: any }>>(new Map());
  // Theo dõi các order_id đã thanh toán/hủy trên máy này để chặn poll ngầm đang bay ghi đè lại món của khách cũ
  const closedOrderIdsRef = React.useRef<Set<string>>(new Set());

  // ── Table sync v2 (docs/MOBILE-TABLE-SYNC-PLAN.md đợt 2) ─────────────────────────────
  // A table is "v2" when the shop runs v2 AND its session id is known (server order/resource
  // metadata.session_id, or table.metadata.session_id for a table opened offline on this device).
  // Every other table keeps the legacy flow below untouched.
  const v2 = tableSync?.enabled ? tableSync : null;
  const v2SessionsRef = React.useRef<Record<string, { sessionId: string; orderId: string }>>({});
  const v2SessionTableNameRef = React.useRef<Record<string, string>>({});
  // Cart the server + pending ops last produced for each v2 table (base for delta ops)
  const lastV2CartRef = React.useRef<Record<string, any>>({});
  // Snapshot of the table cart taken when "Gọi món" starts (base for "Lưu món", fixes #4)
  const orderingBaseCartRef = React.useRef<Record<string, any>>({});
  // Per-table checkout guard (#13)
  const payingTableIdsRef = React.useRef<Set<string>>(new Set());
  const activeTableIdRef = React.useRef<string | null>(null);
  activeTableIdRef.current = activeTable?.id || null;
  const tableCartsRef = React.useRef<{ [tableId: string]: { [cartItemId: string]: CartItem } }>({});
  tableCartsRef.current = tableCarts;
  type V2CheckoutLock = {
    tableId: string;
    sessionId: string;
    orderId: string;
    quoteId: string;
    provisional: boolean;
    amount: number;
    label: string;
    checkoutAt: string;
  };
  const [v2Checkout, setV2Checkout] = useState<V2CheckoutLock | null>(null);

  const parseMetaSafe = (raw: any): Record<string, any> => {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  const rememberV2Session = (tableId: string, sessionId: string, orderId: string, tableName?: string) => {
    if (!tableId || !sessionId) return;
    v2SessionsRef.current[tableId] = { sessionId, orderId: orderId || '' };
    if (tableName) v2SessionTableNameRef.current[sessionId] = tableName;
  };

  const forgetV2Session = (tableId: string) => {
    delete v2SessionsRef.current[tableId];
    delete lastV2CartRef.current[tableId];
    delete orderingBaseCartRef.current[tableId];
  };

  /** v2 session of a table, or null when the table must run the legacy flow */
  const getV2Session = (tableOrId: any): { sessionId: string; orderId: string } | null => {
    if (!v2 || !tableOrId) return null;
    const table = typeof tableOrId === 'string' ? tables.find(t => t.id === tableOrId) : tableOrId;
    const tableId = typeof tableOrId === 'string' ? tableOrId : tableOrId.id;
    const known = v2SessionsRef.current[tableId];
    const currentOrderId = table?.current_order_id && !String(table.current_order_id).startsWith('ORD-T-INPROG-')
      ? String(table.current_order_id)
      : '';
    // A session only counts when it belongs to the table's CURRENT order. Table/resource metadata can
    // still carry the session of a previous (closed) customer after a legacy reopen.
    if (known?.sessionId) {
      if (!currentOrderId || !known.orderId || known.orderId === currentOrderId) {
        return { sessionId: known.sessionId, orderId: known.orderId || currentOrderId };
      }
      return null;
    }
    // Offline-opened table: no order yet, its `open` is still queued on this device
    const metaSessionId = String(parseMetaSafe(table?.metadata).session_id || '');
    if (!currentOrderId && metaSessionId && v2.pendingFor(metaSessionId).some((e: any) => e.kind === 'open')) {
      return { sessionId: metaSessionId, orderId: '' };
    }
    return null;
  };

  const withoutTimeCharge = (cart: Record<string, any> | undefined) =>
    Object.fromEntries(
      Object.entries(cart || {}).filter(([cartItemId, it]: [string, any]) => !isTimeChargeProduct(it?.productId || cartItemId, it?.name))
    );

  const lastLayoutRefreshRef = React.useRef(0);
  const refreshTablesThrottled = () => {
    const now = Date.now();
    if (now - lastLayoutRefreshRef.current < 3000) return;
    lastLayoutRefreshRef.current = now;
    refreshTables?.();
  };

  const [tableConflict, setTableConflict] = useState<TableConflict | null>(null);

  const cleanStaticResourceMeta = useCallback((rawMeta: any, extraFields: Record<string, any> = {}) => {
    let parsed: Record<string, any> = {};
    try {
      parsed = typeof rawMeta === 'string' ? JSON.parse(rawMeta || '{}') : (rawMeta || {});
    } catch (e) {}
    const cleaned: Record<string, any> = { ...parsed, ...extraFields };
    delete cleaned.check_in;
    delete cleaned.session_id;
    delete cleaned.temp_checkout_time;
    delete cleaned.original_start_time;
    delete cleaned.original_temp_checkout_time;
    delete cleaned.guests;
    delete cleaned.guests_list;
    delete cleaned.num_guests;
    return JSON.stringify(cleaned);
  }, []);

  // Tự động thay đổi kích thước danh sách khách lưu trú khi thay đổi số khách
  useEffect(() => {
    setLodgingGuests(prev => {
      const current = [...prev];
      if (current.length < roomGuestCount) {
        while (current.length < roomGuestCount) {
          current.push({
            name: '',
            id_type: 'CCCD',
            id_number: '',
            idCard: '',
            expiry_date: '',
            nationality: 'Việt Nam',
            dob: '',
            gender: '',
            note: ''
          });
        }
      } else if (current.length > roomGuestCount) {
        return current.slice(0, roomGuestCount);
      }
      return current;
    });
  }, [roomGuestCount]);

  // Tự động lưu khách hàng được gán cho từng phòng bàn
  useEffect(() => {
    if (!isNavReady || isLoading) return;
    const saveTableCustomers = async () => {
      try {
        await AsyncStorage.setItem('temp_table_customers', JSON.stringify(tableCustomers));
      } catch (err) {
        console.error('Không thể lưu khách hàng phòng bàn:', err);
      }
    };
    saveTableCustomers();
  }, [tableCustomers, isNavReady, isLoading]);

  // Tự động lưu giỏ hàng gọi thêm của từng phòng bàn
  useEffect(() => {
    if (!isNavReady || isLoading) return;
    const saveTableCarts = async () => {
      try {
        await AsyncStorage.setItem('temp_table_carts', JSON.stringify(tableCarts));
      } catch (err) {
        console.error('Không thể lưu giỏ hàng phòng bàn:', err);
      }
    };
    saveTableCarts();
  }, [tableCarts, isNavReady, isLoading]);

  // Ticker đếm giờ cho bi-a / phòng bàn (cập nhật mỗi 15 giây thay vì 1 giây để tránh re-render toàn màn hình POS gây văng app)
  const [timeTicker, setTimeTicker] = useState(0);
  useEffect(() => {
    if (!isNavReady || shopVertical === 'retail') return;
    const timer = setInterval(() => {
      setTimeTicker(prev => prev + 1);
    }, 15000);
    return () => clearInterval(timer);
  }, [isNavReady, shopVertical]);

  // Tự động cập nhật tiền giờ trong giỏ hàng theo thời gian thực mỗi 10 giây khi đang mở modal thanh toán
  useEffect(() => {
    if (!isNavReady || !cartOwnerTable) return;
    
    // Nếu có mốc thời gian checkout yêu cầu trước hoặc phòng đã khóa giờ ra, không tick động nữa
    let rmd: any = {};
    try {
      rmd = typeof cartOwnerTable.metadata === 'string' ? JSON.parse(cartOwnerTable.metadata) : (cartOwnerTable.metadata || {});
    } catch (e) {
      console.warn('Cannot parse table metadata:', e);
    }
    if (rmd.actual_checkout_requested_at) return;
    // Table sync v2: the time charge is locked by the server quote (or the provisional amount)
    if (v2Checkout && v2Checkout.tableId === cartOwnerTable.id) return;

    const updateRealtimeBilliardTime = () => {
      const now = new Date();
      // 1. Tính toán lại tiền giờ tại thời điểm hiện tại
      const billing = calculateBilling(cartOwnerTable, now);
      
      const billingName = cartOwnerTable.type === 'room'
        ? `Tiền phòng - ${cartOwnerTable.name} (${billing.label})`
        : `Tiền giờ - ${cartOwnerTable.name} (${billing.label})`;

      setCart((prevCart: any) => {
        if (!prevCart || !prevCart['TIME_CHARGE']) return prevCart;
        
        // Nếu giá tiền và số lượng không đổi, không cập nhật để tránh re-render thừa
        const targetPrice = billing.unitPrice || billing.cost;
        const targetQty = billing.qty || 1;
        if (prevCart['TIME_CHARGE'].price === targetPrice && prevCart['TIME_CHARGE'].quantity === targetQty && prevCart['TIME_CHARGE'].name === billingName) {
          return prevCart;
        }

        return {
          ...prevCart,
          'TIME_CHARGE': {
            ...prevCart['TIME_CHARGE'],
            name: billingName,
            price: targetPrice,
            quantity: targetQty
          }
        };
      });
    };

    // Chạy lần đầu và thiết lập interval mỗi 10 giây
    updateRealtimeBilliardTime();
    const interval = setInterval(updateRealtimeBilliardTime, 10000);

    return () => clearInterval(interval);
  }, [cartOwnerTable, timeTicker, isNavReady, v2Checkout]);



  // Tính tiền giờ bàn bi-a
  const calculateBilling = (table: any, customCheckoutTime?: Date, rentalTypeOverride?: 'hourly' | 'overnight' | 'daily', chargeByMinuteOverride?: boolean) => {
    if (!table.startTime) return { hours: 0, minutes: 0, cost: 0, label: '0h 0p', details: '' };

    // Phân tích cấu hình metadata nâng cao
    let rmd: any = {};
    try {
      rmd = typeof table.metadata === 'string' ? JSON.parse(table.metadata) : (table.metadata || {});
    } catch (e) {
      console.warn('Không thể parse metadata của phòng bàn:', e);
    }

    const rentalType = rentalTypeOverride || rmd.rental_type || 'hourly';

    const formatCurrencyLocal = (value: number) => {
      return value.toLocaleString('vi-VN') + '₫';
    };

    if (rentalType === 'overnight') {
      const overnightRate = Number(rmd.overnight_rate) || Number(table.hourly_rate * 3) || 200000;
      const overnightGraceHours = Number(rmd.overnight_grace_hours) || 0;
      const checkInDate = new Date(table.startTime);
      const checkOutDate = customCheckoutTime || (table.checkoutTime ? new Date(table.checkoutTime) : new Date());
      
      const d1 = new Date(checkInDate.getFullYear(), checkInDate.getMonth(), checkInDate.getDate());
      const d2 = new Date(checkOutDate.getFullYear(), checkOutDate.getMonth(), checkOutDate.getDate());
      const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
      
      const totalHours = (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60);
      let nights = Math.max(1, diffDays);
      if (diffDays > 0) {
        const standardCycleHours = diffDays * 24;
        if (totalHours > (standardCycleHours + overnightGraceHours)) {
          nights = Math.ceil(totalHours / 24);
        }
      }
      const cost = nights * overnightRate;

      return {
        hours: 0,
        minutes: 0,
        cost,
        qty: nights,
        unitPrice: overnightRate,
        label: `${nights} đêm`,
        details: `Thuê qua đêm: ${nights} đêm x ${formatCurrencyLocal(overnightRate)}/đêm`
      };
    }

    if (rentalType === 'daily') {
      const dailyRate = Number(rmd.daily_rate) || Number(rmd.overnight_rate) || Number(table.hourly_rate * 3) || 200000;
      const dailyGraceHours = Number(rmd.daily_grace_hours) || 2;
      const checkInDate = new Date(table.startTime);
      const checkOutDate = customCheckoutTime || (table.checkoutTime ? new Date(table.checkoutTime) : new Date());
      
      const totalHours = (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60);
      const completedDays = Math.floor(totalHours / 24);
      const excessHours = totalHours % 24;
      const days = Math.max(1, completedDays + (excessHours > dailyGraceHours ? 1 : 0));
      const cost = days * dailyRate;

      return {
        hours: 0,
        minutes: 0,
        cost,
        qty: days,
        unitPrice: dailyRate,
        label: `${days} ngày`,
        details: `Thuê theo ngày: ${days} ngày x ${formatCurrencyLocal(dailyRate)}/ngày`
      };
    }

    const hourlyRate = Number(table.hourly_rate) || 0;
    const checkInDate = new Date(table.startTime);
    const checkOutDate = customCheckoutTime || (table.checkoutTime ? new Date(table.checkoutTime) : new Date());

    const resolvedChargeByMinute = chargeByMinuteOverride !== undefined
      ? chargeByMinuteOverride
      : (rmd.advanced_pricing?.charge_by_minute ?? rmd.charge_by_minute);

    const pricingResult = calculateHourlyBilling({
      checkIn: checkInDate,
      checkOut: checkOutDate,
      standardRate: hourlyRate,
      config: resolvedChargeByMinute !== undefined
        ? { ...(rmd.advanced_pricing || {}), charge_by_minute: Boolean(resolvedChargeByMinute) }
        : rmd.advanced_pricing
    });

    const diffMs = Math.max(0, checkOutDate.getTime() - checkInDate.getTime());
    const totalMinutes = Math.ceil(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return {
      hours,
      minutes,
      cost: pricingResult.totalAmount,
      label: pricingResult.durationLabel,
      details: pricingResult.detailsLabel
    };
  };

  // Gom nhóm phòng bàn theo khu vực/tầng
  const groupedZones = React.useMemo(() => {
    const groups: { [key: string]: any[] } = {};
    for (const t of tables) {
      const zone = t.zone || 'Chưa phân vùng';
      if (!groups[zone]) {
        groups[zone] = [];
      }
      groups[zone].push(t);
    }
    return groups;
  }, [tables]);

  // Thêm vào giỏ





  // Các hàm tiện ích đồng bộ hóa thời gian thực trực tuyến cho phòng/bàn
  const fetchActiveTableSessionOnline = async (tableId: string, orderId: string | null) => {
    if (!isOnline) return null;

    try {
      const currentUrl = getApiBaseUrl();
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const headers = await getApiHeaders();

      // A. Tải chi tiết vị trí (room) từ cloud để lấy metadata mới nhất
      let latestResource: any = null;
      try {
        const resourceRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${tableId}?t=${Date.now()}`, { headers });
        if (resourceRes.ok) {
          latestResource = await resourceRes.json();
        }
      } catch (resErr) {
        console.log('Không thể tải metadata phòng từ Cloud:', resErr);
      }

      // Quan trọng: Phải luôn ưu tiên ID từ Cloud thay vì ID cũ từ SQLite
      let resolvedOrderId = latestResource?.current_order_id || orderId;

      // Table sync v2: session id from the server resource first (it may have been reopened elsewhere),
      // then what this device knows about the table.
      const v2LocalSession = getV2Session(tableId);
      // The resource's session_id is only trusted while the table has no live order (offline open);
      // otherwise the order's own metadata decides (read below in syncActiveTableSession).
      const v2SessionId = v2
        ? String(
            v2LocalSession?.sessionId ||
            (!latestResource?.current_order_id ? parseMetaSafe(latestResource?.metadata).session_id : '') ||
            ''
          )
        : '';

      // Nếu Cloud trả về available hoặc dirty/cleaning và không có order:
      // KIỂM TRA BẢO VỆ: Nếu bàn đang trong quá trình mở hoặc có đơn in_progress cục bộ chưa đồng bộ xong (ORD-T-INPROG- / pending),
      // tuyệt đối KHÔNG được đánh dấu isFinished = true (tránh lỗi đang dùng bị tự động thoát bàn!).
      if (latestResource && (latestResource.status === 'available' || latestResource.status === 'dirty' || latestResource.status === 'cleaning') && !latestResource.current_order_id) {
        if (openingTableIdsRef.current.has(tableId)) {
          return null;
        }

        // v2: no SQLite self-heal / local deletion / 12h rule. A session opened offline on this
        // device stays until its queued `open` is sent; otherwise the server says the table is free.
        if (v2 && v2SessionId) {
          if (v2.pendingFor(v2SessionId).some(e => e.kind === 'open')) return null;
          return { isFinished: true, resourceStatus: latestResource.status };
        }

        if (Platform.OS !== 'web') {
          try {
            let localPendingOrder: any = null;
            if (orderId) {
              const found = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId)).limit(1);
              if (found[0] && found[0].status === 'in_progress' && (found[0].sync_status === 'pending' || String(found[0].id).startsWith('ORD-T-INPROG-'))) {
                localPendingOrder = found[0];
              }
            }
            if (!localPendingOrder) {
              const byRes = await db.select().from(schema.orders).where(and(eq(schema.orders.resource_id, tableId), eq(schema.orders.status, 'in_progress'))).limit(1);
              if (byRes[0] && (byRes[0].sync_status === 'pending' || String(byRes[0].id).startsWith('ORD-T-INPROG-'))) {
                localPendingOrder = byRes[0];
              }
            }

            if (localPendingOrder) {
              let latestResMeta: any = {};
              let localOrdMeta: any = {};
              try {
                latestResMeta = latestResource.metadata
                  ? (typeof latestResource.metadata === 'string' ? JSON.parse(latestResource.metadata) : latestResource.metadata)
                  : {};
              } catch {}
              try {
                localOrdMeta = localPendingOrder.metadata
                  ? (typeof localPendingOrder.metadata === 'string' ? JSON.parse(localPendingOrder.metadata) : localPendingOrder.metadata)
                  : {};
              } catch {}

              const lastCheckoutMs = latestResMeta?.last_checkout_time ? new Date(latestResMeta.last_checkout_time).getTime() : 0;
              const localCheckInIso = localOrdMeta?.check_in || localPendingOrder.created_at || '';
              const localCheckInMs = localCheckInIso ? new Date(localCheckInIso).getTime() : 0;
              const ageMs = localCheckInMs > 0 ? (Date.now() - localCheckInMs) : Infinity;

              const isTempLocalInProg = String(localPendingOrder.id).startsWith('ORD-T-INPROG-');
              const isBeforeLastCheckout = lastCheckoutMs > 0 && localCheckInMs > 0 && localCheckInMs < lastCheckoutMs - 5000;
              const isStaleOfflineOpen =
                ageMs > 12 * 60 * 60 * 1000 ||
                closedOrderIdsRef.current.has(String(localPendingOrder.id));

              // Nếu đơn local đã từng có ID server (nhưng nay server đã giải phóng bàn),
              // hoặc giờ vào cũ hơn lần trả bàn gần nhất trên Cloud, hoặc đơn tạm từ hôm trước (> 12h):
              // -> Đây là đơn mồ côi cũ trong SQLite, xóa sạch để không bao giờ hồi sinh bàn đã đóng!
              if (!isTempLocalInProg || isBeforeLastCheckout || isStaleOfflineOpen) {
                await db.delete(schema.orders).where(eq(schema.orders.id, localPendingOrder.id));
                await db.delete(schema.order_items).where(eq(schema.order_items.order_id, localPendingOrder.id));
              } else {
                // Tự động đẩy đơn mở lúc rớt mạng (kèm toàn bộ món đã gọi lúc offline) lên Cloud khi có mạng lại
                (async () => {
                  try {
                    const localItems = await db
                      .select()
                      .from(schema.order_items)
                      .where(eq(schema.order_items.order_id, localPendingOrder.id));
                    const mappedBatchItems = localItems.map((it: any) => ({
                      product_id: it.product_id,
                      product_name: it.product_name,
                      qty: it.qty,
                      unit_price: it.unit_price,
                      original_price: it.original_price ?? it.unit_price,
                      discount_amount: it.discount_amount || 0,
                      line_total: it.line_total,
                      tax_rate: it.tax_rate || '0',
                      tax_amount: it.tax_amount || 0,
                      tax_group: it.tax_group || '',
                      tax_vat_rate: it.tax_vat_rate || '0',
                      tax_pit_rate: it.tax_pit_rate || '0',
                    }));
                    const syncRes = await fetch(`${currentUrl}/api/shops/${shopId}/orders/sync-batch`, {
                      method: 'POST',
                      headers: { ...headers, 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        local_order_id: localPendingOrder.id,
                        order: {
                          status: 'in_progress',
                          channel: 'pos-mobile',
                          customer_id: localPendingOrder.customer_id || 'C-DEFAULT-RETAIL',
                          customer_name: localPendingOrder.customer_name || 'Khách lẻ',
                          branch_id: shopId,
                          employee_id: currentUserEmail,
                          subtotal: localPendingOrder.total_amount || 0,
                          total_amount: localPendingOrder.total_amount || 0,
                          paid_amount: 0,
                          resource_id: tableId,
                          created_at: localPendingOrder.created_at || new Date().toISOString(),
                          metadata: localPendingOrder.metadata || '{}',
                        },
                        items: mappedBatchItems,
                        payments: [],
                      }),
                    });
                    if (syncRes.ok) {
                      const syncData = await syncRes.json().catch(() => ({}));
                      if (syncData.skipped_stale_in_progress) {
                        await db.delete(schema.orders).where(eq(schema.orders.id, localPendingOrder.id));
                        await db.delete(schema.order_items).where(eq(schema.order_items.order_id, localPendingOrder.id));
                        return;
                      }
                      const serverOrderId = syncData.order_id;
                      if (serverOrderId) {
                        await db.update(schema.location_resources).set({ current_order_id: serverOrderId, status: 'occupied' }).where(eq(schema.location_resources.id, tableId));
                        await db.update(schema.orders).set({ id: serverOrderId, sync_status: 'synced', updated_at: new Date().toISOString() }).where(eq(schema.orders.id, localPendingOrder.id));
                        await db.update(schema.order_items).set({ order_id: serverOrderId }).where(eq(schema.order_items.order_id, localPendingOrder.id));
                        setTables(prev => prev.map(t => t.id === tableId ? { ...t, current_order_id: serverOrderId, status: 'occupied' } : t));
                        setActiveTable((prev: any) => prev && prev.id === tableId ? { ...prev, current_order_id: serverOrderId, status: 'occupied' } : prev);
                        setCartOwnerTable((prev: any) => prev && prev.id === tableId ? { ...prev, current_order_id: serverOrderId, status: 'occupied' } : prev);
                        pendingItemSyncByOrderRef.current.delete(localPendingOrder.id);
                      }
                    }
                  } catch (healErr) {
                    console.warn('[Self-heal Pending Table] Lỗi đồng bộ lại bàn:', healErr);
                  }
                })();
                return null;
              }
            }
          } catch (checkErr) {}
        } else if (orderId && String(orderId).startsWith('ORD-T-INPROG-')) {
          return null;
        }

        return { isFinished: true, resourceStatus: latestResource.status };
      }

      // v2: one snapshot call returns the session, its order and its lines (#17)
      if (v2 && v2SessionId) {
        const snap = await callTableSessionApi(shopId, `/${encodeURIComponent(v2SessionId)}`, 'GET');
        const snapSession = snap.body?.session;
        if (snap.status === 200 && snapSession) {
          const snapOrderId = String(snapSession.order_id || '');
          const resourceOrderId = String(latestResource?.current_order_id || '');
          const tableNowHasOtherOrder = !!resourceOrderId && resourceOrderId !== snapOrderId;
          if (!tableNowHasOtherOrder) {
            if (snapSession.status !== 'open' || (snapSession.resource_id && snapSession.resource_id !== tableId)) {
              return { isFinished: true, resourceStatus: latestResource?.status === 'occupied' ? 'available' : (latestResource?.status || 'available') };
            }
            return { order: snap.body.order || null, items: snap.body.items || [], resource: latestResource, isFinished: false, v2SessionId };
          }
          // The table now holds another order (legacy or other session): read it below
        } else if (snap.status === 404 && v2.pendingFor(v2SessionId).some(e => e.kind === 'open')) {
          return null;
        } else if (snap.status !== 404) {
          return null;
        }
      }

      let orderData: any = null;

      // TỰ ĐỘNG CHỮA LÀNH (Self-heal): Nếu không có orderId cục bộ nhưng trạng thái là đang ở/chơi
      // thì truy vấn danh sách order in_progress trên server để đối chiếu resource_id.
      if (!resolvedOrderId) {
        const ordersRes = await fetch(`${currentUrl}/api/shops/${shopId}/orders?status=in_progress&limit=100&t=${Date.now()}`, { headers });
        if (ordersRes.ok) {
          const ordersData = await ordersRes.json();
          const list = ordersData.data || [];
          
          // Sắp xếp giảm dần theo created_at để ưu tiên order mới nhất nếu bị stuck
          list.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
          
          const matched = list.find((o: any) => {
            try {
              const meta = typeof o.metadata === 'string' ? JSON.parse(o.metadata) : (o.metadata || {});
              // Đơn bị server gắn cờ cần kiểm tra (đơn cũ còn món) không được chọn làm đơn đang mở của bàn
              if (meta.needs_review === true || meta.needs_review === 'true') return false;
              return meta.resource_id === tableId;
            } catch (e) {
              return false;
            }
          });
          if (matched) {
            resolvedOrderId = matched.id;
            orderData = matched;
          }
        }
      }

      if (!resolvedOrderId) {
        return latestResource ? { order: null, items: [], resource: latestResource } : null;
      }

      if (!orderData) {
        const orderRes = await fetch(`${currentUrl}/api/shops/${shopId}/orders/${resolvedOrderId}?t=${Date.now()}`, { headers });
        if (!orderRes.ok) {
          return latestResource ? { order: null, items: [], resource: latestResource } : null;
        }
        orderData = await orderRes.json();
      }

      // 2. Tải chi tiết các Món ăn/Dịch vụ gọi kèm của đơn hàng
      const itemsRes = await fetch(`${currentUrl}/api/shops/${shopId}/order-items?order_id=${resolvedOrderId}&limit=200&t=${Date.now()}`, { headers });
      if (!itemsRes.ok) {
        return { order: orderData, items: [], resource: latestResource };
      }
      const itemsData = await itemsRes.json();
      const rawItems = itemsData.data || [];

      let isFinished = false;
      if (orderData && (orderData.status === 'completed' || orderData.status === 'cancelled')) {
        isFinished = true;
      }

      return { order: orderData, items: rawItems, resource: latestResource, isFinished };
    } catch (err) {
      console.warn('Lỗi khi tải chi tiết phòng/bàn từ server:', err);
      return null;
    }
  };

  // Báo xung đột thay vì đẩy món khi giỏ hàng không thuộc phiên hiện tại của đơn/bàn trên server.
  // Món local vẫn nằm trong SQLite (theo localOrderId) để màn xử lý xung đột gộp/thay thế/bỏ.
  // Nếu đơn server đã đóng: ưu tiên đối chiếu với phiên đang mở trên bàn; không có thì server sẽ cất
  // món vào một đơn "cần kiểm tra" khi người dùng chọn gộp/thay thế (resolve-conflict).
  const raiseItemSyncSessionConflict = async (params: {
    tableId: string;
    localOrderId: string;
    cartItems: any;
    localCheckIn: any;
    serverOrderId: string;
    currentUrl: string;
    shopId: string;
    headers: any;
  }) => {
    const { tableId, localOrderId, cartItems, localCheckIn, currentUrl, shopId, headers } = params;
    let serverOrderId = params.serverOrderId;
    if (localOrderId) pendingItemSyncByOrderRef.current.delete(localOrderId);

    const localItems = Object.entries(cartItems || {})
      .filter(([cartItemId, it]: [string, any]) => !isTimeChargeProduct(it?.productId || cartItemId, it?.name))
      .map(([, it]: [string, any]) => ({
        product_name: it?.name || '',
        qty: Number(it?.quantity || 1),
        unit_price: Number(it?.price || 0),
      }));
    if (!tableId || localItems.length === 0) return;

    try {
      const fetchOrder = async (id: string) => {
        const r = await fetch(`${currentUrl}/api/shops/${shopId}/orders/${id}?t=${Date.now()}`, { headers });
        return r.ok ? await r.json().catch(() => null) : null;
      };
      let serverOrder: any = await fetchOrder(serverOrderId);
      if (serverOrder && (serverOrder.status === 'completed' || serverOrder.status === 'cancelled')) {
        const resRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${tableId}?t=${Date.now()}`, { headers });
        const resData = resRes.ok ? await resRes.json().catch(() => null) : null;
        const currentId = resData?.current_order_id ? String(resData.current_order_id) : '';
        if (currentId && currentId !== serverOrderId && !currentId.startsWith('ORD-T-INPROG-')) {
          const currentOrder = await fetchOrder(currentId);
          if (currentOrder && currentOrder.status === 'in_progress') {
            serverOrderId = currentId;
            serverOrder = currentOrder;
          }
        }
      }

      let serverItems: any[] = [];
      try {
        const itemsRes = await fetch(`${currentUrl}/api/shops/${shopId}/order-items?order_id=${serverOrderId}&limit=200&t=${Date.now()}`, { headers });
        if (itemsRes.ok) {
          const itemsData = await itemsRes.json();
          serverItems = (itemsData.data || []).filter((it: any) => !isTimeChargeProduct(it.product_id, it.product_name));
        }
      } catch {}

      let serverMeta: any = {};
      try { serverMeta = typeof serverOrder?.metadata === 'string' ? JSON.parse(serverOrder.metadata || '{}') : (serverOrder?.metadata || {}); } catch {}

      const conflict: TableConflict = {
        tableId,
        localOrderId,
        localItems,
        localCheckIn: String(localCheckIn || ''),
        localCustomerName: tableCustomers[tableId]?.name || 'Khách lẻ',
        existingOrder: {
          order_id: serverOrderId,
          order_no: serverOrder?.order_no || '',
          check_in: String(serverMeta.check_in || serverOrder?.created_at || ''),
          customer_name: serverOrder?.customer_name || 'Khách lẻ',
          items_count: serverItems.length,
          items_summary: serverItems.map((it: any) => ({ name: it.product_name || '', qty: Number(it.qty || 1) })),
          total_amount: Number(serverOrder?.total_amount || 0),
        },
      };
      await AsyncStorage.setItem(`table_conflict:${tableId}`, JSON.stringify({ ...conflict, detectedAt: new Date().toISOString() }));
      setTableConflict(conflict);
      console.log(`[TableSync] Giỏ của phiên ${localOrderId} không thuộc đơn ${serverOrderId} trên bàn ${tableId} — giữ làm xung đột, không đẩy món`);
    } catch (err) {
      console.warn('[TableSync] Không thể tạo xung đột phiên bàn:', err);
    }
  };

  const syncOrderItemsOnline = async (
    orderId: string,
    cartItems: any,
    tableId?: string,
    baseCart?: any,
    opts?: { kitchenFire?: boolean; voidReason?: string },
  ) => {
    // Table sync v2: send only the DIFFERENCE between the cart the user started from and the cart
    // they saved, through the persistent outbox (no SQLite rows, no absolute PUT/POST/DELETE).
    const v2Session = tableId ? getV2Session(tableId) : null;
    if (v2 && v2Session && tableId) {
      try {
        const base = withoutTimeCharge(baseCart ?? lastV2CartRef.current[tableId] ?? {});
        const next = withoutTimeCharge(cartItems);
        const ops = diffCartToOps(base as any, next as any);
        // Bar/Bếp K3 "Lưu & báo bếp": flag the last op; the server sends everything unsent for the
        // table once it applies. Rides the outbox, so it also works after an offline save.
        if (opts?.kitchenFire && ops.length > 0) {
          ops[ops.length - 1] = { ...ops[ops.length - 1], kitchen_fire: true } as (typeof ops)[number];
        }
        // Bar/Bếp: an approved cut into dishes already sent → cancel ticket with its reason, now
        if (opts?.voidReason) {
          for (let i = 0; i < ops.length; i++) {
            const op = ops[i] as any;
            if (op.type === 'remove_item' || (op.type === 'change_qty' && Number(op.delta) < 0)) {
              ops[i] = { ...op, note: `Lý do: ${opts.voidReason}`, kitchen_fire: true };
            }
          }
        }
        if (ops.length > 0) await v2.enqueueOps(v2Session.sessionId, ops);
        lastV2CartRef.current[tableId] = next;
        return true;
      } catch (err) {
        console.warn('[TableSyncV2] Không thể ghi thao tác vào hàng đợi:', err);
        return false;
      }
    }

    const initialOrderId =
      orderId ||
      (tableId ? tables.find(t => t.id === tableId)?.current_order_id : '') ||
      '';

    if (initialOrderId) {
      pendingItemSyncByOrderRef.current.set(initialOrderId, {
        tableId: tableId || '',
        cartItems,
      });
    }

    // 1. Lưu ngay xuống SQLite cục bộ TRƯỚC khi kiểm tra mạng (để khi máy rớt mạng vẫn lưu 100% vào SQLite & tự đẩy lên khi có mạng lại)
    if (Platform.OS !== 'web' && initialOrderId) {
      try {
        await db.delete(schema.order_items).where(eq(schema.order_items.order_id, initialOrderId));
        let localItemsSubtotal = 0;
        for (const [cartItemId, cartItem] of Object.entries(cartItems) as [string, any][]) {
          if (isTimeChargeProduct(cartItem.productId || cartItemId, cartItem.name)) continue;
          const productId = cartItem.productId || cartItemId;
          const modifierTotal = Number(cartItem.modifier_total || 0);
          const lineTotal = (Number(cartItem.price) + modifierTotal) * Number(cartItem.quantity);
          localItemsSubtotal += lineTotal;
          await db.insert(schema.order_items).values({
            id: `ORDI-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
            order_id: initialOrderId,
            product_id: productId,
            product_name: cartItem.name || '',
            qty: Number(cartItem.quantity) || 1,
            unit_price: Number(cartItem.price) || 0,
            original_price: Number(cartItem.original_price ?? cartItem.price) || 0,
            discount_amount: Number(cartItem.discount_amount || 0),
            line_total: lineTotal,
            tax_rate: String(cartItem.tax_rate || '0'),
            tax_amount: 0,
            tax_group: String(cartItem.tax_group || ''),
            tax_vat_rate: '0',
            tax_pit_rate: '0',
          }).catch(() => {});
        }
        await db
          .update(schema.orders)
          .set({
            total_amount: localItemsSubtotal,
            sync_status: 'pending',
            updated_at: new Date().toISOString(),
          })
          .where(eq(schema.orders.id, initialOrderId))
          .catch(() => {});
      } catch {}
    }

    if (!isOnline) return false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const getModifiersHash = (modifiers: any) => {
      if (!modifiers) return 'none';
      try {
        const parsed = typeof modifiers === 'string' ? JSON.parse(modifiers) : modifiers;
        if (!Array.isArray(parsed) || parsed.length === 0) return 'none';
        return parsed
          .map((modifier: any) => modifier.option || modifier.name || modifier.id || '')
          .filter(Boolean)
          .sort()
          .join(',') || 'none';
      } catch {
        return 'none';
      }
    };

    const getItemKey = (productId: string, variantLabel: string, modifiers: any) =>
      `${productId}_${variantLabel || 'none'}_${getModifiersHash(modifiers)}`;

    if (tableId) {
      syncingItemsTableIdsRef.current.add(tableId);
    }

    try {
      const currentUrl = getApiBaseUrl();
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const headers = await getApiHeaders();

      let effectiveOrderId = initialOrderId;

      // Giờ vào (check_in) của phiên mà giỏ hàng này thuộc về — dùng để không đẩy món sang phiên/khách khác
      const localTableForSession = tableId ? tables.find(t => t.id === tableId) : undefined;
      let localSessionCheckIn: any = '';
      try {
        const localMeta = typeof localTableForSession?.metadata === 'string'
          ? JSON.parse(localTableForSession.metadata || '{}')
          : (localTableForSession?.metadata || {});
        localSessionCheckIn = localMeta.check_in || '';
      } catch {}
      if (!localSessionCheckIn && localTableForSession?.startTime) {
        localSessionCheckIn = new Date(localTableForSession.startTime).toISOString();
      }
      // Không đủ dữ liệu để so thì giữ hành vi cũ (tin server)
      const matchesLocalSession = (serverCheckIn: any) =>
        !localSessionCheckIn || !serverCheckIn || isSameCheckIn(localSessionCheckIn, serverCheckIn);
      // Đơn trên server KHÔNG thuộc phiên của giỏ này (bàn đã đóng/mở lại) -> không đẩy món, báo xung đột
      let sessionMismatchOrderId = '';

      // Nếu orderId trống hoặc đang là mã tạm ORD-T-INPROG-, tra cứu mã đơn thực tế từ Server qua tableId
      // Nếu trên Server bàn vẫn đang trống (do đơn được tạo lúc máy rớt mạng), tự động khởi tạo phiên bàn lên Server ngay!
      if ((!effectiveOrderId || String(effectiveOrderId).startsWith('ORD-T-INPROG-')) && tableId) {
        try {
          const resCheck = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${tableId}?t=${Date.now()}`, {
            headers,
            signal: controller.signal,
          });
          if (resCheck.ok) {
            const resData = await resCheck.json();
            if (resData?.current_order_id && !String(resData.current_order_id).startsWith('ORD-T-INPROG-')) {
              let resMeta: any = {};
              try { resMeta = typeof resData.metadata === 'string' ? JSON.parse(resData.metadata || '{}') : (resData.metadata || {}); } catch {}
              if (matchesLocalSession(resMeta.check_in)) {
                effectiveOrderId = resData.current_order_id;
              } else {
                sessionMismatchOrderId = String(resData.current_order_id);
              }
            }
          }
          if (!sessionMismatchOrderId && (!effectiveOrderId || String(effectiveOrderId).startsWith('ORD-T-INPROG-'))) {
            const ordersCheck = await fetch(`${currentUrl}/api/shops/${shopId}/orders?status=in_progress&limit=100&t=${Date.now()}`, {
              headers,
              signal: controller.signal,
            });
            if (ordersCheck.ok) {
              const ordersData = await ordersCheck.json();
              const matchedOrder = (ordersData.data || []).find((o: any) => {
                if (effectiveOrderId && o.reference_no === effectiveOrderId) return true;
                let meta: any = {};
                try { meta = typeof o.metadata === 'string' ? JSON.parse(o.metadata || '{}') : (o.metadata || {}); } catch {}
                if (meta.needs_review === true || meta.needs_review === 'true') return false;
                return (meta.resource_id || o.resource_id) === tableId;
              });
              if (matchedOrder) {
                let matchedMeta: any = {};
                try { matchedMeta = typeof matchedOrder.metadata === 'string' ? JSON.parse(matchedOrder.metadata || '{}') : (matchedOrder.metadata || {}); } catch {}
                const matchedByOwnRef = !!effectiveOrderId && matchedOrder.reference_no === effectiveOrderId;
                if (matchedByOwnRef || matchesLocalSession(matchedMeta.check_in)) {
                  effectiveOrderId = matchedOrder.id || matchedOrder.order_id;
                } else {
                  sessionMismatchOrderId = String(matchedOrder.id || matchedOrder.order_id);
                }
              }
            }
          }

          // Nếu trên Server bàn vẫn đang trống (chưa có đơn in_progress vì bàn được mở lúc rớt mạng),
          // tự động đẩy phiên bàn in_progress lên Server qua sync-batch để lấy serverOrderId chính thức!
          // (Bỏ qua nếu bàn đang thuộc phiên khác — sẽ báo xung đột bên dưới.)
          if (!sessionMismatchOrderId && (!effectiveOrderId || String(effectiveOrderId).startsWith('ORD-T-INPROG-'))) {
            const localTableObj = tables.find(t => t.id === tableId);
            let localOrdRow: any = null;
            if (Platform.OS !== 'web' && effectiveOrderId) {
              const rows = await db.select().from(schema.orders).where(eq(schema.orders.id, effectiveOrderId)).limit(1).catch(() => []);
              localOrdRow = rows[0] || null;
            }
            const fallbackLocalId = effectiveOrderId || `ORD-T-INPROG-${Date.now()}`;
            const batchMeta =
              localOrdRow?.metadata ||
              localTableObj?.metadata ||
              JSON.stringify({
                resource_id: tableId,
                resource_name: localTableObj?.name || '',
                check_in: localTableObj?.startTime ? new Date(localTableObj.startTime).toISOString() : new Date().toISOString(),
              });
            const batchRes = await fetch(`${currentUrl}/api/shops/${shopId}/orders/sync-batch`, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                local_order_id: fallbackLocalId,
                order: {
                  status: 'in_progress',
                  channel: 'pos-mobile',
                  customer_id: localOrdRow?.customer_id || tableCustomers[tableId]?.id || 'C-DEFAULT-RETAIL',
                  customer_name: localOrdRow?.customer_name || tableCustomers[tableId]?.name || 'Khách lẻ',
                  branch_id: shopId,
                  employee_id: currentUserEmail,
                  subtotal: localOrdRow?.total_amount || 0,
                  total_amount: localOrdRow?.total_amount || 0,
                  paid_amount: 0,
                  resource_id: tableId,
                  created_at: localOrdRow?.created_at || new Date().toISOString(),
                  metadata: batchMeta,
                },
                items: [],
                payments: [],
              }),
            });
            if (batchRes.ok) {
              const batchData = await batchRes.json().catch(() => ({}));
              if (batchData.order_id && !batchData.skipped_stale_in_progress) {
                effectiveOrderId = batchData.order_id;
              }
            }
          }

          if (effectiveOrderId && !String(effectiveOrderId).startsWith('ORD-T-INPROG-')) {
            setTables(prev => prev.map(t => t.id === tableId ? { ...t, current_order_id: effectiveOrderId, status: 'occupied' } : t));
            setActiveTable((prev: any) => prev && prev.id === tableId ? { ...prev, current_order_id: effectiveOrderId, status: 'occupied' } : prev);
            setCartOwnerTable((prev: any) => prev && prev.id === tableId ? { ...prev, current_order_id: effectiveOrderId, status: 'occupied' } : prev);
            if (Platform.OS !== 'web') {
              await db
                .update(schema.location_resources)
                .set({ current_order_id: effectiveOrderId, status: 'occupied' })
                .where(eq(schema.location_resources.id, tableId))
                .catch(() => {});
              if (initialOrderId && initialOrderId !== effectiveOrderId) {
                await db
                  .update(schema.orders)
                  .set({ id: effectiveOrderId, sync_status: 'synced', updated_at: new Date().toISOString() })
                  .where(eq(schema.orders.id, initialOrderId))
                  .catch(() => {});
                await db
                  .update(schema.order_items)
                  .set({ order_id: effectiveOrderId })
                  .where(eq(schema.order_items.order_id, initialOrderId))
                  .catch(() => {});
              }
            }
          }
        } catch (resolveErr) {
          console.warn('Không thể phân giải current_order_id từ server:', resolveErr);
        }
      }

      // Đơn thật đã đóng (thanh toán/huỷ ở máy khác trong lúc máy này offline) -> không đẩy món vào đơn đã đóng
      if (!sessionMismatchOrderId && effectiveOrderId && !String(effectiveOrderId).startsWith('ORD-T-INPROG-')) {
        const ordStatusRes = await fetch(`${currentUrl}/api/shops/${shopId}/orders/${effectiveOrderId}?t=${Date.now()}`, {
          headers,
          signal: controller.signal,
        });
        if (ordStatusRes.ok) {
          const ordStatus = await ordStatusRes.json().catch(() => null);
          if (ordStatus && (ordStatus.status === 'completed' || ordStatus.status === 'cancelled')) {
            sessionMismatchOrderId = String(effectiveOrderId);
          }
        }
      }

      if (sessionMismatchOrderId) {
        await raiseItemSyncSessionConflict({
          tableId: tableId || '',
          localOrderId: initialOrderId || effectiveOrderId || '',
          cartItems,
          localCheckIn: localSessionCheckIn,
          serverOrderId: sessionMismatchOrderId,
          currentUrl,
          shopId,
          headers,
        });
        return false;
      }

      if (!effectiveOrderId) {
        throw new Error(`Không tìm thấy mã đơn hàng của ${resourceNouns.noun} để đồng bộ món`);
      }

      const serverItemsRes = await fetch(`${currentUrl}/api/shops/${shopId}/order-items?order_id=${effectiveOrderId}&limit=200&t=${Date.now()}`, {
        headers,
        signal: controller.signal,
      });
      if (!serverItemsRes.ok) {
        throw new Error(`Không thể tải món trên server (${serverItemsRes.status})`);
      }

      const serverItemsData = await serverItemsRes.json();
      const serverItems = serverItemsData.data || [];
      const serverItemsMap = new Map<string, any[]>();
      // Tập món máy này đã từng thấy cho đơn -> chỉ những món này mới được phép xoá
      const knownServerItemIds = await loadKnownServerItemIds(effectiveOrderId);
      const touchedServerItemIds: string[] = [];

      for (const item of serverItems) {
        const key = getItemKey(item.product_id, item.variant_label, item.modifiers);
        const matches = serverItemsMap.get(key) || [];
        matches.push(item);
        serverItemsMap.set(key, matches);
      }

      let index = 1;
      for (const [cartItemId, cartItem] of Object.entries(cartItems) as [string, any][]) {
        if (isTimeChargeProduct(cartItem.productId || cartItemId, cartItem.name)) continue;

        const productId = cartItem.productId || cartItemId;
        const itemKey = getItemKey(productId, cartItem.variant_label, cartItem.modifiers);
        const matches = serverItemsMap.get(itemKey) || [];
        const existing = matches.shift();
        if (matches.length > 0) serverItemsMap.set(itemKey, matches);
        else serverItemsMap.delete(itemKey);

        const modifierTotal = Number(cartItem.modifier_total || 0);
        const lineTotal = (Number(cartItem.price) + modifierTotal) * Number(cartItem.quantity);
        const lineNo = String(index++);

        if (existing) {
          const existingId = existing.item_id || existing.id;
          if (!existingId) throw new Error('Món trên server không có mã định danh');
          touchedServerItemIds.push(String(existingId));

          const needsUpdate =
            Number(existing.qty) !== Number(cartItem.quantity) ||
            Number(existing.unit_price) !== Number(cartItem.price) ||
            Number(existing.modifier_total || 0) !== modifierTotal ||
            Number(existing.line_total) !== lineTotal;

          if (needsUpdate) {
            const updateRes = await fetch(`${currentUrl}/api/shops/${shopId}/order-items/${existingId}`, {
              method: 'PUT',
              headers: { ...headers, 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                qty: String(cartItem.quantity),
                line_total: String(lineTotal),
                unit_price: String(cartItem.price),
                original_price: String(cartItem.original_price ?? cartItem.price),
                discount_amount: String(cartItem.discount_amount || 0),
                variant_label: cartItem.variant_label || '',
                modifiers: cartItem.modifiers ? JSON.stringify(cartItem.modifiers) : '',
                modifier_total: String(modifierTotal),
              })
            });
            if (!updateRes.ok) {
              throw new Error(`Không thể cập nhật món trên server (${updateRes.status})`);
            }
          }
        } else {
          const createRes = await fetch(`${currentUrl}/api/shops/${shopId}/order-items`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              order_id: effectiveOrderId,
              line_no: lineNo,
              product_id: productId,
              product_name: cartItem.name,
              qty: String(cartItem.quantity),
              unit_price: String(cartItem.price),
              original_price: String(cartItem.original_price ?? cartItem.price),
              discount_amount: String(cartItem.discount_amount || 0),
              line_total: String(lineTotal),
              line_discount: '0',
              variant_label: cartItem.variant_label || '',
              modifiers: cartItem.modifiers ? JSON.stringify(cartItem.modifiers) : '',
              modifier_total: String(modifierTotal),
            })
          });
          if (!createRes.ok) {
            throw new Error(`Không thể thêm món lên server (${createRes.status})`);
          }
          const createdItem = await createRes.json().catch(() => null);
          const createdId = createdItem?.item_id || createdItem?.id;
          if (createdId) touchedServerItemIds.push(String(createdId));
        }
      }

      // Những dòng còn lại không còn xuất hiện trong giỏ hiện tại; đồng thời dọn
      // các bản ghi trùng được tạo bởi cơ chế key cũ.
      // CHỈ xoá món mà máy này đã từng thấy (knownServerItemIds). Món máy khác vừa thêm
      // (máy này chưa thấy) được giữ nguyên trên server, lần đồng bộ bàn kế tiếp sẽ gộp vào giỏ.
      const deletedServerItemIds: string[] = [];
      for (const staleItems of serverItemsMap.values()) {
        for (const serverItem of staleItems) {
          const serverItemId = serverItem.item_id || serverItem.id;
          if (!serverItemId) continue;
          if (!knownServerItemIds.has(String(serverItemId))) continue;
          const deleteRes = await fetch(`${currentUrl}/api/shops/${shopId}/order-items/${serverItemId}`, {
            method: 'DELETE',
            headers,
            signal: controller.signal,
          });
          if (!deleteRes.ok && deleteRes.status !== 404) {
            throw new Error(`Không thể xóa món cũ trên server (${deleteRes.status})`);
          }
          deletedServerItemIds.push(String(serverItemId));
        }
      }

      // Cập nhật tập món đã biết: thêm món vừa khớp/tạo, bỏ món vừa xoá
      if (touchedServerItemIds.length > 0 || deletedServerItemIds.length > 0) {
        for (const id of touchedServerItemIds) knownServerItemIds.add(id);
        for (const id of deletedServerItemIds) knownServerItemIds.delete(id);
        await saveKnownServerItemIds(effectiveOrderId, knownServerItemIds);
      }

      if (initialOrderId) pendingItemSyncByOrderRef.current.delete(initialOrderId);
      if (effectiveOrderId) pendingItemSyncByOrderRef.current.delete(effectiveOrderId);
      if (Platform.OS !== 'web' && effectiveOrderId) {
        await db
          .update(schema.orders)
          .set({ sync_status: 'synced', updated_at: new Date().toISOString() })
          .where(eq(schema.orders.id, effectiveOrderId))
          .catch(() => {});
      }

      if (broadcastSync && tableId) {
        broadcastSync({ event: 'TABLE_UPDATED', tableId });
      }
      return true;
    } catch (err: any) {
      console.warn(
        err?.name === 'AbortError'
          ? 'Đồng bộ món lên server quá thời gian 12 giây'
          : 'Lỗi khi đồng bộ món lên server:',
        err?.name === 'AbortError' ? undefined : err
      );
      return false;
    } finally {
      if (tableId) {
        syncingItemsTableIdsRef.current.delete(tableId);
      }
      clearTimeout(timeoutId);
    }
  };

  const syncActiveTableSession = async (table: any) => {
    try {
      const onlineSession = await fetchActiveTableSessionOnline(table.id, table.current_order_id || null);
      if (onlineSession) {
        // Bắt trạng thái đơn hàng/phòng đã thanh toán và giải phóng trên Cloud -> Tự động chữa lành cục bộ!
        if ('isFinished' in onlineSession && onlineSession.isFinished) {
          setIsSyncingTableSession(false);
          setActiveTable((prev: any) => {
            if (prev && prev.id === table.id) {
              return null;
            }
            return prev;
          }); // Chỉ đóng modal nếu đang xem đúng bàn này

          const newStatus = onlineSession.resourceStatus || 'available';
          const cleanedMeta = cleanStaticResourceMeta(table.metadata);

          // A. Cập nhật SQLite nội địa sang trống (bảo toàn cấu hình giá nâng cao / tính theo phút trong metadata)
          if (Platform.OS !== 'web') {
            try {
              await db
                .update(schema.location_resources)
                .set({ status: newStatus, current_order_id: null, startTime: null, metadata: cleanedMeta })
                .where(eq(schema.location_resources.id, table.id));
            } catch (e) { }
          }

          // B. Cập nhật state cục bộ sang trống
          if (getV2Session(table)) refreshTablesThrottled(); // v2: closed/moved elsewhere → layout changed too
          forgetV2Session(table.id);
          setTables(prev => prev.map(t => t.id === table.id ? { ...t, status: newStatus, current_order_id: null, startTime: null, metadata: cleanedMeta } : t));
          setTableCarts(prev => {
            const copy = { ...prev };
            delete copy[table.id];
            return copy;
          });

          showToast(`${getResourceDisplayName(table, shopVertical)} đã được thanh toán và trả trên hệ thống!`, "info");
          return { isFinished: true };
        }

        const { order, items, resource } = onlineSession;
        const resolvedRemoteOrderId = order ? String(order.id || order.order_id || '') : '';
        if (resolvedRemoteOrderId && closedOrderIdsRef.current.has(resolvedRemoteOrderId)) {
          setTableCarts(prev => {
            if (!prev[table.id]) return prev;
            const copy = { ...prev };
            delete copy[table.id];
            return copy;
          });
          return { isFinished: true };
        }

        let parsedMeta: any = {};
        if (order) {
          try {
            parsedMeta = typeof order.metadata === 'string' ? JSON.parse(order.metadata) : (order.metadata || {});
          } catch (e) { }
        }

        let resourceMeta: any = {};
        if (resource) {
          try {
            resourceMeta = typeof resource.metadata === 'string' ? JSON.parse(resource.metadata) : (resource.metadata || {});
          } catch (e) { }
        }

        let tableMetaObj: any = {};
        try {
          tableMetaObj = typeof table.metadata === 'string' ? JSON.parse(table.metadata) : (table.metadata || {});
        } catch (e) { }

        // Find the first metadata source that contains a non-empty guests list
        const onlineGuests =
          (parsedMeta.guests_list && parsedMeta.guests_list.length > 0) ? parsedMeta.guests_list :
            (parsedMeta.guests && parsedMeta.guests.length > 0) ? parsedMeta.guests :
              (resourceMeta.guests_list && resourceMeta.guests_list.length > 0) ? resourceMeta.guests_list :
                (resourceMeta.guests && resourceMeta.guests.length > 0) ? resourceMeta.guests :
                  (tableMetaObj.guests_list && tableMetaObj.guests_list.length > 0) ? tableMetaObj.guests_list :
                    (tableMetaObj.guests && tableMetaObj.guests.length > 0) ? tableMetaObj.guests : [];

        // Table sync v2: this table runs on a session (server lines + this device's pending ops)
        // Order metadata is the source of truth: an order without session_id is a legacy order even if
        // the resource still carries the session of a previous customer.
        const v2SessionId = v2
          ? String(order ? (parsedMeta.session_id || '') : (getV2Session(table)?.sessionId || ''))
          : '';
        if (v2 && order && !parsedMeta.session_id) forgetV2Session(table.id);

        const rentalType = parsedMeta.rental_type || resourceMeta.rental_type || tableMetaObj.rental_type || 'hourly';
        const numGuests = (onlineGuests.length > 0) ? onlineGuests.length : (parsedMeta.num_guests || resourceMeta.num_guests || tableMetaObj.num_guests || 1);
        const checkInVal = parsedMeta.check_in || resourceMeta.check_in || tableMetaObj.check_in;
        const checkInTime = checkInVal ? new Date(checkInVal).getTime() : (table.startTime || Date.now());

        const resolvedActiveStatus =
          resource?.status === 'checking_out' ? 'checking_out' : 'occupied';

        const updatedTable = {
          ...table,
          status: resolvedActiveStatus,
          current_order_id: order ? (order.id || order.order_id) : table.current_order_id, // Tự động chữa lành ID đơn hàng nếu thiếu
          startTime: checkInTime,
          metadata: JSON.stringify({
            ...tableMetaObj,
            ...resourceMeta,
            rental_type: rentalType,
            num_guests: numGuests,
            check_in: checkInVal || new Date(checkInTime).toISOString(),
            guests_list: onlineGuests,
            guests: onlineGuests,
            ...(v2SessionId ? { session_id: v2SessionId } : {})
          })
        };
        if (v2SessionId) {
          rememberV2Session(table.id, v2SessionId, resolvedRemoteOrderId, table.name);
        }

        // Gán khách hàng cho phòng bàn cục bộ
        if (order && order.customer_id) {
          const localCust = customersList.find(c => c.id === order.customer_id);
          const phoneVal = localCust?.phone || parsedMeta.customer_phone || "";
          const addressVal = localCust?.address || parsedMeta.customer_address || "";
          const nextCustomer = {
            id: order.customer_id,
            name: order.customer_name || 'Khách lẻ',
            phone: phoneVal,
            address: addressVal
          };
          setTableCustomers(prev => (
            v2SessionId && JSON.stringify(prev[table.id] || null) === JSON.stringify(nextCustomer)
              ? prev
              : { ...prev, [table.id]: nextCustomer }
          ));
        } else if (order) {
          setTableCustomers(prev => {
            if (v2SessionId && !prev[table.id]) return prev;
            const copy = { ...prev };
            delete copy[table.id];
            return copy;
          });
        }

        // v2: skip identical writes so the 15s refresh does not re-render the whole layout (#17)
        const currentLocalTable = tables.find(t => t.id === table.id);
        const tableUnchanged =
          !!v2SessionId &&
          !!currentLocalTable &&
          currentLocalTable.status === updatedTable.status &&
          String(currentLocalTable.current_order_id || '') === String(updatedTable.current_order_id || '') &&
          Number(currentLocalTable.startTime) === Number(updatedTable.startTime) &&
          currentLocalTable.metadata === updatedTable.metadata;

        // Cập nhật tables list state cục bộ và ghi SQLite ngoại tuyến để tự chữa lành
        if (!tableUnchanged) setTables(prev => prev.map(t => t.id === table.id ? updatedTable : t));
        if (Platform.OS !== 'web' && !tableUnchanged) {
          try {
            await db
              .update(schema.location_resources)
              .set({ status: resolvedActiveStatus, current_order_id: order ? (order.id || order.order_id) : table.current_order_id, startTime: checkInTime, metadata: updatedTable.metadata })
              .where(eq(schema.location_resources.id, table.id));
          } catch (e) { }
        }

        // Chỉ đồng bộ giỏ hàng về state cục bộ khi đã tải được order hợp lệ từ Server
        if (v2 && v2SessionId) {
          // v2: cart = server lines + this device's pending ops. No legacy push / conflict block.
          if (order && Array.isArray(items)) {
            const pendingOps = await v2.pendingOpsFor(v2SessionId);
            const v2Cart = v2LinesToCart(items, pendingOps, (id) => productsList.find(p => p.id === id)) as any;
            lastV2CartRef.current[table.id] = v2Cart;
            const serialized = JSON.stringify(v2Cart);
            if (JSON.stringify(tableCartsRef.current[table.id] || null) !== serialized) {
              tableCartsRef.current = { ...tableCartsRef.current, [table.id]: v2Cart };
              setTableCarts(prev => (JSON.stringify(prev[table.id] || null) === serialized ? prev : { ...prev, [table.id]: v2Cart }));
            }
          }
        } else if (order && Array.isArray(items)) {
          const mappedCart: any = {};
          for (const item of items) {
            if (isTimeChargeProduct(item.product_id, item.product_name)) continue;
            const originalProd = productsList.find(p => p.id === item.product_id);
            const unitPrice = parseInt(item.unit_price || '0', 10);
            const origPrice = parseInt(item.original_price || '0', 10) || (originalProd ? Number(originalProd.sell_price) || unitPrice : unitPrice);
            const discountAmt = parseInt(item.discount_amount || '0', 10) || Math.max(0, origPrice - unitPrice);
            const parsedQty = parseInt(item.qty || '1', 10);
            let parsedModifiers: any = undefined;
            if (item.modifiers) {
              try {
                const parsed = typeof item.modifiers === 'string' ? JSON.parse(item.modifiers) : item.modifiers;
                if (Array.isArray(parsed)) parsedModifiers = parsed;
              } catch (e) {}
            }
            const modKey = parsedModifiers && parsedModifiers.length > 0
              ? `_${parsedModifiers.map((m: any) => m.option || m.name || '').join(',')}`
              : '';
            const cartKey = `${item.product_id}${item.variant_label ? `_${item.variant_label}` : ''}${modKey}`;
            if (mappedCart[cartKey]) {
              mappedCart[cartKey].quantity += parsedQty;
            } else {
              mappedCart[cartKey] = {
                productId: item.product_id,
                name: item.product_name,
                price: unitPrice,
                original_price: origPrice,
                discount_amount: discountAmt,
                discount_pct: parseInt(item.discount_pct || '0', 10) || 0,
                quantity: parsedQty,
                tax_rate: item.tax_rate || originalProd?.tax_rate || '0',
                input_tax_rate: item.input_tax_rate || originalProd?.input_tax_rate || '0',
                tax_group: item.tax_group || originalProd?.tax_group || '',
                variant_label: item.variant_label || '',
                modifier_total: parseInt(item.modifier_total || '0', 10) || 0,
                ...(parsedModifiers ? { modifiers: parsedModifiers } : {}),
              };
            }
          }

          const pendingForOrder =
            (resolvedRemoteOrderId && pendingItemSyncByOrderRef.current.get(resolvedRemoteOrderId)) ||
            (table.current_order_id && pendingItemSyncByOrderRef.current.get(String(table.current_order_id)));

          // So khớp phiên local với phiên hiện tại trên server trước khi đẩy giỏ đang chờ.
          // Nếu giỏ chờ thuộc đơn local khác đơn server và giờ vào (check_in) lệch quá ±2s
          // -> bàn đã bị đóng & mở lại bởi máy/khách khác: KHÔNG đẩy món sang khách sau, lưu xung đột local.
          const localPendingOrderId = table.current_order_id ? String(table.current_order_id) : '';
          const pendingMatchedByLocalId =
            !!pendingForOrder &&
            !(resolvedRemoteOrderId && pendingItemSyncByOrderRef.current.get(resolvedRemoteOrderId)) &&
            !!localPendingOrderId &&
            localPendingOrderId !== resolvedRemoteOrderId;
          const serverCheckIn = parsedMeta.check_in || resourceMeta.check_in || '';
          const isPendingSessionMismatch =
            pendingMatchedByLocalId &&
            !(serverCheckIn && (isSameCheckIn(tableMetaObj.check_in, serverCheckIn) || isSameCheckIn(table.startTime, serverCheckIn)));

          if (pendingForOrder && isPendingSessionMismatch) {
            const localItems = Object.entries(pendingForOrder.cartItems || {})
              .filter(([cartItemId, it]: [string, any]) => !isTimeChargeProduct(it?.productId || cartItemId, it?.name))
              .map(([, it]: [string, any]) => ({
                product_name: it?.name || '',
                qty: Number(it?.quantity || 1),
                unit_price: Number(it?.price || 0),
              }));
            const serverItemsNoTime = items.filter((it: any) => !isTimeChargeProduct(it.product_id, it.product_name));
            const conflict: TableConflict = {
              tableId: table.id,
              localOrderId: localPendingOrderId,
              localItems,
              localCheckIn: String(tableMetaObj.check_in || (table.startTime ? new Date(table.startTime).toISOString() : '')),
              localCustomerName: tableCustomers[table.id]?.name || 'Khách lẻ',
              existingOrder: {
                order_id: resolvedRemoteOrderId,
                order_no: order.order_no || '',
                check_in: String(serverCheckIn || ''),
                customer_name: order.customer_name || 'Khách lẻ',
                items_count: serverItemsNoTime.length,
                items_summary: serverItemsNoTime.map((it: any) => ({ name: it.product_name || '', qty: Number(it.qty || 1) })),
                total_amount: Number(order.total_amount || 0),
              },
            };
            pendingItemSyncByOrderRef.current.delete(localPendingOrderId);
            if (localItems.length > 0) {
              try {
                await AsyncStorage.setItem(`table_conflict:${table.id}`, JSON.stringify({ ...conflict, detectedAt: new Date().toISOString() }));
              } catch {}
              setTableConflict(conflict);
              console.log(`[TableSync] Phiên bàn ${table.id} đã đổi (local ${localPendingOrderId} ≠ server ${resolvedRemoteOrderId}) — giữ giỏ chờ làm xung đột, không đẩy`);
            }
            if (!syncingItemsTableIdsRef.current.has(table.id)) {
              setTableCarts(prev => ({
                ...prev,
                [table.id]: mappedCart
              }));
              void addKnownServerItemIds(resolvedRemoteOrderId, items.map((it: any) => it.item_id || it.id));
            }
          } else if (pendingForOrder && !syncingItemsTableIdsRef.current.has(table.id)) {
            void syncOrderItemsOnline(resolvedRemoteOrderId || table.current_order_id || '', pendingForOrder.cartItems, table.id);
          } else if (!syncingItemsTableIdsRef.current.has(table.id)) {
            setTableCarts(prev => ({
              ...prev,
              [table.id]: mappedCart
            }));
            // Ghi nhận các món server máy này đã thấy (đã nạp vào giỏ) -> được phép xoá khi người dùng bỏ món
            void addKnownServerItemIds(resolvedRemoteOrderId, items.map((it: any) => it.item_id || it.id));
          }
        }

        // Khôi phục thông tin khách lưu trú từ Cloud — chỉ cho bàn đang mở trên màn hình (#7)
        if (activeTableIdRef.current === table.id) {
        setRoomGuestCount(numGuests);
        setLodgingGuests(onlineGuests.length > 0
          ? onlineGuests.map((g: any) => ({
            id: g.id || undefined,
            name: g.name || '',
            id_type: g.id_type || g.idType || 'CCCD',
            id_number: g.id_number || g.idNumber || g.idCard || g.id_card || '',
            idCard: g.id_number || g.idNumber || g.idCard || g.id_card || '',
            expiry_date: g.expiry_date || g.expiryDate || '',
            nationality: g.nationality || 'Việt Nam',
            dob: g.dob || '',
            gender: g.gender || '',
            address: g.address || '',
            note: g.note || ''
          }))
          : [{ name: '', id_type: 'CCCD', id_number: '', expiry_date: '', nationality: 'Việt Nam', dob: '', gender: '', address: '', note: '' }]);
        }

        setActiveTable((prev: any) => {
          if (prev && prev.id === table.id) {
            if (v2SessionId && prev.metadata === updatedTable.metadata && prev.status === updatedTable.status
              && String(prev.current_order_id || '') === String(updatedTable.current_order_id || '')
              && Number(prev.startTime) === Number(updatedTable.startTime)) {
              return prev;
            }
            return updatedTable;
          }
          return prev;
        }); // Chỉ cập nhật dữ liệu nếu người dùng vẫn đang xem bàn này
        return { isFinished: false };
      }
      return { isFinished: false };
    } catch (err) {
      console.warn('Lỗi khi đồng bộ phiên hoạt động:', err);
      return { isFinished: false };
    }
  };

  const syncTableSilent = useCallback(async (tableId: string) => {
    const targetTable = tables.find(t => t.id === tableId);
    if (!targetTable) {
      try {
        const currentUrl = getApiBaseUrl();
        const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
        const headers = await getApiHeaders();
        const resourceRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${tableId}`, { headers });
        if (resourceRes.ok) {
          const fetchedTable = await resourceRes.json();
          await syncActiveTableSession({ ...fetchedTable, type: fetchedTable.type || 'table', status: fetchedTable.status === 'occupied' ? 'occupied' : 'available' });
        }
      } catch (err) {}
    } else {
      await syncActiveTableSession(targetTable);
    }
  }, [tables, syncActiveTableSession]);

  // Tự động dọn sạch giỏ hàng & khách hàng tạm của các bàn đã trống (available/dirty/cleaning),
  // đồng thời đồng bộ giỏ hàng của các bàn đang có khách (occupied) từ Cloud để Máy B luôn thấy món từ Máy A
  const lastOccupiedSyncRef = React.useRef<Record<string, number>>({});
  useEffect(() => {
    if (!isNavReady || shopVertical === 'retail' || tables.length === 0) return;

    const inactiveTableIds = tables
      .filter(
        t =>
          t.status !== 'occupied' &&
          t.status !== 'playing' &&
          t.status !== 'checking_out' &&
          !openingTableIdsRef.current.has(t.id)
      )
      .map(t => t.id);

    if (inactiveTableIds.length > 0) {
      setTableCarts(prev => {
        let changed = false;
        const copy = { ...prev };
        for (const id of inactiveTableIds) {
          if (copy[id]) {
            delete copy[id];
            changed = true;
          }
        }
        return changed ? copy : prev;
      });
      setTableCustomers(prev => {
        let changed = false;
        const copy = { ...prev };
        for (const id of inactiveTableIds) {
          if (copy[id]) {
            delete copy[id];
            changed = true;
          }
        }
        return changed ? copy : prev;
      });
    }

    if (!isOnline) return;
    const now = Date.now();
    const occupiedTables = tables.filter(
      t =>
        (t.status === 'occupied' || t.status === 'playing' || t.status === 'checking_out') &&
        !openingTableIdsRef.current.has(t.id)
    );
    for (const t of occupiedTables) {
      const syncKey = `${t.id}_${t.current_order_id || ''}`;
      const lastAt = lastOccupiedSyncRef.current[syncKey] || 0;
      // v2 tables are refreshed by change events (changeTick); the poll is only a slow safety net
      const minGapMs = getV2Session(t) ? 60000 : 8000;
      if (now - lastAt > minGapMs) {
        lastOccupiedSyncRef.current[syncKey] = now;
        void syncActiveTableSession(t);
      }
    }
  }, [tables, isNavReady, isOnline, shopVertical, timeTicker]);

  // Table sync v2: the server reported changes → re-sync exactly the tables of those sessions
  const syncActiveTableSessionRef = React.useRef(syncActiveTableSession);
  syncActiveTableSessionRef.current = syncActiveTableSession;
  const tablesRef = React.useRef(tables);
  tablesRef.current = tables;
  useEffect(() => {
    if (!v2 || !tableSync?.changeTick) return;
    const changed = new Set(tableSync.lastChangedSessions || []);
    const handled = new Set<string>();
    for (const t of tablesRef.current) {
      const session = getV2Session(t);
      if (session && changed.has(session.sessionId)) {
        handled.add(session.sessionId);
        void syncActiveTableSessionRef.current(t);
      }
    }
    // A session this device does not show yet (opened / moved on another device) changes the layout
    if (Array.from(changed).some(sid => !handled.has(sid))) refreshTablesThrottled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableSync?.changeTick]);

  // Table sync v2: when a session's queue drains (>0 → 0), reload that table from the server
  const prevPendingCountsRef = React.useRef<Record<string, number>>({});
  useEffect(() => {
    if (!v2) return;
    const counts: Record<string, number> = {};
    for (const e of tableSync?.outbox || []) counts[e.session_id] = (counts[e.session_id] || 0) + 1;
    const prev = prevPendingCountsRef.current;
    prevPendingCountsRef.current = counts;
    const drained = Object.keys(prev).filter(sid => prev[sid] > 0 && !counts[sid]);
    if (drained.length === 0) return;
    for (const t of tablesRef.current) {
      const session = getV2Session(t);
      if (session && drained.includes(session.sessionId)) void syncActiveTableSessionRef.current(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableSync?.outbox]);

  // Xung đột bàn được lưu bền trong AsyncStorage (`table_conflict:<tableId>`) bởi SyncManager / syncOrderItemsOnline.
  // "Để sau" chỉ tạm ẩn (snooze) bàn đó trong phiên app; xung đột KHÔNG bao giờ tự xoá — món trên máy chỉ mất
  // khi người dùng chủ động chọn "Giữ đơn hệ thống".
  const snoozedConflictTablesRef = React.useRef<Set<string>>(new Set());
  const [pendingConflictTableIds, setPendingConflictTableIds] = useState<string[]>([]);

  const loadPendingConflicts = useCallback(async (): Promise<TableConflict[]> => {
    try {
      const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith('table_conflict:'));
      const conflicts: TableConflict[] = [];
      for (const key of keys) {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) continue;
        try { conflicts.push(JSON.parse(raw)); } catch {}
      }
      setPendingConflictTableIds(conflicts.map(c => c.tableId));
      return conflicts;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (shopVertical === 'retail') return;
    (async () => {
      const conflicts = await loadPendingConflicts();
      const next = conflicts.find(c => !snoozedConflictTablesRef.current.has(c.tableId));
      if (next) setTableConflict(prev => prev || next);
    })();
  }, [tables, shopVertical, loadPendingConflicts]);

  /** "Để sau": ẩn bảng xung đột của bàn này cho tới khi người dùng mở lại từ nút "Xung đột" */
  const dismissTableConflict = useCallback(() => {
    setTableConflict(prev => {
      if (prev) snoozedConflictTablesRef.current.add(prev.tableId);
      return null;
    });
  }, []);

  /** Mở lại xung đột đang chờ (ưu tiên bàn được chỉ định) */
  const openPendingConflict = useCallback(async (tableId?: string) => {
    const conflicts = await loadPendingConflicts();
    const target = (tableId && conflicts.find(c => c.tableId === tableId)) || conflicts[0];
    if (!target) return;
    snoozedConflictTablesRef.current.delete(target.tableId);
    setTableConflict(target);
  }, [loadPendingConflicts]);

  const resolveTableConflict = async (action: 'merge' | 'keep_server' | 'replace_server') => {
    if (!tableConflict) return;
    try {
      const currentUrl = getApiBaseUrl();
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const headers = await getApiHeaders();

      // Chuẩn bị dữ liệu món từ máy cục bộ cho merge/replace
      let localItemsPayload: any[] | undefined;
      if (action === 'merge' || action === 'replace_server') {
        try {
          const localDbItems = await db
            .select()
            .from(schema.order_items)
            .where(eq(schema.order_items.order_id, tableConflict.localOrderId));
          localItemsPayload = localDbItems.map((it: any) => ({
            product_id: it.product_id,
            product_name: it.product_name || '',
            qty: String(it.qty || 1),
            unit_price: String(it.unit_price || 0),
            original_price: String(it.original_price ?? it.unit_price ?? 0),
            discount_amount: String(it.discount_amount || 0),
            line_total: String(it.line_total || 0),
            tax_rate: it.tax_rate || '0',
            tax_amount: String(it.tax_amount || 0),
            tax_group: it.tax_group || '',
          }));
        } catch {
          // Fallback nếu không đọc được từ SQLite
          localItemsPayload = tableConflict.localItems.map(it => ({
            product_id: '',
            product_name: it.product_name,
            qty: String(it.qty),
            unit_price: String(it.unit_price),
            line_total: String(it.qty * it.unit_price),
          }));
        }
      }

      const res = await fetch(`${currentUrl}/api/shops/${shopId}/orders/resolve-conflict`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          local_order_id: tableConflict.localOrderId,
          existing_order_id: tableConflict.existingOrder.order_id,
          resource_id: tableConflict.tableId,
          local_items: localItemsPayload,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Đơn trên server đã đóng: món local đã được cất vào đơn "cần kiểm tra" (parked) hoặc bị bỏ theo lựa chọn (discarded)
        // -> chỉ dọn local, không chiếm bàn
        if (data.action_taken === 'parked' || data.action_taken === 'discarded') {
          if (Platform.OS !== 'web') {
            try {
              await db.delete(schema.orders).where(eq(schema.orders.id, tableConflict.localOrderId));
              await db.delete(schema.order_items).where(eq(schema.order_items.order_id, tableConflict.localOrderId));
            } catch {}
          }
          await AsyncStorage.removeItem(`table_conflict:${tableConflict.tableId}`);
          pendingItemSyncByOrderRef.current.delete(tableConflict.localOrderId);
          snoozedConflictTablesRef.current.delete(tableConflict.tableId);
          setTableConflict(null);
          void loadPendingConflicts();
          const parkedTable = tables.find(t => t.id === tableConflict.tableId);
          if (parkedTable) setTimeout(() => syncActiveTableSession(parkedTable), 500);
          return;
        }
        // Dọn dẹp đơn cục bộ
        if (Platform.OS !== 'web') {
          try {
            await db.delete(schema.orders).where(eq(schema.orders.id, tableConflict.localOrderId));
            await db.delete(schema.order_items).where(eq(schema.order_items.order_id, tableConflict.localOrderId));
          } catch {}
        }
        // Cập nhật trạng thái bàn
        setTables(prev => prev.map(t =>
          t.id === tableConflict.tableId
            ? { ...t, current_order_id: data.resolved_order_id, status: 'occupied' }
            : t
        ));
        // Xóa xung đột khỏi storage
        await AsyncStorage.removeItem(`table_conflict:${tableConflict.tableId}`);
        pendingItemSyncByOrderRef.current.delete(tableConflict.localOrderId);
        snoozedConflictTablesRef.current.delete(tableConflict.tableId);
        setTableConflict(null);
        void loadPendingConflicts();
        // Đồng bộ lại dữ liệu bàn
        const updatedTable = tables.find(t => t.id === tableConflict.tableId);
        if (updatedTable) {
          setTimeout(() => syncActiveTableSession({ ...updatedTable, current_order_id: data.resolved_order_id }), 500);
        }
      } else {
        const errBody = await res.json().catch(() => ({} as any));
        throw new Error(errBody?.error || errBody?.message || 'Không thể giải quyết xung đột. Vui lòng thử lại.');
      }
    } catch (err) {
      console.error('[resolveTableConflict] Error:', err);
      throw err;
    }
  };

  const [isCleanConfirmModalOpen, setIsCleanConfirmModalOpen] = useState(false);
  const [tableToClean, setTableToClean] = useState<any>(null);
  const [cleanConfirmSaving, setCleanConfirmSaving] = useState(false);

  const handleCleanTable = async (table: any) => {
    try {
      setCleanConfirmSaving(true);
      const currentUrl = getApiBaseUrl();
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const headers = await getApiHeaders();
      const res = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${table.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'available' })
      });
      if (!res.ok) throw new Error('Cập nhật thất bại');
      
      setTables(prev => prev.map(t => t.id === table.id ? { ...t, status: 'available' } : t));
      if (Platform.OS !== 'web') {
        try {
          await db
            .update(schema.location_resources)
            .set({ status: 'available' })
            .where(eq(schema.location_resources.id, table.id));
        } catch (e) {}
      }
      showToast('Đã đánh dấu dọn xong!', 'success');
      setIsCleanConfirmModalOpen(false);
      setTableToClean(null);
    } catch (error) {
      console.error(error);
      showToast('Lỗi khi cập nhật trạng thái', 'error');
    } finally {
      setCleanConfirmSaving(false);
    }
  };

  // Mở bàn
  const handleTablePress = async (table: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
    if (table.status === 'dirty' || table.status === 'cleaning') {
      setTableToClean(table);
      setIsCleanConfirmModalOpen(true);
      return;
    }
    if (table.status === 'playing' || table.status === 'occupied') {
      // 1. Mở modal ngay lập tức với dữ liệu cục bộ hiện có để mang lại trải nghiệm tức thì (Zero-Lag)
      setActiveTable(table);
      activeTableIdRef.current = table.id;
      setIsSyncingTableSession(true);
      setActiveTableTab('billing'); // Reset tab về billing mặc định khi mở phòng bàn

      // Khôi phục thông tin khách lưu trú từ cache SQLite cục bộ trước khi sync
      let localMeta: any = {};
      try {
        localMeta = typeof table.metadata === 'string' ? JSON.parse(table.metadata) : (table.metadata || {});
      } catch (e) { }
      const cachedGuests = localMeta.guests_list || localMeta.guests || [];
      setRoomGuestCount(localMeta.num_guests || Math.max(1, cachedGuests.length));
      setLodgingGuests(cachedGuests.length > 0
        ? cachedGuests.map((g: any) => ({
          id: g.id || undefined,
          name: g.name || '',
          id_type: g.id_type || g.idType || 'CCCD',
          id_number: g.id_number || g.idNumber || g.idCard || g.id_card || '',
          idCard: g.id_number || g.idNumber || g.idCard || g.id_card || '',
          expiry_date: g.expiry_date || g.expiryDate || '',
          nationality: g.nationality || 'Việt Nam',
          dob: g.dob || '',
          gender: g.gender || '',
          address: g.address || '',
          note: g.note || ''
        }))
        : [{ name: '', id_type: 'CCCD', id_number: '', expiry_date: '', nationality: 'Việt Nam', dob: '', gender: '', address: '', note: '' }]);

      await syncActiveTableSession(table);
      setIsSyncingTableSession(false);
    } else {
      if (openTableInFlightRef.current) return;
      setOpenTableError(null);
      setSelectedTableForOpen(table);
      setIsTableOpenDialogVisible(true);
    }
  };

  /**
   * After a successful open: close the "Nhận bàn" dialog, then present the table detail modal
   * (billing tab, "Gọi món / Dịch vụ"). iOS can present only one RN Modal at a time, so the detail
   * modal is opened from the dialog Modal's onDismiss (completeOpenTableHandoff); a timer is the
   * safety net (and the trigger on Android/web, which have no such restriction).
   * tableOpenHandoff keeps a dimmed layer over the table map in between (no flash of the map).
   */
  const handOffToOpenedTable = (openedTable: any) => {
    openHandoffTableRef.current = openedTable;
    setTableOpenHandoff(true);
    // Next frame: the dialog switches to a fade-out first, then closes
    requestAnimationFrame(() => setIsTableOpenDialogVisible(false));
    if (openHandoffTimerRef.current) clearTimeout(openHandoffTimerRef.current);
    openHandoffTimerRef.current = setTimeout(() => completeOpenTableHandoff(), Platform.OS === 'ios' ? 900 : 120);
  };

  const completeOpenTableHandoff = () => {
    if (openHandoffTimerRef.current) {
      clearTimeout(openHandoffTimerRef.current);
      openHandoffTimerRef.current = null;
    }
    const openedTable = openHandoffTableRef.current;
    if (!openedTable) return;
    openHandoffTableRef.current = null;
    setSelectedTableForOpen(null);
    setCheckInTab('info');
    setIsOpeningTable(false);
    openTableInFlightRef.current = false;
    void handleTablePress(openedTable);
    // Safety: never leave the dimmed hand-off layer up if the detail modal never reports onShow
    setTimeout(() => setTableOpenHandoff(false), 1500);
  };

  /** Table detail modal finished presenting: drop the hand-off dim layer */
  const onActiveTableModalShown = () => {
    setTableOpenHandoff(false);
  };

  // Cập nhật thông tin khách lưu trú của phòng đang ở
  const handleUpdateActiveRoomGuests = async () => {
    if (!activeTable) return;
    const targetTable = activeTable;
    const targetGuests = lodgingGuests;
    const targetGuestCount = roomGuestCount;
    const targetRoomRentalType = roomRentalType;

    // Dialog xác nhận an toàn trước khi cập nhật
    const confirmUpdate = Platform.OS === 'web'
      ? window.confirm("Bạn có chắc chắn muốn cập nhật thông tin khách lưu trú này?")
      : (await dialog.confirm({
        title: 'Xác nhận cập nhật',
        message: `Cập nhật danh sách khách lưu trú của ${getResourceDisplayName(targetTable, shopVertical, false)} lên hệ thống?`,
        tone: 'info',
        icon: 'users',
        actions: [
          { key: 'cancel', label: 'Hủy bỏ', style: 'secondary' },
          { key: 'ok', label: 'Đồng ý', style: 'primary' },
        ],
      })) === 'ok';

    if (!confirmUpdate) return;

    try {
      setIsUpdatingGuestsLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';

      // 1. Chuẩn hóa metadata khách lưu trú
      const updatedGuests = targetGuests
        .filter(g => g.name || g.id_number || g.idCard)
        .map(g => ({
          id: g.id || undefined,
          name: g.name || '',
          id_type: g.id_type || 'CCCD',
          id_number: g.id_number || g.idCard || '',
          idCard: g.id_number || g.idCard || '',
          expiry_date: g.expiry_date || '',
          nationality: g.nationality || 'Việt Nam',
          dob: g.dob || '',
          gender: g.gender || '',
          address: g.address || '',
          note: g.note || ''
        }));

      // Đọc metadata hiện tại và ghi đè
      let currentMeta: any = {};
      try {
        currentMeta = typeof targetTable.metadata === 'string' ? JSON.parse(targetTable.metadata) : (targetTable.metadata || {});
      } catch (e) { }

      const updatedMeta = JSON.stringify({
        ...currentMeta,
        resource_id: targetTable.id,
        resource_name: targetTable.name,
        check_in: targetTable.startTime || new Date().toISOString(),
        num_guests: targetGuestCount,
        rental_type: targetRoomRentalType,
        guests_list: updatedGuests,
        guests: updatedGuests
      });

      // 2. Offline-First: Cập nhật SQLite nội địa và State lập tức
      if (Platform.OS === 'web') {
        setTables(prev => prev.map(t => t.id === targetTable.id ? { ...t, metadata: updatedMeta } : t));
      } else {
        await db
          .update(schema.location_resources)
          .set({ metadata: updatedMeta })
          .where(eq(schema.location_resources.id, targetTable.id));
        const updated = await db.select().from(schema.location_resources);
        setTables(updated);
      }

      // Cập nhật thông tin phòng đang mở để đồng bộ trực quan tức thì
      setActiveTable((prev: any) => prev ? { ...prev, metadata: updatedMeta } : null);

      setIsUpdatingGuestsLoading(false);
      showToast("Đã cập nhật khách cục bộ! Đang đồng bộ...", "info");

      // 3. Online Sync lên Cloud Next.js ở chế độ nền
      if (isOnline) {
        (async () => {
          try {
            const currentUrl = getApiBaseUrl();
            const headers = await getApiHeaders();

            // A. PATCH location-resources metadata
            const patchRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${targetTable.id}`, {
              method: 'PATCH',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                metadata: updatedMeta
              }),
            });

            // B. PUT active order metadata nếu tồn tại current_order_id
            if (targetTable.current_order_id) {
              await fetch(`${currentUrl}/api/shops/${shopId}/orders/${targetTable.current_order_id}`, {
                method: 'PUT',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  metadata: updatedMeta
                })
              });
            }

            if (patchRes.ok) {
              showToast("Đã đồng bộ thông tin khách lưu trú thành công!", "success");
            } else {
              showToast("Đã lưu thông tin khách ngoại tuyến (Cloud lỗi).", "info");
            }
          } catch (syncErr) {
            console.log('Mất mạng hoặc lỗi server, bỏ qua đồng bộ metadata khách trực tuyến:', syncErr);
            showToast("Mất kết nối, thông tin khách đã được lưu ngoại tuyến.", "info");
          }
        })();
      }
    } catch (err) {
      console.error('Không thể cập nhật khách lưu trú:', err);
      showToast("Có lỗi xảy ra khi cập nhật khách!", "error");
      setIsUpdatingGuestsLoading(false);
    }
  };

  // Trình mở DatePicker
  const handleUpdateTableTime = async (tableId: string, type: 'checkin' | 'checkout', newDateIso: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
      const targetTable = tables.find(t => t.id === tableId);
      if (!targetTable) return;

      let currentMeta: any = {};
      try {
        currentMeta = typeof targetTable.metadata === 'string' ? JSON.parse(targetTable.metadata) : (targetTable.metadata || {});
      } catch (e) { }

      let updatedMetaObj = { ...currentMeta };
      let updatePayload: any = {};

      if (type === 'checkin') {
        if (!updatedMetaObj.original_start_time && targetTable.startTime) {
          updatedMetaObj.original_start_time = targetTable.startTime;
        }
        updatedMetaObj.check_in = newDateIso;
        updatePayload.startTime = newDateIso;
      } else if (type === 'checkout') {
        if (!updatedMetaObj.original_temp_checkout_time) {
          updatedMetaObj.original_temp_checkout_time = currentMeta.temp_checkout_time || new Date().toISOString();
        }
        updatedMetaObj.temp_checkout_time = newDateIso;
      }

      const updatedMeta = JSON.stringify(updatedMetaObj);
      updatePayload.metadata = updatedMeta;

      if (Platform.OS === 'web') {
        setTables(prev => prev.map(t => t.id === tableId ? { ...t, ...updatePayload } : t));
      } else {
        await db
          .update(schema.location_resources)
          .set(updatePayload)
          .where(eq(schema.location_resources.id, tableId));
        const updated = await db.select().from(schema.location_resources);
        setTables(updated);
      }

      if (activeTable?.id === tableId) {
        setActiveTable((prev: any) => prev ? { ...prev, ...updatePayload } : null);
      }
      
      if (cartOwnerTable?.id === tableId) {
        setCartOwnerTable((prev: any) => prev ? { ...prev, ...updatePayload } : null);
      }

      showToast(`Đã cập nhật ${type === 'checkin' ? 'giờ vào' : 'giờ ra'} thành công.`, "success");

      // Đồng bộ ngầm
      if (isOnline) {
        (async () => {
          try {
            const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
            const currentUrl = getApiBaseUrl();
            const headers = await getApiHeaders();
            
            await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${tableId}`, {
              method: 'PATCH',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify(updatePayload),
            });
            
            if (targetTable.current_order_id) {
              await fetch(`${currentUrl}/api/shops/${shopId}/orders/${targetTable.current_order_id}`, {
                method: 'PUT',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  metadata: updatedMeta,
                  ...(type === 'checkin' ? { created_at: newDateIso } : {})
                })
              });
            }
          } catch (err) {
            console.warn('[Table Sync] Time update sync failed', err);
          }
        })();
      }
    } catch (error) {
      console.error('Update table time error:', error);
      showToast('Lỗi cập nhật thời gian', 'error');
    }
  };

  const handleDatePickerOpen = (index: number, field: 'dob' | 'expiry_date') => {
    setPickerTargetIndex(index);
    setPickerTargetField(field);
    setIsDatePickerOpen(true);
  };

  // Mở bàn
  const handleConfirmOpenTable = async () => {
    if (!selectedTableForOpen) return;
    // Double-tap guard for the whole open (the request takes 1–2 s)
    if (openTableInFlightRef.current) return;
    openTableInFlightRef.current = true;
    setIsOpeningTable(true);
    setOpenTableError(null);
    let handedOff = false;
    const targetTableForOpen = selectedTableForOpen;
    const targetCustomer = selectedCustomer;
    const targetGuestCount = roomGuestCount;
    const targetRoomRentalType = roomRentalType;
    const targetLodgingGuests = lodgingGuests;
    const targetDisplayName = getResourceDisplayName(targetTableForOpen, shopVertical);
    const failOpen = (message: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => { });
      setOpenTableError(message);
    };

    try {
      const nowTime = Date.now();
      const nowIso = new Date(nowTime).toISOString();
      const orderId = `ORD-T-INPROG-${nowTime}`;
      openingTableIdsRef.current.add(targetTableForOpen.id);

      let tMeta: any = {};
      try {
        tMeta = targetTableForOpen.metadata ? (typeof targetTableForOpen.metadata === 'string' ? JSON.parse(targetTableForOpen.metadata) : targetTableForOpen.metadata) : {};
      } catch (e) { }

      const normalizedGuests = targetLodgingGuests
        .filter(g => g.name || g.id_number || g.idCard)
        .map(g => ({
          id: g.id || undefined,
          name: g.name || '',
          id_type: g.id_type || 'CCCD',
          id_number: g.id_number || g.idCard || '',
          idCard: g.id_number || g.idCard || '',
          expiry_date: g.expiry_date || '',
          nationality: g.nationality || 'Việt Nam',
          dob: g.dob || '',
          gender: g.gender || '',
          address: g.address || '',
          note: g.note || ''
        }));

      // 1. Chuẩn hóa metadata nhận phòng: BẮT BUỘC giữ nguyên toàn bộ cấu hình tĩnh (...tMeta như charge_by_minute, advanced_pricing, layout)
      const openTableMeta = JSON.stringify({
        ...tMeta,
        resource_id: targetTableForOpen.id,
        resource_name: targetTableForOpen.name,
        resource_type: targetTableForOpen.type,
        check_in: nowIso,
        num_guests: targetGuestCount,
        rental_type: targetRoomRentalType,
        guests_list: normalizedGuests,
        guests: normalizedGuests,
      });

      // Table sync v2: open through table-sessions/open (online) or the outbox (offline).
      // No SQLite in_progress order row and no deletion of other local orders (#2).
      if (v2) {
        const sessionId = generateClientId();
        const openPayload = {
          session_id: sessionId,
          resource_id: targetTableForOpen.id,
          check_in: nowIso,
          customer_id: targetCustomer?.id || '',
          customer_name: targetCustomer?.name || 'Khách lẻ',
          rental_type: targetRoomRentalType,
          metadata: JSON.parse(openTableMeta) as Record<string, unknown>,
        };
        let openedOrderId = '';
        let openedOffline = false;
        try {
          if (!isOnline) throw new Error('offline');
          const shopIdForOpen = activeShopId || await AsyncStorage.getItem('active_shop_id') || 'default-shop';
          const r = await callTableSessionApi(shopIdForOpen, '/open', 'POST', { ...openPayload, device_id: v2.deviceId });
          if (r.status === 409 && r.body?.error === 'resource_occupied') {
            openingTableIdsRef.current.delete(targetTableForOpen.id);
            failOpen(`${targetDisplayName} vừa được mở trên thiết bị khác. Hãy đóng hộp thoại và chọn lại ${resourceNouns.noun} trên sơ đồ.`);
            refreshTablesThrottled();
            return;
          }
          if (r.status < 200 || r.status >= 300) {
            openingTableIdsRef.current.delete(targetTableForOpen.id);
            failOpen(r.body?.message || `Không thể mở ${targetDisplayName} (lỗi ${r.status}). Vui lòng thử lại.`);
            return;
          }
          openedOrderId = String(r.body?.session?.order_id || '');
        } catch {
          // Network failure: open offline through the outbox (same session id)
          await v2.openSession(openPayload);
          openedOffline = true;
        }

        const v2OpenMeta = JSON.stringify({ ...JSON.parse(openTableMeta), session_id: sessionId });
        rememberV2Session(targetTableForOpen.id, sessionId, openedOrderId, targetTableForOpen.name);
        lastV2CartRef.current[targetTableForOpen.id] = {};
        const openedFields = { status: 'occupied', current_order_id: openedOrderId, startTime: nowTime, metadata: v2OpenMeta };
        setTables(prev => prev.map(t => t.id === targetTableForOpen.id ? { ...t, ...openedFields } : t));
        if (Platform.OS !== 'web') {
          await db
            .update(schema.location_resources)
            .set(openedFields)
            .where(eq(schema.location_resources.id, targetTableForOpen.id))
            .catch(() => {});
        }
        tableCartsRef.current = { ...tableCartsRef.current, [targetTableForOpen.id]: {} };
        setTableCarts(prev => {
          const copy = { ...prev };
          delete copy[targetTableForOpen.id];
          return copy;
        });
        setTableCustomers(prev => {
          const copy = { ...prev };
          if (targetCustomer) {
            copy[targetTableForOpen.id] = targetCustomer;
          } else {
            delete copy[targetTableForOpen.id];
          }
          return copy;
        });
        handedOff = true;
        handOffToOpenedTable({ ...targetTableForOpen, ...openedFields });
        if (openedOffline) {
          showToast(`Mất mạng: đã mở ${targetDisplayName} trên máy này, sẽ đồng bộ khi có mạng lại.`, 'info');
        } else {
          showToast(`Đã nhận ${targetDisplayName}!`, 'success');
          broadcastSync?.({ event: 'TABLE_OPENED', tableId: targetTableForOpen.id, orderId: openedOrderId });
        }
        setTimeout(() => {
          openingTableIdsRef.current.delete(targetTableForOpen.id);
        }, 4000);
        return;
      }

      // 2. Ghi đè vào DB Cục bộ hoặc State cục bộ lập tức (Offline-First)
      if (Platform.OS === 'web') {
        setTables(prev => prev.map(t => t.id === targetTableForOpen.id ? {
          ...t,
          status: 'occupied',
          current_order_id: orderId,
          startTime: nowTime,
          metadata: openTableMeta
        } : t));
      } else {
        // Dọn sạch mọi đơn in_progress và món ăn cũ của bàn này trong SQLite trước khi mở phiên mới
        try {
          const oldInProgOrders = await db
            .select()
            .from(schema.orders)
            .where(
              and(
                eq(schema.orders.resource_id, targetTableForOpen.id),
                eq(schema.orders.status, 'in_progress')
              )
            );
          for (const oldOrd of oldInProgOrders) {
            if (oldOrd.id) {
              closedOrderIdsRef.current.add(oldOrd.id);
              await db.delete(schema.orders).where(eq(schema.orders.id, oldOrd.id));
              await db.delete(schema.order_items).where(eq(schema.order_items.order_id, oldOrd.id));
            }
          }
        } catch (e) {}

        await db
          .update(schema.location_resources)
          .set({
            status: 'occupied',
            current_order_id: orderId,
            startTime: nowTime,
            metadata: openTableMeta
          })
          .where(eq(schema.location_resources.id, targetTableForOpen.id));

        // Nhập đơn hàng in_progress ngoại tuyến ngay lập tức
        const activeShiftId = await AsyncStorage.getItem('active_shift_id') || 'default-shift';
        await db.insert(schema.orders).values({
          id: orderId,
          order_no: `HD-BAN-${nowTime.toString().substring(9)}`,
          status: 'in_progress',
          customer_id: targetCustomer?.id || 'C-DEFAULT-RETAIL',
          customer_name: targetCustomer?.name || 'Khách lẻ',
          total_amount: 0,
          paid_amount: 0,
          payment_method: '',
          created_at: nowIso,
          updated_at: nowIso,
          shift_id: activeShiftId,
          sync_status: 'pending',
          note: '',
          discount_amount: 0,
          resource_id: targetTableForOpen.id,
          metadata: openTableMeta,
        });

        const updated = await db.select().from(schema.location_resources);
        setTables(updated);
      }

      // BẮT BUỘC làm sạch giỏ hàng của bàn khi mở phiên mới (tuyệt đối không để sót món của khách trước!)
      setTableCarts(prev => {
        const copy = { ...prev };
        delete copy[targetTableForOpen.id];
        return copy;
      });

      // Gán thông tin khách hàng nhận phòng bàn (hoặc xóa khách cũ nếu mở cho Khách lẻ)
      setTableCustomers(prev => {
        const copy = { ...prev };
        if (targetCustomer) {
          copy[targetTableForOpen.id] = targetCustomer;
        } else {
          delete copy[targetTableForOpen.id];
        }
        return copy;
      });

      handedOff = true;
      handOffToOpenedTable({
        ...targetTableForOpen,
        status: 'occupied',
        current_order_id: orderId,
        startTime: nowTime,
        metadata: openTableMeta,
      });

      showToast(`Đã nhận ${targetDisplayName}! Đang đồng bộ...`, 'info');

      // 3. Đồng bộ trực tuyến lên Server Next.js ở chế độ nền
      if (isOnline) {
        (async () => {
          try {
            const currentUrl = getApiBaseUrl();
            const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
            const headers = await getApiHeaders();

            let serverOrderId: string | null = null;

            // A. Tạo order in_progress trên Next.js Server
            const orderRes = await fetch(`${currentUrl}/api/shops/${shopId}/orders`, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status: 'in_progress',
                channel: 'pos-mobile',
                reference_no: orderId,
                customer_id: targetCustomer?.id || 'C-DEFAULT-RETAIL',
                customer_name: targetCustomer?.name || 'Khách lẻ',
                branch_id: shopId,
                employee_id: currentUserEmail,
                subtotal: '0',
                total_amount: '0',
                paid_amount: '0',
                resource_id: targetTableForOpen.id,
                metadata: openTableMeta
              }),
            });

            if (orderRes.ok) {
              const createdOrder = await orderRes.json();
              serverOrderId = createdOrder.id || createdOrder.order_id;
            } else {
              // Dự phòng qua sync-batch (tự động xử lý ca làm việc & tự động chiếm giữ phòng/bàn trên Server)
              console.warn(`[Open Table POST Failed] Status ${orderRes.status}, falling back to sync-batch`);
              const batchRes = await fetch(`${currentUrl}/api/shops/${shopId}/orders/sync-batch`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  local_order_id: orderId,
                  order: {
                    status: 'in_progress',
                    channel: 'pos-mobile',
                    customer_id: targetCustomer?.id || 'C-DEFAULT-RETAIL',
                    customer_name: targetCustomer?.name || 'Khách lẻ',
                    branch_id: shopId,
                    employee_id: currentUserEmail,
                    subtotal: 0,
                    total_amount: 0,
                    paid_amount: 0,
                    resource_id: targetTableForOpen.id,
                    created_at: nowIso,
                    metadata: openTableMeta,
                  },
                  items: [],
                  payments: [],
                }),
              });
              if (batchRes.ok) {
                const batchData = await batchRes.json().catch(() => ({}));
                serverOrderId = batchData.order_id || null;
              }
            }

            if (serverOrderId) {
              // B. Cập nhật vị trí sang occupied kèm đầy đủ metadata (chứa check_in)
              const patchRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${targetTableForOpen.id}`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  status: 'occupied',
                  current_order_id: serverOrderId,
                  metadata: openTableMeta
                }),
              });

              if (Platform.OS !== 'web') {
                await db
                  .update(schema.location_resources)
                  .set({ current_order_id: serverOrderId, status: 'occupied', metadata: openTableMeta })
                  .where(eq(schema.location_resources.id, targetTableForOpen.id));

                await db.update(schema.orders)
                  .set({ id: serverOrderId, sync_status: 'synced', updated_at: new Date().toISOString() })
                  .where(eq(schema.orders.id, orderId));

                await db.update(schema.order_items)
                  .set({ order_id: serverOrderId })
                  .where(eq(schema.order_items.order_id, orderId));

                const updated = await db.select().from(schema.location_resources);
                setTables(updated);
              } else {
                setTables(prev => prev.map(t => t.id === targetTableForOpen.id ? { ...t, current_order_id: serverOrderId, metadata: openTableMeta } : t));
              }

              setActiveTable((prev: any) => prev && prev.id === targetTableForOpen.id ? { ...prev, current_order_id: serverOrderId, metadata: openTableMeta } : prev);
              setCartOwnerTable((prev: any) => prev && prev.id === targetTableForOpen.id ? { ...prev, current_order_id: serverOrderId, metadata: openTableMeta } : prev);

              if (patchRes.ok) {
                showToast(`Đã đồng bộ ${targetDisplayName}!`, 'success');
              }
              broadcastSync?.({ event: 'TABLE_OPENED', tableId: targetTableForOpen.id, orderId: serverOrderId });
            }
          } catch (syncErr) {
            console.log('Mất mạng hoặc lỗi server, bỏ qua sync check-in trực tiếp:', syncErr);
          } finally {
            setTimeout(() => {
              openingTableIdsRef.current.delete(targetTableForOpen.id);
            }, 4000);
          }
        })();
      } else {
        setTimeout(() => {
          openingTableIdsRef.current.delete(targetTableForOpen.id);
        }, 4000);
      }
    } catch (err) {
      openingTableIdsRef.current.delete(targetTableForOpen.id);
      console.error('Không thể mở bàn bi-a:', err);
      failOpen(`Có lỗi xảy ra khi mở ${targetDisplayName}. Vui lòng thử lại.`);
    } finally {
      // Success keeps the loading state until the hand-off finishes (completeOpenTableHandoff)
      if (!handedOff) {
        openTableInFlightRef.current = false;
        setIsOpeningTable(false);
      }
    }
  };

  // Thay đổi số lượng món ăn/dịch vụ của phòng bàn trực tiếp
  /** v2: apply an edit to a table cart and enqueue its delta (no side effects inside setState) */
  const applyV2TableCartEdit = (
    tableId: string,
    edit: (cart: Record<string, any>) => Record<string, any> | null,
    opts?: { voidReason?: string },
  ) => {
    const base = tableCartsRef.current[tableId] || {};
    const next = edit(base);
    if (!next) return;
    tableCartsRef.current = { ...tableCartsRef.current, [tableId]: next };
    setTableCarts(prev => ({ ...prev, [tableId]: next }));
    void syncOrderItemsOnline('', next, tableId, base, opts?.voidReason ? { voidReason: opts.voidReason } : undefined);
  };

  const handleIncreaseTableItemQty = (tableId: string, cartItemId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    if (getV2Session(tableId)) {
      applyV2TableCartEdit(tableId, (cart) => {
        const item = cart[cartItemId];
        return item ? { ...cart, [cartItemId]: { ...item, quantity: item.quantity + 1 } } : null;
      });
      return;
    }
    setTableCarts(prev => {
      const tableCart = prev[tableId] || {};
      const item = tableCart[cartItemId];
      if (!item) return prev;
      const updatedCart = {
        ...tableCart,
        [cartItemId]: {
          ...item,
          quantity: item.quantity + 1
        }
      };

      // Đồng bộ trực tuyến tức thì lên server Next.js
      if (activeTable && activeTable.id === tableId) {
        syncOrderItemsOnline(activeTable.current_order_id || '', updatedCart, tableId);
      }

      return {
        ...prev,
        [tableId]: updatedCart
      };
    });
  };

  const handleDecreaseTableItemQty = (tableId: string, cartItemId: string, opts?: { voidReason?: string }) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    if (getV2Session(tableId)) {
      applyV2TableCartEdit(tableId, (cart) => {
        const item = cart[cartItemId];
        if (!item) return null;
        const newQty = Math.max(1, item.quantity - 1);
        return newQty === item.quantity ? null : { ...cart, [cartItemId]: { ...item, quantity: newQty } };
      }, opts);
      return;
    }
    setTableCarts(prev => {
      const tableCart = prev[tableId] || {};
      const item = tableCart[cartItemId];
      if (!item) return prev;
      const newQty = Math.max(1, item.quantity - 1);
      const updatedCart = {
        ...tableCart,
        [cartItemId]: {
          ...item,
          quantity: newQty
        }
      };

      // Đồng bộ trực tuyến tức thì lên server Next.js
      if (activeTable && activeTable.id === tableId) {
        syncOrderItemsOnline(activeTable.current_order_id || '', updatedCart, tableId);
      }

      return {
        ...prev,
        [tableId]: updatedCart
      };
    });
  };

  const handleRemoveTableItem = (tableId: string, cartItemId: string, opts?: { voidReason?: string }) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => { });
    if (getV2Session(tableId)) {
      applyV2TableCartEdit(tableId, (cart) => {
        if (!cart[cartItemId]) return null;
        const next = { ...cart };
        delete next[cartItemId];
        return next;
      }, opts);
      return;
    }
    setTableCarts(prev => {
      const tableCart = { ...(prev[tableId] || {}) };
      delete tableCart[cartItemId];

      // Đồng bộ trực tuyến tức thì lên server Next.js
      if (activeTable && activeTable.id === tableId) {
        syncOrderItemsOnline(activeTable.current_order_id || '', tableCart, tableId);
      }

      return {
        ...prev,
        [tableId]: tableCart
      };
    });
  };

  const syncCustomerUpdate = async (orderId: string, custId: string, custName: string, custPhone: string) => {
    try {
      const targetTable = activeTable;
      if (!targetTable) return;

      // Lấy metadata hiện tại
      let currentMeta: any = {};
      if (targetTable.metadata) {
        try {
          currentMeta = typeof targetTable.metadata === 'string' ? JSON.parse(targetTable.metadata) : (targetTable.metadata || {});
        } catch (e) { }
      }

      const updatedMeta = JSON.stringify({
        ...currentMeta,
        customer_phone: custPhone
      });

      // Cập nhật SQLite metadata cục bộ và đơn hàng in_progress cục bộ lập tức
      if (Platform.OS !== 'web') {
        await db.update(schema.location_resources)
          .set({ metadata: updatedMeta })
          .where(eq(schema.location_resources.id, targetTable.id));

        await db.update(schema.orders)
          .set({
            customer_id: custId,
            customer_name: custName,
            metadata: updatedMeta,
            updated_at: new Date().toISOString()
          })
          .where(eq(schema.orders.id, orderId));
      }

      // Cập nhật state activeTable và tables lập tức
      setActiveTable((prev: any) => prev ? { ...prev, metadata: updatedMeta } : null);
      setTables(prev => prev.map(t => t.id === targetTable.id ? { ...t, metadata: updatedMeta } : t));

      // Gọi PUT đồng bộ lên server Next.js ở background
      if (isOnline) {
        (async () => {
          try {
            const currentUrl = getApiBaseUrl();
            const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
            const headers = await getApiHeaders();
            
            await fetch(`${currentUrl}/api/shops/${shopId}/orders/${orderId}`, {
              method: 'PUT',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                customer_id: custId,
                customer_name: custName,
                metadata: updatedMeta
              })
            });
          } catch (e) {
            console.warn('Lỗi khi đồng bộ khách hàng đại diện lên server trong nền:', e);
          }
        })();
      }
    } catch (e) {
      console.warn('Lỗi khi cập nhật khách hàng đại diện cục bộ:', e);
    }
  };

  const handleUpdateTableCustomer = async (tableId: string, customer: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
    if (!customer) {
      // Xóa khách hàng đại diện -> đưa về Khách lẻ
      setTableCustomers(prev => {
        const copy = { ...prev };
        delete copy[tableId];
        return copy;
      });
      if (activeTable && activeTable.id === tableId && activeTable.current_order_id) {
        await syncCustomerUpdate(activeTable.current_order_id, 'C-DEFAULT-RETAIL', 'Khách lẻ', '');
      }
    } else {
      // Gán khách hàng đại diện mới
      setTableCustomers(prev => ({
        ...prev,
        [tableId]: customer
      }));
      if (activeTable && activeTable.id === tableId && activeTable.current_order_id) {
        await syncCustomerUpdate(activeTable.current_order_id, customer.id, customer.name, customer.phone || '');
      }
    }
  };

  /**
   * Table sync v2 checkout preparation: flush the outbox, then lock the time charge with a server
   * quote (online, nothing pending) or a provisional amount from the shared formula (offline / ops
   * still queued). Returns null when checkout must not continue.
   */
  const prepareV2Checkout = async (
    table: any,
    session: { sessionId: string; orderId: string }
  ): Promise<{ lock: V2CheckoutLock; cart: Record<string, any> } | null> => {
    if (!v2) return null;
    if (payingTableIdsRef.current.has(table.id)) {
      showToast('Đang xử lý thanh toán cho bàn này...', 'info');
      return null;
    }
    if (!session.orderId) {
      showToast('Phiên bàn chưa lên máy chủ. Cần có mạng một lần để đồng bộ trước khi thanh toán.', 'error');
      return null;
    }
    payingTableIdsRef.current.add(table.id);
    try {
      await v2.flush().catch(() => {});
      const pending = await v2.pendingCount(session.sessionId);
      const shopId = activeShopId || await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const lookup = (id: string) => productsList.find(p => p.id === id);

      if (pending > 0 || !isOnline) {
        const choice = await dialog.confirm({
          title: 'Đóng tạm khi mất mạng',
          message: pending > 0
            ? `Còn ${pending} thao tác của ${getResourceDisplayName(table, shopVertical, false)} chưa gửi được lên máy chủ. Bạn vẫn có thể thu tiền; đơn được ghi "đóng tạm" và máy chủ sẽ đối soát tiền giờ khi có mạng lại.`
            : `Máy đang mất mạng. Bạn vẫn có thể thu tiền ${getResourceDisplayName(table, shopVertical, false)}; đơn được ghi "đóng tạm" và máy chủ sẽ đối soát tiền giờ khi có mạng lại.`,
          tone: 'warning',
          icon: 'wifi-off',
          dismissable: false,
          actions: [
            { key: 'cancel', label: 'Huỷ', style: 'secondary' },
            { key: 'close', label: 'Đóng tạm', style: 'primary' },
          ],
        });
        if (choice !== 'close') return null;
        const checkoutAt = new Date();
        const meta = parseMetaSafe(table.metadata);
        const checkInIso = meta.check_in || (table.startTime ? new Date(table.startTime).toISOString() : checkoutAt.toISOString());
        const charge = computeTableTimeCharge(buildTablePricingSnapshot(table, meta), new Date(checkInIso), checkoutAt);
        // Lines the device knows: last server lines + this device's still-queued ops
        const cart = lastV2CartRef.current[table.id] || tableCartsRef.current[table.id] || {};
        return {
          lock: {
            tableId: table.id,
            sessionId: session.sessionId,
            orderId: session.orderId,
            quoteId: '',
            provisional: true,
            amount: Math.round(Number(charge.amount) || 0),
            label: charge.duration_label,
            checkoutAt: checkoutAt.toISOString(),
          },
          cart,
        };
      }

      const r = await callTableSessionApi(shopId, `/${encodeURIComponent(session.sessionId)}/quote`, 'POST', { device_id: v2.deviceId });
      if (r.status === 409 && r.body?.error === 'session_not_open') {
        showToast('Bàn này đã được thanh toán hoặc đóng trên thiết bị khác.', 'info');
        void syncActiveTableSession(table);
        refreshTablesThrottled();
        return null;
      }
      if (r.status < 200 || r.status >= 300) {
        showToast(r.body?.message || 'Không lấy được báo giá tiền giờ', 'error');
        return null;
      }
      const quote = r.body || {};
      // Bill exactly the server lines (lines added by other devices included, #8)
      let cart: Record<string, any> = lastV2CartRef.current[table.id] || tableCartsRef.current[table.id] || {};
      try {
        const snap = await callTableSessionApi(shopId, `/${encodeURIComponent(session.sessionId)}`, 'GET');
        if (snap.status === 200 && Array.isArray(snap.body?.items)) {
          cart = v2LinesToCart(snap.body.items, [], lookup) as any;
          lastV2CartRef.current[table.id] = cart;
          tableCartsRef.current = { ...tableCartsRef.current, [table.id]: cart as any };
          setTableCarts(prev => ({ ...prev, [table.id]: cart as any }));
        }
      } catch {}
      return {
        lock: {
          tableId: table.id,
          sessionId: session.sessionId,
          orderId: session.orderId,
          quoteId: String(quote.quote_id || ''),
          provisional: false,
          amount: Math.round(Number(quote.time_charge?.amount) || 0),
          label: String(quote.time_charge?.duration_label || ''),
          checkoutAt: String(quote.checkout_at || new Date().toISOString()),
        },
        cart,
      };
    } catch (err) {
      console.warn('[TableSyncV2] Không thể chuẩn bị thanh toán:', err);
      showToast('Không lấy được báo giá tiền giờ. Vui lòng kiểm tra kết nối và thử lại.', 'error');
      return null;
    } finally {
      payingTableIdsRef.current.delete(table.id);
    }
  };

  /**
   * "Thanh toán" on a table: shows a loading state on the button while the outbox is flushed and the
   * time charge is quoted, and ignores repeated taps until the checkout modal is up.
   */
  const triggerPayTable = async (table: any) => {
    if (payPrepInFlightRef.current) return;
    payPrepInFlightRef.current = true;
    setIsPreparingTablePay(true);
    let handedToCheckout = false;
    try {
      handedToCheckout = await preparePayTable(table);
    } catch (err) {
      console.warn('[POS] Không thể chuẩn bị thanh toán bàn:', err);
      showToast('Không thể chuẩn bị thanh toán. Vui lòng thử lại.', 'error');
    } finally {
      const release = () => {
        payPrepInFlightRef.current = false;
        setIsPreparingTablePay(false);
      };
      // Keep the guard until the checkout modal has been asked to open (preparePayTable waits 400 ms)
      if (handedToCheckout) setTimeout(release, 450);
      else release();
    }
  };

  /** Returns true when the checkout modal is being opened for the table. */
  const preparePayTable = async (table: any): Promise<boolean> => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });

    // Table sync v2: lock the time charge first (quote / provisional) and bill the server lines
    const v2Session = getV2Session(table);
    let v2Prepared: { lock: V2CheckoutLock; cart: Record<string, any> } | null = null;
    if (v2 && v2Session) {
      v2Prepared = await prepareV2Checkout(table, v2Session);
      if (!v2Prepared) return false;
    } else {
      setV2Checkout(null);
    }

    // 1. Tính toán tiền giờ/qua đêm lưu trú nâng cao sử dụng @oni/core
    const billing = v2Prepared
      ? { cost: v2Prepared.lock.amount, label: v2Prepared.lock.label }
      : calculateBilling(table);

    // 2. Chuyển tiền giờ thành sản phẩm TIME_CHARGE ảo đặc biệt
    const billingName = table.type === 'room'
      ? `Tiền phòng - ${table.name} (${billing.label})`
      : `Tiền giờ - ${table.name} (${billing.label})`;

    const tableCartItems = v2Prepared ? withoutTimeCharge(v2Prepared.cart) : (tableCarts[table.id] || {});
    const newCart: any = { ...tableCartItems };

    const activeIndustry = await AsyncStorage.getItem('active_shop_industry') || 'retail';
    const systemProdId = getTimeChargeProductId(activeIndustry);
    
    // Query product from SQLite
    let timeChargeTaxRate = '0';
    let timeChargeTaxGroup = '';
    try {
      const prod = await db.select()
        .from(schema.products)
        .where(eq(schema.products.id, systemProdId))
        .limit(1)
        .then((res: any[]) => res[0]);
      if (prod) {
        timeChargeTaxRate = prod.tax_rate || '0';
        timeChargeTaxGroup = prod.tax_group || '';
      }
    } catch (e) {
      console.warn('Failed to query system product from SQLite:', e);
    }

    if (billing.cost > 0) {
      newCart['TIME_CHARGE'] = {
        productId: 'TIME_CHARGE',
        name: billingName,
        price: billing.cost,
        quantity: 1,
        modifier_total: 0,
        tax_rate: timeChargeTaxRate,
        tax_group: timeChargeTaxGroup
      };
    }

    // 3. Thiết lập giỏ hàng bán lẻ dùng chung
    if (v2Prepared) setV2Checkout(v2Prepared.lock);
    setCart(newCart);
    setCartOwnerTable(table);
    setSelectedCustomer(tableCustomers[table.id] || null);
    setDiscountAmount(0);
    setOrderNote('');

    // 4. Thiết lập phương thức thanh toán mặc định tương đương tổng tiền giỏ hàng
    let totalTaxAmount = 0;
    Object.values(newCart).forEach((item: any) => {
      const itemTotal = (item.price + (item.modifier_total || 0)) * item.quantity;
      const taxRateVal = parseFloat(item.tax_rate || '0');
      const taxAmountVal = Math.round(itemTotal * (taxRateVal / 100));
      totalTaxAmount += taxAmountVal;
    });

    const totalCartValue = Math.max(
      0,
      Object.values(newCart).reduce((sum: number, item: any) => sum + ((item.price + (item.modifier_total || 0)) * item.quantity), 0) + totalTaxAmount
    );
    setPaymentRows([{ id: 'pay-cash', method: 'cash', fund_id: paymentFundsList.find(f => f.type === 'cash')?.id || 'cash', amount: totalCartValue }]);

    // 5. Mở modal giỏ hàng chính để thanh toán hệ thống (Trì hoãn để tránh đơ UI trên iOS)
    setActiveTable(null); // Đóng modal sơ đồ phòng bàn hiện tại trước
    setTimeout(() => {
      handleCheckoutPress(() => {
        setIsCartModalOpen(true);
      });
    }, 400);
    return true;
  };

  // Xác nhận Thanh toán bàn chơi / phòng lưu trú (Unified Flow)
  const handlePayTableConfirmUnified = async (
    customer: any,
    discount: number,
    note: string,
    payments: { id: string; method: string; fund_id: string; amount: number }[],
    customCheckoutTime?: Date,
    selectedRentalType?: 'hourly' | 'overnight' | 'daily',
    overrideCartItems?: { [cartItemId: string]: any },
    chargeByMinuteOverride?: boolean
  ) => {
    if (!cartOwnerTable) return;
    // Table sync v2: checkout only with the time charge locked by triggerPayTable (quote / provisional)
    const v2Lock = v2 && v2Checkout && v2Checkout.tableId === cartOwnerTable.id ? v2Checkout : null;
    if (!v2Lock && getV2Session(cartOwnerTable)) {
      showToast('Vui lòng bấm "Thanh toán" lại trên bàn để lấy báo giá tiền giờ.', 'error');
      return;
    }
    const v2GuardTableId = cartOwnerTable.id;
    let releaseV2GuardInBackground = false;
    if (v2Lock) {
      if (payingTableIdsRef.current.has(v2GuardTableId)) {
        showToast('Đang xử lý thanh toán cho bàn này...', 'info');
        return;
      }
      payingTableIdsRef.current.add(v2GuardTableId);
    }
    // Chốt MỘT mốc giờ ra duy nhất cho cả luồng thanh toán bàn (tiền giờ, check_out, created_at, khoá thuế)
    // -> tổng tiền gửi lên luôn khớp dòng tiền giờ (tránh 400 do server kiểm tra toàn vẹn).
    const frozenCheckoutTime: Date = v2Lock
      ? new Date(v2Lock.checkoutAt)
      : (customCheckoutTime || (cartOwnerTable.checkoutTime ? new Date(cartOwnerTable.checkoutTime) : new Date()));
    setIsPayingTableLoading(true);
    try {
      const { isTaxPeriodLocked } = await import('../../lib/utils/tax');
      const isLocked = await isTaxPeriodLocked(frozenCheckoutTime);
      if (isLocked) {
        setIsPayingTableLoading(false);
        void dialog.alert(
          'Kỳ thuế đã khóa',
          'Thời điểm thanh toán nằm trong kỳ thuế đã bị khóa sổ. Không thể tạo hóa đơn mới!',
          'danger'
        );
        return;
      }
      const selectedTableForPay = cartOwnerTable;
      let rentalType = selectedRentalType || 'hourly';
      let parsedTableMeta: any = {};
      if (selectedTableForPay.metadata) {
        try {
          parsedTableMeta = typeof selectedTableForPay.metadata === 'string'
            ? JSON.parse(selectedTableForPay.metadata)
            : selectedTableForPay.metadata;
          if (!selectedRentalType) {
            rentalType = parsedTableMeta?.rental_type || 'hourly';
          }
        } catch (e) {
          console.warn('Error parsing metadata in handlePayTableConfirmUnified:', e);
        }
      }

      const v2CheckInIso = v2Lock
        ? String(parsedTableMeta?.check_in || (selectedTableForPay.startTime ? new Date(selectedTableForPay.startTime).toISOString() : ''))
        : '';
      const v2DurationMin = v2Lock && v2CheckInIso
        ? Math.max(0, Math.ceil((frozenCheckoutTime.getTime() - new Date(v2CheckInIso).getTime()) / 60000))
        : 0;
      const billing = v2Lock
        ? { hours: Math.floor(v2DurationMin / 60), minutes: v2DurationMin % 60, cost: v2Lock.amount, label: v2Lock.label }
        : calculateBilling(selectedTableForPay, frozenCheckoutTime, rentalType, chargeByMinuteOverride);
      // v2: extra order metadata so sync-batch closes the session (server reconciles the time charge)
      const v2OrderMeta = v2Lock
        ? {
            session_id: v2Lock.sessionId,
            quote_id: v2Lock.quoteId || undefined,
            check_in: v2CheckInIso || undefined,
            check_out: v2Lock.checkoutAt,
            provisional_close: v2Lock.provisional ? true : undefined,
          }
        : {};
      const rawTableCartItems = overrideCartItems || tableCarts[selectedTableForPay.id] || {};
      // TIME_CHARGE chỉ là dòng ảo để hiển thị trong modal checkout. Phần tiền phòng/giờ
      // được tạo riêng bằng system product bên dưới, nên tuyệt đối không tính/gửi dòng ảo này.
      const tableCartItems = Object.fromEntries(
        Object.entries(rawTableCartItems).filter(([cartItemId, item]: [string, any]) =>
          !isTimeChargeProduct(item.productId || cartItemId, item.name)
        )
      );

      const itemsCost = Object.values(tableCartItems).reduce((sum, item: any) => sum + ((item.price + (item.modifier_total || 0)) * item.quantity), 0);
      const subtotal = billing.cost + itemsCost;

      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const shiftId = await AsyncStorage.getItem('active_shift_id') || 'default-shift';

      const activeIndustry = await AsyncStorage.getItem('active_shop_industry') || 'retail';
      const systemProdId = getTimeChargeProductId(activeIndustry);

      const systemTaxGroups = await getSystemTaxGroups();

      let timeChargeTaxRate = '0';
      let timeChargeTaxGroup = '';
      let timeChargeVatRate = '0';
      let timeChargePitRate = '0';
      try {
        const prod = await db.select()
          .from(schema.products)
          .where(eq(schema.products.id, systemProdId))
          .limit(1)
          .then((res: any[]) => res[0]);
        if (prod) {
          timeChargeTaxRate = prod.tax_rate || '0';
          timeChargeTaxGroup = prod.tax_group || '';
          
          if (timeChargeTaxGroup) {
            const matchedGroup = systemTaxGroups.find(
              (g) =>
                g.code === timeChargeTaxGroup ||
                g.name === timeChargeTaxGroup ||
                (timeChargeTaxGroup === 'Phân phối, cung cấp hàng hóa' && g.code === 'phan_phoi') ||
                (timeChargeTaxGroup === 'Dịch vụ, xây dựng không bao thầu nguyên vật liệu' && g.code === 'dich_vu') ||
                (timeChargeTaxGroup === 'Sản xuất, vận tải, dịch vụ có gắn với hàng hóa, xây dựng có bao thầu nguyên vật liệu' && g.code === 'san_xuat') ||
                (timeChargeTaxGroup === 'Hoạt động kinh doanh khác' && g.code === 'khac')
            );
            if (matchedGroup) {
              timeChargeTaxGroup = matchedGroup.code;
              timeChargeVatRate = String(matchedGroup.vat_rate);
              timeChargePitRate = String(matchedGroup.pit_rate);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to query system product in handlePayTableConfirmUnified:', e);
      }

      // FIX DUPLICATE: Resolve latest current_order_id from state/SQLite in case serverOrderId arrived while modal was open
      let resolvedCurrentOrderId =
        tables.find((t: any) => t.id === selectedTableForPay.id)?.current_order_id ||
        selectedTableForPay.current_order_id ||
        '';
      if (Platform.OS !== 'web') {
        try {
          const [latestLocalRes] = await db
            .select()
            .from(schema.location_resources)
            .where(eq(schema.location_resources.id, selectedTableForPay.id));
          if (latestLocalRes?.current_order_id) {
            resolvedCurrentOrderId = latestLocalRes.current_order_id;
          }
        } catch (e) {}
      }
      if (v2Lock) resolvedCurrentOrderId = v2Lock.orderId;
      // v2: stable local id per session so a retried checkout is idempotent
      const orderId = v2Lock ? `v2-checkout-${v2Lock.sessionId}` : (resolvedCurrentOrderId || `ORD-T-${Date.now()}`);
      const orderNoType = shopVertical === 'lodging' ? 'KS' : (shopVertical === 'sports_court' ? 'SAN' : 'POS');
      const orderNo = `HD-${orderNoType}-${Date.now().toString().substring(9)}`;
      const checkoutTimeStr = frozenCheckoutTime.toISOString();
      let syncSucceeded = false;
      let serverOrderNo = orderNo;

      // Calculate offline tax
      let totalTaxAmount = 0;

      if (billing.cost > 0) {
        const timeTaxRateVal = parseFloat(timeChargeTaxRate || '0');
        const timeTaxAmountVal = Math.round(billing.cost * (timeTaxRateVal / 100));
        totalTaxAmount += timeTaxAmountVal;
      }

      const calculatedItems = Object.entries(tableCartItems).map(([prodId, item]: [string, any]) => {
        const itemTotal = (item.price + (item.modifier_total || 0)) * item.quantity;
        const taxRateVal = parseFloat(item.tax_rate || '0');
        const taxAmountVal = Math.round(itemTotal * (taxRateVal / 100));
        totalTaxAmount += taxAmountVal;

        let taxVatRate = '0';
        let taxPitRate = '0';
        let normalizedGroup = item.tax_group || '';

        if (normalizedGroup) {
          const matchedGroup = systemTaxGroups.find(
            (g) =>
              g.code === normalizedGroup ||
              g.name === normalizedGroup ||
              (normalizedGroup === 'Phân phối, cung cấp hàng hóa' && g.code === 'phan_phoi') ||
              (normalizedGroup === 'Dịch vụ, xây dựng không bao thầu nguyên vật liệu' && g.code === 'dich_vu') ||
              (normalizedGroup === 'Sản xuất, vận tải, dịch vụ có gắn với hàng hóa, xây dựng có bao thầu nguyên vật liệu' && g.code === 'san_xuat') ||
              (normalizedGroup === 'Hoạt động kinh doanh khác' && g.code === 'khac')
          );
          if (matchedGroup) {
            normalizedGroup = matchedGroup.code;
            taxVatRate = String(matchedGroup.vat_rate);
            taxPitRate = String(matchedGroup.pit_rate);
          }
        }

        const origProd = productsList.find(p => p.id === item.productId);
        const catalogPrice = origProd ? (Number(origProd.sell_price) || 0) : 0;
        const resolvedOrigPrice = item.original_price ?? (catalogPrice > 0 ? catalogPrice : (item.price + (item.modifier_total || 0)));

        return {
          id: `ORDI-${orderId}-${prodId}`,
          order_id: orderId,
          product_id: item.productId,
          product_name: item.name,
          qty: item.quantity,
          unit_price: item.price + (item.modifier_total || 0),
          original_price: resolvedOrigPrice,
          discount_amount: item.discount_amount || Math.max(0, resolvedOrigPrice - (item.price + (item.modifier_total || 0))),
          line_total: itemTotal,
          tax_rate: item.tax_rate || '0',
          tax_amount: taxAmountVal,
          tax_group: normalizedGroup,
          tax_vat_rate: taxVatRate,
          tax_pit_rate: taxPitRate,
        };
      });

      const totalAmount = Math.max(0, subtotal - discount + totalTaxAmount);
      const paidSum = payments.reduce((sum, p) => sum + p.amount, 0);
      const cashChange = Math.max(0, paidSum - totalAmount);
      let processedPayments = [...payments];
      if (cashChange > 0) {
        const defaultCashFund = paymentFundsList.find(f => f.type === 'cash' && f.is_default === 'TRUE') || paymentFundsList.find(f => f.type === 'cash') || paymentFundsList[0];
        processedPayments.push({
          id: 'change-' + Date.now(),
          method: 'cash',
          fund_id: defaultCashFund?.id || '',
          amount: -cashChange
        });
      }

      const paymentMethodString = JSON.stringify(processedPayments.map(p => {
        const fund = paymentFundsList.find(f => f.id === p.fund_id);
        return {
          method: p.method,
          amount: p.amount,
          meta: {
            fund_id: p.fund_id,
            fund_name: fund ? fund.name : ''
          }
        };
      }));

      const releaseStatusAfterPay = shopVertical === 'lodging' ? 'dirty' : 'available';
      const cleanedPaidTableMeta = cleanStaticResourceMeta(selectedTableForPay.metadata, { last_checkout_time: checkoutTimeStr });
      if (selectedTableForPay.current_order_id) closedOrderIdsRef.current.add(selectedTableForPay.current_order_id);
      if (resolvedCurrentOrderId) closedOrderIdsRef.current.add(resolvedCurrentOrderId);

      // A. Lưu vào cơ sở dữ liệu SQLite cục bộ (Offline-First)
      if (Platform.OS === 'web') {
        setTables(prev => prev.map(t => t.id === selectedTableForPay.id ? { ...t, status: releaseStatusAfterPay, startTime: null, current_order_id: null, metadata: cleanedPaidTableMeta } : t));
      } else {
        const oldOrderIdsToClean = new Set<string>();
        if (v2Lock) {
          // v2: never delete other local orders of the table (#2); only replace this checkout's own row
          oldOrderIdsToClean.add(orderId);
        } else {
        if (selectedTableForPay.current_order_id) oldOrderIdsToClean.add(selectedTableForPay.current_order_id);
        if (resolvedCurrentOrderId) oldOrderIdsToClean.add(resolvedCurrentOrderId);
        try {
          const localInProgForTable = await db
            .select()
            .from(schema.orders)
            .where(
              and(
                eq(schema.orders.resource_id, selectedTableForPay.id),
                eq(schema.orders.status, 'in_progress')
              )
            );
          for (const o of localInProgForTable) {
            if (o.id) oldOrderIdsToClean.add(o.id);
          }
        } catch (e) {}
        }

        for (const oldId of oldOrderIdsToClean) {
          await db.delete(schema.orders).where(eq(schema.orders.id, oldId));
          await db.delete(schema.order_items).where(eq(schema.order_items.order_id, oldId));
        }

        await db.insert(schema.orders).values({
          id: orderId,
          order_no: orderNo,
          status: 'completed',
          customer_name: customer?.name || 'Khách lẻ',
          customer_id: customer?.id || 'C-DEFAULT-RETAIL',
          total_amount: totalAmount,
          paid_amount: Math.min(totalAmount, processedPayments
            .filter(p => p.method !== 'debt' && !p.method?.startsWith('debt-'))
            .reduce((sum, p) => sum + p.amount, 0)),
          payment_method: paymentMethodString,
          created_at: checkoutTimeStr,
          updated_at: checkoutTimeStr,
          shift_id: shiftId,
          tax_amount: totalTaxAmount,
          sync_status: 'pending',
          note: note,
          discount_amount: discount,
          resource_id: selectedTableForPay.id,
          metadata: JSON.stringify({
            resource_id: selectedTableForPay.id,
            resource_name: selectedTableForPay.name,
            resource_type: selectedTableForPay.type,
            billing_cost: billing.cost,
            billing_duration: billing.label,
            check_in: selectedTableForPay.startTime,
            original_start_time: parsedTableMeta?.original_start_time,
            duration_minutes: (billing.hours || 0) * 60 + (billing.minutes || 0),
            check_out: checkoutTimeStr,
            original_check_out: parsedTableMeta?.original_temp_checkout_time,
            rental_type: rentalType,
            server_order_id: resolvedCurrentOrderId || '',
            ...v2OrderMeta
          }),
        });

        if (billing.cost > 0) {
          const timeTaxRateVal = parseFloat(timeChargeTaxRate || '0');
          const timeTaxAmountVal = Math.round(billing.cost * (timeTaxRateVal / 100));
          await db.insert(schema.order_items).values({
            id: `ORDI-${orderId}-time`,
            order_id: orderId,
            product_id: systemProdId,
            product_name: selectedTableForPay.type === 'room'
              ? `Tiền phòng - ${selectedTableForPay.name} (${billing.label})`
              : `Tiền giờ - ${selectedTableForPay.name} (${billing.label})`,
            qty: 1,
            unit_price: billing.cost,
            line_total: billing.cost,
            tax_rate: timeChargeTaxRate,
            tax_amount: timeTaxAmountVal,
            tax_group: timeChargeTaxGroup,
            tax_vat_rate: timeChargeVatRate,
            tax_pit_rate: timeChargePitRate,
          });
        }

        // Thêm các món ăn/dịch vụ gọi kèm vào SQLite order_items
        for (const it of calculatedItems) {
          await db.insert(schema.order_items).values(it);
        }

        await db
          .update(schema.location_resources)
          .set({ status: releaseStatusAfterPay, startTime: null, current_order_id: null, metadata: cleanedPaidTableMeta })
          .where(eq(schema.location_resources.id, selectedTableForPay.id));

        const updated = await db.select().from(schema.location_resources);
        setTables(updated);
      }

      // Xóa giỏ hàng của bàn và khách hàng phòng bàn sau khi thanh toán cục bộ ngay lập tức
      setTableCarts(prev => {
        const copy = { ...prev };
        delete copy[selectedTableForPay.id];
        return copy;
      });
      setTableCustomers(prev => {
        const copy = { ...prev };
        delete copy[selectedTableForPay.id];
        return copy;
      });

      setCart({});
      setDiscountAmount(0);
      setOrderNote('');
      setSelectedCustomer(null);
      setCartOwnerTable(null);

      if (v2Lock) {
        // A provisional close already billed the queued lines: never replay them after the session closed
        if (v2Lock.provisional) await v2?.discardSession(v2Lock.sessionId).catch(() => {});
        forgetV2Session(selectedTableForPay.id);
        setV2Checkout(null);
      }

      setIsCartModalOpen(false);
      setIsPayingTableLoading(false); // UI unblocked!

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });

      // Hiển thị QR thanh toán hoặc Toast báo thành công bằng local orderNo ngay lập tức
      const hasTransfer = payments.some(p => checkIsQrPayment(p.method) && p.amount > 0);
      if (hasTransfer) {
        const transferAmount = payments.filter(p => checkIsQrPayment(p.method)).reduce((sum, p) => sum + p.amount, 0);
        const transferP = payments.find(p => checkIsQrPayment(p.method) && p.amount > 0);
        const transferFund = transferP ? paymentFundsList.find(f => f.id === transferP.fund_id) : null;
        // Silent skip: Chỉ hiển thị QR nếu Quỹ đã cài đặt số tài khoản ngân hàng và tên ngân hàng
        const hasValidBankSetup = transferP && transferFund && transferFund.account_number && transferFund.bank_name;
        if (hasValidBankSetup && transferP) {
          setQrPayload({ amount: transferAmount, orderNo: orderNo, fund_id: transferP.fund_id });
          setTimeout(() => {
            setIsQrModalOpen(true);
          }, 400);
        } else {
          showToast(`Đã lưu hóa đơn ${orderNo}. Đang đồng bộ lên server...`, 'info');
        }
      } else {
        showToast(`Đã lưu hóa đơn ${orderNo}. Đang đồng bộ lên server...`, 'info');
      }

      // B. Đồng bộ hóa trong nền không làm nghẽn giao diện chính
      releaseV2GuardInBackground = !!v2Lock;
      (async () => {
        try {
        const currentUrl = isOnline ? getApiBaseUrl() : null;
        if (!currentUrl) {
          if (Platform.OS !== 'web') {
            setTimeout(() => {
              SyncManager.pushOfflineOrders(shopId).catch(() => {});
            }, 800);
          }
          return;
        }

        const syncController = new AbortController();
        const syncTimeoutId = setTimeout(() => syncController.abort(), 15000);
        try {
          const headers = await getApiHeaders();
          const payload = {
            local_order_id: v2Lock ? orderId : (resolvedCurrentOrderId || orderId),
            server_order_id: resolvedCurrentOrderId || '',
            order: {
              status: 'completed',
              channel: 'pos-mobile',
              customer_id: customer?.id || 'C-DEFAULT-RETAIL',
              customer_name: customer?.name || 'Khách lẻ',
              branch_id: shopId,
              employee_id: currentUserEmail,
              subtotal: subtotal,
              discount_amount: discount,
              tax_amount: totalTaxAmount,
              total_amount: totalAmount,
              paid_amount: Math.min(totalAmount, paidSum),
              debt_amount: Math.max(0, totalAmount - Math.min(totalAmount, paidSum)),
              resource_id: selectedTableForPay.id,
              note: note || `Thanh toán ${resourceNouns.noun} từ di động.`,
              created_at: checkoutTimeStr,
              metadata: JSON.stringify({
                resource_id: selectedTableForPay.id,
                resource_name: selectedTableForPay.name,
                resource_type: selectedTableForPay.type,
                billing_cost: billing.cost,
                billing_duration: billing.label,
                check_in: selectedTableForPay.startTime,
                original_start_time: parsedTableMeta?.original_start_time,
                duration_minutes: (billing.hours || 0) * 60 + (billing.minutes || 0),
                check_out: checkoutTimeStr,
                original_check_out: parsedTableMeta?.original_temp_checkout_time,
                rental_type: rentalType,
                server_order_id: resolvedCurrentOrderId || '',
                ...v2OrderMeta
              }),
              shift_id: shiftId,
            },
            items: [
              ...(billing.cost > 0 ? [{
                product_id: systemProdId,
                product_name: selectedTableForPay.type === 'room'
                  ? `Tiền phòng - ${selectedTableForPay.name} (${billing.label})`
                  : `Tiền giờ - ${selectedTableForPay.name} (${billing.label})`,
                qty: 1,
                unit_price: billing.cost,
                discount_amount: 0,
                line_total: billing.cost,
                tax_rate: timeChargeTaxRate,
                tax_amount: Math.round(billing.cost * (parseFloat(timeChargeTaxRate || '0') / 100)),
                tax_group: timeChargeTaxGroup,
              }] : []),
              ...calculatedItems.map(it => ({
                product_id: it.product_id,
                product_name: it.product_name,
                qty: it.qty,
                unit_price: it.unit_price,
                original_price: it.original_price,
                discount_amount: it.discount_amount,
                line_total: it.line_total,
                tax_rate: it.tax_rate,
                tax_amount: it.tax_amount,
                tax_group: it.tax_group,
                tax_vat_rate: it.tax_vat_rate,
                tax_pit_rate: it.tax_pit_rate,
              }))
            ],
            payments: processedPayments.map(p => {
              const fund = paymentFundsList.find(f => f.id === p.fund_id);
              return {
                method: p.method,
                amount: p.amount,
                fund_id: p.fund_id,
                meta: {
                  fund_id: p.fund_id,
                  fund_name: fund ? fund.name : ''
                }
              };
            }),
            stock_movements: Array.from(Object.entries(tableCartItems))
              .filter(([prodId, item]: [string, any]) => !isTimeChargeProduct(item.productId, item.name))
              .map(([prodId, item]: [string, any]) => ({
                type: 'sale_out',
                product_id: item.productId,
                qty: -item.quantity,
                branch_id: shopId,
              }))
          };

          // v2: SyncManager must not push this order while the direct request is in flight (#13)
          if (v2Lock) SyncManager.inFlightOrderIds.add(orderId);
          const syncRes = await fetch(`${currentUrl}/api/shops/${shopId}/orders/sync-batch`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            signal: syncController.signal,
            body: JSON.stringify(payload),
          }).finally(() => {
            if (v2Lock) SyncManager.inFlightOrderIds.delete(orderId);
          });

          if (syncRes.ok) {
            const syncData = await syncRes.json().catch(() => ({}));
            const resolvedServerOrderNo = syncData.order_no || orderNo;

            // sync-batch đã tự hoàn tất order và giải phóng resource theo cấu hình
            // skip_cleaning_process; đảm bảo trạng thái SQLite & UI của bàn vừa thanh toán luôn được giải phóng
            // (phòng trường hợp có 1 lệnh pull chạy xen kẽ trong lúc sync-batch đang bay trên mạng).
            if (Platform.OS !== 'web') {
              if (syncData.order_id) {
                const serverId = syncData.order_id;
                if (serverId !== orderId) {
                  await db.update(schema.order_items)
                    .set({ order_id: serverId })
                    .where(eq(schema.order_items.order_id, orderId));
                }
                await db.update(schema.orders)
                  .set({
                    id: serverId,
                    order_no: resolvedServerOrderNo,
                    sync_status: 'synced',
                    reference_no: orderId,
                    updated_at: new Date().toISOString()
                  })
                  .where(eq(schema.orders.id, orderId));
              }
              await db
                .update(schema.location_resources)
                .set({
                  status: releaseStatusAfterPay,
                  startTime: null,
                  current_order_id: null,
                  metadata: cleanedPaidTableMeta,
                })
                .where(eq(schema.location_resources.id, selectedTableForPay.id));
              const updatedAfterSync = await db.select().from(schema.location_resources);
              setTables(updatedAfterSync);
            } else {
              setTables(prev => prev.map(t => t.id === selectedTableForPay.id ? { ...t, status: releaseStatusAfterPay, startTime: null, current_order_id: null, metadata: cleanedPaidTableMeta } : t));
            }
            broadcastSync?.({ event: 'TABLE_PAID', tableId: selectedTableForPay.id, orderId: syncData.order_id || orderId });
            showToast(`Đã đồng bộ hóa đơn ${resolvedServerOrderNo} lên server.`, 'success');
          } else {
            const syncError = await syncRes.json().catch(() => ({}));
            console.warn('[POS] Sync batch phòng bàn lỗi server:', syncRes.status, syncError);
            showToast('Hóa đơn đã lưu cục bộ và đang chờ đồng bộ lại.', 'info');
            if (Platform.OS !== 'web') {
              setTimeout(() => {
                SyncManager.pushOfflineOrders(shopId).catch(() => {});
              }, 800);
            }
          }
        } catch (syncErr: any) {
          console.warn(
            syncErr?.name === 'AbortError'
              ? '[POS] Sync phòng bàn quá thời gian 15 giây, sẽ gửi qua hàng đợi sau.'
              : '[POS] Sync phòng bàn trực tiếp thất bại, sẽ gửi qua hàng đợi sau:',
            syncErr?.name === 'AbortError' ? undefined : syncErr
          );
          showToast('Hóa đơn đã lưu cục bộ và đang chờ đồng bộ lại.', 'info');
          if (Platform.OS !== 'web') {
            setTimeout(() => {
              SyncManager.pushOfflineOrders(shopId).catch(() => {});
            }, 800);
          }
        } finally {
          clearTimeout(syncTimeoutId);
        }
        } finally {
          if (v2Lock) payingTableIdsRef.current.delete(v2GuardTableId);
        }
      })();
    } catch (err) {
      console.error('Lỗi thanh toán phòng bàn:', err);
      showToast("Lỗi khi xử lý thanh toán!", "error");
      setIsPayingTableLoading(false);
    } finally {
      if (v2Lock && !releaseV2GuardInBackground) payingTableIdsRef.current.delete(v2GuardTableId);
    }
  };

  // Chuyển phòng/bàn
  const handleTransferTable = async (sourceTableId: string, targetTableId: string, includeSourceStayCost = true) => {
    try {
      const sourceTable = tables.find(t => t.id === sourceTableId);
      const targetTable = tables.find(t => t.id === targetTableId);
      if (!sourceTable || !targetTable) return;

      // Table sync v2: the server moves the session atomically (online only, #16)
      const v2Source = getV2Session(sourceTable);
      if (v2 && v2Source) {
        if (!isOnline) {
          showToast('Chuyển bàn cần có mạng (tránh hai máy cùng chuyển một phiên).', 'error');
          return;
        }
        const shopIdForTransfer = activeShopId || await AsyncStorage.getItem('active_shop_id') || 'default-shop';
        const r = await callTableSessionApi(shopIdForTransfer, `/${encodeURIComponent(v2Source.sessionId)}/transfer`, 'POST', {
          target_resource_id: targetTableId,
          device_id: v2.deviceId,
        });
        if (r.status < 200 || r.status >= 300) {
          showToast(
            r.body?.error === 'target_occupied'
              ? `${targetTable.name} vừa có khách trên thiết bị khác`
              : (r.body?.message || `Lỗi khi chuyển ${resourceNouns.noun}`),
            'error'
          );
          return;
        }
        const releaseStatusV2 = shopVertical === 'lodging' ? 'dirty' : 'available';
        const sourceMetaV2 = parseMetaSafe(sourceTable.metadata);
        const targetMetaV2 = JSON.stringify({
          ...parseMetaSafe(targetTable.metadata),
          check_in: sourceMetaV2.check_in || (sourceTable.startTime ? new Date(sourceTable.startTime).toISOString() : new Date().toISOString()),
          session_id: v2Source.sessionId,
        });
        const cleanedSourceMetaV2 = cleanStaticResourceMeta(sourceTable.metadata);
        const movedCart = tableCartsRef.current[sourceTableId];
        forgetV2Session(sourceTableId);
        rememberV2Session(targetTableId, v2Source.sessionId, v2Source.orderId, targetTable.name);
        if (movedCart) lastV2CartRef.current[targetTableId] = movedCart;
        setTables(prev => prev.map(t => {
          if (t.id === sourceTableId) return { ...t, status: releaseStatusV2, current_order_id: null, startTime: null, metadata: cleanedSourceMetaV2 };
          if (t.id === targetTableId) return { ...t, status: 'occupied', current_order_id: v2Source.orderId, startTime: sourceTable.startTime, metadata: targetMetaV2 };
          return t;
        }));
        if (Platform.OS !== 'web') {
          await db.update(schema.location_resources)
            .set({ status: releaseStatusV2, current_order_id: null, startTime: null, metadata: cleanedSourceMetaV2 })
            .where(eq(schema.location_resources.id, sourceTableId)).catch(() => {});
          await db.update(schema.location_resources)
            .set({ status: 'occupied', current_order_id: v2Source.orderId, startTime: sourceTable.startTime, metadata: targetMetaV2 })
            .where(eq(schema.location_resources.id, targetTableId)).catch(() => {});
        }
        setTableCarts(prev => {
          const copy = { ...prev };
          if (copy[sourceTableId]) {
            copy[targetTableId] = copy[sourceTableId];
            delete copy[sourceTableId];
          }
          return copy;
        });
        setTableCustomers(prev => {
          const copy = { ...prev };
          if (copy[sourceTableId]) {
            copy[targetTableId] = copy[sourceTableId];
            delete copy[sourceTableId];
          }
          return copy;
        });
        broadcastSync?.({ event: 'TABLE_TRANSFERRED', tableId: targetTableId, sourceTableId });
        refreshTablesThrottled();
        showToast(`Đã chuyển sang ${targetTable.name}`, 'success');
        return;
      }

      const orderId = sourceTable.current_order_id;
      if (!orderId) return;

      openingTableIdsRef.current.add(targetTableId);

      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const currentUrl = getApiBaseUrl();
      const headers = await getApiHeaders();

      let sourceMeta: any = {};
      try {
        sourceMeta = sourceTable.metadata ? (typeof sourceTable.metadata === 'string' ? JSON.parse(sourceTable.metadata) : sourceTable.metadata) : {};
      } catch (e) {}

      let targetMeta: any = {};
      try {
        targetMeta = targetTable.metadata ? (typeof targetTable.metadata === 'string' ? JSON.parse(targetTable.metadata) : targetTable.metadata) : {};
      } catch (e) {}

      const nowIso = new Date().toISOString();
      const sourceCheckInIso =
        sourceMeta.check_in ||
        (sourceTable.startTime ? new Date(sourceTable.startTime).toISOString() : nowIso);
      const effectiveCheckInIso = includeSourceStayCost ? sourceCheckInIso : nowIso;
      const targetStartTimeMs = new Date(effectiveCheckInIso).getTime();

      const releaseStatus = shopVertical === 'lodging' ? 'dirty' : 'available';
      const cleanedSourceMeta = cleanStaticResourceMeta(sourceTable.metadata);

      // Bảo toàn cấu hình giá tĩnh của bàn đích (...targetMeta) và ghép thông tin phiên chơi đang chạy sang
      const newTargetMeta = JSON.stringify({
        ...targetMeta,
        resource_id: targetTable.id,
        resource_name: targetTable.name,
        resource_type: targetTable.type,
        check_in: effectiveCheckInIso,
        num_guests: sourceMeta.num_guests || 1,
        rental_type: sourceMeta.rental_type || 'hourly',
        guests_list: sourceMeta.guests_list || [],
        guests: sourceMeta.guests || [],
        customer_phone: sourceMeta.customer_phone || '',
      });

      const newOrderMeta = JSON.stringify({
        ...sourceMeta,
        resource_id: targetTable.id,
        resource_name: targetTable.name,
        resource_type: targetTable.type,
        check_in: effectiveCheckInIso,
        advanced_pricing: targetMeta.advanced_pricing ?? sourceMeta.advanced_pricing,
        charge_by_minute: targetMeta.charge_by_minute ?? targetMeta.advanced_pricing?.charge_by_minute ?? sourceMeta.charge_by_minute,
      });

      // 1. SQLite & State offline-first updates (Zero-Lag)
      if (Platform.OS === 'web') {
        setTables(prev => prev.map(t => {
          if (t.id === sourceTableId) return { ...t, status: releaseStatus, current_order_id: null, startTime: null, metadata: cleanedSourceMeta };
          if (t.id === targetTableId) return { ...t, status: 'occupied', current_order_id: orderId, startTime: targetStartTimeMs, metadata: newTargetMeta };
          return t;
        }));
      } else {
        await db
          .update(schema.location_resources)
          .set({ status: releaseStatus, current_order_id: null, startTime: null, metadata: cleanedSourceMeta })
          .where(eq(schema.location_resources.id, sourceTableId));

        await db
          .update(schema.location_resources)
          .set({ status: 'occupied', current_order_id: orderId, startTime: targetStartTimeMs, metadata: newTargetMeta })
          .where(eq(schema.location_resources.id, targetTableId));

        await db
          .update(schema.orders)
          .set({
            resource_id: targetTable.id,
            metadata: newOrderMeta,
            ...(includeSourceStayCost ? {} : { created_at: effectiveCheckInIso }),
            updated_at: nowIso,
            sync_status: 'pending'
          })
          .where(eq(schema.orders.id, orderId));

        const updated = await db.select().from(schema.location_resources);
        setTables(updated);
      }

      // Move cart and customer to target table in local state
      setTableCarts(prev => {
        const copy = { ...prev };
        if (copy[sourceTableId]) {
          copy[targetTableId] = copy[sourceTableId];
          delete copy[sourceTableId];
        }
        return copy;
      });

      setTableCustomers(prev => {
        const copy = { ...prev };
        if (copy[sourceTableId]) {
          copy[targetTableId] = copy[sourceTableId];
          delete copy[sourceTableId];
        }
        return copy;
      });

      // 2. Đồng bộ lên Cloud
      if (isOnline) {
        try {
          const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };
          await Promise.all([
            fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${sourceTableId}`, {
              method: 'PATCH',
              headers: jsonHeaders,
              body: JSON.stringify({ status: releaseStatus, current_order_id: '', metadata: cleanedSourceMeta }),
            }),
            fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${targetTableId}`, {
              method: 'PATCH',
              headers: jsonHeaders,
              body: JSON.stringify({ status: 'occupied', current_order_id: orderId, metadata: newTargetMeta }),
            }),
            fetch(`${currentUrl}/api/shops/${shopId}/orders/${orderId}`, {
              method: 'PUT',
              headers: jsonHeaders,
              body: JSON.stringify({
                resource_id: targetTable.id,
                metadata: newOrderMeta,
                ...(includeSourceStayCost ? {} : { created_at: effectiveCheckInIso }),
              }),
            }),
          ]);

          if (Platform.OS !== 'web') {
            await db
              .update(schema.orders)
              .set({ sync_status: 'synced' })
              .where(eq(schema.orders.id, orderId));
          }
          broadcastSync?.({ event: 'TABLE_TRANSFERRED', tableId: targetTableId, sourceTableId });
        } catch (syncErr) {
          console.warn('Lỗi đồng bộ chuyển bàn lên Cloud:', syncErr);
        } finally {
          setTimeout(() => {
            openingTableIdsRef.current.delete(targetTableId);
          }, 4000);
        }
      } else {
        setTimeout(() => {
          openingTableIdsRef.current.delete(targetTableId);
        }, 4000);
      }

      showToast(`Đã chuyển sang ${targetTable.name}`, "success");
    } catch (err) {
      openingTableIdsRef.current.delete(targetTableId);
      console.error('Lỗi chuyển phòng bàn:', err);
      showToast(`Có lỗi xảy ra khi chuyển ${resourceNouns.noun}`, "error");
    }
  };

  // Gộp phòng/bàn
  const handleMergeTable = async (sourceTableId: string, targetTableId: string, includeSourceStayCost = true) => {
    try {
      const sourceTable = tables.find(t => t.id === sourceTableId);
      const targetTable = tables.find(t => t.id === targetTableId);
      if (!sourceTable || !targetTable) return;

      if (v2 && (getV2Session(sourceTable) || getV2Session(targetTable))) {
        showToast('Gộp bàn chưa hỗ trợ ở chế độ đồng bộ v2', 'info');
        return;
      }

      const sourceOrderId = sourceTable.current_order_id;
      const targetOrderId = targetTable.current_order_id;
      if (!sourceOrderId || !targetOrderId) {
        showToast(`Cả hai ${resourceNouns.noun} phải đang hoạt động để gộp!`, "error");
        return;
      }

      // Calculate frozen stay fee for source room/table up to now
      const sourceBilling = calculateBilling(sourceTable);
      const sourceStayCost = includeSourceStayCost ? (sourceBilling ? sourceBilling.cost : 0) : 0;
      const stayPrefix = shopVertical === 'lodging' ? 'Tiền phòng' : 'Tiền giờ';
      const frozenProductId = `TIME_CHARGE_MERGED_${sourceTableId}`;
      const frozenProductName = `${stayPrefix} ${sourceTable.name} (Đã gộp - ${sourceBilling.label})`;

      const releaseStatus = shopVertical === 'lodging' ? 'dirty' : 'available';
      const cleanedSourceMeta = cleanStaticResourceMeta(sourceTable.metadata);

      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const currentUrl = getApiBaseUrl();
      const headers = await getApiHeaders();

      const activeIndustry = await AsyncStorage.getItem('active_shop_industry') || 'retail';
      const systemProdId = getTimeChargeProductId(activeIndustry);

      let timeChargeTaxRate = '0';
      let timeChargeTaxGroup = '';
      let timeChargeVatRate = '0';
      let timeChargePitRate = '0';
      try {
        const prod = await db.select()
          .from(schema.products)
          .where(eq(schema.products.id, systemProdId))
          .limit(1)
          .then((res: any[]) => res[0]);
        if (prod) {
          timeChargeTaxRate = prod.tax_rate || '0';
          timeChargeTaxGroup = prod.tax_group || '';

          const systemTaxGroups = await getSystemTaxGroups();
          if (timeChargeTaxGroup) {
            const matchedGroup = systemTaxGroups.find(
              (g) =>
                g.code === timeChargeTaxGroup ||
                g.name === timeChargeTaxGroup ||
                (timeChargeTaxGroup === 'Phân phối, cung cấp hàng hóa' && g.code === 'phan_phoi') ||
                (timeChargeTaxGroup === 'Dịch vụ, xây dựng không bao thầu nguyên vật liệu' && g.code === 'dich_vu') ||
                (timeChargeTaxGroup === 'Sản xuất, vận tải, dịch vụ có gắn với hàng hóa, xây dựng có bao thầu nguyên vật liệu' && g.code === 'san_xuat') ||
                (timeChargeTaxGroup === 'Hoạt động kinh doanh khác' && g.code === 'khac')
            );
            if (matchedGroup) {
              timeChargeTaxGroup = matchedGroup.code;
              timeChargeVatRate = String(matchedGroup.vat_rate);
              timeChargePitRate = String(matchedGroup.pit_rate);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to query system product in handleMergeTable:', e);
      }

      // 1. Xây dựng giỏ hàng gộp chuẩn xác từ cả tableCarts cục bộ và SQLite/Server
      const sourceCartState: Record<string, any> = { ...(tableCarts[sourceTableId] || {}) };
      if (Platform.OS !== 'web' && Object.keys(sourceCartState).length === 0) {
        try {
          const dbSourceItems = await db.select().from(schema.order_items).where(eq(schema.order_items.order_id, sourceOrderId));
          for (const it of dbSourceItems) {
            if (it.product_id === 'TIME_CHARGE') continue;
            sourceCartState[it.product_id] = {
              productId: it.product_id,
              name: it.product_name,
              price: Number(it.unit_price) || 0,
              quantity: Number(it.qty) || 1,
              tax_rate: it.tax_rate || '0',
              tax_group: it.tax_group || '',
            };
          }
        } catch (e) {}
      }

      const mergedTargetCart: Record<string, any> = { ...(tableCarts[targetTableId] || {}) };
      if (sourceStayCost > 0) {
        mergedTargetCart[frozenProductId] = {
          productId: frozenProductId,
          name: frozenProductName,
          price: sourceStayCost,
          quantity: 1,
          tax_rate: timeChargeTaxRate,
          tax_group: timeChargeTaxGroup,
        };
      }

      Object.entries(sourceCartState).forEach(([itemId, item]: [string, any]) => {
        if (itemId === 'TIME_CHARGE' || item.productId === 'TIME_CHARGE') return;
        if (mergedTargetCart[itemId]) {
          mergedTargetCart[itemId] = {
            ...mergedTargetCart[itemId],
            quantity: Number(mergedTargetCart[itemId].quantity || 0) + Number(item.quantity || 1),
          };
        } else {
          mergedTargetCart[itemId] = { ...item };
        }
      });

      // 2. Cập nhật State & SQLite cục bộ ngay lập tức (Offline-First)
      setTableCarts(prev => {
        const copy = { ...prev };
        copy[targetTableId] = mergedTargetCart;
        delete copy[sourceTableId];
        return copy;
      });

      setTableCustomers(prev => {
        const copy = { ...prev };
        if (!copy[targetTableId] && copy[sourceTableId]) {
          copy[targetTableId] = copy[sourceTableId];
        }
        delete copy[sourceTableId];
        return copy;
      });

      if (Platform.OS === 'web') {
        setTables(prev => prev.map(t => {
          if (t.id === sourceTableId) return { ...t, status: releaseStatus, current_order_id: null, startTime: null, metadata: cleanedSourceMeta };
          return t;
        }));
      } else {
        if (sourceStayCost > 0) {
          const stayFeeItemId = `ORDI-FROZEN-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          const rateVal = parseFloat(timeChargeTaxRate);
          const taxAmt = Math.round(sourceStayCost * (rateVal / 100));
          await db.insert(schema.order_items).values({
            id: stayFeeItemId,
            order_id: targetOrderId,
            product_id: frozenProductId,
            product_name: frozenProductName,
            qty: 1,
            unit_price: sourceStayCost,
            line_total: sourceStayCost,
            tax_rate: timeChargeTaxRate,
            tax_amount: taxAmt,
            tax_group: timeChargeTaxGroup,
            tax_vat_rate: timeChargeVatRate,
            tax_pit_rate: timeChargePitRate,
          });
        }

        for (const item of Object.values(sourceCartState) as any[]) {
          const prodId = item.productId || item.product_id;
          if (!prodId || prodId === 'TIME_CHARGE') continue;

          // SỬA LỖI DRIZZLE ORM: Phải dùng and(...) thay vì chuỗi .where().where() làm ghi đè điều kiện order_id!
          const existing = await db
            .select()
            .from(schema.order_items)
            .where(and(eq(schema.order_items.order_id, targetOrderId), eq(schema.order_items.product_id, prodId)));

          const itemQty = Number(item.quantity ?? item.qty ?? 1);
          const itemPrice = Number(item.price ?? item.unit_price ?? 0);

          if (existing.length > 0) {
            const newQty = Number(existing[0].qty) + itemQty;
            const newTotal = newQty * Number(existing[0].unit_price || itemPrice);
            await db
              .update(schema.order_items)
              .set({ qty: newQty, line_total: newTotal })
              .where(eq(schema.order_items.id, existing[0].id));
          } else {
            await db.insert(schema.order_items).values({
              id: `ORDI-${Date.now()}-${Math.random().toString(36).substring(7)}`,
              order_id: targetOrderId,
              product_id: prodId,
              product_name: item.name || item.product_name || '',
              qty: itemQty,
              unit_price: itemPrice,
              line_total: itemQty * itemPrice,
              tax_rate: item.tax_rate || '0',
              tax_amount: 0,
              tax_group: item.tax_group || '',
              tax_vat_rate: '0',
              tax_pit_rate: '0',
            });
          }
        }

        const updatedTargetItems = await db.select().from(schema.order_items).where(eq(schema.order_items.order_id, targetOrderId));
        const newTotal = updatedTargetItems.reduce((sum: number, item: any) => sum + (Number(item.line_total) || 0), 0);
        await db
          .update(schema.orders)
          .set({ total_amount: newTotal, sync_status: 'pending' })
          .where(eq(schema.orders.id, targetOrderId));

        await db
          .update(schema.orders)
          .set({ status: 'cancelled', sync_status: 'pending' })
          .where(eq(schema.orders.id, sourceOrderId));

        await db
          .update(schema.location_resources)
          .set({ status: releaseStatus, current_order_id: null, startTime: null, metadata: cleanedSourceMeta })
          .where(eq(schema.location_resources.id, sourceTableId));

        const updated = await db.select().from(schema.location_resources);
        setTables(updated);
      }

      // 3. Đồng bộ lên Cloud
      if (isOnline) {
        try {
          const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };
          // Đồng bộ toàn bộ giỏ hàng đích (bao gồm cả dòng TIME_CHARGE_MERGED_ và các món gộp) qua pipeline chuẩn
          await syncOrderItemsOnline(targetOrderId, mergedTargetCart, targetTableId);

          await Promise.all([
            fetch(`${currentUrl}/api/shops/${shopId}/orders/${sourceOrderId}/cancel`, {
              method: 'POST',
              headers: jsonHeaders,
              body: JSON.stringify({ reason: `Gộp sang ${targetTable.name}` }),
            }),
            fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${sourceTableId}`, {
              method: 'PATCH',
              headers: jsonHeaders,
              body: JSON.stringify({ status: releaseStatus, current_order_id: '', metadata: cleanedSourceMeta }),
            }),
          ]);

          broadcastSync?.({ event: 'TABLE_MERGED', tableId: targetTableId, sourceTableId });
        } catch (syncErr) {
          console.warn('Lỗi đồng bộ gộp bàn lên Cloud:', syncErr);
        }
      }

      showToast(`Đã gộp thành công từ ${sourceTable.name} sang ${targetTable.name}`, "success");
    } catch (err) {
      console.error('Lỗi gộp phòng bàn:', err);
      showToast(`Có lỗi xảy ra khi gộp ${resourceNouns.noun}`, "error");
    }
  };

  // ── Table sync v2 helpers used by the POS screen ─────────────────────────────────
  const isV2Table = (table: any) => !!getV2Session(table);

  /**
   * Before saving items into a v2 table: confirm with the server that the session is still open and
   * still belongs to this table's order. 'offline' → caller may queue (ops are sent later).
   */
  const verifyV2SessionOpen = async (table: any): Promise<'open' | 'closed' | 'offline'> => {
    const session = getV2Session(table);
    if (!v2 || !session) return 'closed';
    if (!isOnline) return 'offline';
    try {
      const res = await callTableSessionApi(activeShopId, `/${encodeURIComponent(session.sessionId)}`, 'GET');
      if (res.status !== 200) return res.status >= 500 ? 'offline' : 'closed';
      const s = res.body?.session;
      const open = s?.status === 'open' && (!session.orderId || !s?.order_id || s.order_id === session.orderId);
      if (!open) forgetV2Session(table.id);
      return open ? 'open' : 'closed';
    } catch {
      return 'offline';
    }
  };

  /** "Gọi món": snapshot the table cart the user starts editing from (base for "Lưu món", #4) */
  const beginTableOrdering = (table: any) => {
    if (!table) return;
    orderingBaseCartRef.current[table.id] = tableCartsRef.current[table.id] || tableCarts[table.id] || {};
    setV2Checkout(null);
  };

  /** "Lưu món": the snapshot taken by beginTableOrdering (consumed once) */
  const takeOrderingBaseCart = (tableId: string) => {
    const base = orderingBaseCartRef.current[tableId];
    delete orderingBaseCartRef.current[tableId];
    return base;
  };

  /**
   * Cancel / release a v2 table: online only (#6). The existing order cancel endpoint also ends
   * the v2 session server-side. Only this table's own state is cleared (#2).
   */
  const cancelV2Table = async (table: any, cleanedMeta: string): Promise<boolean> => {
    const session = getV2Session(table);
    if (!v2 || !session) return false;
    if (!isOnline) {
      showToast('Huỷ bàn cần có mạng để tránh bàn tự mở lại trên thiết bị khác.', 'error');
      return false;
    }
    if (!session.orderId) {
      showToast('Phiên bàn chưa lên máy chủ. Vui lòng chờ đồng bộ rồi thử lại.', 'error');
      return false;
    }
    try {
      const currentUrl = getApiBaseUrl();
      const shopId = activeShopId || await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const headers = await getApiHeaders();
      const cancelRes = await fetch(`${currentUrl}/api/shops/${shopId}/orders/${session.orderId}/cancel`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Hủy từ di động' })
      });
      if (!cancelRes.ok) {
        const body = await cancelRes.json().catch(() => ({} as any));
        showToast(body?.error || body?.message || `Không thể huỷ bàn (${cancelRes.status})`, 'error');
        return false;
      }
      await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${table.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'available', current_order_id: '', startTime: null, metadata: cleanedMeta }),
      }).catch(() => {});
      closedOrderIdsRef.current.add(session.orderId);
      // The cancelled session's queued ops are dropped on purpose
      await v2.discardSession(session.sessionId).catch(() => {});
      forgetV2Session(table.id);
      setTableCarts(prev => {
        const copy = { ...prev };
        delete copy[table.id];
        return copy;
      });
      setTableCustomers(prev => {
        const copy = { ...prev };
        delete copy[table.id];
        return copy;
      });
      setTables(prev => prev.map(t => t.id === table.id ? { ...t, status: 'available', startTime: null, current_order_id: null, metadata: cleanedMeta } : t));
      if (Platform.OS !== 'web') {
        await db
          .update(schema.location_resources)
          .set({ status: 'available', startTime: null, current_order_id: null, metadata: cleanedMeta })
          .where(eq(schema.location_resources.id, table.id))
          .catch(() => {});
      }
      broadcastSync?.({ event: 'TABLE_UPDATED', tableId: table.id });
      return true;
    } catch (err) {
      console.warn('[TableSyncV2] Huỷ bàn thất bại:', err);
      showToast('Mất kết nối khi huỷ bàn. Vui lòng thử lại.', 'error');
      return false;
    }
  };

  /** Readable table name of a v2 session (inbox) */
  const tableNameOfSession = (sessionId: string) => {
    const table = tables.find(t => getV2Session(t)?.sessionId === sessionId);
    if (table) return table.name || '';
    const known = v2SessionTableNameRef.current[sessionId];
    if (known) return known;
    const openEntry = (tableSync?.inbox || []).find(i => i.session_id === sessionId && i.entry.kind === 'open');
    const resourceId = openEntry && openEntry.entry.kind === 'open' ? openEntry.entry.payload.resource_id : '';
    return (resourceId && tables.find(t => t.id === resourceId)?.name) || '';
  };

  /** Readable product name for an inbox op reference */
  const itemNameOfSession = (_sessionId: string, ref: { item_id?: string; line_key?: string }) => {
    if (!ref.item_id) return undefined;
    for (const cart of Object.values(lastV2CartRef.current)) {
      const hit = Object.values(cart || {}).find((it: any) => it?._serverItemId === ref.item_id) as any;
      if (hit) return hit.name;
    }
    return undefined;
  };

  const lockedTimeCharge = React.useMemo(
    () => (v2Checkout && cartOwnerTable && v2Checkout.tableId === cartOwnerTable.id
      ? { amount: v2Checkout.amount, label: v2Checkout.label, checkoutAt: v2Checkout.checkoutAt }
      : undefined),
    [v2Checkout, cartOwnerTable]
  );

  // Thanh toán Bán lẻ

  // Khôi phục cache local
  useEffect(() => {
    let isMounted = true;
    const loadTemp = async () => {
      const savedTableCustomers = await AsyncStorage.getItem('temp_table_customers');
      let parsedTableCustomers = {};
      if (savedTableCustomers) {
        try { parsedTableCustomers = JSON.parse(savedTableCustomers); } catch (e) {}
      }
      if (isMounted) setTableCustomers(parsedTableCustomers);

      const savedTableCarts = await AsyncStorage.getItem('temp_table_carts');
      let parsedTableCarts = {};
      if (savedTableCarts) {
        try { parsedTableCarts = JSON.parse(savedTableCarts); } catch (e) {}
      }
      if (isMounted) setTableCarts(parsedTableCarts);
    };
    loadTemp();
    return () => { isMounted = false; };
  }, []);

  return {
    activeTable, setActiveTable,
    tableCarts, setTableCarts,
    tableCustomers, setTableCustomers,
    roomGuestCount, setRoomGuestCount,
    lodgingGuests, setLodgingGuests,
    isTableOpenDialogVisible, setIsTableOpenDialogVisible,
    selectedTableForOpen, setSelectedTableForOpen,
    checkInTab, setCheckInTab,
    activeTableTab, setActiveTableTab,
    cartOwnerTable, setCartOwnerTable,
    isOpeningTable, setIsOpeningTable,
    openTableError, setOpenTableError,
    tableOpenHandoff,
    completeOpenTableHandoff,
    onActiveTableModalShown,
    isPreparingTablePay,
    isSyncingTableSession, setIsSyncingTableSession,
    isPayingTableLoading,
    isUpdatingGuestsLoading,
    datePickerView, setDatePickerView,
    pickerYear, setPickerYear,
    pickerMonth, setPickerMonth,
    pickerDay, setPickerDay,
    pickerTargetField, setPickerTargetField,
    pickerTargetIndex, setPickerTargetIndex,
    isDatePickerOpen, setIsDatePickerOpen,
    roomRentalType, setRoomRentalType,
    timeTicker,
    calculateBilling,

    handleTablePress,
    triggerPayTable,
    handlePayTableConfirmUnified,
    handleIncreaseTableItemQty,
    handleDecreaseTableItemQty,
    handleRemoveTableItem,
    handleUpdateTableCustomer,
    groupedZones,
    syncOrderItemsOnline,
    syncCustomerUpdate,
    handleUpdateActiveRoomGuests,
    handleDatePickerOpen,
    handleConfirmOpenTable,
    syncActiveTableSession,
    syncTableSilent,
    handleTransferTable,
    handleMergeTable,
    isCleanConfirmModalOpen, setIsCleanConfirmModalOpen,
    tableToClean, setTableToClean,
    cleanConfirmSaving,
    handleCleanTable,
    handleUpdateTableTime,
    tableConflict, setTableConflict,
    resolveTableConflict,
    dismissTableConflict,
    openPendingConflict,
    pendingConflictTableIds,
    // Table sync v2
    isV2Table,
    getV2Session,
    beginTableOrdering,
    takeOrderingBaseCart,
    verifyV2SessionOpen,
    cancelV2Table,
    tableNameOfSession,
    itemNameOfSession,
    lockedTimeCharge,
  };
}
