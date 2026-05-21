export function cleanSku(sku: string | null | undefined): string {
  if (!sku) return ''
  const trimmed = String(sku).trim()
  const match = trimmed.match(/^P-[A-Z0-9]{8}-(.*)$/i)
  return match ? match[1] : trimmed
}

export function prefixSku(sku: string | null | undefined, tenantHash: string): string {
  if (!sku) return ''
  const trimmed = String(sku).trim()
  if (!trimmed) return ''
  if (trimmed.startsWith(`P-${tenantHash}-`)) return trimmed
  return `P-${tenantHash}-${trimmed}`
}
