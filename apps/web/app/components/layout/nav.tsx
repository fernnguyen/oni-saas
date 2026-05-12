'use client';

import React from 'react';

export interface NavItem {
  href: string;
  label: string;
  icon: ({ className }: { className?: string }) => React.ReactElement;
  /** Permission code required to see this item. Omit = always visible. */
  permission?: string;
  exact?: boolean;
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
  /** 'control' = org management; 'shop' = shop operations; 'super' = superadmin panel */
  context?: 'control' | 'shop' | 'super';
}

/**
 * Builds nav groups filtered by the user's permission set.
 * Pass an empty array to hide all permission-gated items (e.g. loading state).
 */
export function buildNavGroups(options: BuildNavOptions, permissions: string[]): NavGroup[] {
  const base = normalizeBasePath(options.basePath);
  const can = (p: string) => permissions.includes(p);

  const filter = (groups: NavGroup[]) =>
    groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.permission || can(item.permission)),
      }))
      .filter((group) => group.items.length > 0);

  if (options.context === 'super') {
    return filter([
      {
        items: [
          { href: '/super/dashboard', label: 'Tổng quan', icon: IconHome, exact: true },
        ],
      },
      {
        label: 'Quản lý hệ thống',
        items: [
          { href: '/super/tenants',    label: 'Tất cả tổ chức',  icon: IconBuilding },
          { href: '/super/plans',      label: 'Gói dịch vụ',     icon: IconMoney },
          { href: '/super/users',      label: 'Tìm người dùng',  icon: IconUsers },
          { href: '/super/audit-logs', label: 'Nhật ký hệ thống', icon: IconActivity },
        ],
      },
      {
        label: 'Cá nhân',
        items: [
          { href: '/super/account', label: 'Tài khoản', icon: IconSettings },
        ],
      },
    ]);
  }

  if (options.context === 'control') {
    return filter([
      {
        items: [
          { href: base || '/dashboard', label: 'Tổng quan', icon: IconHome, exact: true },
        ],
      },
      {
        label: 'Quản lý',
        items: [
          { href: options.tenantHref ?? '#',     label: 'Tổ chức',         icon: IconBuilding, permission: 'tenants.view' },
          { href: options.connectorsHref ?? '#', label: 'Kết nối dữ liệu', icon: IconPlugin,   permission: 'connectors.view' },
        ],
      },
      {
        label: 'Hệ thống',
        items: [
          { href: joinPath(base, '/billing'), label: 'Gói dịch vụ', icon: IconMoney,    permission: 'settings.view' },
          { href: joinPath(base, '/roles'),   label: 'Phân quyền',  icon: IconShield,   permission: 'roles.view' },
          { href: options.settingsHref ?? '#', label: 'Cài đặt',   icon: IconSettings, permission: 'settings.view' },
        ],
      },
    ]);
  }

  return filter([
    {
      label: 'Bán hàng',
      items: [
        { href: joinPath(base, '/channels/pos'), label: 'Bán tại quầy', icon: IconPos,      permission: 'pos.use' },
        { href: joinPath(base, '/orders'),   label: 'Đơn hàng',      icon: IconClipboard, permission: 'orders.view' },
        { href: joinPath(base, '/returns'),  label: 'Đơn trả hàng',  icon: IconReturn,    permission: 'returns.view' },
        { href: joinPath(base, '/customers'), label: 'Khách hàng',   icon: IconUsers,     permission: 'customers.view' },
      ],
    },
    {
      label: 'Danh mục',
      items: [
        { href: joinPath(base, '/products'),   label: 'Sản phẩm',    icon: IconBox,       permission: 'products.view' },
        { href: joinPath(base, '/categories'), label: 'Danh mục',    icon: IconGrid,      permission: 'products.view' },
        { href: joinPath(base, '/suppliers'),  label: 'Nhà cung cấp', icon: IconTruck,    permission: 'inventory.view' },
        { href: joinPath(base, '/employees'),  label: 'Nhân viên',   icon: IconUsers,     permission: 'dashboard.view' },
      ],
    },
    {
      label: 'Vận hành',
      items: [
        { href: joinPath(base, '/shipping'),  label: 'Vận chuyển',      icon: IconTruck,     permission: 'shipping.view' },
        { href: joinPath(base, '/inventory'), label: 'Kho',             icon: IconWarehouse, permission: 'inventory.view' },
        { href: joinPath(base, '/partners'),  label: 'Quản lý đối tác', icon: IconUsers,     permission: 'partners.view' },
        { href: joinPath(base, '/customers/debt'), label: 'Công nợ',   icon: IconMoney,     permission: 'debt.view' },
        { href: joinPath(base, '/cashbook'),           label: 'Sổ quỹ',       icon: IconReceipt,  permission: 'cashbook.view' },
      ],
    },
    {
      label: 'Kênh bán hàng',
      items: [
        { href: joinPath(base, '/channels/facebook'), label: 'Facebook',     icon: IconFacebook, permission: 'channels.view' },
        { href: joinPath(base, '/channels/ecom'),     label: 'Sàn TMĐT',     icon: IconShop,     permission: 'channels.view' },
      ],
    },
    {
      label: 'Báo cáo',
      items: [
        { href: joinPath(base, '/reports/overview'),    label: 'Tổng quan',    icon: IconBarChart, permission: 'reports.view_shop' },
        { href: joinPath(base, '/reports/accounting'), label: 'Kế toán',      icon: IconChart,    permission: 'accounting.view' },
        { href: joinPath(base, '/reports/tax'),        label: 'Báo cáo thuế', icon: IconReceipt,  permission: 'accounting.view' },
        { href: joinPath(base, '/reports/cod'),        label: 'Đối soát COD', icon: IconMoney,    permission: 'cod.view' },
      ],
    },
    {
      label: 'Hệ thống',
      items: [
        { href: joinPath(base, '/team'),       label: 'Thành viên',      icon: IconUsers,    permission: 'users.view' },
        { href: options.tenantHref ?? '#',     label: 'Tổ chức',         icon: IconBuilding, permission: 'tenants.view' },
        { href: options.connectorsHref ?? '#', label: 'Kết nối dữ liệu', icon: IconPlugin,   permission: 'connectors.view' },
        { href: joinPath(base, '/roles'),      label: 'Phân quyền',      icon: IconShield,   permission: 'roles.view' },
        { href: options.settingsHref ?? '#',   label: 'Cài đặt',         icon: IconSettings, permission: 'settings.view' },
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

export function IconHome({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}
export function IconBox({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}
export function IconClipboard({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}
export function IconReturn({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  );
}
export function IconTruck({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
    </svg>
  );
}
export function IconWarehouse({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
    </svg>
  );
}
export function IconGrid({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 3h6m-3-3v6" />
    </svg>
  );
}
export function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
export function IconFacebook({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}
export function IconShop({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  );
}
export function IconPos({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );
}
export function IconChart({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}
export function IconMoney({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}
export function IconBarChart({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}
export function IconReceipt({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
  );
}
export function IconPlugin({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}
export function IconSettings({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
export function IconHelp({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
export function IconShield({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}
export function IconBuilding({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}
export function IconActivity({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  );
}
export function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
