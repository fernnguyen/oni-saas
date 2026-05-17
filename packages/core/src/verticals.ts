/**
 * Vertical Registry — defines features and behavior per industry type.
 *
 * Consumed by:
 * - Frontend: nav filtering, POS layout selection, registration form
 * - Backend: entity validation, feature gating
 */

export const INDUSTRY_TYPES = [
  'retail',
  'fnb',
  'billiards',
  'sports_court',
  'lodging',
  'fashion',
  'service_hourly',
] as const;

export type IndustryType = (typeof INDUSTRY_TYPES)[number];

export interface VerticalFeatures {
  /** Barcode scanning in POS */
  barcode_scan: boolean;
  /** Location resources: tables, courts, rooms */
  location_resource: boolean;
  /** Time-based billing (hourly rate) */
  hourly_billing: boolean;
  /** Kitchen Display System for order preparation */
  kitchen_display: boolean;
  /** Reservation / booking system */
  reservation: boolean;
  /** Product variants (size, color) */
  product_variants: boolean;
}

export interface ResourceTemplate {
  /** DB value: 'table' | 'court' | 'room' */
  type: string;
  /** Display label: Bàn, Sân, Phòng */
  label: string;
  /** Icon emoji */
  icon: string;
  /** Sub-types for admin to choose (e.g. VIP, Standard) */
  subTypes: { value: string; label: string }[];
  /** Session action labels — localized per vertical */
  actions: {
    checkIn: string;
    checkOut: string;
    payAndClose: string;
  };
  /** Which extended sections to show in SlideOver and forms */
  sections: {
    guestRegistration: boolean;
    bookingSource: boolean;
    bedType: boolean;
    amenities: boolean;
    overnightRate: boolean;
    depositAmount: boolean;
    surfaceType: boolean;
    expectedReturn: boolean;
  };
  /** Localized labels for UI */
  metaLabels: {
    expectedReturn: string;
    sessionInfo: string;
    tabServices: string;
  };
}

export interface VerticalConfig {
  label: string;
  icon: string;
  description: string;
  features: VerticalFeatures;
  /** POS screen layout type */
  posLayout: 'product_grid' | 'table_map' | 'room_map';
  /** Extra data-plane entities beyond the core 15 */
  extraEntities: string[];
  /** Resource type label for Location Resources (if applicable) */
  resourceLabel?: string;
  /** Resource type value for Location Resources */
  resourceType?: string;
  /** Template config for resource management (if applicable) */
  resourceTemplate?: ResourceTemplate;
  /** Display label for the POS screen and navigation */
  posLabel: string;
}

/* ─── Template presets ─── */

const TABLE_TEMPLATE: ResourceTemplate = {
  type: 'table', label: 'Bàn', icon: '🍽',
  subTypes: [
    { value: 'standard', label: 'Bàn thường' },
    { value: 'vip', label: 'Bàn VIP' },
    { value: 'outdoor', label: 'Bàn ngoài trời' },
  ],
  actions: { checkIn: 'Mở bàn', checkOut: 'Trả bàn', payAndClose: 'Thanh toán & Trả bàn' },
  sections: {
    guestRegistration: false, bookingSource: false, bedType: false, amenities: false,
    overnightRate: false, depositAmount: false, surfaceType: false, expectedReturn: false,
  },
  metaLabels: { expectedReturn: 'Dự kiến trả bàn', sessionInfo: 'Thông tin phiên', tabServices: 'Bàn & Dịch vụ' },
};

