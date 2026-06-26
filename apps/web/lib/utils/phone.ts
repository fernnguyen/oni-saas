/**
 * Kiểm tra xem một chuỗi có phải là số điện thoại di động Việt Nam hợp lệ hay không.
 * Các đầu số hợp lệ (nhà mạng Viettel, VinaPhone, MobiFone, Vietnamobile, Gmobile, Itelecom, Wintel...):
 * - Đầu 03, 05, 07, 08, 09
 * - Độ dài chính xác 10 số (bao gồm cả số 0 ở đầu)
 */
export const VN_PHONE_REGEX = /^(0[3|5|7|8|9])+([0-9]{8})$/;

export function isValidVNPhone(phone: string): boolean {
  return VN_PHONE_REGEX.test(phone.trim());
}

/**
 * Chuyển đổi số điện thoại thành dạng email ảo để lưu trữ trong hệ thống (Supabase Auth)
 * Ví dụ: 0987654321 -> 0987654321@user.oni.vn
 */
export function formatPhoneAsEmail(phone: string): string {
  const cleanPhone = phone.trim();
  if (isValidVNPhone(cleanPhone)) {
    return `${cleanPhone}@user.oni.vn`;
  }
  return cleanPhone;
}

/**
 * Kiểm tra xem một chuỗi có phải là email ảo được tạo từ số điện thoại không
 */
export function isPhoneEmail(email: string): boolean {
  return email.endsWith('@user.oni.vn');
}

/**
 * Trích xuất lại số điện thoại từ email ảo
 * Ví dụ: 0987654321@user.oni.vn -> 0987654321
 */
export function extractPhoneFromEmail(email: string): string | null {
  if (isPhoneEmail(email)) {
    return email.replace('@user.oni.vn', '');
  }
  return null;
}
