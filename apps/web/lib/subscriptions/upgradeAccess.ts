const SUBSCRIPTION_MANAGE_PERMISSIONS = [
  'settings.manage',
  'tenants.manage',
  'billing.manage',
] as const;

export function canManageSubscription(permissions: readonly string[]): boolean {
  return SUBSCRIPTION_MANAGE_PERMISSIONS.some((permission) =>
    permissions.includes(permission),
  );
}

export function requestPlanUpgrade(
  feature: string,
  target: EventTarget = window,
): void {
  target.dispatchEvent(
    new CustomEvent('open-plan-modal', {
      detail: { feature },
    }),
  );
}
