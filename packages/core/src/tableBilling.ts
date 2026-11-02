import { calculateHourlyBilling, type HourlyPricingConfig } from './hourlyBilling';

// Single source of truth for table/room/court time charges in table sync v2
// (docs/TABLE-SESSION-SYNC-PLAN.md 0.9 / 2.1 / 2.4). The server computes quotes with it and
// clients use the same function offline, so both sides agree on the amount.
// Legacy UI code paths still carry their own copies; they are not changed by this module.

export type TableRentalType = 'hourly' | 'overnight' | 'daily';

export interface TablePricingSnapshot {
  rental_type: TableRentalType;
  hourly_rate: number;
  advanced_pricing?: HourlyPricingConfig;
  overnight_rate?: number;
  overnight_grace_hours?: number;
  daily_rate?: number;
  daily_grace_hours?: number;
}

export interface TableTimeCharge {
  amount: number;
  billable_minutes: number;
  unit: 'hour' | 'night' | 'day';
  qty: number;
  duration_label: string;
  details_label: string;
}

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const parseObj = (raw: unknown): Record<string, any> => {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, any>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

/**
 * Freezes the pricing inputs of a session. Priority: explicit order/session metadata over the
 * resource's current configuration (so editing a table's price mid-session does not change an
 * open bill). `charge_by_minute` may live inside `advanced_pricing` or at the top level.
 */
export function buildTablePricingSnapshot(
  resource: { hourly_rate?: unknown; metadata?: unknown } | null | undefined,
  orderMetadata?: unknown
): TablePricingSnapshot {
  const rmd = parseObj(resource?.metadata);
  const omd = parseObj(orderMetadata);
  const pick = (key: string) => (omd[key] !== undefined && omd[key] !== '' ? omd[key] : rmd[key]);

  const rawType = String(pick('rental_type') || 'hourly');
  const rental_type: TableRentalType = rawType === 'overnight' || rawType === 'daily' ? rawType : 'hourly';

  const advanced = parseObj(pick('advanced_pricing'));
  const chargeByMinute = advanced.charge_by_minute ?? pick('charge_by_minute');
  const hasAdvanced = Object.keys(advanced).length > 0;
  const advanced_pricing: HourlyPricingConfig | undefined = hasAdvanced || chargeByMinute !== undefined
    ? {
        enabled: Boolean(advanced.enabled),
        base_hours: toNum(advanced.base_hours) || 1,
        base_price: toNum(advanced.base_price),
        next_hourly_rate: advanced.next_hourly_rate !== undefined ? toNum(advanced.next_hourly_rate) : undefined,
        grace_minutes: toNum(advanced.grace_minutes),
        progressive_rates: advanced.progressive_rates || undefined,
        charge_by_minute: chargeByMinute === undefined ? undefined : chargeByMinute === true || chargeByMinute === 'true',
      }
    : undefined;

  const snapshot: TablePricingSnapshot = {
    rental_type,
    hourly_rate: toNum(omd.hourly_rate ?? resource?.hourly_rate),
  };
  if (advanced_pricing) snapshot.advanced_pricing = advanced_pricing;
  for (const key of ['overnight_rate', 'overnight_grace_hours', 'daily_rate', 'daily_grace_hours'] as const) {
    const v = pick(key);
    if (v !== undefined && v !== '' && v !== null) snapshot[key] = toNum(v);
  }
  return snapshot;
}

/** Calendar day index in GMT+7 (Vietnam), independent of the process TZ */
const vnDayIndex = (d: Date) => Math.floor((d.getTime() + 7 * 3600_000) / 86_400_000);

export function computeTableTimeCharge(snapshot: TablePricingSnapshot, checkIn: Date, checkOut: Date): TableTimeCharge {
  const diffMs = Math.max(0, checkOut.getTime() - checkIn.getTime());
  const billableMinutes = Math.ceil(diffMs / 60000);
  const totalHours = diffMs / 3_600_000;
  const hourlyRate = toNum(snapshot.hourly_rate);

  if (snapshot.rental_type === 'overnight') {
    const rate = toNum(snapshot.overnight_rate) || hourlyRate * 3 || 200000;
    const grace = toNum(snapshot.overnight_grace_hours);
    const diffDays = vnDayIndex(checkOut) - vnDayIndex(checkIn);
    let nights = Math.max(1, diffDays);
    if (diffDays > 0 && totalHours > diffDays * 24 + grace) nights = Math.ceil(totalHours / 24);
    return {
      amount: Math.round(nights * rate),
      billable_minutes: billableMinutes,
      unit: 'night',
      qty: nights,
      duration_label: `${nights} đêm`,
      details_label: `${nights} đêm × ${Math.round(rate).toLocaleString('vi-VN')}₫`,
    };
  }

  if (snapshot.rental_type === 'daily') {
    const rate = toNum(snapshot.daily_rate) || toNum(snapshot.overnight_rate) || hourlyRate * 3 || 200000;
    const grace = snapshot.daily_grace_hours !== undefined ? toNum(snapshot.daily_grace_hours) : 2;
    const completedDays = Math.floor(totalHours / 24);
    const excessHours = totalHours % 24;
    const days = Math.max(1, completedDays + (excessHours > grace ? 1 : 0));
    return {
      amount: Math.round(days * rate),
      billable_minutes: billableMinutes,
      unit: 'day',
      qty: days,
      duration_label: `${days} ngày`,
      details_label: `${days} ngày × ${Math.round(rate).toLocaleString('vi-VN')}₫`,
    };
  }

  const result = calculateHourlyBilling({ checkIn, checkOut, standardRate: hourlyRate, config: snapshot.advanced_pricing });
  return {
    amount: Math.round(result.totalAmount),
    billable_minutes: billableMinutes,
    unit: 'hour',
    qty: result.billableQty,
    duration_label: result.durationLabel,
    details_label: result.detailsLabel,
  };
}
