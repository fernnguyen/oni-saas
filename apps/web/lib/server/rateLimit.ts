/**
 * DB-backed rate limiter using Supabase.
 *
 * Rationale: In serverless/distributed environments (Vercel, Railway, etc.),
 * in-memory Maps are NOT shared across instances. This implementation stores
 * events in a lightweight Postgres table so limits are enforced globally.
 *
 * Trade-off: +2 DB queries per rate-limited call. Acceptable for low-frequency
 * sensitive operations (password reset, email lookup).
 */
import { getSupabaseAdminClient } from './supabaseAdmin';

/**
 * Check and record a rate-limit event.
 *
 * @param key          Unique key (e.g. `password_reset:user_id`, `lookup:ip`)
 * @param maxRequests  Maximum allowed requests in the window
 * @param windowSeconds  Rolling window in seconds
 * @returns `true` if the request is allowed; `false` if it is rate-limited
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  const windowStart = new Date(Date.now() - windowSeconds * 1_000).toISOString();

  // 1. Count how many events for this key in the rolling window
  const { count, error: countErr } = await admin
    .from('rate_limit_events')
    .select('*', { count: 'exact', head: true })
    .eq('key', key)
    .gte('created_at', windowStart);

  if (countErr) {
    // If we can't check, fail open with a warning (don't block the request)
    console.warn('[rateLimit] count error — failing open:', countErr.message);
    return true;
  }

  if ((count ?? 0) >= maxRequests) {
    return false; // Rate limited
  }

  // 2. Record this event (fire-and-forget, don't block on error)
  admin
    .from('rate_limit_events')
    .insert({ key })
    .then(({ error }) => {
      if (error) console.warn('[rateLimit] insert error:', error.message);
    });

  return true;
}

/**
 * Build a standardised rate-limit key from caller context.
 * Prefer user-scoped keys when a userId is known; fall back to IP.
 */
export function rateLimitKey(namespace: string, id: string): string {
  return `${namespace}:${id}`;
}
