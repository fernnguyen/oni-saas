'use client';

import React from 'react';
import { getVerticalConfig, type VerticalFeatures } from '@oni/core';
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  UserSearch,
  Ticket,
  Globe,
  Activity,
  Settings,
  User,
  Link,
  Shield,
  Store,
  ShoppingBag,
  Undo2,
  Users,
  FileQuestion,
  FileCheck,
  PackageCheck,
  MapPin,
  Package,
  FolderTree,
  Warehouse,
  Factory,
  Wallet,
  Scale,
  TrendingUp,
  BarChart3,
  LineChart,
  Receipt,
  ArrowLeftRight,
  Network,
  Contact,
  Percent,
  Landmark,
  Users2,
  Sliders,
  HelpCircle,
  Trash2,
  Truck,
  CalendarCheck,
  BedDouble,
  Megaphone,
  Smartphone
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Permission code required to see this item. Omit = always visible. */
  permission?: string;
  /** Vertical feature gate. If set, item only shows when this feature is enabled. */
  featureGate?: keyof VerticalFeatures;
  exact?: boolean;
  /** Highlight this item with special styling */
  highlight?: boolean;
  /** Temporarily hide this item */
  hidden?: boolean;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

interface BuildNavOptions {
  basePath: string;
  supportHref: string;
  tenantHref?: string;
  connectorsHref?: string;
  settingsHref?: string;
  tenantBillingHref?: string;
  tenantSettingsHref?: string;
  tenantTeamHref?: string;
  tenantRolesHref?: string;
  /** 'control' = org management; 'shop' = shop operations; 'super' = superadmin panel */
  context?: 'control' | 'shop' | 'super';
  /** Industry type of the tenant — controls which nav items are visible */
  industryType?: string;
  /** Whether the advanced P2P warehouse add-on is unlocked for the tenant */
  hasP2pAccess?: boolean;
}

// Backward compatibility exports & aliases for safety across the monorepo
export const IconHelp = HelpCircle;
export const IconHome = LayoutDashboard;
export const IconBox = Package;
export const IconClipboard = ShoppingBag;
export const IconReturn = Undo2;
export const IconTruck = Truck;
export const IconWarehouse = Warehouse;
export const IconGrid = FolderTree;
export const IconUsers = Users;
export const IconShop = Store;
export const IconPos = Store;
export const IconChart = LineChart;
export const IconMoney = CreditCard;
export const IconBarChart = BarChart3;
export const IconCashbook = Wallet;
export const IconReceipt = Receipt;
export const IconPlugin = Link;
export const IconSettings = Settings;
export const IconShield = Shield;
export const IconBuilding = Building2;
export const IconActivity = Activity;
export const IconTable = MapPin;
export const IconTrash = Trash2;

