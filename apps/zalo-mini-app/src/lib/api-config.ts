import { getAuthToken } from './supabase';

// Root domain — dùng để xây dựng subdomain URL từ tenant code
const ROOT_DOMAIN = import.meta.env.VITE_API_ROOT_DOMAIN || 'oni.vn';

// Dev mode: proxy qua localhost thay vì gọi trực tiếp production
const IS_DEV = import.meta.env.DEV;
const DEV_API_URL = import.meta.env.VITE_DEV_API_URL || ''; // e.g., http://localhost:3000

/**
 * Build API base URL từ tenant slug.
 * - Production: https://{slug}.oni.vn
 * - Dev: http://localhost:3000 (Next.js dev server, dùng x-tenant-slug header)
 */
export function buildTenantUrl(tenantSlug: string): string {
  // Khi dev, dùng localhost + header thay vì subdomain
  if (IS_DEV && DEV_API_URL) {
    return DEV_API_URL;
  }
  return `https://${tenantSlug}.${ROOT_DOMAIN}`;
}

/**
 * Lấy API base URL hiện tại.
 */
export function getApiBaseUrl(): string {
  const custom = localStorage.getItem('custom_api_base_url');
  if (custom) return custom;

  const tenantCode = localStorage.getItem('active_tenant_code');
  if (tenantCode) return buildTenantUrl(tenantCode);

  return `https://${ROOT_DOMAIN}`;
}

/**
 * Lưu API base URL.
 */
export function saveApiBaseUrl(url: string): void {
  localStorage.setItem('custom_api_base_url', url.trim());
}

/**
 * Set tenant code → build và lưu API base URL.
 */
export function setTenantCode(tenantCode: string): void {
  const slug = tenantCode.trim().toLowerCase();
  localStorage.setItem('active_tenant_code', slug);
  localStorage.setItem('saved_tenant_code', slug);
  saveApiBaseUrl(buildTenantUrl(slug));
}

export async function getApiHeaders(customHeaders: Record<string, string> = {}): Promise<HeadersInit> {
  const token = await getAuthToken();
  const tenantCode = localStorage.getItem('active_tenant_code');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(tenantCode ? { 'x-tenant-slug': tenantCode } : {}),
    ...customHeaders,
  };
}
