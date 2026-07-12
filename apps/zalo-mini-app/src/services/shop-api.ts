/**
 * Centralized API service cho tất cả shop-scoped endpoints.
 * Port từ patterns của mobile app, bỏ offline/SQLite.
 */
import { apiFetch, apiPost } from './api';

// ────────────────────────────── Types ──────────────────────────────

export interface Product {
  id: string;
  product_id?: string;
  name: string;
  sku?: string;
  sell_price: number | string;
  cost_price?: number | string;
  active?: string;
  category_id?: string;
  category_name?: string;
  image_url?: string;
  product_type?: string;
  tax_rate?: number | string;
  input_tax_rate?: number | string;
  tax_group?: string;
  unit?: string;
  barcode?: string;
  stock_quantity?: number | string;
  variants?: string; // JSON string
  modifiers?: string; // JSON string
  branch_id?: string;
}

export interface Category {
  id: string;
  name: string;
  slug?: string;
  sort_order?: number;
  image_url?: string;
  category_id?: string;
  categoryId?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  customer_type?: string;
  total_spent?: number;
  total_orders?: number;
  debt_amount?: number;
  prepaid_balance?: number;
  credit_limit?: number;
  note?: string;
  created_at?: string;
}

export interface Order {
  id: string;
  order_number?: string;
  status: string;
  total_amount: number | string;
  discount_amount?: number | string;
  tax_amount?: number | string;
  final_amount?: number | string;
  payment_status?: string;
  payment_method?: string;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  note?: string;
  channel?: string;
  shift_id?: string;
  created_at: string;
  updated_at?: string;
  items?: OrderItem[];
  branch_id?: string;
  debt_amount?: number | string;
  paid_amount?: number | string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number | string;
  total_price: number | string;
  discount_amount?: number | string;
  note?: string;
  variant_name?: string;
  modifiers?: string;
  returned_quantity?: number;
}

export interface Shift {
  id: string;
  status: string;
  opening_cash?: number;
  expected_closing_cash?: number;
  actual_closing_cash?: number;
  user_id?: string;
  user_email?: string;
  opened_at: string;
  closed_at?: string;
  note?: string;
}

export interface CashbookEntry {
  id: string;
  type: 'receipt' | 'payment';
  amount: number | string;
  category?: string;
  fund_id?: string;
  fund_name?: string;
  reference_id?: string;
  reference_type?: string;
  customer_id?: string;
  customer_name?: string;
  note?: string;
  created_at: string;
  created_by?: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  type?: string;
  active?: string;
  is_default?: boolean;
  bank_name?: string;
  account_number?: string;
  account_holder?: string;
  current_balance?: number | string;
}

export interface LocationResource {
  id: string;
  name: string;
  zone?: string;
  type?: string; // table, room, court
  status?: string; // available, occupied, cleaning, reserved
  current_order_id?: string;
  industry_type?: string;
  sort_order?: number;
}

export interface ReportOverview {
  kpi?: {
    today?: { orders: number; revenue: number; debt: number };
    month?: { orders: number; revenue: number; debt: number };
    returns?: { count: number; refund: number };
  };
  todayRevenue?: number;
  todayOrders?: number;
  monthRevenue?: number;
  monthOrders?: number;
  aov?: number;
  refundRevenue?: number;
  refundCount?: number;
  topProducts?: Array<{ id?: string; name: string; quantity?: number; qty?: number; revenue: number }>;
  todayGrowth?: number;
  monthGrowth?: number;
  chartData?: Array<{ date: string; revenue: number }>;
}

// ────────────────────────────── Dashboard ──────────────────────────────

export function getReportsOverview(shopId: string) {
  return apiFetch<ReportOverview>(`/api/shops/${shopId}/reports/overview`);
}

// ────────────────────────────── Shifts ──────────────────────────────

export function getShifts(shopId: string, params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ data?: Shift[] }>(`/api/shops/${shopId}/shifts${query}`)
    .then(res => ({ shifts: res?.data || [] }));
}

export function createShift(shopId: string, data: { opening_cash?: number; user_email?: string }) {
  return apiPost<Shift>(`/api/shops/${shopId}/shifts`, data);
}

export function closeShift(shopId: string, shiftId: string, data: { actual_closing_cash?: number; note?: string }) {
  return apiFetch<Shift>(`/api/shops/${shopId}/shifts/${shiftId}`, {
    method: 'PUT',
    body: JSON.stringify({ ...data, status: 'closed' }),
  });
}

// ────────────────────────────── Orders ──────────────────────────────

