'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { BANKS } from '@/lib/constants/banks';

interface ShopSettings {
  shop_id: string;
  shop_name: string | null;
  currency: string;
  timezone: string;
  tax_rate: number;
  invoice_prefix: string;
  low_stock_threshold: number;
  allow_negative_stock: boolean;
  auto_print_receipt: boolean;
  mute_pos_sound: boolean;
  skip_cleaning_process: boolean;
  skip_return_confirmation: boolean;
  tax_id?: string | null;
  wifi_info?: string | null;
  bank_code?: string | null;
  bank_account_number?: string | null;
  bank_account_name?: string | null;
  qr_template?: string | null;
  receipt_footer?: string | null;
  default_price_type: string;
  qr_auto_approve_session?: boolean;
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
  address?: string | null;
  phone?: string | null;
}

interface Props {
  shop: Shop;
  settings: ShopSettings;
  canManage: boolean;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function ShopSettingsForm({ shop, settings: initial, canManage }: Props) {
  const [form, setForm] = useState({
    shop_name: shop.name, // always prefer the canonical name from the shops table
    address: shop.address ?? '',
    phone: shop.phone ?? '',
    currency: initial.currency,
    timezone: initial.timezone,
    tax_rate: String(initial.tax_rate),
    invoice_prefix: initial.invoice_prefix,
    low_stock_threshold: String(initial.low_stock_threshold),
    allow_negative_stock: initial.allow_negative_stock,
    auto_print_receipt: initial.auto_print_receipt ?? true,
    mute_pos_sound: initial.mute_pos_sound ?? false,
    skip_cleaning_process: initial.skip_cleaning_process ?? false,
    skip_return_confirmation: initial.skip_return_confirmation ?? false,
    tax_id: initial.tax_id ?? '',
    wifi_info: initial.wifi_info ?? '',
    bank_code: initial.bank_code ?? '',
    bank_account_number: initial.bank_account_number ?? '',
    bank_account_name: initial.bank_account_name ?? '',
    qr_template: initial.qr_template ?? 'compact2',
    receipt_footer: initial.receipt_footer ?? '',
    default_price_type: initial.default_price_type,
    qr_auto_approve_session: initial.qr_auto_approve_session ?? false,
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
          address: form.address || undefined,
          phone: form.phone || undefined,
          currency: form.currency,
          timezone: form.timezone,
          tax_rate: parseFloat(form.tax_rate) || 0,
          invoice_prefix: form.invoice_prefix,
          low_stock_threshold: parseInt(form.low_stock_threshold, 10) || 0,
          allow_negative_stock: form.allow_negative_stock,
          auto_print_receipt: form.auto_print_receipt,
          mute_pos_sound: form.mute_pos_sound,
          skip_cleaning_process: form.skip_cleaning_process,
          skip_return_confirmation: form.skip_return_confirmation,
          tax_id: form.tax_id,
          wifi_info: form.wifi_info,
          bank_code: form.bank_code,
          bank_account_number: form.bank_account_number,
          bank_account_name: form.bank_account_name,
          qr_template: form.qr_template,
          receipt_footer: form.receipt_footer,
          default_price_type: form.default_price_type,
          qr_auto_approve_session: form.qr_auto_approve_session,
        }),
      });
      if (!res.ok) throw new Error();
      setSaveState('saved');
      toast.success('Đã lưu cấu hình chi nhánh!');
      setTimeout(() => setSaveState('idle'), 2500);
    } catch {
      setSaveState('error');
      toast.error('Có lỗi xảy ra khi lưu cấu hình. Vui lòng thử lại.');
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
            <Field label="Số điện thoại">
              <input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                disabled={!canManage}
                className={inputCls}
                placeholder="0912 345 678"
              />
            </Field>
          </Section>

          {/* ── Section: Thông tin Hóa đơn ── */}
          <Section title="Thông tin Hóa đơn" description="Các thông tin sẽ được in trên bill thanh toán cho khách">
            <Field label="Mã số thuế (Tax ID)">
              <input
                value={form.tax_id}
                onChange={(e) => set('tax_id', e.target.value)}
                disabled={!canManage}
                className={inputCls}
                placeholder="0123456789"
              />
            </Field>
            <Field label="Thông tin Wi-Fi" hint="Ví dụ: ONI / 12345678">
              <input
                value={form.wifi_info}
                onChange={(e) => set('wifi_info', e.target.value)}
                disabled={!canManage}
                className={inputCls}
                placeholder="ONI / 12345678"
              />
            </Field>
            <div className="border-t border-slate-100 pt-4 mt-4 lg:flex lg:gap-6">
              <div className="flex-1 space-y-4">
                <Field label="Ngân hàng nhận thanh toán" hint="Để khách hàng dễ dàng chuyển khoản">
                  <select
                    value={form.bank_code}
                    onChange={(e) => set('bank_code', e.target.value)}
                    disabled={!canManage}
                    className={inputCls}
                  >
                    <option value="">-- Chọn ngân hàng --</option>
                    {BANKS.map((bank: any) => (
                      <option key={bank.code} value={bank.code}>
                        {bank.shortName} - {bank.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {form.bank_code && (
                  <>
                    <Field label="Số tài khoản">
                      <input
                        value={form.bank_account_number}
                        onChange={(e) => set('bank_account_number', e.target.value)}
                        disabled={!canManage}
                        className={inputCls}
                        placeholder="0123456789"
                      />
                    </Field>
                    <Field label="Tên chủ tài khoản">
                      <input
                        value={form.bank_account_name}
                        onChange={(e) => set('bank_account_name', e.target.value)}
                        disabled={!canManage}
                        className={inputCls}
                        placeholder="NGUYEN VAN A"
                        style={{ textTransform: 'uppercase' }}
                      />
                    </Field>
                    <Field label="Giao diện QR">
                      <select
                        value={form.qr_template}
                        onChange={(e) => set('qr_template', e.target.value)}
                        disabled={!canManage}
                        className={inputCls}
                      >
                        <option value="compact2">Compact 2 (Kèm Logo, Thông tin chuyển khoản)</option>
                        <option value="compact">Compact (QR kèm logo)</option>
                        <option value="qr_only">QR Only (Chỉ ảnh QR)</option>
                        <option value="print">Print (Đầy đủ thông tin)</option>
                      </select>
                    </Field>
                  </>
                )}
              </div>

              {form.bank_code && (
                <div className="w-full lg:w-48 xl:w-56 mt-6 lg:mt-0 flex flex-col items-center border-l-0 lg:border-l border-slate-100 lg:pl-6">
                  <span className="text-xs font-medium text-slate-500 uppercase mb-3 text-center block w-full">Xem trước mã QR</span>
                  {form.bank_account_number && form.bank_account_name ? (
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={`https://img.vietqr.io/image/${form.bank_code}-${form.bank_account_number}-${form.qr_template}.png?amount=990000&addInfo=ONIAB12CD34&accountName=${encodeURIComponent(form.bank_account_name)}`} 
                        alt="VietQR Preview" 
                        className="w-full max-w-[200px] h-auto rounded-lg shadow-sm"
                      />
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 italic text-center p-4 bg-slate-50 rounded-xl border border-slate-200 border-dashed w-full h-full flex items-center justify-center min-h-[150px]">
                      Nhập Số TK và Tên để xem trước.
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="border-t border-slate-100 pt-4 mt-4">
              <Field label="Lời cảm ơn (Cuối bill)">
                <textarea
                  value={form.receipt_footer}
                  onChange={(e) => set('receipt_footer', e.target.value)}
                  disabled={!canManage}
                  className={inputCls}
                  rows={2}
                  placeholder="Cảm ơn quý khách đã mua hàng tại ONI!"
                />
              </Field>
            </div>
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
              <div
                onClick={() => canManage && set('allow_negative_stock', !form.allow_negative_stock)}
                className="flex cursor-pointer items-center gap-3"
              >
                <div
                  className={`relative h-6 w-11 rounded-full transition-colors ${form.allow_negative_stock ? 'bg-primary' : 'bg-slate-200'} ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.allow_negative_stock ? 'translate-x-5' : ''}`}
                  />
                </div>
                <span className="text-sm text-slate-600 select-none">
                  {form.allow_negative_stock ? 'Cho phép bán khi tồn kho = 0' : 'Không cho phép bán khi hết hàng'}
                </span>
              </div>
            </Field>
            <Field label="Tự động in hóa đơn">
              <div
                onClick={() => canManage && set('auto_print_receipt', !form.auto_print_receipt)}
                className="flex cursor-pointer items-center gap-3 mt-1"
              >
                <div
                  className={`relative h-6 w-11 rounded-full transition-colors ${form.auto_print_receipt ? 'bg-primary' : 'bg-slate-200'} ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.auto_print_receipt ? 'translate-x-5' : ''}`}
                  />
                </div>
                <span className="text-sm text-slate-600 select-none">
                  {form.auto_print_receipt ? 'Tự động in sau khi tạo đơn POS' : 'Tắt tự động in hóa đơn'}
                </span>
              </div>
            </Field>
            <Field label="Âm thanh POS">
              <div
                onClick={() => canManage && set('mute_pos_sound', !form.mute_pos_sound)}
                className="flex cursor-pointer items-center gap-3 mt-1"
              >
                <div
                  className={`relative h-6 w-11 rounded-full transition-colors ${!form.mute_pos_sound ? 'bg-primary' : 'bg-slate-200'} ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${!form.mute_pos_sound ? 'translate-x-5' : ''}`}
                  />
                </div>
                <span className="text-sm text-slate-600 select-none">
                  {!form.mute_pos_sound ? 'Phát âm thanh khi quét mã/chọn món' : 'Đã tắt âm thanh (Mute)'}
                </span>
              </div>
            </Field>
            <Field label="Bỏ qua dọn dẹp">
              <div
                onClick={() => canManage && set('skip_cleaning_process', !form.skip_cleaning_process)}
                className="flex cursor-pointer items-center gap-3 mt-1"
              >
                <div
                  className={`relative h-6 w-11 rounded-full transition-colors ${form.skip_cleaning_process ? 'bg-primary' : 'bg-slate-200'} ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.skip_cleaning_process ? 'translate-x-5' : ''}`}
                  />
                </div>
                <span className="text-sm text-slate-600 select-none">
                  {form.skip_cleaning_process ? 'Chuyển về trạng thái Trống/Sẵn sàng ngay sau khi thanh toán' : 'Chuyển về trạng thái Dọn dẹp sau khi thanh toán'}
                </span>
              </div>
            </Field>
            <Field label="Bỏ qua duyệt trả hàng">
              <div
                onClick={() => canManage && set('skip_return_confirmation', !form.skip_return_confirmation)}
                className="flex cursor-pointer items-center gap-3 mt-1"
              >
                <div
                  className={`relative h-6 w-11 rounded-full transition-colors ${form.skip_return_confirmation ? 'bg-primary' : 'bg-slate-200'} ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.skip_return_confirmation ? 'translate-x-5' : ''}`}
                  />
                </div>
                <span className="text-sm text-slate-600 select-none">
                  {form.skip_return_confirmation ? 'Tự động duyệt và hoàn kho/tạo phiếu chi khi tạo phiếu trả hàng' : 'Cần người có thẩm quyền duyệt phiếu trả hàng'}
                </span>
              </div>
            </Field>
            <Field label="Tự động mở bàn ăn khi quét QR">
              <div
                onClick={() => canManage && set('qr_auto_approve_session', !form.qr_auto_approve_session)}
                className="flex cursor-pointer items-center gap-3 mt-1"
              >
                <div
                  className={`relative h-6 w-11 rounded-full transition-colors ${form.qr_auto_approve_session ? 'bg-primary' : 'bg-slate-200'} ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.qr_auto_approve_session ? 'translate-x-5' : ''}`}
                  />
                </div>
                <span className="text-sm text-slate-600 select-none">
                  {form.qr_auto_approve_session ? 'Tự động kích hoạt bàn ăn ngay khi khách quét QR' : 'Khách quét QR gửi yêu cầu, nhân viên phải duyệt mở bàn ăn bằng tay (Mặc định)'}
                </span>
              </div>
            </Field>
          </Section>

          {/* ── Save button ── */}
          {canManage && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saveState === 'saving'}
                className="cursor-pointer rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60 transition-colors"
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
