import {getApiBaseUrl, getApiHeaders} from './config';

export type ResourceStatus =
  | 'available'
  | 'occupied'
  | 'reserved'
  | 'cleaning'
  | 'dirty'
  | 'maintenance'
  | 'deleted'
  | string;

export interface AdvancedPricing {
  enabled?: boolean;
  base_hours?: number;
  base_price?: number;
  next_hourly_rate?: number;
  grace_minutes?: number;
  progressive_rates?: Record<string, number>;
}

export interface ResourceMetadata {
  sub_type?: string;
  room_class?: string;
  bed_type?: string;
  weekend_rate?: string | number;
  overnight_rate?: string | number;
  daily_rate?: string | number;
  overnight_grace_hours?: number;
  daily_grace_hours?: number;
  surcharge_pct?: number;
  checkin_time?: string;
  checkout_time?: string;
  deposit_amount?: string | number;
  extra_bed_fee?: string | number;
  amenities?: string[];
  advanced_pricing?: AdvancedPricing;
  [key: string]: unknown;
}

export interface LocationResource {
  id: string;
  resource_id?: string;
  name: string;
  type: 'table' | 'court' | 'room';
  zone?: string;
  capacity?: string;
  hourly_rate?: string;
  sort_order?: string;
  status: ResourceStatus;
  current_order_id?: string | null;
  metadata?: string | ResourceMetadata | null;
}

export interface LocationResourcePayload {
  name: string;
  type: LocationResource['type'];
  zone: string;
  capacity: string;
  hourly_rate: string;
  metadata: string;
}

type ResourceListResponse = {
  data?: LocationResource[];
};

export interface ResourceShopSettings {
  resource_sub_types?: string | Record<string, unknown>;
  [key: string]: unknown;
}

async function parseApiError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body?.error || body?.message || `Máy chủ trả về lỗi ${response.status}`;
  } catch {
    return `Máy chủ trả về lỗi ${response.status}`;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await getApiHeaders((init?.headers || {}) as Record<string, string>);
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return response.json() as Promise<T>;
}

export function parseResourceMetadata(
  metadata: LocationResource['metadata'],
): ResourceMetadata {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;

  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

export async function listLocationResources(
  shopId: string,
): Promise<LocationResource[]> {
  const result = await requestJson<ResourceListResponse>(
    `/api/shops/${shopId}/location-resources?limit=500`,
  );
  return result.data || [];
}

export function getResourceShopSettings(
  shopId: string,
): Promise<ResourceShopSettings> {
  return requestJson<ResourceShopSettings>(`/api/shops/${shopId}/settings`);
}

export async function createLocationResource(
  shopId: string,
  payload: LocationResourcePayload,
): Promise<LocationResource> {
  return requestJson<LocationResource>(
    `/api/shops/${shopId}/location-resources`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export async function updateLocationResource(
  shopId: string,
  resourceId: string,
  payload: Partial<LocationResourcePayload> & {status?: ResourceStatus},
): Promise<LocationResource> {
  return requestJson<LocationResource>(
    `/api/shops/${shopId}/location-resources/${resourceId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}
