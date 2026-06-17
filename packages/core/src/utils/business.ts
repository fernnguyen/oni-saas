export function cleanPaymentMethodKey(methodId: string): string {
  if (!methodId) return 'unknown';
  const lastIndex = methodId.lastIndexOf('-');
  if (lastIndex !== -1) {
    return methodId.substring(0, lastIndex);
  }
  return methodId;
}

export function normalizePaymentMethod(methodId: string): string {
  const clean = cleanPaymentMethodKey(methodId).toLowerCase();
  if (clean === 'cash' || clean.startsWith('cash')) return 'cash';
  if (clean === 'bank_transfer' || clean === 'bank' || clean.startsWith('bank') || clean.startsWith('transfer')) return 'bank_transfer';
  if (clean === 'momo' || clean.startsWith('momo')) return 'momo';
  if (clean === 'vnpay' || clean.startsWith('vnpay')) return 'vnpay';
  if (clean === 'zalopay' || clean.startsWith('zalopay')) return 'zalopay';
  if (clean === 'debt' || clean.startsWith('debt')) return 'debt';
  if (clean === 'prepaid' || clean.startsWith('prepaid') || clean.startsWith('wallet')) return 'prepaid';
  if (clean === 'card' || clean.startsWith('card')) return 'card';
  return clean;
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  card: 'Thẻ ATM / POS',
  momo: 'Ví MoMo',
  zalopay: 'Ví ZaloPay',
  vnpay: 'Ví VNPay',
  prepaid: 'Ví trả trước',
  debt: 'Nợ',
  unknown: 'Khác',
};

export function getPaymentMethodLabel(methodId: string): string {
  const norm = normalizePaymentMethod(methodId);
  return PAYMENT_METHOD_LABELS[norm] || methodId || 'Khác';
}

export function isTimeChargeProduct(
  productId: string | null | undefined,
  productName?: string | null | undefined
): boolean {
  if (!productId) return false;
  if (productId === 'TIME_CHARGE') return true;
  if (productId === 'billiard-time') return true;
  if (productId.startsWith('TIME_CHARGE_MERGED_')) return true;
  return false;
}
