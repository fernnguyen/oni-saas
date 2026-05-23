export interface HourlyPricingConfig {
  enabled: boolean;
  base_hours: number;
  base_price: number;
  next_hourly_rate?: number;
  grace_minutes: number;
  progressive_rates?: Record<string | number, number | string>;
}

export interface BillingResult {
  billableQty: number;
  totalAmount: number;
  durationLabel: string;
  detailsLabel: string;
}

/**
 * Calculates hourly billing according to advanced pricing configurations:
 * - Base block hour duration and pricing.
 * - Grace period minutes (rounds down the extra hour if under/equal to grace_minutes).
 * - Progressive hourly rate schedule.
 * - Dynamic fallback to previous block rates or next hourly rate.
 */
export function calculateHourlyBilling({
  checkIn,
  checkOut,
  standardRate,
  config
}: {
  checkIn: Date;
  checkOut: Date;
  standardRate: number;
  config?: HourlyPricingConfig;
}): BillingResult {
  const diffMs = Math.max(0, checkOut.getTime() - checkIn.getTime());
  const totalMinutes = Math.ceil(diffMs / 60000);
  
  const enabled = config?.enabled ?? false;
  const baseHours = enabled ? (Number(config?.base_hours) || 1) : 1;
  const basePrice = enabled ? (Number(config?.base_price) ?? standardRate) : standardRate;
  const nextRate = enabled ? (Number(config?.next_hourly_rate) ?? standardRate) : standardRate;
  const graceMinutes = enabled ? (Number(config?.grace_minutes) || 0) : 0;
  const progRates = config?.progressive_rates ?? {};

  const getProgRate = (hour: number): number | undefined => {
    if (progRates[hour] !== undefined && progRates[hour] !== null) {
      return Number(progRates[hour]);
    }
    const strKey = String(hour);
    if (progRates[strKey] !== undefined && progRates[strKey] !== null) {
      return Number(progRates[strKey]);
    }
    return undefined;
  };

  const baseMinutes = baseHours * 60;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const durationLabel = `${h}h ${m}p`;

  // 1. Within the base block
  if (totalMinutes <= baseMinutes) {
    return {
      billableQty: 1,
      totalAmount: basePrice,
      durationLabel,
      detailsLabel: `${baseHours}h đầu`
    };
  }

  // 2. Beyond the base block
  const excessMinutes = totalMinutes - baseMinutes;
  const excessHoursComplete = Math.floor(excessMinutes / 60);
  const excessMinutesRem = excessMinutes % 60;

  // Apply grace minutes
  const extraHours = excessMinutesRem > graceMinutes 
    ? excessHoursComplete + 1 
    : excessHoursComplete;

  const totalBillableHours = baseHours + extraHours;
  let totalAmount = basePrice;

  // Calculate pricing progressively for each extra hour
  for (let hourIdx = baseHours + 1; hourIdx <= totalBillableHours; hourIdx++) {
    const specificRate = getProgRate(hourIdx);
    if (specificRate !== undefined && !isNaN(specificRate)) {
      totalAmount += specificRate;
    } else {
      // Find closest previous configured hour
      let fallbackRate: number | null = null;
      for (let prevH = hourIdx - 1; prevH > baseHours; prevH--) {
        const prevRate = getProgRate(prevH);
        if (prevRate !== undefined && !isNaN(prevRate)) {
          fallbackRate = prevRate;
          break;
        }
      }
      
      if (fallbackRate !== null) {
        totalAmount += fallbackRate;
      } else {
        totalAmount += nextRate;
      }
    }
  }

  const graceApplied = excessMinutesRem > 0 && excessMinutesRem <= graceMinutes;
  const finalDurationLabel = durationLabel + (graceApplied ? ' (không tính quá giờ)' : '');
  const detailsLabel = `${baseHours}h đầu` + (extraHours > 0 ? ` + ${extraHours}h tiếp theo` : '');

  return {
    billableQty: totalBillableHours,
    totalAmount,
    durationLabel: finalDurationLabel,
    detailsLabel
  };
}
export default calculateHourlyBilling;
