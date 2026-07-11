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
    
    let errMsg = errorData.error || errorData.message || `Lỗi hệ thống (${response.status})`;
    if (errorData.details && typeof errorData.details === 'object' && errorData.details.message) {
      errMsg = errorData.details.message; // Detailed Supabase/Auth error
    } else if (typeof errorData.details === 'string') {
      errMsg = errorData.details;
    }

    // Append full JSON data for debugging purposes
    const fullErrorStr = typeof errMsg === 'string' 
      ? `${errMsg} - Chi tiết: ${JSON.stringify(errorData)}`
      : JSON.stringify(errorData);

    throw new Error(fullErrorStr);
  }

  return response.json();
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
