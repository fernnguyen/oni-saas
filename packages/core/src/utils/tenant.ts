import crypto from 'crypto';

/**
 * Generates a consistent 8-character uppercase tenant hash from a tenant ID.
 * This is the central source of truth for tenant hashing across the system.
 */
export function getTenantHash(tenantId: string): string {
  if (!tenantId) return '';
  return crypto.createHash('sha256').update(tenantId).digest('hex').substring(0, 8).toUpperCase();
}