const BILLIARDS_TABLE_TEMPLATE: ResourceTemplate = {
  type: 'table', label: 'Bàn', icon: '🎱',
  subTypes: [
    { value: 'standard', label: 'Bàn thường' },
    { value: 'vip', label: 'Bàn VIP' },
    { value: '3_cushion', label: 'Bàn 3 băng' },
  ],
  actions: { checkIn: 'Mở bàn', checkOut: 'Kết thúc', payAndClose: 'Thanh toán & Kết thúc' },
  sections: {
    guestRegistration: false, bookingSource: false, bedType: false, amenities: false,
    overnightRate: false, depositAmount: false, surfaceType: false, expectedReturn: false,
  },
  metaLabels: { expectedReturn: 'Dự kiến kết thúc', sessionInfo: 'Thông tin phiên', tabServices: 'Bàn & Dịch vụ' },
};

const COURT_TEMPLATE: ResourceTemplate = {
  type: 'court', label: 'Sân', icon: '🏸',
  subTypes: [
    { value: 'standard', label: 'Sân thường' },
    { value: 'vip', label: 'Sân VIP' },
    { value: 'indoor', label: 'Sân trong nhà' },
  ],
  actions: { checkIn: 'Mở sân', checkOut: 'Kết thúc', payAndClose: 'Thanh toán & Kết thúc' },
  sections: {
    guestRegistration: false, bookingSource: false, bedType: false, amenities: false,
    overnightRate: false, depositAmount: false, surfaceType: true, expectedReturn: true,
  },
  metaLabels: { expectedReturn: 'Dự kiến kết thúc', sessionInfo: 'Thông tin phiên', tabServices: 'Sân & Dịch vụ' },
};

const ROOM_TEMPLATE: ResourceTemplate = {
  type: 'room', label: 'Phòng', icon: '🛏',
  subTypes: [
    { value: 'standard', label: 'Standard' },
    { value: 'deluxe', label: 'Deluxe' },
    { value: 'vip', label: 'VIP' },
    { value: 'suite', label: 'Suite' },
  ],
  actions: { checkIn: 'Nhận phòng', checkOut: 'Trả phòng', payAndClose: 'Thanh toán & Trả phòng' },
  sections: {
    guestRegistration: true, bookingSource: true, bedType: true, amenities: true,
    overnightRate: true, depositAmount: true, surfaceType: false, expectedReturn: true,
  },
  metaLabels: { expectedReturn: 'Dự kiến trả phòng', sessionInfo: 'Thông tin thuê', tabServices: 'Phòng & Dịch vụ' },
};

const SERVICE_ROOM_TEMPLATE: ResourceTemplate = {
  type: 'room', label: 'Phòng/Máy', icon: '🖥',
  subTypes: [
    { value: 'standard', label: 'Phòng thường' },
    { value: 'vip', label: 'Phòng VIP' },
    { value: 'machine', label: 'Máy' },
  ],
  actions: { checkIn: 'Bắt đầu', checkOut: 'Kết thúc', payAndClose: 'Thanh toán & Kết thúc' },
  sections: {
    guestRegistration: false, bookingSource: false, bedType: false, amenities: false,
    overnightRate: false, depositAmount: false, surfaceType: false, expectedReturn: true,
  },
  metaLabels: { expectedReturn: 'Dự kiến kết thúc', sessionInfo: 'Thông tin phiên', tabServices: 'Dịch vụ' },
};

