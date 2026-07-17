import { supabase } from '@/lib/supabase';
import { apiFetch } from './api';
import { useAuthStore } from '@/stores/auth-store';
import { useTenantStore } from '@/stores/tenant-store';
import { usePosStore } from '@/stores/pos-store';

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

// Login via Zalo Mini App
export async function loginWithZaloMiniApp(
  token: string,
  accessToken: string,
  tenantCode?: string,
  profile?: { name?: string; avatar?: string }
) {
  if (tenantCode) {
    localStorage.setItem('active_tenant_code', tenantCode);
    localStorage.removeItem('custom_api_base_url');
  } else {
    // Ensure we call the root API for global auth (registration)
    localStorage.removeItem('active_tenant_code');
    localStorage.removeItem('custom_api_base_url');
  }

  const { session } = await apiFetch<{ session: any }>('/api/auth/zalo/mini-app', {
    method: 'POST',
    body: JSON.stringify({
      token,
      accessToken,
      profileName: profile?.name,
      profileAvatar: profile?.avatar,
    }),
  });

  if (session) {
    // Set the session directly using Supabase client
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    // And also update store explicitly if needed (setSession listener might catch it, but good to be explicit)
    useAuthStore.getState().setSession(session);
  }

  return session;
}

// Logout
export async function logout() {
  await supabase.auth.signOut();
  useAuthStore.getState().logout();
  useTenantStore.getState().clearAll();
  usePosStore.getState().clearCart();
  localStorage.removeItem('active_tenant_code');
  localStorage.removeItem('custom_api_base_url');
}

// Listen to auth state changes
export function onAuthStateChange(callback: (session: any) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}
