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
  todayRevenue?: number;
  todayOrders?: number;
  monthRevenue?: number;
  monthOrders?: number;
  aov?: number;
  refundRevenue?: number;
  refundCount?: number;
  topProducts?: Array<{ name: string; quantity: number; revenue: number }>;
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
  return apiFetch<{ shifts?: Shift[] }>(`/api/shops/${shopId}/shifts${query}`);
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
  return apiFetch<{ orders?: Order[]; total?: number }>(`/api/shops/${shopId}/orders${query}`);
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

export function createOrderBatch(shopId: string, orders: any[]) {
  return apiPost<any>(`/api/shops/${shopId}/orders/sync-batch`, { orders });
}

// ────────────────────────────── Order Items ──────────────────────────────

export function getOrderItems(shopId: string, params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<OrderItem[]>(`/api/shops/${shopId}/order-items${query}`);
}

// ────────────────────────────── Returns ──────────────────────────────

export function getReturns(shopId: string, params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any[]>(`/api/shops/${shopId}/returns${query}`);
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
  return apiFetch<any[]>(`/api/shops/${shopId}/return-items${query}`);
}

// ────────────────────────────── Products & Categories ──────────────────────────────

export function getProducts(shopId: string, params?: Record<string, string>) {
  const defaultParams = { limit: '5000', nocache: 'true', ...params };
  const query = '?' + new URLSearchParams(defaultParams).toString();
  return apiFetch<{ products?: Product[] }>(`/api/shops/${shopId}/products${query}`);
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
  return apiFetch<{ categories?: Category[] }>(`/api/shops/${shopId}/categories?limit=500`);
}

// ────────────────────────────── Customers ──────────────────────────────

export function getCustomers(shopId: string, params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ customers?: Customer[] }>(`/api/shops/${shopId}/customers${query}`);
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
  return apiFetch<CashbookEntry[]>(`/api/shops/${shopId}/cashbook${query}`);
}

export function createCashbookEntry(shopId: string, data: any) {
  return apiPost<CashbookEntry>(`/api/shops/${shopId}/cashbook`, data);
}

export function getPaymentMethods(shopId: string, params?: Record<string, string>) {
  const defaultParams = { active: 'TRUE', ...params };
  const query = '?' + new URLSearchParams(defaultParams).toString();
  return apiFetch<PaymentMethod[]>(`/api/shops/${shopId}/payment-methods${query}`);
}

// ────────────────────────────── Location Resources (Tables/Rooms) ──────────────────────────────

export function getLocationResources(shopId: string) {
  return apiFetch<LocationResource[]>(`/api/shops/${shopId}/location-resources?limit=500`);
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
  return apiFetch<any[]>(`/api/shops/${shopId}/qr-orders${query}`);
}

export function updateQrOrder(shopId: string, orderId: string, data: any) {
  return apiFetch<any>(`/api/shops/${shopId}/qr-orders/${orderId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function getQrSessions(shopId: string, params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any[]>(`/api/shops/${shopId}/qr-sessions${query}`);
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