export const VERTICAL_REGISTRY: Record<IndustryType, VerticalConfig> = {
  retail: {
    label: 'Bán lẻ',
    icon: '🛒',
    description: 'Cửa hàng tạp hóa, siêu thị mini, shop bán lẻ tổng hợp',
    features: {
      barcode_scan: true,
      location_resource: false,
      hourly_billing: false,
      kitchen_display: false,
      reservation: false,
      product_variants: false,
    },
    posLayout: 'product_grid',
    extraEntities: [],
    posLabel: 'Bán tại quầy',
  },

  fnb: {
    label: 'Nhà hàng / Quán cafe',
    icon: '🍔',
    description: 'Quán ăn, quán cafe, trà sữa, nhà hàng nhỏ',
    features: {
      barcode_scan: false,
      location_resource: true,
      hourly_billing: false,
      kitchen_display: true,
      reservation: true,
      product_variants: false,
    },
    posLayout: 'table_map',
    extraEntities: ['location_resources'],
    resourceLabel: 'Bàn',
    resourceType: 'table',
    resourceTemplate: TABLE_TEMPLATE,
    posLabel: 'Thu ngân',
  },

  billiards: {
    label: 'Bi-a',
    icon: '🎱',
    description: 'Quán bi-a, bi-a phỏm, pool',
    features: {
      barcode_scan: false,
      location_resource: true,
      hourly_billing: true,
      kitchen_display: false,
      reservation: false,
      product_variants: false,
    },
    posLayout: 'table_map',
    extraEntities: ['location_resources'],
    resourceLabel: 'Bàn',
    resourceType: 'table',
    resourceTemplate: BILLIARDS_TABLE_TEMPLATE,
    posLabel: 'Thu ngân',
  },

  sports_court: {
    label: 'Sân thể thao',
    icon: '🏸',
    description: 'Sân Pickleball, cầu lông, bóng đá mini, tennis',
    features: {
      barcode_scan: false,
      location_resource: true,
      hourly_billing: true,
      kitchen_display: false,
      reservation: true,
      product_variants: false,
    },
    posLayout: 'table_map',
    extraEntities: ['location_resources'],
    resourceLabel: 'Sân',
    resourceType: 'court',
    resourceTemplate: COURT_TEMPLATE,
    posLabel: 'Thu ngân',
  },

  lodging: {
    label: 'Nhà nghỉ / Khách sạn',
    icon: '🏨',
    description: 'Nhà nghỉ, khách sạn mini, homestay, nhà trọ',
    features: {
      barcode_scan: false,
      location_resource: true,
      hourly_billing: true,
      kitchen_display: false,
      reservation: true,
      product_variants: false,
    },
    posLayout: 'room_map',
    extraEntities: ['location_resources'],
    resourceLabel: 'Phòng',
    resourceType: 'room',
    resourceTemplate: ROOM_TEMPLATE,
    posLabel: 'Lễ tân',
  },

  fashion: {
    label: 'Thời trang',
    icon: '👗',
    description: 'Shop quần áo, giày dép, phụ kiện thời trang',
    features: {
      barcode_scan: true,
      location_resource: false,
      hourly_billing: false,
      kitchen_display: false,
      reservation: false,
      product_variants: true,
    },
    posLayout: 'product_grid',
    extraEntities: [],
    posLabel: 'Bán tại quầy',
  },

  service_hourly: {
    label: 'Dịch vụ theo giờ',
    icon: '⏰',
    description: 'Quán game, karaoke, phòng tập, coworking space',
    features: {
      barcode_scan: false,
      location_resource: true,
      hourly_billing: true,
      kitchen_display: false,
      reservation: false,
      product_variants: false,
    },
    posLayout: 'table_map',
    extraEntities: ['location_resources'],
    resourceLabel: 'Phòng/Máy',
    resourceType: 'room',
    resourceTemplate: SERVICE_ROOM_TEMPLATE,
    posLabel: 'Thu ngân',
  },
};

/**
 * Check if a given industry type is valid.
 */
export function isValidIndustryType(value: string): value is IndustryType {
  return INDUSTRY_TYPES.includes(value as IndustryType);
}

/**
 * Get vertical config for an industry type. Falls back to 'retail' if invalid.
 */
export function getVerticalConfig(industryType: string): VerticalConfig {
  if (isValidIndustryType(industryType)) {
    return VERTICAL_REGISTRY[industryType];
  }
  return VERTICAL_REGISTRY.retail;
}

/**
 * Nav-level visibility keys that map to vertical features.
 * Used by Sidebar to filter nav items based on tenant's industry.
 */
export const NAV_FEATURE_GATES: Record<string, keyof VerticalFeatures> = {
  'location_resources': 'location_resource',
  'kitchen_display': 'kitchen_display',
  'reservations': 'reservation',
};
