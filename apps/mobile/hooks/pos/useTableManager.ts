import React, { useState, useCallback, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { db } from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import { eq } from 'drizzle-orm';
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
}

import { CartItem } from '../../app/(tabs)/pos';
import { calculateHourlyBilling, isTimeChargeProduct } from '@oni/core';
import { LodgingGuest } from '../../components/pos/LodgingGuestsForm';

export function useTableManager(props: UseTableManagerProps) {
  const { 
    tables, setTables, shopVertical, activeShopId, 
    showToast, setCart, setDiscountAmount, setOrderNote, setSelectedCustomer, setIsPreviewModalOpen,
    isNavReady, isLoading, isOnline, checkIsQrPayment, currentUserEmail, productsList, paymentFundsList, customersList, selectedCustomer, setPaymentRows, handleCheckoutPress, setIsCartModalOpen, setQrPayload, setIsQrModalOpen, broadcastSync } = props;

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

  // Ticker đếm giờ cho bi-a
  const [timeTicker, setTimeTicker] = useState(0);
  useEffect(() => {
    if (!isNavReady) return;
    const timer = setInterval(() => {
      setTimeTicker(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isNavReady]);

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

    const updateRealtimeBilliardTime = () => {
      const now = new Date();
      // 1. Tính toán lại tiền giờ tại thời điểm hiện tại
      const billing = calculateBilling(cartOwnerTable, now);
      
      const billingName = cartOwnerTable.type === 'room'
        ? `Tiền phòng - ${cartOwnerTable.name} (${billing.label})`
        : `Tiền giờ - ${cartOwnerTable.name} (${billing.label})`;

      setCart((prevCart: any) => {
        if (!prevCart || !prevCart['TIME_CHARGE']) return prevCart;
        
        // Nếu giá tiền không đổi, không cập nhật để tránh re-render thừa
        if (prevCart['TIME_CHARGE'].price === billing.cost && prevCart['TIME_CHARGE'].name === billingName) {
          return prevCart;
        }

        return {
          ...prevCart,
          'TIME_CHARGE': {
            ...prevCart['TIME_CHARGE'],
            name: billingName,
            price: billing.cost
          }
        };
      });
    };

    // Chạy lần đầu và thiết lập interval mỗi 10 giây
    updateRealtimeBilliardTime();
    const interval = setInterval(updateRealtimeBilliardTime, 10000);

    return () => clearInterval(interval);
  }, [cartOwnerTable, timeTicker, isNavReady]);



  // Tính tiền giờ bàn bi-a
  const calculateBilling = (table: any, customCheckoutTime?: Date, rentalTypeOverride?: 'hourly' | 'overnight' | 'daily') => {
    if (!table.startTime) return { hours: 0, minutes: 0, cost: 0, label: '0h 0p', details: '' };

    // Phân tích cấu hình metadata nâng cao
    let rmd: any = {};
    try {
      rmd = typeof table.metadata === 'string' ? JSON.parse(table.metadata) : (table.metadata || {});
    } catch (e) {
      console.warn('Không thể parse metadata của phòng bàn:', e);
    }

    const rentalType = rentalTypeOverride || rmd.rental_type || 'hourly';

    if (rentalType === 'overnight') {
      const overnightRate = Number(rmd.overnight_rate) || Number(table.hourly_rate) || 0;
      return {
        hours: 0,
        minutes: 0,
        cost: overnightRate,
        label: 'Qua đêm',
        details: 'Trọn gói qua đêm'
      };
    }

    if (rentalType === 'daily') {
      const dailyRate = Number(rmd.overnight_rate) || Number(table.hourly_rate * 3) || 200000;
      const checkInDate = new Date(table.startTime);
      const checkOutDate = customCheckoutTime || (table.checkoutTime ? new Date(table.checkoutTime) : new Date());
      
      const d1 = new Date(checkInDate.getFullYear(), checkInDate.getMonth(), checkInDate.getDate());
      const d2 = new Date(checkOutDate.getFullYear(), checkOutDate.getMonth(), checkOutDate.getDate());
      const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
      const nights = Math.max(1, diffDays);
      
      const cost = nights * dailyRate;
      const formatCurrencyLocal = (value: number) => {
        return value.toLocaleString('vi-VN') + '₫';
      };

      return {
        hours: 0,
        minutes: 0,
        cost,
        label: `${nights} ngày`,
        details: `Thuê theo ngày: ${nights} ngày x ${formatCurrencyLocal(dailyRate)}/ngày`
      };
    }

    const hourlyRate = Number(table.hourly_rate) || 0;
    const checkInDate = new Date(table.startTime);
    const checkOutDate = customCheckoutTime || (table.checkoutTime ? new Date(table.checkoutTime) : new Date());

    const pricingResult = calculateHourlyBilling({
      checkIn: checkInDate,
      checkOut: checkOutDate,
      standardRate: hourlyRate,
      config: rmd.advanced_pricing
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

      // Nếu Cloud trả về available và không có order, nghĩa là bàn đã được giải phóng
      if (latestResource && latestResource.status === 'available' && !latestResource.current_order_id) {
        return { isFinished: true };
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

  const syncOrderItemsOnline = async (orderId: string, cartItems: any, tableId?: string) => {
    if (!isOnline) return;
    try {
      const currentUrl = getApiBaseUrl();
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const headers = await getApiHeaders();

      // Tải món hiện tại trên server
      const serverItemsRes = await fetch(`${currentUrl}/api/shops/${shopId}/order-items?order_id=${orderId}&limit=200`, { headers });
      if (!serverItemsRes.ok) return false;
      const serverItemsData = await serverItemsRes.json();
      const serverItems = serverItemsData.data || [];

      const serverItemsMap = new Map<string, any>();
      for (const item of serverItems) {
        let modifiersHash = 'none';
        if (item.modifiers) {
          try {
            const parsed = typeof item.modifiers === 'string' ? JSON.parse(item.modifiers) : item.modifiers;
            if (Array.isArray(parsed)) {
              modifiersHash = parsed.map((m: any) => m.option).sort().join(',') || 'none';
            }
          } catch(e) {}
        }
        const key = `${item.product_id}_${item.variant_label || 'none'}_${modifiersHash}`;
        serverItemsMap.set(key, item);
      }

      // Đồng bộ hóa vi sai (Differential Sync)
      let index = 1;
      for (const [prodId, cartItem] of Object.entries(cartItems) as [string, any][]) {
        if (prodId === 'TIME_CHARGE') continue; // Tiền giờ ảo không đồng bộ lên mục gọi món
        const existing = serverItemsMap.get(prodId);
        const lineTotal = cartItem.price * cartItem.quantity;
        const lineNo = String(index++);

        if (existing) {
          // Nếu đã tồn tại nhưng sai số lượng, cập nhật lên server
          if (parseInt(existing.qty, 10) !== cartItem.quantity || parseInt(existing.unit_price, 10) !== cartItem.price) {
            await fetch(`${currentUrl}/api/shops/${shopId}/order-items/${existing.id}`, {
              method: 'PUT',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                qty: String(cartItem.quantity),
                line_total: String(lineTotal),
                unit_price: String(cartItem.price)
              })
            });
          }
          serverItemsMap.delete(prodId);
        } else {
          // Chưa tồn tại thì thêm mới lên server (line_no là chuỗi bắt buộc của Zod Schema)
          await fetch(`${currentUrl}/api/shops/${shopId}/order-items`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order_id: orderId,
              line_no: lineNo,
              product_id: cartItem.productId,
              product_name: cartItem.name,
              qty: String(cartItem.quantity),
              unit_price: String(cartItem.price),
              line_total: String(lineTotal),
              line_discount: '0',
              variant_label: cartItem.variant_label || '',
              modifiers: cartItem.modifiers ? JSON.stringify(cartItem.modifiers) : '',
              modifier_total: String(cartItem.modifier_total || 0),
            })
          });
        }
      }

      // Xóa món đã bị bỏ ra khỏi giỏ
      for (const [prodId, serverItem] of serverItemsMap.entries()) {
        await fetch(`${currentUrl}/api/shops/${shopId}/order-items/${serverItem.id}`, {
          method: 'DELETE',
          headers
        });
      }

      if (broadcastSync && tableId) {
        broadcastSync({ event: "TABLE_UPDATED", tableId });
      }
      return true;
    } catch (err) {
      console.warn('Lỗi khi đồng bộ món lên server:', err);
      return false;
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

          // A. Cập nhật SQLite nội địa sang trống
          if (Platform.OS !== 'web') {
            try {
              await db
                .update(schema.location_resources)
                .set({ status: 'available', current_order_id: null, startTime: null })
                .where(eq(schema.location_resources.id, table.id));
            } catch (e) { }
          }

          // B. Cập nhật state cục bộ sang trống
          setTables(prev => prev.map(t => t.id === table.id ? { ...t, status: 'available', current_order_id: null, startTime: null } : t));
          setTableCarts(prev => {
            const copy = { ...prev };
            delete copy[table.id];
            return copy;
          });

          showToast("Phòng đã được thanh toán và trả trên hệ thống!", "info");
          return { isFinished: true };
        }

        const { order, items, resource } = onlineSession;
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

        const rentalType = parsedMeta.rental_type || resourceMeta.rental_type || tableMetaObj.rental_type || 'hourly';
        const numGuests = (onlineGuests.length > 0) ? onlineGuests.length : (parsedMeta.num_guests || resourceMeta.num_guests || tableMetaObj.num_guests || 1);
        const checkInVal = parsedMeta.check_in || resourceMeta.check_in || tableMetaObj.check_in;
        const checkInTime = checkInVal ? new Date(checkInVal).getTime() : (table.startTime || Date.now());

        const updatedTable = {
          ...table,
          current_order_id: order ? (order.id || order.order_id) : table.current_order_id, // Tự động chữa lành ID đơn hàng nếu thiếu
          startTime: checkInTime,
          metadata: JSON.stringify({
            ...tableMetaObj,
            rental_type: rentalType,
            num_guests: numGuests,
            check_in: checkInVal,
            guests_list: onlineGuests,
            guests: onlineGuests
          })
        };

        // Gán khách hàng cho phòng bàn cục bộ
        if (order && order.customer_id) {
          const localCust = customersList.find(c => c.id === order.customer_id);
          const phoneVal = localCust?.phone || parsedMeta.customer_phone || "";
          const addressVal = localCust?.address || parsedMeta.customer_address || "";
          setTableCustomers(prev => ({
            ...prev,
            [table.id]: {
              id: order.customer_id,
              name: order.customer_name || 'Khách lẻ',
              phone: phoneVal,
              address: addressVal
            }
          }));
        } else if (order) {
          setTableCustomers(prev => {
            const copy = { ...prev };
            delete copy[table.id];
            return copy;
          });
        }

        // Cập nhật tables list state cục bộ và ghi SQLite ngoại tuyến để tự chữa lành
        setTables(prev => prev.map(t => t.id === table.id ? updatedTable : t));
        if (Platform.OS !== 'web') {
          try {
            await db
              .update(schema.location_resources)
              .set({ current_order_id: order ? (order.id || order.order_id) : table.current_order_id, startTime: checkInTime, metadata: updatedTable.metadata })
              .where(eq(schema.location_resources.id, table.id));
          } catch (e) { }
        }

        // Đồng bộ món ăn của bàn về state cục bộ
        const mappedCart: any = {};
        if (items) {
          for (const item of items) {
            const originalProd = productsList.find(p => p.id === item.product_id);
            mappedCart[item.product_id] = {
              productId: item.product_id,
              name: item.product_name,
              price: parseInt(item.unit_price || '0', 10),
              quantity: parseInt(item.qty || '1', 10),
              tax_rate: item.tax_rate || originalProd?.tax_rate || '0',
              input_tax_rate: item.input_tax_rate || originalProd?.input_tax_rate || '0',
              tax_group: item.tax_group || originalProd?.tax_group || '',
            };
          }
        }

        setTableCarts(prev => ({
          ...prev,
          [table.id]: mappedCart
        }));

        // Khôi phục thông tin khách lưu trú từ Cloud
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

        setActiveTable((prev: any) => {
          if (prev && prev.id === table.id) {
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

  // Mở bàn
  // Mở bàn
  const handleTablePress = async (table: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
    if (table.status === 'playing' || table.status === 'occupied') {
      // 1. Mở modal ngay lập tức với dữ liệu cục bộ hiện có để mang lại trải nghiệm tức thì (Zero-Lag)
      setActiveTable(table);
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
      setSelectedTableForOpen(table);
      setIsTableOpenDialogVisible(true);
    }
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
      : await new Promise<boolean>((resolve) => {
        Alert.alert(
          "Xác nhận Cập nhật",
          "Bạn có muốn cập nhật danh sách khách lưu trú này lên hệ thống?",
          [
            { text: "Hủy bỏ", onPress: () => resolve(false), style: "cancel" },
            { text: "Đồng ý", onPress: () => resolve(true) }
          ]
        );
      });

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
  const handleDatePickerOpen = (index: number, field: 'dob' | 'expiry_date') => {
    setPickerTargetIndex(index);
    setPickerTargetField(field);
    setIsDatePickerOpen(true);
  };

  // Mở bàn
  const handleConfirmOpenTable = async () => {
    if (!selectedTableForOpen) return;
    const targetTableForOpen = selectedTableForOpen;
    const targetCustomer = selectedCustomer;
    const targetGuestCount = roomGuestCount;
    const targetRoomRentalType = roomRentalType;
    const targetLodgingGuests = lodgingGuests;

    try {
      const nowTime = Date.now();
      const orderId = `ORD-T-INPROG-${Date.now()}`;

      let tMeta: any = {};
      try {
        tMeta = targetTableForOpen.metadata ? JSON.parse(targetTableForOpen.metadata) : {};
      } catch (e) { }

      // 1. Chuẩn hóa metadata nhận phòng để dùng chung cho cả Server và SQLite
      const openTableMeta = JSON.stringify({
        resource_id: targetTableForOpen.id,
        resource_name: targetTableForOpen.name,
        check_in: new Date(nowTime).toISOString(),
        num_guests: targetGuestCount,
        rental_type: targetRoomRentalType,
        advanced_pricing: tMeta.advanced_pricing,
        overnight_rate: tMeta.overnight_rate,
        weekend_rate: tMeta.weekend_rate,
        room_class: tMeta.room_class,
        bed_type: tMeta.bed_type,
        guests_list: targetLodgingGuests
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
          })),
        guests: targetLodgingGuests
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
          })),
      });

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
          order_no: `HD-BAN-${Date.now().toString().substring(9)}`,
          status: 'in_progress',
          customer_id: targetCustomer?.id || 'C-DEFAULT-RETAIL',
          customer_name: targetCustomer?.name || 'Khách lẻ',
          total_amount: 0,
          paid_amount: 0,
          payment_method: '',
          created_at: new Date(nowTime).toISOString(),
          shift_id: activeShiftId,
          sync_status: 'pending',
          note: '',
          discount_amount: 0,
          metadata: openTableMeta,
        });

        const updated = await db.select().from(schema.location_resources);
        setTables(updated);
      }

      // Gán thông tin khách hàng nhận phòng bàn
      if (targetCustomer) {
        setTableCustomers(prev => ({
          ...prev,
          [targetTableForOpen.id]: targetCustomer
        }));
      }

      setIsTableOpenDialogVisible(false);
      setSelectedTableForOpen(null);
      // Reset các tab check-in
      setCheckInTab('info');

      const roomLabel = shopVertical === 'lodging' ? 'Phòng' : shopVertical === 'sports_court' ? 'Sân' : 'Bàn';
      showToast(`Đã nhận ${roomLabel} ${targetTableForOpen.name}! Đang đồng bộ...`, 'info');

      // 3. Đồng bộ trực tuyến lên Server Next.js ở chế độ nền
      if (isOnline) {
        (async () => {
          try {
            const currentUrl = getApiBaseUrl();
            const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
            const headers = await getApiHeaders();

            // A. Tạo order in_progress trên Next.js Server
            const orderRes = await fetch(`${currentUrl}/api/shops/${shopId}/orders`, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status: 'in_progress',
                channel: 'pos-mobile',
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
              const serverOrderId = createdOrder.id || createdOrder.order_id;

              // B. Cập nhật vị trí sang occupied
              const patchRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${targetTableForOpen.id}`, {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  status: 'occupied',
                  current_order_id: serverOrderId,
                  startTime: nowTime
                }),
              });
              if (patchRes.ok) {
                // Đồng bộ thành công, cập nhật SQLite để chuyển sang synced và khớp orderId của Server
                if (Platform.OS !== 'web') {
                  await db
                    .update(schema.location_resources)
                    .set({ current_order_id: serverOrderId })
                    .where(eq(schema.location_resources.id, targetTableForOpen.id));

                  await db.update(schema.orders)
                    .set({ id: serverOrderId, sync_status: 'synced' })
                    .where(eq(schema.orders.id, orderId));

                  const updated = await db.select().from(schema.location_resources);
                  setTables(updated);
                } else {
                  setTables(prev => prev.map(t => t.id === targetTableForOpen.id ? { ...t, current_order_id: serverOrderId } : t));
                }
                
                showToast(`Đồng bộ thành công ${roomLabel} ${targetTableForOpen.name}!`, 'success');
                broadcastSync?.({ event: 'TABLE_OPENED', tableId: targetTableForOpen.id, orderId: serverOrderId });
              } else {
                console.warn(`[Open Table PATCH Failed] Status ${patchRes.status}`);
              }
            } else {
              console.warn(`[Open Table POST Failed] Status ${orderRes.status}`);
            }
          } catch (syncErr) {
            console.log('Mất mạng hoặc lỗi server, bỏ qua sync check-in trực tiếp:', syncErr);
          }
        })();
      }
    } catch (err) {
      console.error('Không thể mở bàn bi-a:', err);
      showToast('Có lỗi xảy ra khi nhận phòng!', 'error');
    }
  };

  // Thay đổi số lượng món ăn/dịch vụ của phòng bàn trực tiếp
  const handleIncreaseTableItemQty = (tableId: string, cartItemId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
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

      // Đồng bộ trực tuyến tức thì lên server Next.js nếu có current_order_id
      if (activeTable && activeTable.id === tableId && activeTable.current_order_id) {
        syncOrderItemsOnline(activeTable.current_order_id, updatedCart, tableId);
      }

      return {
        ...prev,
        [tableId]: updatedCart
      };
    });
  };

  const handleDecreaseTableItemQty = (tableId: string, cartItemId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
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

      // Đồng bộ trực tuyến tức thì lên server Next.js nếu có current_order_id
      if (activeTable && activeTable.id === tableId && activeTable.current_order_id) {
        syncOrderItemsOnline(activeTable.current_order_id, updatedCart, tableId);
      }

      return {
        ...prev,
        [tableId]: updatedCart
      };
    });
  };

  const handleRemoveTableItem = (tableId: string, cartItemId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => { });
    setTableCarts(prev => {
      const tableCart = { ...(prev[tableId] || {}) };
      delete tableCart[cartItemId];

      // Đồng bộ trực tuyến tức thì lên server Next.js nếu có current_order_id
      if (activeTable && activeTable.id === tableId && activeTable.current_order_id) {
        syncOrderItemsOnline(activeTable.current_order_id, tableCart, tableId);
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
            metadata: updatedMeta
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

  const triggerPayTable = (table: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });

    // 1. Tính toán tiền giờ/qua đêm lưu trú nâng cao sử dụng @oni/core
    const billing = calculateBilling(table);

    // 2. Chuyển tiền giờ thành sản phẩm TIME_CHARGE ảo đặc biệt
    const billingName = table.type === 'room'
      ? `Tiền phòng - ${table.name} (${billing.label})`
      : `Tiền giờ - ${table.name} (${billing.label})`;

    const tableCartItems = tableCarts[table.id] || {};
    const newCart: any = { ...tableCartItems };

    if (billing.cost > 0) {
      newCart['TIME_CHARGE'] = {
        productId: 'TIME_CHARGE',
        name: billingName,
        price: billing.cost,
        quantity: 1,
        modifier_total: 0
      };
    }

    // 3. Thiết lập giỏ hàng bán lẻ dùng chung
    setCart(newCart);
    setCartOwnerTable(table);
    setSelectedCustomer(tableCustomers[table.id] || null);
    setDiscountAmount(0);
    setOrderNote('');

    // 4. Thiết lập phương thức thanh toán mặc định tương đương tổng tiền giỏ hàng
    const totalCartValue = Math.max(0, Object.values(newCart).reduce((sum: number, item: any) => sum + ((item.price + (item.modifier_total || 0)) * item.quantity), 0));
    setPaymentRows([{ id: 'pay-cash', method: 'cash', fund_id: paymentFundsList.find(f => f.type === 'cash')?.id || 'cash', amount: totalCartValue }]);

    // 5. Mở modal giỏ hàng chính để thanh toán hệ thống (Trì hoãn để tránh đơ UI trên iOS)
    setActiveTable(null); // Đóng modal sơ đồ phòng bàn hiện tại trước
    setTimeout(() => {
      handleCheckoutPress(() => {
        setIsCartModalOpen(true);
      });
    }, 400);
  };

  // Xác nhận Thanh toán bàn chơi / phòng lưu trú (Unified Flow)
  const handlePayTableConfirmUnified = async (
    customer: any,
    discount: number,
    note: string,
    payments: { id: string; method: string; fund_id: string; amount: number }[],
    customCheckoutTime?: Date,
    selectedRentalType?: 'hourly' | 'overnight' | 'daily'
  ) => {
    if (!cartOwnerTable) return;
    setIsPayingTableLoading(true);
    try {
      const { isTaxPeriodLocked } = await import('../../lib/utils/tax');
      const isLocked = await isTaxPeriodLocked(customCheckoutTime || new Date());
      if (isLocked) {
        Alert.alert(
          'Kỳ thuế đã khóa',
          'Thời điểm thanh toán nằm trong kỳ thuế đã bị khóa sổ. Không thể tạo hóa đơn mới!'
        );
        setIsPayingTableLoading(false);
        return;
      }
      const selectedTableForPay = cartOwnerTable;
      let rentalType = selectedRentalType || 'hourly';
      if (!selectedRentalType && selectedTableForPay.metadata) {
        try {
          const parsed = typeof selectedTableForPay.metadata === 'string'
            ? JSON.parse(selectedTableForPay.metadata)
            : selectedTableForPay.metadata;
          rentalType = parsed?.rental_type || 'hourly';
        } catch (e) {
          console.warn('Error parsing metadata in handlePayTableConfirmUnified:', e);
        }
      }

      const billing = calculateBilling(selectedTableForPay, customCheckoutTime, rentalType);
      const tableCartItems = tableCarts[selectedTableForPay.id] || {};

      const itemsCost = Object.values(tableCartItems).reduce((sum, item) => sum + ((item.price + (item.modifier_total || 0)) * item.quantity), 0);
      const subtotal = billing.cost + itemsCost;
      const totalAmount = Math.max(0, subtotal - discount);
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

      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const shiftId = await AsyncStorage.getItem('active_shift_id') || 'default-shift';
      // FIX DUPLICATE: Reuse existing order ID to prevent duplicates!
      const orderId = selectedTableForPay.current_order_id || `ORD-T-${Date.now()}`;
      const orderNoType = shopVertical === 'lodging' ? 'KS' : (shopVertical === 'sports_court' ? 'SAN' : 'POS');
      const orderNo = `HD-${orderNoType}-${Date.now().toString().substring(9)}`;
      const nowStr = new Date().toISOString();
      const checkoutTimeStr = customCheckoutTime ? customCheckoutTime.toISOString() : nowStr;
      let syncSucceeded = false;
      let serverOrderNo = orderNo;

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

      // Calculate offline tax
      const systemTaxGroups = await getSystemTaxGroups();
      let totalTaxAmount = 0;
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

        return {
          id: `ORDI-${orderId}-${prodId}`,
          order_id: orderId,
          product_id: item.productId,
          product_name: item.name,
          qty: item.quantity,
          unit_price: item.price + (item.modifier_total || 0),
          line_total: itemTotal,
          tax_rate: item.tax_rate || '0',
          tax_amount: taxAmountVal,
          tax_group: normalizedGroup,
          tax_vat_rate: taxVatRate,
          tax_pit_rate: taxPitRate,
        };
      });

      // A. Lưu vào cơ sở dữ liệu SQLite cục bộ (Offline-First)
      if (Platform.OS === 'web') {
        setTables(prev => prev.map(t => t.id === selectedTableForPay.id ? { ...t, status: 'available', startTime: null } : t));
      } else {
        if (selectedTableForPay.current_order_id) {
          await db.delete(schema.orders).where(eq(schema.orders.id, selectedTableForPay.current_order_id));
          await db.delete(schema.order_items).where(eq(schema.order_items.order_id, selectedTableForPay.current_order_id));
        }

        await db.insert(schema.orders).values({
          id: orderId,
          order_no: orderNo,
          status: 'completed',
          customer_name: customer?.name || 'Khách lẻ',
          customer_id: customer?.id || 'C-DEFAULT-RETAIL',
          total_amount: totalAmount,
          paid_amount: Math.min(totalAmount, paidSum),
          payment_method: paymentMethodString,
          created_at: checkoutTimeStr,
          shift_id: shiftId,
          tax_amount: totalTaxAmount,
          sync_status: 'pending',
          note: note,
          discount_amount: discount,
          metadata: JSON.stringify({
            resource_id: selectedTableForPay.id,
            resource_name: selectedTableForPay.name,
            billing_cost: billing.cost,
            billing_duration: billing.label,
            check_in: selectedTableForPay.startTime,
            duration_minutes: (billing.hours || 0) * 60 + (billing.minutes || 0),
            check_out: checkoutTimeStr,
            rental_type: rentalType,
            server_order_id: selectedTableForPay.current_order_id || ''
          }),
        });

        if (billing.cost > 0) {
          await db.insert(schema.order_items).values({
            id: `ORDI-${orderId}-time`,
            order_id: orderId,
            product_id: 'TIME_CHARGE_BILLIARD',
            product_name: selectedTableForPay.type === 'room'
              ? `Tiền phòng - ${selectedTableForPay.name} (${billing.label})`
              : `Tiền giờ - ${selectedTableForPay.name} (${billing.label})`,
            qty: 1,
            unit_price: billing.cost,
            line_total: billing.cost,
            tax_rate: '0',
            tax_amount: 0,
            tax_group: '',
            tax_vat_rate: '0',
            tax_pit_rate: '0',
          });
        }

        // Thêm các món ăn/dịch vụ gọi kèm vào SQLite order_items
        for (const it of calculatedItems) {
          await db.insert(schema.order_items).values(it);
        }

        await db
          .update(schema.location_resources)
          .set({ status: 'available', startTime: null, current_order_id: null })
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
          showToast(`Thanh toán Hóa đơn ${orderNo} thành công!`, "success");
        }
      } else {
        showToast(`Thanh toán Hóa đơn ${orderNo} thành công! Hệ thống đang đồng bộ trong nền.`, "success");
      }

      // B. Đồng bộ hóa trong nền không làm nghẽn giao diện chính
      (async () => {
        const currentUrl = isOnline ? getApiBaseUrl() : null;
        if (!currentUrl) {
          if (Platform.OS !== 'web') {
            setTimeout(() => {
              SyncManager.pushOfflineOrders(shopId).catch(() => {});
            }, 800);
          }
          return;
        }

        try {
          const headers = await getApiHeaders();
          const payload = {
            local_order_id: selectedTableForPay.current_order_id || orderId,
            server_order_id: selectedTableForPay.current_order_id || '',
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
              note: note || `Thanh toán phòng/bàn từ di động.`,
              created_at: checkoutTimeStr,
              metadata: JSON.stringify({
                resource_id: selectedTableForPay.id,
                resource_name: selectedTableForPay.name,
                billing_cost: billing.cost,
                billing_duration: billing.label,
                check_in: selectedTableForPay.startTime,
                duration_minutes: (billing.hours || 0) * 60 + (billing.minutes || 0),
                check_out: checkoutTimeStr,
                rental_type: rentalType
              }),
              shift_id: shiftId,
            },
            items: [
              ...(billing.cost > 0 ? [{
                product_id: 'TIME_CHARGE_BILLIARD',
                product_name: selectedTableForPay.type === 'room'
                  ? `Tiền phòng - ${selectedTableForPay.name} (${billing.label})`
                  : `Tiền giờ - ${selectedTableForPay.name} (${billing.label})`,
                qty: 1,
                unit_price: billing.cost,
                discount_amount: 0,
                line_total: billing.cost,
                tax_rate: '0',
                tax_amount: 0,
                tax_group: '',
              }] : []),
              ...calculatedItems.map(it => ({
                product_id: it.product_id,
                product_name: it.product_name,
                qty: it.qty,
                unit_price: it.unit_price,
                discount_amount: 0,
                line_total: it.line_total,
                tax_rate: it.tax_rate,
                tax_amount: it.tax_amount,
                tax_group: it.tax_group,
              }))
            ],
            payments: processedPayments.map(p => {
              const fund = paymentFundsList.find(f => f.id === p.fund_id);
              return {
                method: p.method,
                amount: p.amount,
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

          const syncRes = await fetch(`${currentUrl}/api/shops/${shopId}/orders/sync-batch`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (syncRes.ok) {
            const syncData = await syncRes.json().catch(() => ({}));
            let serverOrderNo = orderNo;
            if (syncData.order_no) serverOrderNo = syncData.order_no;

            // Cập nhật vị trí sang available trên Server Cloud
            const patchRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${selectedTableForPay.id}`, {
              method: 'PATCH',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status: 'available',
                current_order_id: '',
                startTime: null
              }),
            });

            if (patchRes.ok) {
              if (Platform.OS !== 'web' && syncData.order_id) {
                const serverId = syncData.order_id;
                if (serverId !== orderId) {
                  await db.update(schema.order_items)
                    .set({ order_id: serverId })
                    .where(eq(schema.order_items.order_id, orderId));
                }
                await db.update(schema.orders)
                  .set({ id: serverId, order_no: serverOrderNo, sync_status: 'synced', reference_no: orderId })
                  .where(eq(schema.orders.id, orderId));
              }
              broadcastSync?.({ event: 'TABLE_PAID', tableId: selectedTableForPay.id, orderId: orderId });
            } else {
              console.warn('[POS] Patch location-resources lỗi trên cloud:', patchRes.status);
            }
          } else {
            console.warn('[POS] Sync batch phòng bàn lỗi server:', syncRes.status);
            if (Platform.OS !== 'web') {
              setTimeout(() => {
                SyncManager.pushOfflineOrders(shopId).catch(() => {});
              }, 800);
            }
          }
        } catch (syncErr) {
          console.warn('[POS] Sync phòng bàn trực tiếp thất bại, sẽ gửi qua hàng đợi sau:', syncErr);
          if (Platform.OS !== 'web') {
            setTimeout(() => {
              SyncManager.pushOfflineOrders(shopId).catch(() => {});
            }, 800);
          }
        }
      })();
    } catch (err) {
      console.error('Lỗi thanh toán phòng bàn:', err);
      showToast("Lỗi khi xử lý thanh toán!", "error");
      setIsPayingTableLoading(false);
    }
  };

  // Chuyển phòng/bàn
  const handleTransferTable = async (sourceTableId: string, targetTableId: string, includeSourceStayCost = true) => {
    try {
      const sourceTable = tables.find(t => t.id === sourceTableId);
      const targetTable = tables.find(t => t.id === targetTableId);
      if (!sourceTable || !targetTable) return;

      const orderId = sourceTable.current_order_id;
      if (!orderId) return;

      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const currentUrl = await getApiBaseUrl();
      const headers = await getApiHeaders();

      let sourceMeta: any = {};
      try {
        sourceMeta = sourceTable.metadata ? (typeof sourceTable.metadata === 'string' ? JSON.parse(sourceTable.metadata) : sourceTable.metadata) : {};
      } catch (e) {}

      const newOrderMeta = JSON.stringify({
        ...sourceMeta,
        resource_id: targetTable.id,
        resource_name: targetTable.name
      });

      const targetStartTime = includeSourceStayCost ? sourceTable.startTime : new Date().toISOString();

      if (isOnline) {
        // 1. Release source resource
        await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${sourceTableId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: 'available', current_order_id: '' }),
        });
        // 2. Occupy target resource
        await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${targetTableId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: 'occupied', current_order_id: orderId, startTime: targetStartTime }),
        });
        // 3. Update order metadata
        await fetch(`${currentUrl}/api/shops/${shopId}/orders/${orderId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ metadata: newOrderMeta }),
        });
      }

      // SQLite offline-first updates
      if (Platform.OS === 'web') {
        setTables(prev => prev.map(t => {
          if (t.id === sourceTableId) return { ...t, status: 'available', current_order_id: null, startTime: null, metadata: null };
          if (t.id === targetTableId) return { ...t, status: 'occupied', current_order_id: orderId, startTime: targetStartTime, metadata: newOrderMeta };
          return t;
        }));
      } else {
        // Update source resource
        await db
          .update(schema.location_resources)
          .set({ status: 'available', current_order_id: null, startTime: null, metadata: null })
          .where(eq(schema.location_resources.id, sourceTableId));

        // Update target resource
        await db
          .update(schema.location_resources)
          .set({ status: 'occupied', current_order_id: orderId, startTime: targetStartTime, metadata: newOrderMeta })
          .where(eq(schema.location_resources.id, targetTableId));

        // Update order
        await db
          .update(schema.orders)
          .set({ metadata: newOrderMeta, sync_status: 'pending' })
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

      showToast(`Đã chuyển sang ${targetTable.name}`, "success");
    } catch (err) {
      console.error('Lỗi chuyển phòng bàn:', err);
      showToast("Có lỗi xảy ra khi chuyển phòng bàn", "error");
    }
  };

  // Gộp phòng/bàn
  const handleMergeTable = async (sourceTableId: string, targetTableId: string, includeSourceStayCost = true) => {
    try {
      const sourceTable = tables.find(t => t.id === sourceTableId);
      const targetTable = tables.find(t => t.id === targetTableId);
      if (!sourceTable || !targetTable) return;

      const sourceOrderId = sourceTable.current_order_id;
      const targetOrderId = targetTable.current_order_id;
      if (!sourceOrderId || !targetOrderId) {
        showToast("Cả hai phòng/bàn phải đang hoạt động để gộp!", "error");
        return;
      }

      // Calculate frozen stay fee for source room/table up to now
      const sourceBilling = calculateBilling(sourceTable);
      const sourceStayCost = includeSourceStayCost ? (sourceBilling ? sourceBilling.cost : 0) : 0;

      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const currentUrl = await getApiBaseUrl();
      const headers = await getApiHeaders();

      let sourceItems: any[] = [];
      let targetItems: any[] = [];

      if (Platform.OS === 'web') {
        sourceItems = Object.values(tableCarts[sourceTableId] || {});
        targetItems = Object.values(tableCarts[targetTableId] || {});
      } else {
        sourceItems = await db.select().from(schema.order_items).where(eq(schema.order_items.order_id, sourceOrderId));
        targetItems = await db.select().from(schema.order_items).where(eq(schema.order_items.order_id, targetOrderId));
      }

      if (isOnline) {
        // 1. Add frozen source stay fee to the target order on Cloud
        if (sourceStayCost > 0) {
          const stayFeePayload = {
            order_id: targetOrderId,
            order_no: targetTable.current_order_id || '',
            line_no: '999',
            product_id: `TIME_CHARGE_MERGED_${sourceTableId}`,
            sku: 'TIME_CHARGE_MERGED',
            product_name: `Tiền phòng ${sourceTable.name} (Đã gộp - ${sourceBilling.label})`,
            qty: '1',
            unit_price: String(sourceStayCost),
            line_total: String(sourceStayCost),
            line_discount: '0'
          };
          await fetch(`${currentUrl}/api/shops/${shopId}/order-items`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(stayFeePayload)
          });
        }

        // 2. Transfer other items
        const itemsRes = await fetch(`${currentUrl}/api/shops/${shopId}/order-items?order_id=${sourceOrderId}&limit=200&t=${Date.now()}`, { headers });
        if (itemsRes.ok) {
          const json = await itemsRes.json();
          const cloudSourceItems = json.data || [];
          
          let index = 1;
          for (const item of cloudSourceItems) {
            // Skip the dynamic stay charge of the source room
            if (item.product_id === 'TIME_CHARGE') continue;

            const payload = {
              order_id: targetOrderId,
              order_no: targetTable.current_order_id || '',
              line_no: String(100 + index++),
              product_id: item.product_id,
              sku: item.sku || '',
              product_name: item.product_name,
              qty: String(item.qty),
              unit_price: String(item.unit_price),
              line_total: String(item.line_total),
              line_discount: String(item.line_discount || '0'),
              variant_id: item.variant_id || '',
              variant_label: item.variant_label || '',
              modifiers: item.modifiers || '',
              modifier_total: String(item.modifier_total || '0')
            };
            await fetch(`${currentUrl}/api/shops/${shopId}/order-items`, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
          }
        }

        await fetch(`${currentUrl}/api/shops/${shopId}/orders/${sourceOrderId}/cancel`, { method: 'POST', headers });

        await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${sourceTableId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: 'available', current_order_id: '' }),
        });
      }

      if (Platform.OS === 'web') {
        const sourceCart = tableCarts[sourceTableId] || {};
        setTableCarts(prev => {
          const copy = { ...prev };
          const targetCart = { ...(copy[targetTableId] || {}) };
          
          if (sourceStayCost > 0) {
            const frozenProductId = `TIME_CHARGE_MERGED_${sourceTableId}`;
            targetCart[frozenProductId] = {
              productId: frozenProductId,
              name: `Tiền phòng ${sourceTable.name} (Đã gộp - ${sourceBilling.label})`,
              price: sourceStayCost,
              quantity: 1,
            };
          }

          Object.entries(sourceCart).forEach(([itemId, item]) => {
            if (itemId === 'TIME_CHARGE' || item.productId === 'TIME_CHARGE') return;

            if (targetCart[itemId]) {
              targetCart[itemId] = {
                ...targetCart[itemId],
                quantity: targetCart[itemId].quantity + item.quantity
              };
            } else {
              targetCart[itemId] = item;
            }
          });
          
          copy[targetTableId] = targetCart;
          delete copy[sourceTableId];
          return copy;
        });

        setTables(prev => prev.map(t => {
          if (t.id === sourceTableId) return { ...t, status: 'available', current_order_id: null, startTime: null, metadata: null };
          return t;
        }));
      } else {
        // 1. Insert frozen stay fee to SQLite database
        if (sourceStayCost > 0) {
          const stayFeeItemId = `ORDI-FROZEN-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await db.insert(schema.order_items).values({
            id: stayFeeItemId,
            order_id: targetOrderId,
            product_id: `TIME_CHARGE_MERGED_${sourceTableId}`,
            product_name: `Tiền phòng ${sourceTable.name} (Đã gộp - ${sourceBilling.label})`,
            qty: 1,
            unit_price: sourceStayCost,
            line_total: sourceStayCost,
            tax_rate: '0',
            tax_amount: 0,
            tax_group: '',
            tax_vat_rate: '0',
            tax_pit_rate: '0',
          });
        }

        // 2. Transfer other items
        for (const item of sourceItems) {
          if (item.product_id === 'TIME_CHARGE') continue;

          const existing = await db
            .select()
            .from(schema.order_items)
            .where(eq(schema.order_items.order_id, targetOrderId))
            .where(eq(schema.order_items.product_id, item.product_id));

          if (existing.length > 0) {
            const newQty = Number(existing[0].qty) + Number(item.qty);
            const newTotal = newQty * Number(existing[0].unit_price);
            await db
              .update(schema.order_items)
              .set({ qty: String(newQty), line_total: String(newTotal) })
              .where(eq(schema.order_items.id, existing[0].id));
          } else {
            await db.insert(schema.order_items).values({
              id: `ORDI-${Date.now()}-${Math.random().toString(36).substring(7)}`,
              order_id: targetOrderId,
              product_id: item.product_id,
              product_name: item.product_name,
              qty: item.qty,
              unit_price: item.unit_price,
              line_total: item.line_total,
              tax_rate: item.tax_rate,
              tax_amount: item.tax_amount,
              tax_group: item.tax_group,
              tax_vat_rate: item.tax_vat_rate,
              tax_pit_rate: item.tax_pit_rate,
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
          .set({ status: 'available', current_order_id: null, startTime: null, metadata: null })
          .where(eq(schema.location_resources.id, sourceTableId));

        const updated = await db.select().from(schema.location_resources);
        setTables(updated);

        const sourceCart = tableCarts[sourceTableId] || {};
        setTableCarts(prev => {
          const copy = { ...prev };
          const targetCart = { ...(copy[targetTableId] || {}) };
          
          if (sourceStayCost > 0) {
            const frozenProductId = `TIME_CHARGE_MERGED_${sourceTableId}`;
            targetCart[frozenProductId] = {
              productId: frozenProductId,
              name: `Tiền phòng ${sourceTable.name} (Đã gộp - ${sourceBilling.label})`,
              price: sourceStayCost,
              quantity: 1,
            };
          }

          Object.entries(sourceCart).forEach(([itemId, item]) => {
            if (itemId === 'TIME_CHARGE' || item.productId === 'TIME_CHARGE') return;

            if (targetCart[itemId]) {
              targetCart[itemId] = {
                ...targetCart[itemId],
                quantity: targetCart[itemId].quantity + item.quantity
              };
            } else {
              targetCart[itemId] = item;
            }
          });
          
          copy[targetTableId] = targetCart;
          delete copy[sourceTableId];
          return copy;
        });
      }

      setTableCustomers(prev => {
        const copy = { ...prev };
        delete copy[sourceTableId];
        return copy;
      });

      showToast(`Đã gộp thành công từ phòng/bàn ${sourceTable.name}`, "success");
    } catch (err) {
      console.error('Lỗi gộp phòng bàn:', err);
      showToast("Có lỗi xảy ra khi gộp phòng bàn", "error");
    }
  };

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
    handleMergeTable
  };
}
