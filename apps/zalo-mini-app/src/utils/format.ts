/**
 * Bộ tiện ích định dạng dữ liệu dùng chung cho ONI Mini App
 * Port từ mobile lib/utils/format.ts
 */

/**
 * Định dạng số tiền hiển thị chuẩn Việt Nam
 * Ví dụ: 10000000 -> "10.000.000 đ"
 */
export function formatCurrency(value: number | string | null | undefined, suffix = 'đ'): string {
  if (value === null || value === undefined || value === '') {
    return `0 ${suffix}`.trim();
  }

  const cleanString = value.toString()
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .replace(/[^0-9.-]/g, '');

  const num = typeof value === 'number' ? value : parseFloat(cleanString);
  if (isNaN(num)) {
    return `0 ${suffix}`.trim();
  }

  const roundedNum = Math.round(num * 100) / 100;
  const parts = roundedNum.toString().split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];

  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  if (decimalPart !== undefined && decimalPart.length > 0) {
    const cleanedDecimal = decimalPart.substring(0, 2);
    return `${formattedInteger},${cleanedDecimal} ${suffix}`.trim();
  }

  return `${formattedInteger} ${suffix}`.trim();
}

/**
 * Mặt nạ nhập liệu số tiền (Mask Input) thời gian thực
 */
export function maskCurrencyInput(text: string): string {
  if (!text) return '';

  let cleaned = text.replace(/\./g, ',');
  cleaned = cleaned.replace(/[^0-9,-]/g, '');

  const firstCommaIndex = cleaned.indexOf(',');
  if (firstCommaIndex !== -1) {
    const beforeComma = cleaned.substring(0, firstCommaIndex).replace(/,/g, '');
    const afterComma = cleaned.substring(firstCommaIndex + 1).replace(/,/g, '').substring(0, 2);
    cleaned = `${beforeComma},${afterComma}`;
  }

  const parts = cleaned.split(',');
  let integerPart = parts[0];

  if (integerPart.startsWith('0') && integerPart.length > 1) {
    integerPart = parseInt(integerPart, 10).toString();
  }

  if (integerPart) {
    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  if (parts.length > 1) {
    return `${integerPart},${parts[1]}`;
  }
  return integerPart;
}

/**
 * Chuyển đổi chuỗi tiền tệ ngược lại thành số
 * Ví dụ: "10.000.000,23" -> 10000000.23
 */
export function parseCurrencyToNumber(formattedValue: string | number | null | undefined): number {
  if (formattedValue === null || formattedValue === undefined || formattedValue === '') {
    return 0;
  }
  if (typeof formattedValue === 'number') {
    return formattedValue;
  }

  const cleaned = formattedValue
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .replace(/[^0-9.-]/g, '');

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Định dạng ngày: dd/mm/yyyy
 */
export function formatDate(dateVal: Date | string | number | null | undefined): string {
  if (!dateVal) return '';
  const date = new Date(dateVal);
  if (isNaN(date.getTime())) return '';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

/**
 * Định dạng ngày giờ: dd/mm/yyyy HH:mm
 */
export function formatDateTime(dateVal: Date | string | number | null | undefined): string {
  if (!dateVal) return '';
  const date = new Date(dateVal);
  if (isNaN(date.getTime())) return '';

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Định dạng thời gian tương đối: "5 phút trước", "2 giờ trước"
 */
export function formatTimeAgo(dateVal: Date | string | number | null | undefined): string {
  if (!dateVal) return '';
  const date = new Date(dateVal);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays < 7) return `${diffDays} ngày trước`;
  return formatDate(date);
}

/**
 * Rút gọn số: 1500000 -> "1.5M", 12500 -> "12.5K"
 */
export function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return value.toString();
}

/**
 * Trích xuất và rút gọn mã đơn hàng, loại bỏ tenant hash prefix.
 * e.g., ORD-E007393D-10041 -> ORD-10041
 */
export function cleanOrderNo(orderNo: string | undefined, orderId: string): string {
  const code = orderNo || orderId;
  if (!code) return '';

  const matchTenantPattern = code.match(/(ORD|RET)-([a-fA-F0-9]{8})-([a-zA-Z0-9-]+)/i);
  if (matchTenantPattern) {
    return matchTenantPattern[3];
  }

  const match = code.match(/(ORD|RET)-([a-zA-Z0-9-]+)/i);
  if (match) {
    return match[2];
  }

  if (code.length > 20 && /^[a-fA-F0-9-]{36}$/.test(code)) {
    return code.slice(0, 8).toUpperCase();
  }

  if (code.length > 15) {
    if (code.includes('_')) {
      const parts = code.split('_');
      const ordPart = parts.find(p => p.toUpperCase().startsWith('ORD-') || p.toUpperCase().startsWith('RET-'));
      if (ordPart) return cleanOrderNo(ordPart, '');
      return parts[parts.length - 1];
    }
    return code.slice(0, 10).toUpperCase();
  }

  return code.replace(/^(ORD|RET)-/i, '');
}
