'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { BANKS } from '@/lib/constants/banks';
import { getVerticalConfig } from '@oni/core';

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
  enable_shift_management?: boolean;
  synced_from_sheet_at: string | null;
  updated_at: string;
  // CRM Settings
  has_crm_access?: boolean;
  loyalty_points_enabled?: boolean;
  loyalty_money_to_point?: number;
  loyalty_point_to_money?: number;
  tier_reward_type?: string;
  tier_evaluation_years?: number;
  tier_gold_threshold?: number;
  tier_silver_threshold?: number;
  tier_bronze_threshold?: number;
  tier_gold_discount?: number;
  tier_silver_discount?: number;
  tier_bronze_discount?: number;
  membership_tiers?: { name: string; threshold: number; discount: number }[];
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
  permissions?: string[];
  industryType?: string;
}

function toRawNumber(val: string): string {
  return val.replace(/\./g, '')
}

function formatWithDots(val: string | number): string {
  if (val === undefined || val === null || val === '') return ''
  const clean = String(val).replace(/[^0-9]/g, '')
  if (!clean) return ''
  return parseFloat(clean).toLocaleString('vi-VN')
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function ShopSettingsForm({ shop, settings: initial, canManage, permissions = [], industryType }: Props) {
  const canManageSettings = canManage;
  const canManageQr = permissions.includes('qr_order.manage') || canManageSettings;
  const canManageCrm = permissions.includes('crm.manage') || canManageSettings;

  const vertical = getVerticalConfig(industryType || 'retail');
  const resourceLabel = industryType === 'fnb' ? 'bàn ăn' : (vertical.resourceLabel?.toLowerCase() || 'bàn');
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
    enable_shift_management: initial.enable_shift_management ?? false,
    // CRM Settings
    loyalty_points_enabled: initial.loyalty_points_enabled ?? true,
    loyalty_money_to_point: String(initial.loyalty_money_to_point ?? 100000),
    loyalty_point_to_money: String(initial.loyalty_point_to_money ?? 1000),
    tier_reward_type: initial.tier_reward_type ?? 'discount_bill',
    tier_evaluation_years: String(initial.tier_evaluation_years ?? 3),
    membership_tiers: (initial.membership_tiers && initial.membership_tiers.length > 0
      ? initial.membership_tiers
      : [
          { name: 'Đồng', threshold: 5000000, discount: 2, color: 'slate' },
          { name: 'Bạc', threshold: 15000000, discount: 5, color: 'sapphire' },
          { name: 'Vàng', threshold: 35000000, discount: 10, color: 'gold' }
        ]) as { name: string; threshold: number | string; discount: number | string; color?: string }[],
  });
  const [saveState, setSaveState] = useState<SaveState>('idle');

  function set(key: keyof typeof form, value: any) {
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
          enable_shift_management: form.enable_shift_management,
          // CRM updates
          loyalty_points_enabled: form.loyalty_points_enabled,
          loyalty_money_to_point: parseFloat(form.loyalty_money_to_point) || 100000,
          loyalty_point_to_money: parseFloat(form.loyalty_point_to_money) || 1000,
          tier_reward_type: form.tier_reward_type,
          tier_evaluation_years: parseInt(form.tier_evaluation_years, 10) || 3,
          membership_tiers: form.membership_tiers.map((t: any) => ({
            name: t.name,
            threshold: parseFloat(String(t.threshold)) || 0,
            discount: parseFloat(String(t.discount)) || 0,
            color: t.color || 'slate'
          })),
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
            <Field label="Quản lý ca làm việc (POS)">
              <div
                onClick={() => canManage && set('enable_shift_management', !form.enable_shift_management)}
                className="flex cursor-pointer items-center gap-3 mt-1"
              >
                <div
                  className={`relative h-6 w-11 rounded-full transition-colors ${form.enable_shift_management ? 'bg-primary' : 'bg-slate-200'} ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.enable_shift_management ? 'translate-x-5' : ''}`}
                  />
                </div>
                <span className="text-sm text-slate-600 select-none">
                  {form.enable_shift_management ? 'Bắt buộc đóng/mở ca khi bán hàng tại POS (Hạn chế thất thoát)' : 'Bán hàng liên tục không chia ca (Phù hợp hộ kinh doanh/SME)'}
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
            <Field label={`Tự động mở ${resourceLabel} khi quét QR` + (!canManageQr ? ' 🔒 (Cần quyền)' : '')}>
              <div
                onClick={() => canManageQr && set('qr_auto_approve_session', !form.qr_auto_approve_session)}
                className={`flex items-center gap-3 mt-1 ${canManageQr ? 'cursor-pointer' : 'cursor-not-allowed'}`}
              >
                <div
                  className={`relative h-6 w-11 rounded-full transition-colors ${form.qr_auto_approve_session ? 'bg-primary' : 'bg-slate-200'} ${canManageQr ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.qr_auto_approve_session ? 'translate-x-5' : ''}`}
                  />
                </div>
                <span className="text-sm text-slate-600 select-none">
                  {form.qr_auto_approve_session 
                    ? `Tự động kích hoạt ${resourceLabel} ngay khi khách quét QR` 
                    : `Khách quét QR gửi yêu cầu, nhân viên phải duyệt mở ${resourceLabel} bằng tay (Mặc định)`}
                </span>
              </div>
            </Field>
          </Section>

          {/* ── Section: Cấu hình CRM & Hạng thành viên ── */}
          <Section title="Cấu hình CRM & Hạng thành viên" description="Thiết lập tỷ lệ tích lũy điểm, tiêu điểm và chiết khấu hạng thẻ khách hàng">
            {initial.has_crm_access === false ? (
              <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50/50 p-6 text-center space-y-3">
                <div className="text-3xl">🔒</div>
                <h3 className="text-sm font-bold text-slate-800">Tính năng CRM & Tích điểm Hạng thẻ đang bị khóa</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Tính năng quản lý Ví trả trước, Tích điểm thành viên và tự động thăng hạng thẻ khách hàng yêu cầu gói đăng ký <strong>Chuyên nghiệp (Pro)</strong> trở lên hoặc khi đã kích hoạt Add-on CRM.
                </p>
                <a
                  href="/billing"
                  className="inline-block rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700 active:scale-95 transition-all shadow-xs"
                >
                  Nâng cấp gói ngay
                </a>
              </div>
            ) : (
              <>
                <Field label={`Tích lũy điểm CRM` + (!canManageCrm ? ' 🔒 (Cần quyền)' : '')}>
                  <div
                    onClick={() => canManageCrm && set('loyalty_points_enabled', !form.loyalty_points_enabled)}
                    className={`flex items-center gap-3 ${canManageCrm ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                  >
                    <div
                      className={`relative h-6 w-11 rounded-full transition-colors ${form.loyalty_points_enabled ? 'bg-primary' : 'bg-slate-200'} ${canManageCrm ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.loyalty_points_enabled ? 'translate-x-5' : ''}`}
                      />
                    </div>
                    <span className="text-sm text-slate-600 select-none">
                      {form.loyalty_points_enabled ? 'Đang bật tích lũy điểm & tiêu dùng điểm cho khách' : 'Đã tắt tính năng tích điểm'}
                    </span>
                  </div>
                </Field>

                {form.loyalty_points_enabled && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2 border-t border-slate-100 pt-4 mt-2">
                      <Field label={`Tỷ lệ Tích điểm (Mua bao nhiêu được 1 điểm)` + (!canManageCrm ? ' 🔒' : '')} hint="Ví dụ: 100.000đ chi tiêu = 1 điểm">
                        <input
                          type="text"
                          value={formatWithDots(form.loyalty_money_to_point)}
                          onChange={(e) => set('loyalty_money_to_point', toRawNumber(e.target.value))}
                          disabled={!canManageCrm}
                          className={inputCls}
                          placeholder="100.000"
                        />
                      </Field>
                      <Field label={`Giá trị Tiêu điểm (1 điểm bằng bao nhiêu VNĐ)` + (!canManageCrm ? ' 🔒' : '')} hint="Ví dụ: 1 điểm = 1.000đ khi thanh toán">
                        <input
                          type="text"
                          value={formatWithDots(form.loyalty_point_to_money)}
                          onChange={(e) => set('loyalty_point_to_money', toRawNumber(e.target.value))}
                          disabled={!canManageCrm}
                          className={inputCls}
                          placeholder="1.000"
                        />
                      </Field>
                    </div>

                    <div className="border-t border-slate-100 pt-4 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cấu hình Hạng thành viên {!canManageCrm && '🔒'}</h3>
                          <p className="text-xs text-slate-400">Doanh thu tích lũy được xét trong thời gian quy định.</p>
                        </div>
                        <div className="w-full sm:w-32">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Năm xét hạng</label>
                          <input
                            type="number" min="1" max="10"
                            value={form.tier_evaluation_years}
                            onChange={(e) => set('tier_evaluation_years', e.target.value)}
                            disabled={!canManageCrm}
                            className={inputCls}
                            placeholder="3"
                          />
                        </div>
                      </div>

                      {/* Dynamic Tier Builder List */}
                      <div className="space-y-3">
                        <div className="hidden sm:grid sm:grid-cols-12 gap-4 px-2 text-xs font-semibold text-slate-500 uppercase">
                          <div className="col-span-3">Tên hạng thành viên</div>
                          <div className="col-span-3">Doanh thu tối thiểu (VNĐ)</div>
                          <div className="col-span-2">Chiết khấu bill (%)</div>
                          <div className="col-span-3">Màu sắc / Template</div>
                          <div className="col-span-1 text-center">Xóa</div>
                        </div>

                        <div className="space-y-3">
                          {form.membership_tiers.map((tier, idx) => (
                            <div key={idx} className="flex flex-col sm:grid sm:grid-cols-12 gap-3 sm:gap-4 p-3 sm:p-2 bg-slate-50 sm:bg-transparent rounded-xl sm:rounded-none border border-slate-100 sm:border-0 relative">
                              {/* Tier Name */}
                              <div className="col-span-3 space-y-1 sm:space-y-0">
                                <label className="block sm:hidden text-[10px] font-bold text-slate-400 uppercase">Tên hạng thành viên</label>
                                <input
                                  type="text"
                                  value={tier.name}
                                  onChange={(e) => {
                                    const updated = [...form.membership_tiers];
                                    updated[idx] = { ...updated[idx], name: e.target.value };
                                    set('membership_tiers', updated);
                                  }}
                                  disabled={!canManageCrm}
                                  className={inputCls}
                                  placeholder="Ví dụ: Đồng, Bạc, Vàng, VIP..."
                                />
                              </div>

                              {/* Minimum Revenue with thousands separator masking */}
                              <div className="col-span-3 space-y-1 sm:space-y-0">
                                <label className="block sm:hidden text-[10px] font-bold text-slate-400 uppercase">Doanh thu tối thiểu (VNĐ)</label>
                                <input
                                  type="text"
                                  value={formatWithDots(tier.threshold)}
                                  onChange={(e) => {
                                    const updated = [...form.membership_tiers];
                                    updated[idx] = { ...updated[idx], threshold: toRawNumber(e.target.value) };
                                    set('membership_tiers', updated);
                                  }}
                                  disabled={!canManageCrm}
                                  className={inputCls}
                                  placeholder="5.000.000"
                                />
                              </div>

                              {/* Discount bill */}
                              <div className="col-span-2 space-y-1 sm:space-y-0">
                                <label className="block sm:hidden text-[10px] font-bold text-slate-400 uppercase">Chiết khấu bill (%)</label>
                                <div className="relative flex items-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    value={tier.discount}
                                    onChange={(e) => {
                                      const updated = [...form.membership_tiers];
                                      updated[idx] = { ...updated[idx], discount: e.target.value };
                                      set('membership_tiers', updated);
                                    }}
                                    disabled={!canManageCrm}
                                    className="w-full rounded-xl border border-slate-200 bg-white pl-4 pr-8 py-2.5 text-sm focus:border-primary focus:outline-none"
                                    placeholder="5"
                                  />
                                  <span className="absolute right-4 text-xs font-semibold text-slate-400">%</span>
                                </div>
                              </div>

                              {/* Color template selector */}
                              <div className="col-span-3 space-y-1 sm:space-y-0">
                                <label className="block sm:hidden text-[10px] font-bold text-slate-400 uppercase">Màu sắc / Template</label>
                                <select
                                  value={tier.color || 'slate'}
                                  onChange={(e) => {
                                    const updated = [...form.membership_tiers];
                                    updated[idx] = { ...updated[idx], color: e.target.value };
                                    set('membership_tiers', updated);
                                  }}
                                  disabled={!canManageCrm}
                                  className={inputCls}
                                >
                                  <option value="emerald">🟢 Ngọc lục bảo (Emerald)</option>
                                  <option value="sapphire">🔵 Xanh Sapphire</option>
                                  <option value="amethyst">🟣 Tím Amethyst</option>
                                  <option value="ruby">🔴 Đỏ Ruby</option>
                                  <option value="amber">🟠 Hổ phách (Amber)</option>
                                  <option value="rose">💗 Hồng Rose</option>
                                  <option value="cyan">🩵 Xanh Cyan</option>
                                  <option value="indigo">🌀 Xanh Indigo</option>
                                  <option value="slate">⚪ Xám Slate</option>
                                  <option value="gold">👑 Vàng Gold</option>
                                  <option value="silver">🥈 Bạc Silver</option>
                                  <option value="bronze">🟤 Đồng Bronze</option>
                                </select>
                              </div>

                              {/* Action: Delete */}
                              <div className="col-span-1 flex items-center justify-end sm:justify-center mt-2 sm:mt-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (form.membership_tiers.length <= 1) {
                                      toast.error('Cần giữ lại ít nhất 1 hạng thành viên!');
                                      return;
                                    }
                                    const updated = form.membership_tiers.filter((_, i) => i !== idx);
                                    set('membership_tiers', updated);
                                  }}
                                  disabled={!canManageCrm}
                                  className="p-2 text-rose-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 disabled:hover:bg-transparent rounded-lg transition-colors cursor-pointer"
                                  title="Xóa hạng thành viên"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Add Tier Button */}
                        {canManageCrm && (
                          <div className="pt-2 px-2">
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [
                                  ...form.membership_tiers,
                                  { name: 'Hạng Mới', threshold: 0, discount: 0 }
                                ];
                                set('membership_tiers', updated);
                              }}
                              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/5 rounded-xl border border-dashed border-primary/30 transition-all cursor-pointer active:scale-95"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                              </svg>
                              Thêm hạng mới
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </Section>

          {/* ── Save button ── */}
          {(canManage || canManageQr || canManageCrm) && (
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
