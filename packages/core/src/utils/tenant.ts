import { sha256 } from 'js-sha256';

/**
 * Generates a consistent 8-character uppercase tenant hash from a tenant ID.
 * This is the central source of truth for tenant hashing across the system.
 */
export function getTenantHash(tenantId: string): string {
  if (!tenantId) return '';
  return sha256(tenantId).substring(0, 8).toUpperCase();
}
