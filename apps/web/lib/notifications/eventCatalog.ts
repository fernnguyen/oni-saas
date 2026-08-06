export type NotificationEventGroup = 'operations' | 'hrm';
export type NotificationEventAudience = 'all' | 'management' | 'employee';

export type HrmManagementNotificationRoutingConfig = {
  role_codes: string[];
  requester_department_managers: boolean;
  department_ids: string[];
};

export type LeaveNotificationRoutingConfig = HrmManagementNotificationRoutingConfig;

export type NotificationChannelsConfig = {
  telegram: { enabled: boolean; chat_id?: string };
  push: { enabled: boolean; roles: string[] };
  routing?: HrmManagementNotificationRoutingConfig;
};

export type NotificationEventDefinition = {
  id: string;
  label: string;
  group: NotificationEventGroup;
  defaultEnabled: boolean;
  allowTelegram: boolean;
  audience: NotificationEventAudience;
  audienceLabel?: string;
  defaultChannels: NotificationChannelsConfig;
};

export const HRM_NOTIFICATION_EVENTS = {
  leaveRequested: 'HRM_LEAVE_REQUESTED',
  leaveStatusChanged: 'HRM_LEAVE_STATUS_CHANGED',
  salaryAdvanceRequested: 'HRM_SALARY_ADVANCE_REQUESTED',
  salaryAdvanceStatusChanged: 'HRM_SALARY_ADVANCE_STATUS_CHANGED',
} as const;

function channels(telegramEnabled: boolean): NotificationChannelsConfig {
  return {
    telegram: { enabled: telegramEnabled },
    push: { enabled: true, roles: [] },
  };
}

export const DEFAULT_HRM_MANAGEMENT_NOTIFICATION_ROUTING: Readonly<HrmManagementNotificationRoutingConfig> = {
  role_codes: ['owner', 'admin'],
  requester_department_managers: true,
  department_ids: [],
};

export const DEFAULT_LEAVE_NOTIFICATION_ROUTING = DEFAULT_HRM_MANAGEMENT_NOTIFICATION_ROUTING;

