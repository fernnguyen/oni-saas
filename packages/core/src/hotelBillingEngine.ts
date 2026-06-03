export interface HotelPricingConfig {
  hourly_rate: number;
  overnight_rate: number;
  daily_rate: number; // Tiêu chuẩn theo ngày (e.g. 500,000đ)
  standard_checkin_time: string;  // e.g. "14:00"
  standard_checkout_time: string; // e.g. "12:00"
  
  // Phụ thu Nhận phòng Sớm (Early Check-in Surcharge Policy)
  early_checkin_rules?: {
    enabled: boolean;
    rules: {
      before_hour: string;     // e.g. "06:00" -> Nhận trước 6h sáng phụ thu 100%
      surcharge_pct: number;   // e.g. 100
    }[];
  };

  // Phụ thu Trả phòng Trễ (Late Check-out Surcharge Policy)
  late_checkout_rules?: {
    enabled: boolean;
    rules: {
      after_hour: string;      // e.g. "15:00" -> Trả sau 15h phụ thu 30%
      surcharge_pct: number;   // e.g. 30
    }[];
  };
}

export interface RoomBillingResult {
  rentalType: 'hourly' | 'overnight' | 'daily';
  durationLabel: string;
  baseRoomFee: number;
  earlyCheckInSurcharge: number;
  lateCheckOutSurcharge: number;
  totalRoomFee: number;
  auditLogs: string[];
  overrideReason?: string;
  isOverridden: boolean;
}

/**
 * Advanced Room Billing Engine
 * Supports Hourly, Overnight, and Daily stays with early check-in & late check-out surcharges.
 */
export function calculateHotelRoomBilling({
  checkIn,
  checkOut,
  rentalType,
  config,
  overrideSurcharges,
  overrideReason
}: {
  checkIn: Date;
  checkOut: Date;
  rentalType: 'hourly' | 'overnight' | 'daily';
  config: HotelPricingConfig;
  overrideSurcharges?: {
    earlyCheckIn?: number;
    lateCheckOut?: number;
  };
  overrideReason?: string;
}): RoomBillingResult {
  const auditLogs: string[] = [];
  let baseRoomFee = 0;
  let earlyCheckInSurcharge = 0;
  let lateCheckOutSurcharge = 0;
  let durationLabel = '';

  const diffMs = Math.max(0, checkOut.getTime() - checkIn.getTime());
  
  if (rentalType === 'hourly') {
    // Hourly calculation logic
    const totalMinutes = Math.ceil(diffMs / 60000);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    durationLabel = `${h}h ${m}p`;
    
    // We can assume hourly pricing simple multiplication or progressive rules passed inside config
    baseRoomFee = h * config.hourly_rate + (m > 0 ? config.hourly_rate : 0);
    auditLogs.push(`Tính theo giờ: ${durationLabel} x ${config.hourly_rate.toLocaleString('vi-VN')}₫/giờ = ${baseRoomFee.toLocaleString('vi-VN')}₫`);

  } else if (rentalType === 'overnight') {
    // Overnight calculation logic
    durationLabel = '1 đêm (Qua đêm)';
    baseRoomFee = config.overnight_rate;
    auditLogs.push(`Tính trọn gói qua đêm: ${baseRoomFee.toLocaleString('vi-VN')}₫`);

  } else {
    // Daily/Multi-day calculation logic
    // Zero-out hours/minutes to get clean date difference
    const d1 = new Date(checkIn.getFullYear(), checkIn.getMonth(), checkIn.getDate());
    const d2 = new Date(checkOut.getFullYear(), checkOut.getMonth(), checkOut.getDate());
    const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    
    const nights = Math.max(1, diffDays); // Minimum 1 night
    durationLabel = `${nights} đêm`;
    baseRoomFee = nights * config.daily_rate;
    auditLogs.push(`Tính theo ngày: ${nights} đêm x ${config.daily_rate.toLocaleString('vi-VN')}₫ = ${baseRoomFee.toLocaleString('vi-VN')}₫`);

    // Calculate standard early check-in surcharge
    if (config.early_checkin_rules?.enabled && config.early_checkin_rules.rules.length > 0) {
      const checkInHourStr = checkIn.toTimeString().slice(0, 5); // e.g. "08:30"
      
      // Sort rules from earliest to latest time
      const sortedRules = [...config.early_checkin_rules.rules].sort((a, b) => a.before_hour.localeCompare(b.before_hour));
      
      for (const rule of sortedRules) {
        if (checkInHourStr < rule.before_hour) {
          earlyCheckInSurcharge = (config.daily_rate * rule.surcharge_pct) / 100;
          auditLogs.push(`[Phụ thu check-in sớm] Nhận lúc ${checkInHourStr} (trước ${rule.before_hour}): +${rule.surcharge_pct}% giá ngày = ${earlyCheckInSurcharge.toLocaleString('vi-VN')}₫`);
          break; // Apply only the highest applicable tier
        }
      }
    }

    // Calculate standard late check-out surcharge
    if (config.late_checkout_rules?.enabled && config.late_checkout_rules.rules.length > 0) {
      const checkOutHourStr = checkOut.toTimeString().slice(0, 5); // e.g. "15:45"
      
      // Sort rules from latest to earliest time
      const sortedRules = [...config.late_checkout_rules.rules].sort((a, b) => b.after_hour.localeCompare(a.after_hour));
      
      for (const rule of sortedRules) {
        if (checkOutHourStr > rule.after_hour) {
          lateCheckOutSurcharge = (config.daily_rate * rule.surcharge_pct) / 100;
          auditLogs.push(`[Phụ thu check-out muộn] Trả lúc ${checkOutHourStr} (sau ${rule.after_hour}): +${rule.surcharge_pct}% giá ngày = ${lateCheckOutSurcharge.toLocaleString('vi-VN')}₫`);
          break; // Apply only the highest applicable tier
        }
      }
    }
  }

  // Handle manual auditor overrides
  let isOverridden = false;
  
  if (overrideSurcharges) {
    if (overrideSurcharges.earlyCheckIn !== undefined && overrideSurcharges.earlyCheckIn !== earlyCheckInSurcharge) {
      auditLogs.push(`[Ghi đè] Điều chỉnh Phụ thu Nhận sớm từ ${earlyCheckInSurcharge.toLocaleString('vi-VN')}₫ thành ${overrideSurcharges.earlyCheckIn.toLocaleString('vi-VN')}₫. Lý do: ${overrideReason || 'Không ghi rõ'}`);
      earlyCheckInSurcharge = overrideSurcharges.earlyCheckIn;
      isOverridden = true;
    }
    
    if (overrideSurcharges.lateCheckOut !== undefined && overrideSurcharges.lateCheckOut !== lateCheckOutSurcharge) {
      auditLogs.push(`[Ghi đè] Điều chỉnh Phụ thu Trả muộn từ ${lateCheckOutSurcharge.toLocaleString('vi-VN')}₫ thành ${overrideSurcharges.lateCheckOut.toLocaleString('vi-VN')}₫. Lý do: ${overrideReason || 'Không ghi rõ'}`);
      lateCheckOutSurcharge = overrideSurcharges.lateCheckOut;
      isOverridden = true;
    }
  }

  const totalRoomFee = baseRoomFee + earlyCheckInSurcharge + lateCheckOutSurcharge;

  return {
    rentalType,
    durationLabel,
    baseRoomFee,
    earlyCheckInSurcharge,
    lateCheckOutSurcharge,
    totalRoomFee,
    auditLogs,
    overrideReason: isOverridden ? overrideReason : undefined,
    isOverridden
  };
}
