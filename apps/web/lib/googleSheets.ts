export function extractGoogleSheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch?.[1]) return urlMatch[1];

  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

export function sanitizeInternalPath(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith('/')) return fallback;
  return value;
}

export interface OniTemplateSheet {
  title: string;
  headers: string[];
}

export function buildOniTemplateSheets(): OniTemplateSheet[] {
  return [
    { title: 'Products', headers: ['sku', 'name', 'category', 'unit', 'price', 'cost', 'stock_qty', 'active'] },
    { title: 'Orders', headers: ['order_no', 'created_at', 'status', 'customer_name', 'total_amount', 'note'] },
    { title: 'OrderItems', headers: ['order_no', 'sku', 'product_name', 'qty', 'unit_price', 'line_total'] },
    { title: 'Customers', headers: ['customer_code', 'name', 'phone', 'email', 'address', 'note'] },
    { title: 'Settings', headers: ['key', 'value', 'description'] },
  ];
}
