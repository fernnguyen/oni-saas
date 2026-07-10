import { getApiBaseUrl, getApiHeaders } from '@/lib/api-config';

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const headers = await getApiHeaders();

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  });

  if (response.status === 401) {
    // Session expired - clear auth and redirect
    const { useAuthStore } = await import('@/stores/auth-store');
    useAuthStore.getState().logout();
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `API error: ${response.status}`);
  }

  return response.json();
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
