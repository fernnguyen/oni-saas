import { supabase } from '@/lib/supabase';
import { apiFetch } from './api';
import { useAuthStore } from '@/stores/auth-store';
import { useTenantStore } from '@/stores/tenant-store';

// Resolve tenant by slug - returns tenant info
export async function resolveTenant(slug: string) {
  return apiFetch<{
    id: string;
    name: string;
    slug: string;
    logo_url?: string;
    brand_color?: string;
    industry_type?: string;
  }>(`/api/tenants/by-slug/${slug}`);
}

// Login with email/password via Supabase
export async function loginWithPassword(email: string, password: string, tenantSlug?: string) {
  // Save tenant code before login
  if (tenantSlug) {
    localStorage.setItem('active_tenant_code', tenantSlug);
    localStorage.setItem('saved_tenant_code', tenantSlug);
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) throw error;

  if (data.session) {
    useAuthStore.getState().setSession(data.session);
  }

  return data;
}

// Fetch tenant info for authenticated user
export async function fetchCurrentTenant() {
  return apiFetch<{
    id: string;
    name: string;
    slug: string;
    logo_url?: string;
    brand_color?: string;
    industry_type?: string;
  }>('/api/tenants/me');
}

// Fetch shops/branches for a tenant
export async function fetchShops(tenantId: string) {
  return apiFetch<
    Array<{
      id: string;
      name: string;
      slug: string;
      address?: string;
      industry_type?: string;
    }>
  >(`/api/shops?tenant_id=${tenantId}`);
}

// Logout
export async function logout() {
  await supabase.auth.signOut();
  useAuthStore.getState().logout();
  useTenantStore.getState().clearAll();
  localStorage.removeItem('active_tenant_code');
}

// Listen to auth state changes
export function onAuthStateChange(callback: (session: any) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}
