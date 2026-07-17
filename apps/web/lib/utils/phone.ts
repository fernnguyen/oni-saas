const VN_PHONE_LOCAL_REGEX = /^0(3|5|7|8|9)[0-9]{8}$/;
const VN_PHONE_84_REGEX = /^84(3|5|7|8|9)[0-9]{8}$/;
const VN_PHONE_PLUS_84_REGEX = /^\+84(3|5|7|8|9)[0-9]{8}$/;

export function normalizeVNPhone(phone: string): string | null {
  const cleanPhone = phone.trim().replace(/[.\s()-]/g, '');

  if (VN_PHONE_LOCAL_REGEX.test(cleanPhone)) {
    return cleanPhone;
  }

  if (VN_PHONE_84_REGEX.test(cleanPhone)) {
    return `0${cleanPhone.slice(2)}`;
  }

  if (VN_PHONE_PLUS_84_REGEX.test(cleanPhone)) {
    return `0${cleanPhone.slice(3)}`;
  }

  return null;
}

export function toVNPhone84(phone: string): string | null {
  const normalized = normalizeVNPhone(phone);
  if (!normalized) return null;
  return `84${normalized.slice(1)}`;
}

export function toVNPhonePlus84(phone: string): string | null {
  const normalized = normalizeVNPhone(phone);
  if (!normalized) return null;
  return `+84${normalized.slice(1)}`;
}

export function isValidVNPhone(phone: string): boolean {
  return normalizeVNPhone(phone) !== null;
}

/**
 * Chuyển đổi số điện thoại thành dạng email ảo để lưu trữ trong hệ thống (Supabase Auth)
 * Ví dụ: 0987654321 -> 0987654321@user.oni.vn
 */
export function formatPhoneAsEmail(phone: string): string {
  const normalized = normalizeVNPhone(phone);
  if (normalized) {
    return `${normalized}@user.oni.vn`;
  }
  return phone.trim();
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
