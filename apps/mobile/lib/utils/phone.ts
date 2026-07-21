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

export function formatPhoneAsEmail(phone: string): string {
  const normalized = normalizeVNPhone(phone);
  if (normalized) {
    return `${normalized}@user.oni.vn`;
  }
  return phone.trim();
}
