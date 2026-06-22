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

/**
 * Fetches system tax groups from SQLite cache.
 * Falls back to default Circular 40 tax groups if cache is empty or fails.
 */
export async function getSystemTaxGroups(): Promise<Array<{ code: string; name: string; vat_rate: number; pit_rate: number }>> {
  const fallbackGroups = [
    { code: 'phan_phoi', name: 'Phân phối, cung cấp hàng hóa', vat_rate: 1.0, pit_rate: 0.5 },
    { code: 'dich_vu', name: 'Dịch vụ, xây dựng không bao thầu nguyên vật liệu', vat_rate: 5.0, pit_rate: 2.0 },
    { code: 'san_xuat', name: 'Sản xuất, vận tải, dịch vụ có gắn với hàng hóa, xây dựng có bao thầu nguyên vật liệu', vat_rate: 3.0, pit_rate: 1.5 },
    { code: 'khac', name: 'Hoạt động kinh doanh khác', vat_rate: 2.0, pit_rate: 1.0 }
  ];

  try {
    const cacheRes = await db
      .select()
      .from(schema.localCaches)
      .where(eq(schema.localCaches.cache_key, 'system_tax_groups'))
      .limit(1);

    if (cacheRes.length === 0) {
      return fallbackGroups;
    }

    const groups = JSON.parse(cacheRes[0].cache_value);
    if (Array.isArray(groups) && groups.length > 0) {
      return groups.map((g: any) => ({
        code: g.code,
        name: g.name,
        vat_rate: parseFloat(g.vat_rate) || 0,
        pit_rate: parseFloat(g.pit_rate) || 0,
      }));
    }
  } catch (err) {
    console.error('[Tax Utility] Error fetching system tax groups:', err);
  }
  return fallbackGroups;
}
