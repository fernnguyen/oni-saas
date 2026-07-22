export type ProductReviewStatus = 'pending' | 'confirmed'

export type QuickCreateSource = 'pos_quick_web' | 'pos_quick_mobile'

export interface QuickCreateProductMetadata {
  quick_create?: {
    source: QuickCreateSource
    review_status: ProductReviewStatus
    inventory_policy: 'allow_negative'
    created_at: string
  }
}

type ProductWithMetadata = { metadata?: unknown }

function parseMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

/**
 * Existing products have no quick-create metadata. Treating them as confirmed
 * keeps every current shop on its established behaviour without a migration.
 */
export function getProductReviewStatus(product: ProductWithMetadata): ProductReviewStatus {
  const quickCreate = parseMetadata(product.metadata).quick_create
  if (!quickCreate || typeof quickCreate !== 'object') return 'confirmed'
  return (quickCreate as Record<string, unknown>).review_status === 'pending' ? 'pending' : 'confirmed'
}

/** Only explicitly opted-in quick products may sell into negative inventory. */
export function allowsProductNegativeStock(product: ProductWithMetadata): boolean {
  const quickCreate = parseMetadata(product.metadata).quick_create
  return Boolean(
    quickCreate &&
    typeof quickCreate === 'object' &&
    (quickCreate as Record<string, unknown>).inventory_policy === 'allow_negative'
  )
}

export function buildQuickCreateMetadata(source: QuickCreateSource, now = new Date().toISOString()): QuickCreateProductMetadata {
  return {
    quick_create: {
      source,
      review_status: 'pending',
      inventory_policy: 'allow_negative',
      created_at: now,
    },
  }
}

export function normalizeProductLookup(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}
