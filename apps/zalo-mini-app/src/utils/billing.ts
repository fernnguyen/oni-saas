/**
 * Billing utilities for table/room sessions.
 * Wraps @oni/core's calculateHourlyBilling and adds overnight/daily logic
 * ported from mobile's useTableManager.ts.
 */
import { calculateHourlyBilling } from '@oni/core';

export type RentalType = 'hourly' | 'daily' | 'overnight';

export interface BillingCalcResult {
  cost: number;
  qty: number;
  unitPrice: number;
  label: string;       // e.g. "2h 30p", "2 đêm", "3 ngày"
  details: string;     // human-readable breakdown
}

const fmt = (v: number) => v.toLocaleString('vi-VN') + '₫';

/**
 * Calculate billing for an active table/room session.
 * @param rentalType   - 'hourly' | 'daily' | 'overnight'
 * @param checkInISO   - ISO 8601 check-in time
 * @param checkOutISO  - ISO 8601 check-out time (defaults to now)
 * @param hourlyRate   - Standard hourly rate (VNĐ/giờ)
 * @param dailyRate    - Daily rate (VNĐ/ngày)
 * @param overnightRate - Overnight rate (VNĐ/đêm)
 * @param advancedPricing - Advanced pricing config from @oni/core HourlyPricingConfig
 * @param overnightGraceHours - Grace hours for overnight (default 0)
 * @param dailyGraceHours - Grace hours for daily (default 2)
 */
export function calculateBilling({
  rentalType,
  checkInISO,
  checkOutISO,
  hourlyRate = 0,
  dailyRate = 0,
  overnightRate = 0,
  advancedPricing,
  overnightGraceHours = 0,
  dailyGraceHours = 2,
}: {
  rentalType: RentalType;
  checkInISO: string;
  checkOutISO?: string;
  hourlyRate?: number;
  dailyRate?: number;
  overnightRate?: number;
  advancedPricing?: any;
  overnightGraceHours?: number;
  dailyGraceHours?: number;
}): BillingCalcResult {
  const checkIn = new Date(checkInISO);
  const checkOut = checkOutISO ? new Date(checkOutISO) : new Date();

  const hRate = Number(hourlyRate) || 0;
  const dRate = Number(dailyRate) || 0;
  const oRate = Number(overnightRate) || 0;

  // ── OVERNIGHT ──
  if (rentalType === 'overnight') {
    const rate = oRate || hRate * 3 || 200000;
    const d1 = new Date(checkIn.getFullYear(), checkIn.getMonth(), checkIn.getDate());
    const d2 = new Date(checkOut.getFullYear(), checkOut.getMonth(), checkOut.getDate());
    const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    const totalHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
    let nights = Math.max(1, diffDays);
    if (diffDays > 0) {
      const standardCycleHours = diffDays * 24;
      if (totalHours > standardCycleHours + overnightGraceHours) {
        nights = Math.ceil(totalHours / 24);
      }
    }
    const cost = nights * rate;
    return {
      cost, qty: nights, unitPrice: rate,
      label: `${nights} đêm`,
      details: `Thuê qua đêm: ${nights} đêm × ${fmt(rate)}/đêm = ${fmt(cost)}`,
    };
  }

  // ── DAILY ──
  if (rentalType === 'daily') {
    const rate = dRate || oRate || hRate * 3 || 200000;
    const totalHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
    const completedDays = Math.floor(totalHours / 24);
    const excessHours = totalHours % 24;
    const days = Math.max(1, completedDays + (excessHours > dailyGraceHours ? 1 : 0));
    const cost = days * rate;
    return {
      cost, qty: days, unitPrice: rate,
      label: `${days} ngày`,
      details: `Thuê theo ngày: ${days} ngày × ${fmt(rate)}/ngày = ${fmt(cost)}`,
    };
  }

  // ── HOURLY (delegates to @oni/core) ──
  const result = calculateHourlyBilling({
    checkIn,
    checkOut,
    standardRate: hRate,
    config: advancedPricing,
  });

  const diffMs = Math.max(0, checkOut.getTime() - checkIn.getTime());
  const totalMinutes = Math.ceil(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return {
    cost: result.totalAmount,
    qty: result.billableQty,
    unitPrice: result.totalAmount / Math.max(1, result.billableQty),
    label: `${hours}h ${minutes}p`,
    details: result.detailsLabel,
  };
}

/**
 * Format elapsed time as "Xh Yp" for display in realtime billing counter.
 */
export function formatElapsed(checkInISO: string): string {
  const checkIn = new Date(checkInISO);
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - checkIn.getTime());
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}p`;
}

/**
 * Format a Date or ISO string as Vietnamese datetime.
 */
export function formatViDatetime(dateOrISO: Date | string | null | undefined): string {
  if (!dateOrISO) return '';
  const d = (typeof dateOrISO === 'string' || typeof dateOrISO === 'number' || dateOrISO instanceof Date) ? new Date(dateOrISO) : null;
  if (!d || isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Format ISO string to "HH:MM" local time input value.
 */
export function isoToTimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Format ISO string to "YYYY-MM-DDThh:mm" for datetime-local input.
 */
export function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
