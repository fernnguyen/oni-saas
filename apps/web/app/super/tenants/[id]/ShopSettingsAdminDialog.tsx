'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { X, Save, ShieldAlert, Check } from 'lucide-react';
import { BANKS } from '@/lib/constants/banks';

interface ShopSettings {
  shop_id: string;
  shop_name: string;
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
  tax_id?: string;
  wifi_info?: string;
  bank_code?: string;
  bank_account_number?: string;
  bank_account_name?: string;
  qr_template?: string;
  receipt_footer?: string;
  print_bilingual?: boolean;
  show_brand_attribution?: boolean;
  default_price_type: string;
  qr_auto_approve_session?: boolean;
  enable_shift_management?: boolean;
  strict_shift_lock?: boolean;
  address?: string;
  phone?: string;
  industry_type?: string;

  // Debt Alert Settings
  default_max_debt_days?: number;
  default_max_debt_amount?: number;
  allow_sell_over_debt_limit?: boolean;

  // CRM Settings
  has_crm_access?: boolean;
  loyalty_points_enabled?: boolean;
  loyalty_money_to_point?: number;
  loyalty_point_to_money?: number;
  tier_reward_type?: string;
  tier_evaluation_years?: number;
  membership_tiers?: { name: string; threshold: number | string; discount: number | string; color?: string }[];
  share_customers?: boolean;

  sepay_webhook_token?: string;
  sepay_auth_method?: 'token_query' | 'hmac' | 'api_key' | 'oauth' | 'none';
  sepay_hmac_key?: string;
  sepay_api_key?: string;
  sepay_bank_filter?: string;
  sepay_transaction_type?: 'all' | 'in_only' | 'out_only';
}

interface ShopSettingsAdminDialogProps {
  shopId: string;
  shopName: string;
  shopSlug: string;
  children: React.ReactNode;
}

