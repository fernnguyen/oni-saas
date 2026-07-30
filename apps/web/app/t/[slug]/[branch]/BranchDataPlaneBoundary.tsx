'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { NotificationProvider } from '@/app/components/notifications/NotificationContext';
import { ShiftProvider } from '@/app/components/providers/ShiftProvider';
import { isLockedHrmPath } from '@/lib/hrm/routing';
import QRNotificationCenter from './channels/pos/components/QRNotificationCenter';

interface OperationalBoundaryProps {
  children: ReactNode;
  shopId: string;
  tenantId: string;
  branchId: string;
  hrmEnabled: boolean;
}

interface ShiftBoundaryProps {
  children: ReactNode;
  shopId: string;
  branchId: string;
  userEmail: string;
  permissions: string[];
  hrmEnabled: boolean;
}

export function BranchOperationalBoundary({
  children,
  shopId,
  tenantId,
  branchId,
  hrmEnabled,
}: OperationalBoundaryProps) {
  const pathname = usePathname();

  if (isLockedHrmPath(pathname, hrmEnabled)) {
    return children;
  }

  return (
    <NotificationProvider shopId={shopId} tenantId={tenantId}>
      {children}
      <QRNotificationCenter
        shopId={shopId}
        branchId={branchId}
        isGlobalDrawer={true}
      />
    </NotificationProvider>
  );
}

export function BranchShiftBoundary({
  children,
  shopId,
  branchId,
  userEmail,
  permissions,
  hrmEnabled,
}: ShiftBoundaryProps) {
  const pathname = usePathname();

  if (isLockedHrmPath(pathname, hrmEnabled)) {
    return children;
  }

  return (
    <ShiftProvider
      shopId={shopId}
      branchId={branchId}
      userEmail={userEmail}
      permissions={permissions}
    >
      {children}
    </ShiftProvider>
  );
}
