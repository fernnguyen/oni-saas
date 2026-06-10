import React, { useState, useCallback, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { db } from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { getApiBaseUrl, getApiHeaders } from '../../lib/api/config';
import { SyncManager } from '../../lib/sync/SyncManager';


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
import { calculateHourlyBilling } from '@oni/core';
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



  // Tính tiền giờ bàn bi-a
  const calculateBilling = (table: any, customCheckoutTime?: Date) => {
    if (!table.startTime) return { hours: 0, minutes: 0, cost: 0, label: '0h 0p', details: '' };

    // Phân tích cấu hình metadata nâng cao
    let rmd: any = {};
    try {
      rmd = typeof table.metadata === 'string' ? JSON.parse(table.metadata) : (table.metadata || {});
    } catch (e) {
      console.warn('Không thể parse metadata của phòng bàn:', e);
    }

    const rentalType = rmd.rental_type || 'hourly';

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

    const hourlyRate = Number(table.hourly_rate) || 0;
    const checkInDate = new Date(table.startTime);
    const checkOutDate = customCheckoutTime || new Date();

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
        serverItemsMap.set(item.product_id, item);
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
              product_id: prodId,
              product_name: cartItem.name,
              qty: String(cartItem.quantity),
              unit_price: String(cartItem.price),
              line_total: String(lineTotal),
              line_discount: '0'
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
          setActiveTable(null); // Đóng modal ngay lập tức

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
            mappedCart[item.product_id] = {
              productId: item.product_id,
              name: item.product_name,
              price: parseInt(item.unit_price || '0', 10),
              quantity: parseInt(item.qty || '1', 10)
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

        setActiveTable(updatedTable);
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
      let syncSucceeded = false;

      // 1. Chuẩn hóa metadata khách lưu trú
      const updatedGuests = lodgingGuests
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
        currentMeta = typeof activeTable.metadata === 'string' ? JSON.parse(activeTable.metadata) : (activeTable.metadata || {});
      } catch (e) { }

      const updatedMeta = JSON.stringify({
        ...currentMeta,
        resource_id: activeTable.id,
        resource_name: activeTable.name,
        check_in: activeTable.startTime || new Date().toISOString(),
        num_guests: roomGuestCount,
        rental_type: roomRentalType,
        guests_list: updatedGuests,
        guests: updatedGuests
      });

      // 2. Offline-First: Cập nhật SQLite nội địa và State
      if (Platform.OS === 'web') {
        setTables(prev => prev.map(t => t.id === activeTable.id ? { ...t, metadata: updatedMeta } : t));
      } else {
        await db
          .update(schema.location_resources)
          .set({ metadata: updatedMeta })
          .where(eq(schema.location_resources.id, activeTable.id));
        const updated = await db.select().from(schema.location_resources);
        setTables(updated);
      }

      // Cập nhật thông tin phòng đang mở để đồng bộ trực quan tức thì
      setActiveTable((prev: any) => prev ? { ...prev, metadata: updatedMeta } : null);

      // 3. Online Sync lên Cloud Next.js nếu đang có mạng
      try {
        const currentUrl = getApiBaseUrl();
        const headers = await getApiHeaders();

        // A. PATCH location-resources metadata
        const patchRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${activeTable.id}`, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metadata: updatedMeta
          }),
        });

        // B. PUT active order metadata nếu tồn tại current_order_id
        if (activeTable.current_order_id) {
          await fetch(`${currentUrl}/api/shops/${shopId}/orders/${activeTable.current_order_id}`, {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              metadata: updatedMeta
            })
          });
        }

        if (patchRes.ok) {
          syncSucceeded = true;
        }
      } catch (syncErr) {
        console.log('Mất mạng hoặc lỗi server, bỏ qua đồng bộ metadata khách trực tuyến:', syncErr);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
      if (syncSucceeded) {
        showToast("Cập nhật thông tin khách lưu trú thành công!", "success");
      } else {
        showToast("Đã cập nhật thông tin khách ngoại tuyến!", "info");
      }
    } catch (err) {
      console.error('Không thể cập nhật khách lưu trú:', err);
      showToast("Có lỗi xảy ra khi cập nhật khách!", "error");
    } finally {
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
    try {
      const nowTime = Date.now();
      let syncSucceeded = false;
      let orderId = `ORD-T-INPROG-${Date.now()}`;

      let tMeta: any = {};
      try {
        tMeta = selectedTableForOpen.metadata ? JSON.parse(selectedTableForOpen.metadata) : {};
      } catch (e) { }

      // 1. Chuẩn hóa metadata nhận phòng để dùng chung cho cả Server và SQLite
      const openTableMeta = JSON.stringify({
        resource_id: selectedTableForOpen.id,
        resource_name: selectedTableForOpen.name,
        check_in: new Date(nowTime).toISOString(),
        num_guests: roomGuestCount,
        rental_type: roomRentalType,
        advanced_pricing: tMeta.advanced_pricing,
        overnight_rate: tMeta.overnight_rate,
        weekend_rate: tMeta.weekend_rate,
        room_class: tMeta.room_class,
        bed_type: tMeta.bed_type,
        guests_list: lodgingGuests
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
        guests: lodgingGuests
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

      // 2. Đồng bộ trực tuyến lên Server Next.js nếu đang có mạng (cho cả Web lẫn Native SQLite)
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
            customer_id: selectedCustomer?.id || '',
            customer_name: selectedCustomer?.name || 'Khách lẻ',
            branch_id: shopId,
            employee_id: currentUserEmail,
            subtotal: '0',
            total_amount: '0',
            paid_amount: '0',
            resource_id: selectedTableForOpen.id,
            metadata: openTableMeta
          }),
        });

        if (orderRes.ok) {
          const createdOrder = await orderRes.json();
          orderId = createdOrder.id || createdOrder.order_id;

          // B. Cập nhật vị trí sang occupied
          const patchRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources/${selectedTableForOpen.id}`, {
            method: 'PATCH',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'occupied',
              current_order_id: orderId,
              startTime: nowTime
            }),
          });
          if (patchRes.ok) {
            syncSucceeded = true;
          } else {
            const errBody = await patchRes.text().catch(() => '');
            console.warn(`[Open Table PATCH Failed] Status ${patchRes.status}:`, errBody);
          }
        } else {
          const errBody = await orderRes.text().catch(() => '');
          console.warn(`[Open Table POST Failed] Status ${orderRes.status}:`, errBody);
        }
      } catch (syncErr) {
        console.log('Mất mạng hoặc lỗi server, bỏ qua sync check-in trực tiếp:', syncErr);
      }

      // 3. Ghi đè vào DB Cục bộ hoặc State cục bộ
      if (Platform.OS === 'web') {
        setTables(prev => prev.map(t => t.id === selectedTableForOpen.id ? {
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
          .where(eq(schema.location_resources.id, selectedTableForOpen.id));

        // Nhập đơn hàng in_progress ngoại tuyến nếu chưa đồng bộ thành công
        if (!syncSucceeded) {
          const activeShiftId = await AsyncStorage.getItem('active_shift_id') || 'default-shift';
          await db.insert(schema.orders).values({
            id: orderId,
            order_no: `HD-T-${Date.now().toString().substring(9)}`,
            status: 'in_progress',
            customer_id: selectedCustomer?.id || null,
            customer_name: selectedCustomer?.name || 'Khách lẻ',
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
        }

        const updated = await db.select().from(schema.location_resources);
        setTables(updated);
      }

      // Gán thông tin khách hàng nhận phòng bàn
      if (selectedCustomer) {
        setTableCustomers(prev => ({
          ...prev,
          [selectedTableForOpen.id]: selectedCustomer
        }));
      }

      setIsTableOpenDialogVisible(false);
      setSelectedTableForOpen(null);
      // Reset các tab check-in
      setCheckInTab('info');

      // Hiển thị Toast thông báo thành công sang trọng giống WebUI
      if (syncSucceeded) {
        showToast(`Đã nhận ${shopVertical === 'lodging' ? 'Phòng' : shopVertical === 'sports_court' ? 'Sân' : 'Bàn'} & Đồng bộ thành công!`, 'success');
        broadcastSync?.({ event: 'TABLE_OPENED', tableId: selectedTableForOpen.id, orderId: orderId });
      } else {
        showToast(`Nhận ${shopVertical === 'lodging' ? 'Phòng' : shopVertical === 'sports_court' ? 'Sân' : 'Bàn'} ngoại tuyến thành công!`, 'info');
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
    if (!isOnline) return;
    try {
      const currentUrl = getApiBaseUrl();
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const headers = await getApiHeaders();

      // Lấy metadata hiện tại
      let currentMeta: any = {};
      if (activeTable && activeTable.metadata) {
        try {
          currentMeta = typeof activeTable.metadata === 'string' ? JSON.parse(activeTable.metadata) : (activeTable.metadata || {});
        } catch (e) { }
      }

      const updatedMeta = JSON.stringify({
        ...currentMeta,
        customer_phone: custPhone
      });

      // Cập nhật SQLite metadata cục bộ và đơn hàng in_progress cục bộ
      if (Platform.OS !== 'web' && activeTable) {
        await db.update(schema.location_resources)
          .set({ metadata: updatedMeta })
          .where(eq(schema.location_resources.id, activeTable.id));

        await db.update(schema.orders)
          .set({
            customer_id: custId === 'C-DEFAULT-RETAIL' ? null : custId,
            customer_name: custName,
            metadata: updatedMeta
          })
          .where(eq(schema.orders.id, orderId));
      }

      // Cập nhật state activeTable và tables
      setActiveTable((prev: any) => prev ? { ...prev, metadata: updatedMeta } : null);
      setTables(prev => prev.map(t => t.id === activeTable.id ? { ...t, metadata: updatedMeta } : t));

      // Gọi PUT đồng bộ lên server Next.js
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
      console.warn('Lỗi khi đồng bộ khách hàng đại diện lên server:', e);
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

  // Bấm thanh toán phòng/bàn
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

    // 5. Mở modal giỏ hàng chính để thanh toán hệ thống
    handleCheckoutPress(() => {
      setIsCartModalOpen(true);
      setActiveTable(null); // Đóng modal sơ đồ phòng bàn hiện tại
    });
  };

  // Xác nhận Thanh toán bàn chơi / phòng lưu trú (Unified Flow)
  const handlePayTableConfirmUnified = async (
    customer: any,
    discount: number,
    note: string,
    payments: { id: string; method: string; fund_id: string; amount: number }[]
  ) => {
    if (!cartOwnerTable) return;
    setIsPayingTableLoading(true);
    try {
      const selectedTableForPay = cartOwnerTable;
      const billing = calculateBilling(selectedTableForPay);
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
      const orderNo = `HD-${shopVertical === 'lodging' ? '🏩' : '🎱'}-${Date.now().toString().substring(9)}`;
      const nowStr = new Date().toISOString();
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
          customer_id: customer?.id || null,
          total_amount: totalAmount,
          paid_amount: Math.min(totalAmount, paidSum),
          payment_method: paymentMethodString,
          created_at: nowStr,
          shift_id: shiftId,
          sync_status: 'pending',
          note: note,
          discount_amount: discount,
          metadata: JSON.stringify({
            resource_id: selectedTableForPay.id,
            resource_name: selectedTableForPay.name,
            billing_cost: billing.cost,
            billing_duration: billing.label,
            check_out: nowStr,
            rental_type: selectedTableForPay.metadata ? JSON.parse(selectedTableForPay.metadata).rental_type : 'hourly',
            server_order_id: selectedTableForPay.current_order_id || ''
          }),
        });

        if (billing.cost > 0) {
          await db.insert(schema.order_items).values({
            id: `ORDI-${orderId}-time`,
            order_id: orderId,
            product_id: 'billiard-time',
            product_name: selectedTableForPay.type === 'room'
              ? `Tiền phòng - ${selectedTableForPay.name} (${billing.label})`
              : `Tiền giờ - ${selectedTableForPay.name} (${billing.label})`,
            qty: 1,
            unit_price: billing.cost,
            line_total: billing.cost,
          });
        }

        // Thêm các món ăn/dịch vụ gọi kèm vào SQLite order_items
        for (const [prodId, item] of Object.entries(tableCartItems)) {
          await db.insert(schema.order_items).values({
            id: `ORDI-${orderId}-${prodId}`,
            order_id: orderId,
            product_id: prodId,
            product_name: item.name,
            qty: item.quantity,
            unit_price: item.price,
            line_total: (item.price + (item.modifier_total || 0)) * item.quantity,
          });
        }

        await db
          .update(schema.location_resources)
          .set({ status: 'available', startTime: null, current_order_id: null })
          .where(eq(schema.location_resources.id, selectedTableForPay.id));

        const updated = await db.select().from(schema.location_resources);
        setTables(updated);
      }

      // B. Đồng bộ trực tiếp lên Cloud Next.js Server nếu đang có mạng
      try {
        const currentUrl = getApiBaseUrl();
        const headers = await getApiHeaders();

        const payload = {
          local_order_id: selectedTableForPay.current_order_id || orderId,
          server_order_id: selectedTableForPay.current_order_id || '',
          order: {
            status: 'completed',
            channel: 'pos-mobile',
            customer_id: customer?.id || '',
            customer_name: customer?.name || 'Khách lẻ',
            branch_id: shopId,
            employee_id: currentUserEmail,
            subtotal: subtotal,
            discount_amount: discount,
            tax_amount: 0,
            total_amount: totalAmount,
            paid_amount: Math.min(totalAmount, paidSum),
            debt_amount: Math.max(0, totalAmount - Math.min(totalAmount, paidSum)),
            note: note || `Thanh toán phòng/bàn từ di động.`,
            metadata: JSON.stringify({
              resource_id: selectedTableForPay.id,
              resource_name: selectedTableForPay.name,
              billing_cost: billing.cost,
              billing_duration: billing.label,
              check_out: nowStr,
              rental_type: selectedTableForPay.metadata ? JSON.parse(selectedTableForPay.metadata).rental_type : 'hourly'
            })
          },
          items: [
            ...(billing.cost > 0 ? [{
              product_id: 'billiard-time',
              product_name: selectedTableForPay.type === 'room'
                ? `Tiền phòng - ${selectedTableForPay.name} (${billing.label})`
                : `Tiền giờ - ${selectedTableForPay.name} (${billing.label})`,
              qty: 1,
              unit_price: billing.cost,
              discount_amount: 0,
              line_total: billing.cost,
            }] : []),
            ...Array.from(Object.entries(tableCartItems)).map(([prodId, item]: [string, any]) => ({
              product_id: item.productId,
              product_name: item.name,
              qty: item.quantity,
              unit_price: (item.price + (item.modifier_total || 0)),
              discount_amount: 0,
              line_total: (item.price + (item.modifier_total || 0)) * item.quantity,
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
          stock_movements: Array.from(Object.entries(tableCartItems)).map(([prodId, item]: [string, any]) => ({
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
            syncSucceeded = true;
            if (Platform.OS !== 'web' && syncData.order_id) {
              const serverId = syncData.order_id;
              if (serverId !== orderId) {
                await db.update(schema.order_items)
                  .set({ order_id: serverId })
                  .where(eq(schema.order_items.order_id, orderId));
              }
              await db.update(schema.orders)
                .set({ id: serverId, order_no: syncData.order_no || orderNo, sync_status: 'synced', reference_no: orderId })
                .where(eq(schema.orders.id, orderId));
            }
          }
        }
      } catch (syncErr) {
        console.log('Bỏ qua sync checkout trực tiếp (sẽ sync sau):', syncErr);
      }

      // Xóa giỏ hàng của bàn và khách hàng phòng bàn sau khi thanh toán
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
      setIsPayingTableLoading(false);


      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });

      // Hiển thị Toast thông báo kết quả sang trọng giống WebUI
      const hasTransfer = payments.some(p => checkIsQrPayment(p.method) && p.amount > 0);
      if (hasTransfer) {
        const transferAmount = payments.filter(p => checkIsQrPayment(p.method)).reduce((sum, p) => sum + p.amount, 0);
        const transferP = payments.find(p => checkIsQrPayment(p.method) && p.amount > 0);
        setQrPayload({ amount: transferAmount, orderNo: serverOrderNo, fund_id: transferP ? transferP.fund_id : 'bank' });
        setIsQrModalOpen(true);
      } else {
        if (syncSucceeded) {
          showToast(`Thanh toán & Giải phóng thành công Hóa đơn ${serverOrderNo}!`, "success");
          broadcastSync?.({ event: 'TABLE_PAID', tableId: selectedTableForPay.id, orderId: orderId });
        } else {
          showToast(`Thanh toán ngoại tuyến thành công Hóa đơn ${orderNo}! Sẽ sync sau.`, "info");
        }
      }

      if (Platform.OS !== 'web') {
        setTimeout(() => {
          SyncManager.pushOfflineOrders(shopId);
        }, 800); // Trì hoãn 800ms để nhường luồng cho UI Animation đóng Modal mượt mà
      }
    } catch (err) {
      console.error('Lỗi thanh toán phòng bàn:', err);
      setIsPayingTableLoading(false);

      showToast("Lỗi khi xử lý thanh toán!", "error");
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
    syncTableSilent
  };
}
