
import React, { useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import { eq } from 'drizzle-orm';
import { getApiBaseUrl, getApiHeaders } from '../../lib/api/config';
import { Platform } from 'react-native';

export function usePosData() {
  const [productsList, setProductsList] = useState<any[]>([]);
  const [categoriesList, setCategoriesList] = useState<any[]>([]);
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [paymentFundsList, setPaymentFundsList] = useState<any[]>([]);
  const [paymentMethodsList, setPaymentMethodsList] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [tables, setTables] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isNavReady, setIsNavReady] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('mobile-app');
  const [activeShopId, setActiveShopId] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [apiAuthHeaders, setApiAuthHeaders] = useState<Record<string, string>>({});
  
  const [activeVertical, setActiveVertical] = useState('retail');
  const [shopVertical, setShopVertical] = useState<string>('retail');
  const [isShiftEnabled, setIsShiftEnabled] = useState(false);

  const loadPosData = async (isMounted = true) => {
  try {
  if (isMounted) setIsLoading(true);

  const activeShopName = await AsyncStorage.getItem('active_shop_name') || 'Tạp hóa Linh Ka';
  const activeShopIndustry = await AsyncStorage.getItem('active_shop_industry') || 'retail';
  let vertical = activeShopIndustry;

  const enabled = (await AsyncStorage.getItem('enable_shift_management')) === 'true';
  if (isMounted) setIsShiftEnabled(enabled);
  
  if (isMounted) {
  // Tránh cập nhật state phân hệ ngay lập tức trong chu kỳ focus đầu tiên để không làm mất navigation context
  setTimeout(() => {
  if (isMounted) {
  setShopVertical(vertical);
  setActiveVertical(vertical);
 }
 }, 60);
 }


 let prods = [];
 let cats = [];
 let resources = [];
 let customers = [];
   let funds: any[] = [];
   let methods: any[] = [];

 if (Platform.OS === 'web') {
 // Tải dữ liệu thực tế từ REST API (Next.js) trên môi trường Web để tránh placeholder mock
 try {
 const currentUrl = getApiBaseUrl();
 const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
 const headers = await getApiHeaders();

 // A. Tải danh mục sản phẩm
 const catRes = await fetch(`${currentUrl}/api/shops/${shopId}/categories?limit=500`, {headers});
 if (catRes.ok) {
 const catData = await catRes.json();
 cats = (catData.data || []).map((cat: any) => ({
 id: cat.id || cat.category_id,
 name: cat.name || '',
 parent_id: cat.parent_id || null,
 description: cat.description || null,
}));
}

 // B. Tải sản phẩm thực tế
 const prodRes = await fetch(`${currentUrl}/api/shops/${shopId}/products?limit=2000&nocache=true`, {headers});
 if (prodRes.ok) {
 const prodData = await prodRes.json();
 prods = (prodData.data || []).map((prod: any) => {
 const sellPrice = parseInt(prod.sell_price || '0', 10);
 const stockQty = parseInt(prod.stock_qty || '0', 10);
 return {
 id: prod.id || prod.product_id,
 name: prod.name || '',
 sku: prod.sku || '',
 barcode: prod.barcode || '',
 category_id: prod.category_id || null,
 unit: prod.unit || '',
 sell_price: isNaN(sellPrice) ? 0 : sellPrice,
 stock_qty: isNaN(stockQty) ? 0 : stockQty,
 image_url: prod.image_url || null,
 description: prod.description || null,
 product_type: prod.product_type || 'simple',
 parent_id: prod.parent_id || null,
 variant_options: typeof prod.variant_options === 'string' ? prod.variant_options : JSON.stringify(prod.variant_options || null),
 modifier_groups: typeof prod.modifier_groups === 'string' ? prod.modifier_groups : JSON.stringify(prod.modifier_groups || null),
};
});
}

 // C. Tải sơ đồ phòng bàn
 const tableRes = await fetch(`${currentUrl}/api/shops/${shopId}/location-resources?limit=500`, {headers});
 if (tableRes.ok) {
 const tableData = await tableRes.json();
 resources = (tableData.data || []).map((table: any) => {
 const rate = parseInt(table.hourly_rate || '0', 10);
 const isOccupied = table.status === 'occupied' || table.status === 'playing';
 
 let checkInTime = null;
 if (isOccupied) {
 try {
 const metaObj = typeof table.metadata === 'string' ? JSON.parse(table.metadata) : (table.metadata || {});
 if (metaObj.check_in) {
 checkInTime = new Date(metaObj.check_in).getTime();
}
} catch (e) {}
 if (!checkInTime) checkInTime = Date.now() - 3600000;
}

 return {
 id: table.id || table.resource_id,
 name: table.name || '',
 type: table.type || 'table',
 status: isOccupied ? 'occupied' : 'available',
 current_order_id: table.current_order_id || null,
 hourly_rate: isNaN(rate) ? 0 : rate,
 zone: table.zone || null,
 startTime: checkInTime,
 metadata: typeof table.metadata === 'object' ? JSON.stringify(table.metadata) : (table.metadata || '{}'),
};
});
}

 // D. Tải danh sách khách hàng
 const custRes = await fetch(`${currentUrl}/api/shops/${shopId}/customers?limit=2000`, {headers});
 if (custRes.ok) {
 const custData = await custRes.json();
 customers = (custData.data || []).map((cust: any) => {
 const spent = parseInt(cust.total_spent || cust.prepaid_balance || '0', 10);
 const oCount = parseInt(cust.orders_count || '0', 10);
 return {
 id: cust.id || cust.customer_id,
 name: cust.name || '',
 phone: cust.phone || '',
 email: cust.email || null,
 address: cust.address || null,
 customer_code: cust.customer_code || null,
 customer_type: cust.customer_type || 'Thành viên',
 total_spent: isNaN(spent) ? 0 : spent,
 orders_count: isNaN(oCount) ? 0 : oCount,
 sync_status: 'synced',
};
});
}

 // E. Tải phương thức thanh toán
 try {
 const methodRes = await fetch(`${currentUrl}/api/shops/${shopId}/payment-methods?active=TRUE`, {headers});
 if (methodRes.ok) {
 const methodData = await methodRes.json();
 methods = (methodData.data || []).map((m: any) => ({
 id: m.id,
 name: m.name,
 type: m.type,
 code: m.code,
 branch_id: m.branch_id,
 is_default: m.is_default === 'TRUE',
 active: m.active === 'TRUE',
}));
}
} catch (e) {
 console.warn('Lỗi khi tải phương thức thanh toán:', e);
}
} catch (fetchError) {
 console.warn('Lỗi khi tải dữ liệu thực tế từ REST API trên Web, sử dụng Mock làm dự phòng:', fetchError);
}

 // Fallback sang Mock Data nếu không tải được gì
 if (prods.length === 0) {
 prods = [
 {id: 'p1', name: 'Cà phê Phin Sữa Đá', sell_price: 29000, stock_qty: 99, category_id: 'c1', unit: 'ly'},
 {id: 'p2', name: 'Trà Đào Cam Sả', sell_price: 39000, stock_qty: 45, category_id: 'c1', unit: 'ly'},
 {id: 'p3', name: 'Bánh Mì Pate Xá Xíu', sell_price: 25000, stock_qty: 20, category_id: 'c2', unit: 'cái'},
 {id: 'p4', name: 'Nước suối Aquafina', sell_price: 15000, stock_qty: 150, category_id: 'c3', unit: 'chai'}
 ];
}
 if (cats.length === 0) {
 cats = [
 {id: 'c1', name: 'Đồ uống'},
 {id: 'c2', name: 'Thức ăn'},
 {id: 'c3', name: 'Tiện ích'}
 ];
}
 if (resources.length === 0) {
 resources = [
 {id: 't1', name: 'Bàn Bi-a 01', type: 'table', status: 'available', hourly_rate: 60000, zone: 'Khu A'},
 {id: 't2', name: 'Bàn Bi-a 02', type: 'table', status: 'occupied', hourly_rate: 60000, zone: 'Khu A', startTime: Date.now() - 45 * 60000},
 {id: 't3', name: 'Bàn VIP 01', type: 'table', status: 'available', hourly_rate: 90000, zone: 'Phòng VIP'}
 ];
}
 if (customers.length === 0) {
 customers = [
 {id: 'cust1', name: 'Nguyễn Văn Minh', phone: '0901234567', customer_type: 'VIP'},
 {id: 'cust2', name: 'Trần Thị Hằng', phone: '0987654321', customer_type: 'Thân thiết'}
 ];
}
 if (methods.length === 0) {
   methods = [
     { id: 'cash', name: 'Tiền mặt', type: 'cash', code: 'cash', is_default: true, active: true },
     { id: 'bank_transfer', name: 'Chuyển khoản', type: 'bank', code: 'bank_transfer', is_default: true, active: true },
     { id: 'card', name: 'Thẻ ATM / POS', type: 'bank', code: 'card', is_default: false, active: true },
     { id: 'momo', name: 'Ví MoMo', type: 'wallet', code: 'momo', is_default: true, active: true },
     { id: 'zalopay', name: 'Ví ZaloPay', type: 'wallet', code: 'zalopay', is_default: false, active: true },
     { id: 'vnpay', name: 'Ví VNPay', type: 'wallet', code: 'vnpay', is_default: false, active: true },
     { id: 'prepaid', name: 'Ví trả trước', type: 'prepaid', code: 'prepaid', is_default: true, active: true },
     { id: 'debt', name: 'Ghi nợ', type: 'debt', code: 'debt', is_default: true, active: true },
   ];
 }
} else {
 // SQLite Native
 prods = await db.select().from(schema.products);
 cats = await db.select().from(schema.categories);
 resources = await db.select().from(schema.location_resources);
 customers = await db.select().from(schema.customers);
      funds = await db.select().from(schema.paymentFunds);
      methods = await db.select().from(schema.paymentMethods);
}

 if (isMounted) {
 setProductsList(prods);
 setCategoriesList(cats);
 setTables(resources);
 setCustomersList(customers);
      setPaymentFundsList(funds);
      setPaymentMethodsList(methods);
 setIsLoading(false);
}
} catch (error) {
 console.error('Lỗi khi tải dữ liệu POS:', error);
 if (isMounted) setIsLoading(false);
}
};
  
  return {
    productsList, setProductsList,
    categoriesList, setCategoriesList,
    customersList, setCustomersList,
    paymentFundsList, setPaymentFundsList,
    paymentMethodsList, setPaymentMethodsList,
    selectedCategoryId, setSelectedCategoryId,
    tables, setTables,
    isLoading, setIsLoading,
    isNavReady, setIsNavReady,
    currentUserEmail, setCurrentUserEmail,
    activeShopId, setActiveShopId,
    isOnline, setIsOnline,
    apiAuthHeaders, setApiAuthHeaders,
    activeVertical, setActiveVertical,
    shopVertical, setShopVertical,
    isShiftEnabled, setIsShiftEnabled,
    loadPosData
  };
}
