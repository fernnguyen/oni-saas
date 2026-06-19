import { db } from '../db/client';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';

/**
 * Checks if a given date string (or Date object) falls within a locked tax period.
 * Reads from the local cache table `local_caches`.
 * 
 * @param dateInput Date object or date/time string (ISO or YYYY-MM-DD)
 */
export async function isTaxPeriodLocked(dateInput: Date | string): Promise<boolean> {
  try {
    const dateStr = typeof dateInput === 'string' ? dateInput : dateInput.toISOString();
    const checkDate = dateStr.split('T')[0]; // Format: YYYY-MM-DD

    const cacheRes = await db
      .select()
      .from(schema.localCaches)
      .where(eq(schema.localCaches.cache_key, 'tax_locked_periods'))
      .limit(1);

    if (cacheRes.length === 0) {
      return false; // No locks cached
    }

    const periods = JSON.parse(cacheRes[0].cache_value);
    if (!Array.isArray(periods)) {
      return false;
    }

    for (const period of periods) {
      if (
        period.status === 'locked' &&
        checkDate >= period.start_date &&
        checkDate <= period.end_date
      ) {
        return true;
      }
    }
  } catch (err) {
    console.error('[Tax Utility] Error checking tax lockdown:', err);
  }
  return false;
}