export function IconFacebook({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

/**
 * Builds nav groups filtered by the user's permission set.
 * Pass an empty array to hide all permission-gated items (e.g. loading state).
 */
export function buildNavGroups(options: BuildNavOptions, permissions: string[]): NavGroup[] {
  const base = normalizeBasePath(options.basePath);
  const can = (p: string) => permissions.includes(p);
  const vertical = getVerticalConfig(options.industryType || 'retail');

  const filter = (groups: NavGroup[]) => {
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (item.hidden) return false;
          // Permission check
          if (item.permission && !can(item.permission)) return false;
          // Vertical feature gate check
          if (item.featureGate && !vertical.features[item.featureGate]) return false;
          return true;
        }),
      }))
      .filter((group) => group.items.length > 0);
  };

  if (options.context === 'super') {
    return filter([
      {
        items: [
          { href: '/super/dashboard', label: 'Tổng quan', icon: LayoutDashboard, exact: true },
        ],
      },
      {
        label: 'Quản lý hệ thống',
        items: [
          { href: '/super/tenants',    label: 'Tất cả tổ chức',  icon: Building2 },
          { href: '/super/plans',      label: 'Gói dịch vụ',     icon: CreditCard },
          { href: '/super/users',      label: 'Tìm người dùng',  icon: UserSearch },
          { href: '/super/invitations', label: 'Quản lý mã mời',  icon: Ticket },
          { href: '/super/reserved-subdomains', label: 'Tên miền dự trữ', icon: Globe },
          { href: '/super/audit-logs', label: 'Nhật ký hệ thống', icon: Activity },
          { href: '/super/settings',   label: 'Cài đặt chung',   icon: Settings },
          { href: '/super/notifications', label: 'Thông báo đẩy', icon: Megaphone },
          { href: '/super/app-versions', label: 'Cập nhật App', icon: Smartphone },
        ],
      },
      {
        label: 'Cá nhân',
        items: [
          { href: '/super/account', label: 'Tài khoản', icon: User },
        ],
      },
    ]);
  }

  if (options.context === 'control') {
    return filter([
      {
        items: [
          { href: base || '/dashboard', label: 'Tổng quan', icon: LayoutDashboard, exact: true },
        ],
      },
      {
        label: 'Quản lý',
        items: [
          { href: options.tenantHref ?? '#',     label: 'Tổ chức',         icon: Building2, permission: 'tenants.view' },
          { href: options.connectorsHref ?? '#', label: 'Kết nối dữ liệu', icon: Link,   permission: 'connectors.view' },
        ],
      },
      {
        label: 'Hệ thống',
        items: [
          { href: '#plan-modal', label: 'Gói dịch vụ', icon: CreditCard,    permission: 'settings.view' },
          { href: joinPath(base, '/roles'),   label: 'Phân quyền',  icon: Shield,   permission: 'roles.view' },
          { href: options.settingsHref ?? '#', label: 'Cài đặt',   icon: Settings, permission: 'settings.view' },
        ],
      },
    ]);
  }

  return filter([
    {
      items: [
        { href: base || '/', label: 'Tổng quan', icon: LayoutDashboard, exact: true },
      ],
    },
    {
      label: 'Bán hàng',
      items: [
        { href: joinPath(base, '/channels/pos'), label: vertical.posLabel || 'Bán tại quầy', icon: Store,      permission: 'pos.use', highlight: true },
        { href: joinPath(base, '/reservations'), label: 'Đặt phòng trước', icon: CalendarCheck, permission: 'orders.view', featureGate: 'reservation' },
        { href: joinPath(base, '/orders'),   label: 'Đơn hàng',      icon: ShoppingBag, permission: 'orders.view' },
        { href: joinPath(base, '/returns'),  label: 'Đơn trả hàng',  icon: Undo2,    permission: 'returns.view' },
        { href: joinPath(base, '/customers'), label: 'Khách hàng',   icon: Users,     permission: 'customers.view' },
      ],
    },
    ...(options.hasP2pAccess ? [
      {
        label: 'Mua sắm & Phê duyệt',
        items: [
          { href: joinPath(base, '/p2p/pr'), label: 'Đề xuất mua (PR)', icon: FileQuestion, permission: 'dashboard.view' },
          { href: joinPath(base, '/p2p/po'), label: 'Đơn đặt hàng (PO)', icon: FileCheck, permission: 'inventory.view' },
          { href: joinPath(base, '/p2p/grn'), label: 'Nhập kho đối chiếu', icon: PackageCheck, permission: 'inventory.view' },
        ],
      }
    ] : []),
    {
      label: 'Danh mục',
      items: [
        { href: joinPath(base, '/resources'),  label: `Quản lý ${vertical.resourceLabel || 'vị trí'}`, icon: MapPin, permission: 'products.view', featureGate: 'location_resource' },
        { href: joinPath(base, '/products'),   label: 'Sản phẩm',    icon: Package,       permission: 'products.view' },
        { href: joinPath(base, '/categories'), label: 'Danh mục sản phẩm',    icon: FolderTree,      permission: 'products.view' },
        { href: joinPath(base, '/settings/warehouses'), label: 'Danh mục kho', icon: Warehouse, permission: 'settings.view' },
      ],
    },
    {
      label: 'Vận hành',
      items: [
        { href: joinPath(base, '/housekeeping'), label: 'Buồng phòng', icon: BedDouble, permission: 'housekeeping.view', featureGate: 'location_resource' },
        { href: joinPath(base, '/inventory'), label: 'Kho',             icon: Warehouse, permission: 'inventory.view' },
        // Tạm thời comment Vận chuyển vì chưa implement
        // { href: joinPath(base, '/shipping'),  label: 'Vận chuyển',      icon: Truck,     permission: 'shipping.view' },
        { href: joinPath(base, '/suppliers'),  label: 'Nhà cung cấp',   icon: Factory,     permission: 'inventory.view' },
        // Tạm thời comment Quản lý đối tác vì chưa implement
        // { href: joinPath(base, '/partners'),  label: 'Quản lý đối tác', icon: Handshake,     permission: 'partners.view' },
      ],
    },
    {
      label: 'Tài chính',
      items: [
        { href: joinPath(base, '/cashbook'),           label: 'Sổ quỹ',       icon: Wallet,  permission: 'cashbook.view' },
        { href: joinPath(base, '/debt'),       label: 'Công nợ',          icon: Scale,     permission: 'debt.view' },
      ],
    },
    {
      label: 'Kênh bán hàng',
      items: [
        { href: joinPath(base, '/channels/facebook'), label: 'Facebook',     icon: IconFacebook, permission: 'channels.view', hidden: true },
        { href: joinPath(base, '/channels/ecom'),     label: 'Sàn TMĐT',     icon: Store,     permission: 'channels.view', hidden: true },
      ],
    },
    {
      label: 'Báo cáo',
      items: [
        { href: joinPath(base, '/reports/overview'),    label: 'Tổng quan',    icon: TrendingUp, permission: 'reports.view_shop' },
        { href: joinPath(base, '/reports/inventory'),   label: 'Báo cáo kho',  icon: BarChart3,permission: 'inventory.view' },
        ...(options.hasP2pAccess ? [
          { href: joinPath(base, '/p2p/reports'),       label: 'Báo cáo mua sắm', icon: ShoppingBag, permission: 'reports.view_shop' },
        ] : []),
        { href: joinPath(base, '/reports/accounting'),  label: 'Kế toán',      icon: LineChart,    permission: 'accounting.view' },
        { href: joinPath(base, '/reports/tax'),        label: 'Báo cáo thuế', icon: Receipt,  permission: 'accounting.view' },
        { href: joinPath(base, '/reports/cod'),        label: 'Đối soát COD', icon: ArrowLeftRight,    permission: 'cod.view', hidden: true },
      ],
    },
    {
      label: 'Quản lý chi nhánh',
      items: [
        { href: options.settingsHref ?? '#',   label: 'Cài đặt',         icon: Settings, permission: 'settings.view', exact: true },
        { href: joinPath(base, '/settings/tax'), label: 'Thuế & Khóa sổ', icon: Receipt, permission: 'settings.view' },
        { href: joinPath(base, '/settings/departments'), label: 'Phòng ban', icon: Network, permission: 'departments.view' },
        { href: joinPath(base, '/settings/employees'),  label: 'Nhân viên',   icon: Contact,     permission: 'dashboard.view' },
        { href: joinPath(base, '/settings/cost-allocation'), label: 'Phân bổ chi phí', icon: Percent, permission: 'settings.view' },
        { href: joinPath(base, '/settings/assets'), label: 'Tài sản', icon: Landmark, permission: 'assets.view' },
        { href: joinPath(base, '/settings/warehouses'), label: 'Danh mục kho', icon: Warehouse, permission: 'settings.view' },
      ],
    },
    {
      label: 'Hệ thống',
      items: [
        { href: options.tenantBillingHref ?? '#', label: 'Gói dịch vụ', icon: CreditCard,    permission: 'settings.view' },
        { href: options.tenantTeamHref ?? '#',    label: 'Thành viên',      icon: Users2,    permission: 'users.view' },
        { href: options.tenantRolesHref ?? '#',   label: 'Phân quyền',      icon: Shield,   permission: 'roles.view' },
        { href: options.tenantSettingsHref ?? '#', label: 'Cài đặt tổ chức', icon: Sliders, permission: 'settings.view', exact: true },
      ],
    },
  ]);
}

export function joinPath(basePath: string, suffix: string) {
  const base = normalizeBasePath(basePath);
  if (!base) return suffix;
  return `${base}${suffix}`;
}

function normalizeBasePath(value: string) {
  if (!value || value === '/') return '';
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
