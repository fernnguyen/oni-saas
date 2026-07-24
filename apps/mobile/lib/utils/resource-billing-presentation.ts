import { getVerticalConfig } from '@oni/core';

export type ResourceRentalType = 'hourly' | 'overnight' | 'daily';

type ResourceBillingPresentationInput = {
  shopVertical: string;
  resourceType?: string;
  rentalType?: string;
  hourlyRate: number;
  overnightRate: number;
  dailyRate: number;
};

type ResourceBillingSource = {
  type?: string;
  hourly_rate?: string | number | null;
  metadata?: string | Record<string, unknown> | null;
};

export type ResourceBillingPresentation = {
  title: string;
  methodLabel: string;
  rate: number;
  rateUnit: 'giờ' | 'đêm' | 'ngày' | null;
  showCost: boolean;
  rateBadgeLabel: string | null;
};

export type CheckoutSessionLabels = {
  sectionTitle: string;
  editTimeLabel: string;
  editFormTitle: string;
};

const getResourceLabel = (shopVertical: string, resourceType?: string) => {
  if (shopVertical === 'sports_court' || resourceType === 'court') return 'sân';
  if (shopVertical === 'service_hourly') return 'phòng / máy';
  if (shopVertical === 'lodging' || resourceType === 'room') return 'phòng';
  return 'bàn';
};

export function getResourceBillingPresentation({
  shopVertical,
  resourceType,
  rentalType,
  hourlyRate,
  overnightRate,
  dailyRate,
}: ResourceBillingPresentationInput): ResourceBillingPresentation {
  const vertical = getVerticalConfig(shopVertical);
  const resourceLabel = getResourceLabel(shopVertical, resourceType);

  if (!vertical.features.hourly_billing) {
    return {
      title: `Thông tin sử dụng ${resourceLabel}`,
      methodLabel: 'Tính theo món / dịch vụ',
      rate: 0,
      rateUnit: null,
      showCost: false,
      rateBadgeLabel: 'Không tính tiền giờ',
    };
  }

  if (shopVertical === 'lodging' && rentalType === 'overnight') {
    return {
      title: 'Tiền phòng qua đêm',
      methodLabel: 'Thuê qua đêm',
      rate: overnightRate,
      rateUnit: 'đêm',
      showCost: true,
      rateBadgeLabel: null,
    };
  }

  if (shopVertical === 'lodging' && rentalType === 'daily') {
    return {
      title: 'Tiền phòng theo ngày',
      methodLabel: 'Thuê theo ngày',
      rate: dailyRate,
      rateUnit: 'ngày',
      showCost: true,
      rateBadgeLabel: null,
    };
  }

  const title =
    shopVertical === 'lodging'
      ? 'Tiền phòng theo giờ'
      : shopVertical === 'billiards'
        ? 'Tiền bàn theo giờ'
        : shopVertical === 'sports_court'
          ? 'Phí sân theo giờ'
          : shopVertical === 'service_hourly'
            ? 'Phí dịch vụ theo giờ'
            : `Phí sử dụng ${resourceLabel} theo giờ`;

  return {
    title,
    methodLabel: 'Tính theo giờ',
    rate: hourlyRate,
    rateUnit: 'giờ',
    showCost: true,
    rateBadgeLabel: null,
  };
}

export function getResourceBillingPresentationForResource(
  shopVertical: string,
  resource: ResourceBillingSource
): ResourceBillingPresentation {
  let metadata: Record<string, unknown> = {};
  try {
    const parsed =
      typeof resource.metadata === 'string'
        ? JSON.parse(resource.metadata || '{}')
        : resource.metadata;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      metadata = parsed;
    }
  } catch {
    metadata = {};
  }

  const hourlyRate = Number(resource.hourly_rate) || 0;
  const overnightRate = Number(metadata.overnight_rate) || (hourlyRate * 3) || 200000;
  const dailyRate = Number(metadata.daily_rate) || overnightRate;

  return getResourceBillingPresentation({
    shopVertical,
    resourceType: resource.type,
    rentalType: String(metadata.rental_type || 'hourly'),
    hourlyRate,
    overnightRate,
    dailyRate,
  });
}

export function getCheckoutSessionLabels(shopVertical?: string): CheckoutSessionLabels {
  if (shopVertical === 'fnb') {
    return {
      sectionTitle: 'THÔNG TIN SỬ DỤNG BÀN',
      editTimeLabel: 'Sửa giờ kết thúc',
      editFormTitle: 'NHẬP GIỜ KẾT THÚC MỚI',
    };
  }

  if (shopVertical === 'billiards') {
    return {
      sectionTitle: 'CHI TIẾT THỜI GIAN CHƠI',
      editTimeLabel: 'Sửa giờ kết thúc',
      editFormTitle: 'NHẬP GIỜ KẾT THÚC MỚI',
    };
  }

  if (shopVertical === 'sports_court') {
    return {
      sectionTitle: 'THÔNG TIN SỬ DỤNG SÂN',
      editTimeLabel: 'Sửa giờ kết thúc',
      editFormTitle: 'NHẬP GIỜ KẾT THÚC MỚI',
    };
  }

  if (shopVertical === 'lodging') {
    return {
      sectionTitle: 'THÔNG TIN LƯU TRÚ',
      editTimeLabel: 'Sửa giờ trả phòng',
      editFormTitle: 'NHẬP GIỜ TRẢ PHÒNG MỚI',
    };
  }

  if (shopVertical === 'service_hourly') {
    return {
      sectionTitle: 'CHI TIẾT THỜI GIAN DỊCH VỤ',
      editTimeLabel: 'Sửa giờ kết thúc',
      editFormTitle: 'NHẬP GIỜ KẾT THÚC MỚI',
    };
  }

  return {
    sectionTitle: 'THÔNG TIN THỜI GIAN SỬ DỤNG',
    editTimeLabel: 'Sửa giờ kết thúc',
    editFormTitle: 'NHẬP GIỜ KẾT THÚC MỚI',
  };
}

export function formatResourceStartTime(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Chưa xác định';

  const normalizedValue =
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  const date = new Date(normalizedValue as string | number | Date);
  if (Number.isNaN(date.getTime())) return 'Chưa xác định';

  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