export function getOrders(shopId: string, params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ data?: Order[]; total?: number }>(`/api/shops/${shopId}/orders${query}`)
    .then(res => ({ orders: res?.data || [], total: res?.total ?? 0 }));
}

export function getOrderDetail(shopId: string, orderId: string) {
  return apiFetch<Order>(`/api/shops/${shopId}/orders/${orderId}`);
}

export function cancelOrder(shopId: string, orderId: string, reason: string) {
  return apiFetch<Order>(`/api/shops/${shopId}/orders/${orderId}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'cancelled', cancel_reason: reason }),
  });
}

export function syncOrderDirect(shopId: string, payload: any) {
  return apiPost<any>(`/api/shops/${shopId}/orders/sync-batch`, payload);
}

// ────────────────────────────── Order Items ──────────────────────────────

export function getOrderItems(shopId: string, params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ data?: OrderItem[] }>(`/api/shops/${shopId}/order-items${query}`)
    .then(res => res?.data || []);
}

// ────────────────────────────── Returns ──────────────────────────────

export function getReturns(shopId: string, params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ data?: any[] }>(`/api/shops/${shopId}/returns${query}`)
    .then(res => res?.data || []);
}

export function createReturn(shopId: string, data: any) {
  return apiPost<any>(`/api/shops/${shopId}/returns`, data);
}

export function createReturnItems(shopId: string, data: any) {
  return apiPost<any>(`/api/shops/${shopId}/return-items`, data);
}

export function processReturn(shopId: string, returnId: string, data: any) {
  return apiPost<any>(`/api/shops/${shopId}/returns/${returnId}/process`, data);
}

export function getReturnItems(shopId: string, params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ data?: any[] }>(`/api/shops/${shopId}/return-items${query}`)
    .then(res => res?.data || []);
}

// ────────────────────────────── Products & Categories ──────────────────────────────

export function getProducts(shopId: string, params?: Record<string, string>) {
  const defaultParams = { limit: '5000', nocache: 'true', ...params };
  const query = '?' + new URLSearchParams(defaultParams).toString();
  return apiFetch<{ data?: Product[] }>(`/api/shops/${shopId}/products${query}`)
    .then(res => ({ products: res?.data || [] }));
}

export function getProductDetail(shopId: string, productId: string) {
  return apiFetch<Product>(`/api/shops/${shopId}/products/${productId}`);
}

export function createProduct(shopId: string, data: any) {
  return apiPost<Product>(`/api/shops/${shopId}/products`, data);
}

export function updateProduct(shopId: string, productId: string, data: any) {
  return apiFetch<Product>(`/api/shops/${shopId}/products/${productId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function getCategories(shopId: string) {
  return apiFetch<{ data?: Category[] }>(`/api/shops/${shopId}/categories?limit=500`)
    .then(res => ({ categories: res?.data || [] }));
}

export function createCategory(shopId: string, data: { name: string; description?: string }) {
  return apiPost<any>(`/api/shops/${shopId}/categories`, data);
}

// ────────────────────────────── Customers ──────────────────────────────

export function getCustomers(shopId: string, params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ data?: Customer[] }>(`/api/shops/${shopId}/customers${query}`)
    .then(res => ({ customers: res?.data || [] }));
}

export function getCustomerDetail(shopId: string, customerId: string) {
  return apiFetch<Customer>(`/api/shops/${shopId}/customers/${customerId}`);
}

export function createCustomer(shopId: string, data: Partial<Customer>) {
  return apiPost<Customer>(`/api/shops/${shopId}/customers`, data);
}

export function updateCustomer(shopId: string, customerId: string, data: Partial<Customer>) {
  return apiFetch<Customer>(`/api/shops/${shopId}/customers/${customerId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ────────────────────────────── Cashbook & Payment Methods ──────────────────────────────

export function getCashbook(shopId: string, params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any>(`/api/shops/${shopId}/cashbook${query}`);
}

export function createCashbookEntry(shopId: string, data: any) {
  return apiPost<CashbookEntry>(`/api/shops/${shopId}/cashbook`, data);
}

export function getPaymentMethods(shopId: string, params?: Record<string, string>) {
  const defaultParams = { active: 'TRUE', ...params };
  const query = '?' + new URLSearchParams(defaultParams).toString();
  return apiFetch<{ data?: PaymentMethod[] }>(`/api/shops/${shopId}/payment-methods${query}`)
    .then(res => res?.data || []);
}

export interface PaymentFund {
  id: string;
  name: string;
  type: string; // cash, bank, wallet
  account_number?: string;
  bank_name?: string;
  is_default?: string;
  active?: string;
  current_balance?: number | string;
  account_holder?: string;
  account_name?: string;
}

export function getPaymentFunds(shopId: string) {
  return apiFetch<{ data?: PaymentFund[] }>(`/api/shops/${shopId}/payment-funds?active=TRUE`)
    .then(res => res?.data || []);
}

// ────────────────────────────── Location Resources (Tables/Rooms) ──────────────────────────────

export function getLocationResources(shopId: string) {
  return apiFetch<{ data?: LocationResource[] }>(`/api/shops/${shopId}/location-resources?limit=500`)
    .then(res => res?.data || []);
}

export function updateLocationResource(shopId: string, resourceId: string, data: any) {
  return apiFetch<LocationResource>(`/api/shops/${shopId}/location-resources/${resourceId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ────────────────────────────── QR Orders ──────────────────────────────

export function getQrOrders(shopId: string, params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any[]>(`/api/shops/${shopId}/qr-orders${query}`)
    .then(res => Array.isArray(res) ? res : (res as any)?.data || []);
}

export function updateQrOrder(shopId: string, orderId: string, data: any) {
  const action = data.status === 'confirmed' || data.status === 'accepted' ? 'accept' : 'reject';
  return apiFetch<any>(`/api/shops/${shopId}/qr-orders`, {
    method: 'PATCH',
    body: JSON.stringify({ action, request_id: orderId, ...data }),
  });
}

export function getQrSessions(shopId: string, params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any[]>(`/api/shops/${shopId}/qr-sessions${query}`)
    .then(res => Array.isArray(res) ? res : (res as any)?.data || []);
}

export function updateQrSession(shopId: string, sessionId: string, data: any) {
  return apiFetch<any>(`/api/shops/${shopId}/qr-sessions/${sessionId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ────────────────────────────── Permissions ──────────────────────────────

export function getShopPermissions(shopId: string) {
  return apiFetch<{ permissions: string[] }>(`/api/shops/${shopId}/permissions`);
}

// ────────────────────────────── Settings ──────────────────────────────

export function getShopSettings(shopId: string) {
  return apiFetch<any>(`/api/shops/${shopId}/settings`);
}

// ────────────────────────────── Notifications ──────────────────────────────

export function getNotificationUnreadCounts(tenantId: string) {
  return apiFetch<any>(`/api/notifications/unread-counts?tenantId=${tenantId}`);
}

export interface Payment {
  id: string;
  order_id: string;
  method: string;
  amount: number | string;
  reference_no?: string;
  note?: string;
  paid_at?: string;
  created_at: string;
}

export function getOrderPayments(shopId: string, params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ data?: Payment[] }>(`/api/shops/${shopId}/payments${query}`)
    .then(res => res?.data || []);
}

// ────────────────────────────── Debt ──────────────────────────────

export interface DebtRow {
  id: string;
  customer_id?: string;
  name?: string;
  phone?: string;
  debt_amount?: number | string;
  debt_days?: number | string;
  metadata?: string;
}

export function getDebt(shopId: string, params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ data: DebtRow[]; total: number; totalDebt: number }>(
    `/api/shops/${shopId}/debt${query}`
  );
}

export interface DebtOrder {
  id: string;
  order_no: string;
  created_at: string;
  total_amount: string | number;
  paid_amount: string | number;
  debt_amount: string | number;
  customer_name: string;
  subtotal?: string | number;
  discount_amount?: string | number;
  shipping_fee?: string | number;
  tax_amount?: string | number;
}

export function getDebtOrders(shopId: string, customerId: string) {
  return apiFetch<{ data: DebtOrder[]; total: number; totalDebt: number }>(
    `/api/shops/${shopId}/orders/debt?customer_id=${customerId}`
  );
}

// ────────────────────────────── Notifications ──────────────────────────────

export function getNotifications(tenantId: string, shopId?: string) {
  const query = `?tenantId=${tenantId}${shopId ? `&shopId=${shopId}` : ''}`;
  return apiFetch<any>(`/api/notifications${query}`);
}

export function markNotificationRead(id: string) {
  return apiFetch<any>(`/api/notifications/${id}/read`, { method: 'POST' });
}

export function markAllNotificationsRead(tenantId: string, shopId?: string) {
  const query = `?tenantId=${tenantId}${shopId ? `&shopId=${shopId}` : ''}`;
  return apiFetch<any>(`/api/notifications/read-all${query}`, { method: 'POST' });
}
