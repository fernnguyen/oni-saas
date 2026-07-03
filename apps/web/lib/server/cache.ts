import { unstable_cache, revalidateTag } from 'next/cache'

// Tag pattern: `${shopId}:${entity}`
// All GET routes cache with this tag; all writes call invalidate().

export function shopTag(shopId: string, entity: string) {
  return `${shopId}:${entity}`
}

export function invalidate(shopId: string, entity: string) {
  try {
    revalidateTag(shopTag(shopId, entity), 'max')
  } catch (err) {
    // Suppress Next.js Invariant error when running outside of request context (e.g. CLI migration scripts)
  }
}

/**
 * Dev-safe cache wrapper.
 *
 * In development, `unstable_cache` / `revalidateTag` can behave inconsistently
 * due to HMR module reloads resetting the Data Cache state mid-session. This
 * causes writes to succeed but reads to return stale cached data. In dev we
 * skip Next.js Data Cache entirely and rely on the adapter's own 30-second
 * in-process tabCache for deduplication.
 *
 * In production, the full `unstable_cache` + `revalidateTag` pipeline is used.
 */
export function shopCache<T>(
  fn: () => Promise<T>,
  key: string[],
  opts: { tags: string[]; revalidate: number },
): Promise<T> {
  if (process.env.NODE_ENV !== 'production') return fn()
  return unstable_cache(fn, key, opts)()
}
