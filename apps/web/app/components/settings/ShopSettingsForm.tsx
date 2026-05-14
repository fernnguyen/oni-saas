'use client';

import { useState } from 'react';

interface ShopSettings {
  shop_id: string;
  shop_name: string | null;
  currency: string;
  timezone: string;
  tax_rate: number;
  invoice_prefix: string;
  low_stock_threshold: number;
  allow_negative_stock: boolean;
  default_price_type: string;
  auto_print_receipt: boolean;
  synced_from_sheet_at: string | null;
  updated_at: string;
}

interface ConnectorData {
  connector_id: string;
  shop_id: string;
  shop_name: string;
  type: string;
  sheet_id: string;
  sheet_title: string;
  sheet_url: string;
  status: string;
  updated_at: string;
}

interface Shop {
  id: string;
  name: string;
  slug: string;
  address: string | null;
}

interface Props {
  shop: Shop;
  settings: ShopSettings;
  canManage: boolean;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function ShopSettingsForm({ shop, settings: initial, canManage }: Props) {
  const [form, setForm] = useState({
    shop_name: initial.shop_name ?? shop.name,
    address: shop.address ?? '',
    currency: initial.currency,
    timezone: initial.timezone,
    tax_rate: String(initial.tax_rate),
    invoice_prefix: initial.invoice_prefix,
    low_stock_threshold: String(initial.low_stock_threshold),
    allow_negative_stock: initial.allow_negative_stock,
    auto_print_receipt: initial.auto_print_receipt ?? true,
    default_price_type: initial.default_price_type,
  });
  const [saveState, setSaveState] = useState<SaveState>('idle');

  function set(key: keyof typeof form, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaveState('idle');
  }

  async function handleSave() {
    setSaveState('saving');
    try {
      const res = await fetch(`/api/shops/${shop.id}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop_name: form.shop_name || undefined,
          currency: form.currency,
          timezone: form.timezone,
          tax_rate: parseFloat(form.tax_rate) || 0,
          invoice_prefix: form.invoice_prefix,
          low_stock_threshold: parseInt(form.low_stock_threshold, 10) || 0,
          allow_negative_stock: form.allow_negative_stock,
          auto_print_receipt: form.auto_print_receipt,
          default_price_type: form.default_price_type,
        }),
      });
      if (!res.ok) throw new Error();
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2500);
    } catch {
      setSaveState('error');
    }
  }
  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Left column: main settings ── */}
        <div className="space-y-6 lg:col-span-2">
          {/* ── Section: Thông tin cơ bản ── */}
          <Section title="Thông tin cơ bản" description="Tên và địa chỉ hiển thị của chi nhánh">
            <Field label="Tên chi nhánh">
              <input
                value={form.shop_name}
                onChange={(e) => set('shop_name', e.target.value)}
                disabled={!canManage}
                className={inputCls}
                placeholder="Chi nhánh Linh Ka"
              />
            </Field>
            <Field label="Địa chỉ">
              <input
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                disabled={!canManage}
                className={inputCls}
                placeholder="123 Nguyễn Văn A, TP.HCM"
              />
            </Field>
            <Field label="Subdomain" hint="Không thể thay đổi sau khi tạo">
              <div className={`${inputCls} bg-slate-50 text-slate-400 cursor-not-allowed`}>
                {shop.slug}.oni.vn
              </div>
            </Field>
          </Section>

          {/* ── Section: Cài đặt bán hàng ── */}
          <Section title="Cài đặt bán hàng" description="Các tham số áp dụng khi tạo đơn, tính tiền, quản lý kho">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Đơn vị tiền tệ">
                <select value={form.currency} onChange={(e) => set('currency', e.target.value)} disabled={!canManage} className={inputCls}>
                  <option value="VND">VND — Việt Nam Đồng</option>
                  <option value="USD">USD — US Dollar</option>
                </select>
              </Field>
              <Field label="Múi giờ">
                <select value={form.timezone} onChange={(e) => set('timezone', e.target.value)} disabled={!canManage} className={inputCls}>
                  <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (UTC+7)</option>
                  <option value="Asia/Bangkok">Asia/Bangkok (UTC+7)</option>
                  <option value="Asia/Singapore">Asia/Singapore (UTC+8)</option>
                </select>
              </Field>
              <Field label="Thuế GTGT mặc định (%)" hint="0 = không tính thuế">
                <input
                  type="number" min="0" max="100" step="0.1"
                  value={form.tax_rate}
                  onChange={(e) => set('tax_rate', e.target.value)}
                  disabled={!canManage}
                  className={inputCls}
                />
              </Field>
              <Field label="Tiền tố số đơn hàng" hint={`Ví dụ: ORD → ORD-2025-0001`}>
                <input
                  value={form.invoice_prefix}
                  onChange={(e) => set('invoice_prefix', e.target.value.toUpperCase())}
                  disabled={!canManage}
                  maxLength={10}
                  className={inputCls}
                />
              </Field>
              <Field label="Cảnh báo hết hàng (tồn kho ≤)" hint="Số lượng tối thiểu trước khi cảnh báo">
                <input
                  type="number" min="0"
                  value={form.low_stock_threshold}
                  onChange={(e) => set('low_stock_threshold', e.target.value)}
                  disabled={!canManage}
                  className={inputCls}
                />
              </Field>
              <Field label="Loại giá mặc định">
                <select value={form.default_price_type} onChange={(e) => set('default_price_type', e.target.value)} disabled={!canManage} className={inputCls}>
                  <option value="retail">Bán lẻ (retail)</option>
                  <option value="wholesale">Bán sỉ (wholesale)</option>
                  <option value="vip">VIP</option>
                  <option value="staff">Nội bộ (staff)</option>
                </select>
              </Field>
            </div>
            <Field label="Bán khi hết hàng">
              <label className="flex cursor-pointer items-center gap-3">
                <div
                  onClick={() => canManage && set('allow_negative_stock', !form.allow_negative_stock)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${form.allow_negative_stock ? 'bg-blue-600' : 'bg-slate-200'} ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.allow_negative_stock ? 'translate-x-5' : ''}`}
                  />
                </div>
                <span className="text-sm text-slate-600">
                  {form.allow_negative_stock ? 'Cho phép bán khi tồn kho = 0' : 'Không cho phép bán khi hết hàng'}
                </span>
              </label>
            </Field>
            <Field label="Tự động in hóa đơn">
              <label className="flex cursor-pointer items-center gap-3 mt-1">
                <div
                  onClick={() => canManage && set('auto_print_receipt', !form.auto_print_receipt)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${form.auto_print_receipt ? 'bg-blue-600' : 'bg-slate-200'} ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.auto_print_receipt ? 'translate-x-5' : ''}`}
                  />
                </div>
                <span className="text-sm text-slate-600">
                  {form.auto_print_receipt ? 'Tự động in sau khi tạo đơn POS' : 'Tắt tự động in hóa đơn'}
                </span>
              </label>
            </Field>
          </Section>

          {/* ── Save button ── */}
          {canManage && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saveState === 'saving'}
                className="cursor-pointer rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saveState === 'saving' ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
              {saveState === 'saved' && <p className="text-sm text-green-600">Đã lưu thành công.</p>}
              {saveState === 'error' && <p className="text-sm text-red-600">Lưu thất bại. Thử lại.</p>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Section({ id, title, description, children }: { id?: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <div id={id} className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}


const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed';

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    return `${Math.floor(hours / 24)} ngày trước`;
  } catch { return ''; }
}
