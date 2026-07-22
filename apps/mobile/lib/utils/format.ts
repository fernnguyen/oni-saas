/**
 * Bộ tiện ích định dạng dữ liệu dùng chung cho ONI Mobile ERP
 * Hỗ trợ định dạng Tiền tệ (đáp ứng mặt nạ nhập liệu - Mask Input) và Ngày tháng
 */

/**
 * Định dạng số tiền hiển thị chuẩn Việt Nam (ngăn cách hàng nghìn bằng dấu chấm '.', thập phân bằng dấu phẩy ',')
 * Ví dụ: 10000000.23 -> "10.000.000,23 đ"
 * 
 * @param value Số hoặc chuỗi số cần định dạng
 * @param suffix Đơn vị tiền tệ đi kèm (mặc định 'đ')
 */
export function formatCurrency(value: number | string | null | undefined, suffix = 'đ'): string {
  if (value === null || value === undefined || value === '') {
    return `0 ${suffix}`.trim();
  }

  // Chuyển đổi dấu phẩy thành dấu chấm trước khi parse để đảm bảo tính đúng đắn của số thập phân tiếng Việt
  const cleanString = value.toString()
    .replace(/\./g, '') // Bỏ hết dấu chấm ngăn cách cũ
    .replace(/,/g, '.')  // Thay phẩy bằng chấm để parse float
    .replace(/[^0-9.-]/g, ''); // Giữ lại số, dấu âm, dấu chấm
    
  const num = typeof value === 'number' ? value : parseFloat(cleanString);
  if (isNaN(num)) {
    return `0 ${suffix}`.trim();
  }

  // Làm tròn đến tối đa 2 chữ số thập phân
  const roundedNum = Math.round(num * 100) / 100;
  const parts = roundedNum.toString().split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];

  // Định dạng phần nguyên bằng dấu chấm
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  if (decimalPart !== undefined && decimalPart.length > 0) {
    const cleanedDecimal = decimalPart.substring(0, 2);
    return `${formattedInteger},${cleanedDecimal} ${suffix}`.trim();
  }

  return `${formattedInteger} ${suffix}`.trim();
}

/**
 * Mặt nạ nhập liệu số tiền (Mask Input) thời gian thực cho TextInput
 * Chuyển đổi phím bấm và định dạng ngay khi người dùng gõ
 * Ngăn cách hàng nghìn bằng '.', thập phân bằng ',' và giới hạn tối đa 2 chữ số thập phân
 * 
 * @param text Chuỗi thô nhận được từ TextInput
 */
export function maskCurrencyInput(text: string): string {
  // POS prices are VND integers. Formatting only digits prevents the old
  // decimal-comma branch from treating each newly formatted dot as input.
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString('vi-VN') : '';
}

/**
 * Chuyển đổi chuỗi tiền tệ định dạng Việt Nam ngược lại thành kiểu số nguyên/thập phân thuần túy để lưu trữ/tính toán
 * Ví dụ: "10.000.000,23" -> 10000000.23
 * 
 * @param formattedValue Chuỗi số đã định dạng
 */
export function parseCurrencyToNumber(formattedValue: string | number | null | undefined): number {
  if (formattedValue === null || formattedValue === undefined || formattedValue === '') {
    return 0;
  }
  if (typeof formattedValue === 'number') {
    return formattedValue;
  }

  const cleaned = formattedValue
    .replace(/\./g, '') // Xóa toàn bộ dấu chấm hàng nghìn
    .replace(/,/g, '.')  // Thay dấu phẩy thập phân thành dấu chấm để javascript hiểu
    .replace(/[^0-9.-]/g, ''); // Giữ lại ký tự số và dấu

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Định dạng ngày tháng năm sang kiểu Việt Nam ngắn gọn: dd/mm/yyyy
 * Ví dụ: "2025-12-18T05:30:00.000Z" -> "18/12/2025"
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
 * Định dạng ngày giờ đầy đủ kiểu Việt Nam: dd/mm/yyyy HH:mm
 * Ví dụ: "2025-12-18T05:30:00.000Z" -> "18/12/2025 12:30" (tự động quy đổi múi giờ địa phương)
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