export function ShopSettingsAdminDialog({
  shopId,
  shopName,
  shopSlug,
  children,
}: ShopSettingsAdminDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'sales' | 'crm' | 'sepay'>('general');
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const router = useRouter();

  // Load settings when modal is opened
  useEffect(() => {
    if (!isOpen) return;

    async function fetchSettings() {
      setLoading(true);
      try {
        const res = await fetch(`/api/super/shops/${shopId}/settings`);
        if (!res.ok) {
          throw new Error('Không thể tải cấu hình chi nhánh');
        }
        const data = await res.json();
        setSettings(data);
      } catch (err: any) {
        toast.error(err.message || 'Có lỗi xảy ra khi tải cài đặt');
        setIsOpen(false);
      } finally {
        setLoading(false);
      }
    }

    void fetchSettings();
  }, [isOpen, shopId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/super/shops/${shopId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Không thể lưu cài đặt');
      }

      toast.success('Lưu cài đặt chi nhánh thành công');
      setIsOpen(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Lưu cấu hình thất bại');
    } finally {
      setSaving(false);
    }
  }

  const updateField = (key: keyof ShopSettings, value: any) => {
    setSettings((prev) => {
      if (!prev) return null;
      return { ...prev, [key]: value };
    });
  };

  return (
    <>
      <div onClick={() => setIsOpen(true)} className="cursor-pointer">
        {children}
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                  <span>Cấu hình Chi nhánh: {shopName}</span>
                  <span className="text-xs font-mono font-normal bg-slate-200 text-slate-600 px-2 py-0.5 rounded">
                    {shopSlug}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Quyền quản trị tối cao (Superadmin Bypass RLS)
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                <span className="text-sm text-slate-500 font-medium">Đang tải cấu hình chi nhánh...</span>
              </div>
            ) : !settings ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
                <ShieldAlert className="h-10 w-10 text-red-500" />
                <span className="text-sm font-medium">Không tìm thấy dữ liệu cấu hình.</span>
              </div>
            ) : (
              <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
                {/* Tabs Selector */}
                <div className="flex border-b border-slate-100 px-6 bg-slate-50/50 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveTab('general')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                      activeTab === 'general'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Cấu hình chung
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('sales')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                      activeTab === 'sales'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Bán hàng & POS
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('crm')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                      activeTab === 'crm'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Tích điểm & Công nợ
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('sepay')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                      activeTab === 'sepay'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Ngân hàng & SePay
                  </button>
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {activeTab === 'general' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                          Tên chi nhánh
                        </label>
                        <input
                          type="text"
                          value={settings.shop_name || ''}
                          onChange={(e) => updateField('shop_name', e.target.value)}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                          Số điện thoại
                        </label>
                        <input
                          type="text"
                          value={settings.phone || ''}
                          onChange={(e) => updateField('phone', e.target.value)}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                          Địa chỉ chi nhánh
                        </label>
                        <input
                          type="text"
                          value={settings.address || ''}
                          onChange={(e) => updateField('address', e.target.value)}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                          Ngành nghề kinh doanh
                        </label>
                        <select
                          value={settings.industry_type || 'retail'}
                          onChange={(e) => updateField('industry_type', e.target.value)}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                        >
                          <option value="retail">Bán lẻ / Tạp hóa (Retail)</option>
                          <option value="fnb">Ẩm thực / Nhà hàng (FnB)</option>
                          <option value="beauty">Spa / Làm đẹp (Beauty)</option>
                          <option value="hotel">Khách sạn / Lưu trú (Hotel)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                          Mã số thuế
                        </label>
                        <input
                          type="text"
                          value={settings.tax_id || ''}
                          onChange={(e) => updateField('tax_id', e.target.value)}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                          Tiền tệ mặc định
                        </label>
                        <input
                          type="text"
                          value={settings.currency || 'VND'}
                          onChange={(e) => updateField('currency', e.target.value)}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                          Múi giờ hoạt động
                        </label>
                        <input
                          type="text"
                          value={settings.timezone || 'Asia/Ho_Chi_Minh'}
                          onChange={(e) => updateField('timezone', e.target.value)}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                          required
                        />
                      </div>
                    </div>
                  )}

                  {activeTab === 'sales' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                            Bảng giá mặc định
                          </label>
                          <select
                            value={settings.default_price_type || 'retail'}
                            onChange={(e) => updateField('default_price_type', e.target.value)}
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                          >
                            <option value="retail">Bán lẻ</option>
                            <option value="wholesale">Bán sỉ</option>
                            <option value="vip">Giá VIP</option>
                            <option value="staff">Giá nhân viên</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                            Tiền tố mã hóa đơn (invoice_prefix)
                          </label>
                          <input
                            type="text"
                            value={settings.invoice_prefix || ''}
                            onChange={(e) => updateField('invoice_prefix', e.target.value)}
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                            Ngưỡng cảnh báo tồn kho thấp
                          </label>
                          <input
                            type="number"
                            value={settings.low_stock_threshold ?? 5}
                            onChange={(e) => updateField('low_stock_threshold', parseInt(e.target.value) || 0)}
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                            Thuế suất mặc định (%)
                          </label>
                          <input
                            type="number"
                            value={settings.tax_rate ?? 0}
                            onChange={(e) => updateField('tax_rate', parseFloat(e.target.value) || 0)}
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                          />
                        </div>
                      </div>

                      <hr className="border-slate-100" />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.allow_negative_stock || false}
                            onChange={(e) => updateField('allow_negative_stock', e.target.checked)}
                            className="rounded border-slate-300 text-primary focus:ring-primary h-4.5 w-4.5"
                          />
                          <div className="text-sm">
                            <p className="font-semibold text-slate-700">Cho phép bán âm kho</p>
                            <p className="text-xs text-slate-400">Có thể xuất bán sản phẩm khi tồn kho bằng 0 hoặc âm.</p>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.auto_print_receipt || false}
                            onChange={(e) => updateField('auto_print_receipt', e.target.checked)}
                            className="rounded border-slate-300 text-primary focus:ring-primary h-4.5 w-4.5"
                          />
                          <div className="text-sm">
                            <p className="font-semibold text-slate-700">Tự động in hóa đơn</p>
                            <p className="text-xs text-slate-400">Tự động kích hoạt in hóa đơn ngay sau khi hoàn tất thanh toán.</p>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.mute_pos_sound || false}
                            onChange={(e) => updateField('mute_pos_sound', e.target.checked)}
                            className="rounded border-slate-300 text-primary focus:ring-primary h-4.5 w-4.5"
                          />
                          <div className="text-sm">
                            <p className="font-semibold text-slate-700">Tắt âm thanh POS</p>
                            <p className="text-xs text-slate-400">Mute toàn bộ âm thanh hiệu ứng khi thao tác bán hàng.</p>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.print_bilingual || false}
                            onChange={(e) => updateField('print_bilingual', e.target.checked)}
                            className="rounded border-slate-300 text-primary focus:ring-primary h-4.5 w-4.5"
                          />
                          <div className="text-sm">
                            <p className="font-semibold text-slate-700">In hóa đơn song ngữ</p>
                            <p className="text-xs text-slate-400">In song ngữ Việt - Anh trên mẫu in hóa đơn mặc định.</p>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.show_brand_attribution || false}
                            onChange={(e) => updateField('show_brand_attribution', e.target.checked)}
                            className="rounded border-slate-300 text-primary focus:ring-primary h-4.5 w-4.5"
                          />
                          <div className="text-sm">
                            <p className="font-semibold text-slate-700">Hiển thị logo bản quyền hệ thống</p>
                            <p className="text-xs text-slate-400">Hiển thị chân trang "Powered by Oni" ở cuối hóa đơn.</p>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.qr_auto_approve_session || false}
                            onChange={(e) => updateField('qr_auto_approve_session', e.target.checked)}
                            className="rounded border-slate-300 text-primary focus:ring-primary h-4.5 w-4.5"
                          />
                          <div className="text-sm">
                            <p className="font-semibold text-slate-700">Tự động duyệt gọi món QR</p>
                            <p className="text-xs text-slate-400">Hệ thống tự động duyệt món khi thực khách gửi yêu cầu qua QR Table.</p>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.enable_shift_management || false}
                            onChange={(e) => updateField('enable_shift_management', e.target.checked)}
                            className="rounded border-slate-300 text-primary focus:ring-primary h-4.5 w-4.5"
                          />
                          <div className="text-sm">
                            <p className="font-semibold text-slate-700">Kích hoạt quản lý ca làm việc</p>
                            <p className="text-xs text-slate-400">Yêu cầu khai báo mở/đóng ca để theo dõi doanh thu tiền mặt tại quầy.</p>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.strict_shift_lock || false}
                            onChange={(e) => updateField('strict_shift_lock', e.target.checked)}
                            className="rounded border-slate-300 text-primary focus:ring-primary h-4.5 w-4.5"
                          />
                          <div className="text-sm">
                            <p className="font-semibold text-slate-700">Bắt buộc khóa ca nghiêm ngặt</p>
                            <p className="text-xs text-slate-400">Không cho phép bán hàng nếu ca làm việc hiện tại chưa được mở.</p>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {activeTab === 'crm' && (
                    <div className="space-y-6">
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                        <div className="flex gap-3">
                          <ShieldAlert className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
                          <div className="text-xs text-slate-600 space-y-1">
                            <p className="font-semibold text-slate-800">Quyền hạn CRM của Tenant</p>
                            <p>
                              Trạng thái CRM của Tenant: {' '}
                              {settings.has_crm_access ? (
                                <span className="text-green-600 font-bold">ĐÃ KÍCH HOẠT (Có quyền cấu hình CRM)</span>
                              ) : (
                                <span className="text-red-500 font-bold">CHƯA KÍCH HOẠT (Vui lòng nâng cấp Features trước)</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>

                      {settings.has_crm_access && (
                        <div className="space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <label className="flex items-center gap-3 cursor-pointer border border-slate-100 p-3 rounded-lg bg-white">
                              <input
                                type="checkbox"
                                checked={settings.loyalty_points_enabled || false}
                                onChange={(e) => updateField('loyalty_points_enabled', e.target.checked)}
                                className="rounded border-slate-300 text-primary focus:ring-primary h-4.5 w-4.5"
                              />
                              <div className="text-sm">
                                <p className="font-semibold text-slate-700">Tích lũy điểm</p>
                                <p className="text-[11px] text-slate-400">Tích điểm khi thanh toán hóa đơn</p>
                              </div>
                            </label>

                            <div>
                              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                                Số tiền cho 1 điểm tích lũy
                              </label>
                              <input
                                type="number"
                                value={settings.loyalty_money_to_point ?? 100000}
                                onChange={(e) => updateField('loyalty_money_to_point', parseInt(e.target.value) || 1)}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                                Giá trị quy đổi của 1 điểm (đ)
                              </label>
                              <input
                                type="number"
                                value={settings.loyalty_point_to_money ?? 1000}
                                onChange={(e) => updateField('loyalty_point_to_money', parseInt(e.target.value) || 0)}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      <hr className="border-slate-100" />

                      <div>
                        <h4 className="text-sm font-semibold text-slate-800 mb-3">Quản lý và giới hạn công nợ khách hàng</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                              Số ngày nợ tối đa mặc định (ngày)
                            </label>
                            <input
                              type="number"
                              value={settings.default_max_debt_days ?? 30}
                              onChange={(e) => updateField('default_max_debt_days', parseInt(e.target.value) || 0)}
                              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                              Số tiền nợ tối đa mặc định (đ)
                            </label>
                            <input
                              type="number"
                              value={settings.default_max_debt_amount ?? 10000000}
                              onChange={(e) => updateField('default_max_debt_amount', parseInt(e.target.value) || 0)}
                              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                            />
                          </div>
                        </div>

                        <label className="flex items-center gap-3 cursor-pointer mt-4 border border-slate-100 p-3 rounded-lg bg-white">
                          <input
                            type="checkbox"
                            checked={settings.allow_sell_over_debt_limit || false}
                            onChange={(e) => updateField('allow_sell_over_debt_limit', e.target.checked)}
                            className="rounded border-slate-300 text-primary focus:ring-primary h-4.5 w-4.5"
                          />
                          <div className="text-sm">
                            <p className="font-semibold text-slate-700">Cho phép bán hàng vượt hạn mức nợ</p>
                            <p className="text-xs text-slate-400">Vẫn cho phép tạo đơn hàng ghi nợ mới khi khách hàng đã vượt quá giới hạn ngày nợ/tiền nợ tối đa.</p>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {activeTab === 'sepay' && (
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-800 mb-3">Tài khoản Ngân hàng nhận tiền QR (POS)</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                              Ngân hàng nhận
                            </label>
                            <select
                              value={settings.bank_code || ''}
                              onChange={(e) => updateField('bank_code', e.target.value)}
                              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                            >
                              <option value="">Chọn ngân hàng...</option>
                              {BANKS.map((b) => (
                                <option key={b.code} value={b.code}>
                                  {b.shortName} - {b.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                              Số tài khoản
                            </label>
                            <input
                              type="text"
                              value={settings.bank_account_number || ''}
                              onChange={(e) => updateField('bank_account_number', e.target.value)}
                              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                              Tên chủ tài khoản
                            </label>
                            <input
                              type="text"
                              value={settings.bank_account_name || ''}
                              onChange={(e) => updateField('bank_account_name', e.target.value)}
                              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                            />
                          </div>
                        </div>
                      </div>

                      <hr className="border-slate-100" />

                      <div>
                        <h4 className="text-sm font-semibold text-slate-800 mb-3">Kết nối tự động SePay Webhook</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                              Phương thức xác thực Webhook
                            </label>
                            <select
                              value={settings.sepay_auth_method || 'token_query'}
                              onChange={(e) => updateField('sepay_auth_method', e.target.value)}
                              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                            >
                              <option value="token_query">Token qua Query Parameter</option>
                              <option value="hmac">Chữ ký HMAC Key</option>
                              <option value="api_key">API Key trực tiếp</option>
                              <option value="none">Không xác thực (Không khuyến nghị)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                              SePay Webhook Token
                            </label>
                            <input
                              type="text"
                              value={settings.sepay_webhook_token || ''}
                              onChange={(e) => updateField('sepay_webhook_token', e.target.value)}
                              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                              placeholder="Nhập Token xác thực được cấu hình trên Sepay"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                              Sepay HMAC Key (nếu chọn xác thực HMAC)
                            </label>
                            <input
                              type="text"
                              value={settings.sepay_hmac_key || ''}
                              onChange={(e) => updateField('sepay_hmac_key', e.target.value)}
                              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                              SePay API Key (cho phép gọi ngược API Sepay)
                            </label>
                            <input
                              type="text"
                              value={settings.sepay_api_key || ''}
                              onChange={(e) => updateField('sepay_api_key', e.target.value)}
                              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                              Bộ lọc số tài khoản nhận tiền (Sepay bank filter)
                            </label>
                            <input
                              type="text"
                              value={settings.sepay_bank_filter || ''}
                              onChange={(e) => updateField('sepay_bank_filter', e.target.value)}
                              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                              placeholder="Ví dụ: 039328221, tách nhau bằng dấu phẩy"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                              Loại giao dịch đồng bộ
                            </label>
                            <select
                              value={settings.sepay_transaction_type || 'all'}
                              onChange={(e) => updateField('sepay_transaction_type', e.target.value)}
                              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                            >
                              <option value="all">Tất cả giao dịch (In & Out)</option>
                              <option value="in_only">Chỉ giao dịch nhận tiền (Inbound)</option>
                              <option value="out_only">Chỉ giao dịch chuyển tiền (Outbound)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer buttons */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-800 rounded-lg transition-colors"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 disabled:opacity-60 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                        <span>Đang lưu...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        <span>Lưu cài đặt</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