export const NOTIFICATION_EVENT_CATALOG: readonly NotificationEventDefinition[] = [
  { id: 'ORDER_CREATED', label: 'Đơn hàng mới', group: 'operations', defaultEnabled: false, allowTelegram: true, audience: 'all', defaultChannels: channels(true) },
  { id: 'PAYMENT_RECEIVED', label: 'Thanh toán thành công', group: 'operations', defaultEnabled: false, allowTelegram: true, audience: 'all', defaultChannels: channels(true) },
  { id: 'CUSTOMER_CREATED', label: 'Khách hàng mới', group: 'operations', defaultEnabled: false, allowTelegram: true, audience: 'all', defaultChannels: channels(true) },
  { id: 'ORDER_CANCELLED', label: 'Hủy đơn hàng', group: 'operations', defaultEnabled: false, allowTelegram: true, audience: 'all', defaultChannels: channels(true) },
  { id: 'ORDER_RETURNED', label: 'Khách trả hàng', group: 'operations', defaultEnabled: false, allowTelegram: true, audience: 'all', defaultChannels: channels(true) },
  { id: 'QR_ORDER_CREATED', label: 'Gọi món qua QR', group: 'operations', defaultEnabled: true, allowTelegram: false, audience: 'all', defaultChannels: channels(false) },
  { id: 'QR_SESSION_CREATED', label: 'Yêu cầu mở bàn ăn QR', group: 'operations', defaultEnabled: true, allowTelegram: false, audience: 'all', defaultChannels: channels(false) },
  { id: 'DAILY_DIGEST', label: 'Báo cáo tổng kết doanh thu cuối ngày', group: 'operations', defaultEnabled: false, allowTelegram: true, audience: 'all', defaultChannels: channels(true) },
  { id: 'EXPIRING_BATCHES', label: 'Cảnh báo lô sắp hết hạn', group: 'operations', defaultEnabled: false, allowTelegram: true, audience: 'all', defaultChannels: channels(true) },
  { id: 'LOW_STOCK', label: 'Cảnh báo sắp hết hàng', group: 'operations', defaultEnabled: false, allowTelegram: true, audience: 'all', defaultChannels: channels(true) },
  {
    id: HRM_NOTIFICATION_EVENTS.leaveRequested,
    label: 'Đơn nghỉ phép mới / yêu cầu huỷ đơn',
    group: 'hrm',
    defaultEnabled: true,
    allowTelegram: false,
    audience: 'management',
    audienceLabel: 'Nhóm quyền được chọn và trưởng bộ phận liên quan',
    defaultChannels: {
      ...channels(false),
      routing: {
        ...DEFAULT_HRM_MANAGEMENT_NOTIFICATION_ROUTING,
        role_codes: [...DEFAULT_HRM_MANAGEMENT_NOTIFICATION_ROUTING.role_codes],
        department_ids: [],
      },
    },
  },
  {
    id: HRM_NOTIFICATION_EVENTS.leaveStatusChanged,
    label: 'Trạng thái đơn nghỉ phép thay đổi',
    group: 'hrm',
    defaultEnabled: true,
    allowTelegram: false,
    audience: 'employee',
    audienceLabel: 'Nhân viên, người xử lý và nhóm quản lý được chọn',
    defaultChannels: {
      ...channels(false),
      routing: {
        ...DEFAULT_HRM_MANAGEMENT_NOTIFICATION_ROUTING,
        role_codes: [...DEFAULT_HRM_MANAGEMENT_NOTIFICATION_ROUTING.role_codes],
        department_ids: [],
      },
    },
  },
  {
    id: HRM_NOTIFICATION_EVENTS.salaryAdvanceRequested,
    label: 'Yêu cầu ứng lương mới',
    group: 'hrm',
    defaultEnabled: true,
    allowTelegram: false,
    audience: 'management',
    audienceLabel: 'Nhóm quyền được chọn và trưởng bộ phận liên quan',
    defaultChannels: {
      ...channels(false),
      routing: {
        ...DEFAULT_HRM_MANAGEMENT_NOTIFICATION_ROUTING,
        role_codes: [...DEFAULT_HRM_MANAGEMENT_NOTIFICATION_ROUTING.role_codes],
        department_ids: [],
      },
    },
  },
  {
    id: HRM_NOTIFICATION_EVENTS.salaryAdvanceStatusChanged,
    label: 'Trạng thái ứng lương thay đổi',
    group: 'hrm',
    defaultEnabled: true,
    allowTelegram: false,
    audience: 'employee',
    audienceLabel: 'Nhân viên, người xử lý và nhóm quản lý được chọn',
    defaultChannels: {
      ...channels(false),
      routing: {
        ...DEFAULT_HRM_MANAGEMENT_NOTIFICATION_ROUTING,
        role_codes: [...DEFAULT_HRM_MANAGEMENT_NOTIFICATION_ROUTING.role_codes],
        department_ids: [],
      },
    },
  },
];

const eventById = new Map(
  NOTIFICATION_EVENT_CATALOG.map((event) => [event.id, event]),
);

export function getNotificationEventDefinition(
  eventName: string,
): NotificationEventDefinition | undefined {
  return eventById.get(eventName);
}

export function getDefaultNotificationChannels(
  eventName: string,
): NotificationChannelsConfig {
  const defaults = getNotificationEventDefinition(eventName)?.defaultChannels
    ?? channels(true);

  return {
    telegram: { ...defaults.telegram },
    push: { ...defaults.push, roles: [...defaults.push.roles] },
    ...(defaults.routing
      ? {
          routing: {
            ...defaults.routing,
            role_codes: [...defaults.routing.role_codes],
            department_ids: [...defaults.routing.department_ids],
          },
        }
      : {}),
  };
}
