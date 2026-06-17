'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BANKS } from '@/lib/constants/banks';
import { getVerticalConfig, VERTICAL_REGISTRY, INDUSTRY_TYPES, type IndustryType } from '@oni/core';
import { useConfirm } from '@/app/components/ui/ConfirmProvider';
import { IndustryIcon } from '../layout/IndustryIcon';
import { saveNotificationSettings, generatePairingCode, checkSharedBotConnection, clearPairingCode, revokeSharedBotConnection } from '@/app/t/[slug]/settings/notificationsActions';

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
  print_bilingual?: boolean;
  show_brand_attribution?: boolean;
  default_price_type: string;
  qr_auto_approve_session?: boolean;
  enable_shift_management?: boolean;
  strict_shift_lock?: boolean;
  synced_from_sheet_at: string | null;
  sepay_webhook_token?: string | null;
  sepay_auth_method?: string | null;
  sepay_hmac_key?: string | null;
  sepay_api_key?: string | null;
  sepay_bank_filter?: string | null;
  sepay_transaction_type?: string | null;
  updated_at: string;
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
  
  // Notification Props
  tenantId?: string;
  slug?: string;
  canUsePushNotify?: boolean;
  canUseCustomNotify?: boolean;
  telegramConfig?: { bot_token?: string; chat_id: string } | null;
  eventsConfig?: Record<string, any>;
  roles?: { id: number; code: string; name: string }[];
}

function formatWithDots(val: string | number): string {
  if (val === undefined || val === null || val === '') return ''
  const clean = String(val).replace(/[^0-9]/g, '')
  if (!clean) return ''
  return parseFloat(clean).toLocaleString('vi-VN')
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function ShopSettingsForm({
  shop,
  settings: initial,
  canManage,
  permissions = [],
  industryType,
  tenantId = '',
  slug = '',
  canUsePushNotify = false,
  canUseCustomNotify = false,
  telegramConfig = null,
  eventsConfig = {},
  roles = []
}: Props) {
  const confirm = useConfirm();
  const canManageSettings = canManage;
  const canManageQr = permissions.includes('qr_order.manage') || canManageSettings;
  const canManageCrm = permissions.includes('crm.manage') || canManageSettings;

  const vertical = getVerticalConfig(industryType || 'retail');
  const resourceLabel = industryType === 'fnb' ? 'bàn ăn' : (vertical.resourceLabel?.toLowerCase() || 'bàn');

  const [form, setForm] = useState({
    shop_name: shop.name, // always prefer canonical name
    address: shop.address ?? '',
    phone: shop.phone ?? '',
    industry_type: industryType || 'retail',
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
    print_bilingual: initial.print_bilingual ?? false,
    show_brand_attribution: initial.show_brand_attribution ?? true,
    default_price_type: initial.default_price_type,
    qr_auto_approve_session: initial.qr_auto_approve_session ?? false,
    enable_shift_management: initial.enable_shift_management ?? false,
    strict_shift_lock: initial.strict_shift_lock ?? false,
    default_max_debt_days: String(initial.default_max_debt_days ?? 30),
    default_max_debt_amount: String(initial.default_max_debt_amount ?? 10000000),
    allow_sell_over_debt_limit: initial.allow_sell_over_debt_limit ?? true,
    sepay_webhook_token: initial.sepay_webhook_token ?? '',
    // SePay Advanced Configurations
    sepay_auth_method: initial.sepay_auth_method ?? 'token_query',
    sepay_hmac_key: initial.sepay_hmac_key ?? '',
    sepay_api_key: initial.sepay_api_key ?? '',
    sepay_bank_filter: initial.sepay_bank_filter ?? '',
    sepay_transaction_type: initial.sepay_transaction_type ?? 'all',
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
    share_customers: initial.share_customers ?? false,
  });

  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({
    general: 'idle',
    sales: 'idle',
    debt: 'idle',
    sepay: 'idle',
    crm: 'idle'
  });

  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'sales' | 'debt' | 'sepay' | 'crm' | 'telegram' | 'payment-methods'>('general');
  const [isIndustryUnlocked, setIsIndustryUnlocked] = useState(false);

  const router = useRouter();
  
  // Payment methods states
  const [methods, setMethods] = useState<any[]>([]);
  const [methodsLoading, setMethodsLoading] = useState(false);
  const [editingMethod, setEditingMethod] = useState<any | null>(null);
  const [isAddingMethod, setIsAddingMethod] = useState(false);
  const [methodForm, setMethodForm] = useState({
    id: '',
    code: '',
    name: '',
    type: 'cash' as 'cash' | 'bank' | 'wallet' | 'prepaid' | 'debt',
    is_default: false,
  });

  async function fetchMethods() {
    setMethodsLoading(true);
    try {
      const res = await fetch(`/api/shops/${shop.id}/payment-methods`);
      if (res.ok) {
        const json = await res.json();
        setMethods(json.data || []);
      }
    } catch (e) {
      console.error('Failed to fetch methods:', e);
    } finally {
      setMethodsLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'payment-methods') {
      void fetchMethods();
    }
  }, [activeTab]);

  async function handleSaveMethod() {
    if (!methodForm.name.trim()) {
      toast.error('Tên phương thức thanh toán không được để trống');
      return;
    }
    if (!methodForm.code.trim()) {
      toast.error('Mã code lưu ở db không được để trống');
      return;
    }
    const cleanCode = methodForm.code.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_]/g, '_');
    
    try {
      let res;
      if (editingMethod) {
        res = await fetch(`/api/shops/${shop.id}/payment-methods/${editingMethod.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: methodForm.name,
            type: methodForm.type,
            code: cleanCode,
            is_default: methodForm.is_default,
          }),
        });
      } else {
        const cleanId = cleanCode;
        res = await fetch(`/api/shops/${shop.id}/payment-methods`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: cleanId,
            name: methodForm.name,
            type: methodForm.type,
            code: cleanCode,
            branch_id: shop.id,
            is_default: methodForm.is_default,
          }),
        });
      }

      if (res.ok) {
        toast.success(editingMethod ? 'Cập nhật phương thức thanh toán thành công!' : 'Thêm phương thức thanh toán mới thành công!');
        setEditingMethod(null);
        setIsAddingMethod(false);
        void fetchMethods();
      } else {
        const errJson = await res.json().catch(() => ({}));
        toast.error(errJson.error || 'Có lỗi xảy ra, vui lòng thử lại.');
      }
    } catch (e) {
      console.error('Failed to save method:', e);
      toast.error('Có lỗi kết nối hệ thống.');
    }
  }

  async function handleToggleMethodActive(methodId: string, currentActive: boolean) {
    try {
      const res = await fetch(`/api/shops/${shop.id}/payment-methods/${methodId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active: !currentActive,
        }),
      });
      if (res.ok) {
        toast.success(!currentActive ? 'Đã kích hoạt phương thức thanh toán!' : 'Đã ẩn phương thức thanh toán!');
        void fetchMethods();
      } else {
        const errJson = await res.json().catch(() => ({}));
        toast.error(errJson.error || 'Có lỗi xảy ra, vui lòng thử lại.');
      }
    } catch (e) {
      console.error('Failed to toggle method status:', e);
      toast.error('Có lỗi kết nối hệ thống.');
    }
  }

  async function handleDeleteMethod(methodId: string, methodName: string) {
    const ok = await confirm({
      title: '⚠️ Xác nhận xóa/vô hiệu hóa',
      description: `Bạn có chắc chắn muốn xóa/vô hiệu hóa phương thức thanh toán "${methodName}" này?`,
      confirmLabel: 'Xác nhận xóa',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/shops/${shop.id}/payment-methods/${methodId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success('Đã xóa/vô hiệu hóa phương thức thanh toán thành công!');
        void fetchMethods();
      } else {
        const errJson = await res.json().catch(() => ({}));
        toast.error(errJson.error || 'Có lỗi xảy ra, vui lòng thử lại.');
      }
    } catch (e) {
      console.error('Failed to delete method:', e);
      toast.error('Có lỗi kết nối hệ thống.');
    }
  }
  const [isPending, startTransition] = useTransition();

  const AVAILABLE_EVENTS = [
    { id: 'ORDER_CREATED', label: 'Đơn hàng mới' },
    { id: 'PAYMENT_RECEIVED', label: 'Thanh toán thành công' },
    { id: 'CUSTOMER_CREATED', label: 'Khách hàng mới' },
    { id: 'ORDER_CANCELLED', label: 'Hủy đơn hàng' },
    { id: 'ORDER_RETURNED', label: 'Khách trả hàng' },
    { id: 'QR_ORDER_CREATED', label: 'Gọi món qua QR' },
    { id: 'QR_SESSION_CREATED', label: 'Yêu cầu mở bàn ăn QR' },
  ];

  const [localTelegramConfig, setLocalTelegramConfig] = useState<typeof telegramConfig>(telegramConfig);
  const [botToken, setBotToken] = useState(telegramConfig?.bot_token || '');
  const [chatId, setChatId] = useState(telegramConfig?.chat_id || '');
  
  const [events, setEvents] = useState<Record<string, boolean>>(() => {
    return AVAILABLE_EVENTS.reduce((acc, ev) => {
      const cfg = eventsConfig?.[ev.id];
      const isEnabled = typeof cfg === 'boolean' 
        ? cfg 
        : (cfg?.is_enabled ?? (ev.id === 'QR_ORDER_CREATED' || ev.id === 'QR_SESSION_CREATED'));
      return { ...acc, [ev.id]: isEnabled };
    }, {} as Record<string, boolean>);
  });

  const [eventChannels, setEventChannels] = useState<Record<string, {
    telegram: { enabled: boolean };
    push: { enabled: boolean; roles: string[] };
  }>>(() => {
    return AVAILABLE_EVENTS.reduce((acc, ev) => {
      const cfg = eventsConfig?.[ev.id];
      const isQr = ev.id === 'QR_ORDER_CREATED' || ev.id === 'QR_SESSION_CREATED';
      const defaultChannels = {
        telegram: { enabled: !isQr },
        push: { enabled: true, roles: [] }
      };
      const channels = (cfg && typeof cfg === 'object' && cfg.channels_config) 
        ? cfg.channels_config 
        : defaultChannels;
      return { ...acc, [ev.id]: channels };
    }, {} as Record<string, any>);
  });
  const [telegramSuccessMsg, setTelegramSuccessMsg] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    setLocalTelegramConfig(telegramConfig);
    if (telegramConfig) {
      setBotToken(telegramConfig.bot_token || '');
      setChatId(telegramConfig.chat_id || '');
    } else {
      setBotToken('');
      setChatId('');
    }
  }, [telegramConfig]);

  useEffect(() => {
    if (!pairingCode) return;
    
    // Poll connection status every 3 seconds
    const interval = setInterval(async () => {
      if (!tenantId) return;
      const res = await checkSharedBotConnection(tenantId, shop.id);
      if (res.connected) {
        toast.success('Kết nối thành công!');
        setPairingCode('');
        setTimeLeft(0);
        setLocalTelegramConfig(res.config);
        setChatId(res.config?.chat_id || '');
        router.refresh();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [pairingCode, tenantId, shop.id, router]);

  useEffect(() => {
    if (!pairingCode) return;
    
    // Countdown timer
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setPairingCode('');
          clearPairingCode(pairingCode).catch(console.error);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [pairingCode]);

  const handleSaveTelegram = () => {
    if (!tenantId) return;
    setTelegramSuccessMsg('');
    startTransition(async () => {
      const eventsList = Object.keys(events).map(name => ({
        name,
        enabled: events[name],
        channels_config: eventChannels[name] || {
          telegram: { enabled: true },
          push: { enabled: true, roles: [] }
        }
      }));
      await saveNotificationSettings(tenantId, shop.id, slug, botToken, chatId, eventsList);
      setTelegramSuccessMsg('Đã lưu cấu hình thông báo');
      setTimeout(() => setTelegramSuccessMsg(''), 3000);
    });
  };

  const handleGenerateCode = async () => {
    if (!tenantId) return;
    setIsGeneratingCode(true);
    try {
      const code = await generatePairingCode(tenantId, shop.id);
      setPairingCode(code);
      setTimeLeft(15 * 60); // 15 minutes
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleCancelPairing = async () => {
    if (pairingCode) {
      await clearPairingCode(pairingCode).catch(console.error);
    }
    setPairingCode('');
    setTimeLeft(0);
  };

  const handleRevoke = async () => {
    if (!tenantId) return;
    const ok = await confirm({
      title: 'Hủy kết nối Telegram',
      description: 'Bạn có chắc chắn muốn hủy kết nối với Group Telegram này? Bạn sẽ không nhận được thông báo nữa cho đến khi kết nối lại.',
      confirmLabel: 'Hủy kết nối',
      variant: 'danger',
    });
    if (!ok) return;

    startTransition(async () => {
      try {
        await revokeSharedBotConnection(tenantId, shop.id, slug);
        toast.success('Đã hủy kết nối Telegram');
        setLocalTelegramConfig(null);
        setBotToken('');
        setChatId('');
        router.refresh();
      } catch (e: any) {
        toast.error(e.message);
      }
    });
  };

  // Simulator State
  const [simState, setSimState] = useState<{
    amount: string;
    content: string;
    loading: boolean;
    logs: { text: string; type: 'info' | 'sent' | 'recv' | 'success' | 'err' }[];
  }>({
    amount: '150000',
    content: 'ORD-A3F9D2',
    loading: false,
    logs: []
  });

  // Recent Webhook Logs (starts empty, gets populated by simulators/live events)
  const [webhookLogs, setWebhookLogs] = useState<Array<{
    time: string;
    code: string;
    bank: string;
    content: string;
    amount: number;
    status: 'success' | 'ignored';
    note: string;
  }>>([]);

  // Local state to toggle showing Webhook advanced settings
  const [showWebhook, setShowWebhook] = useState(!!initial.sepay_webhook_token);

  async function fetchWebhookLogs() {
    try {
      const res = await fetch(`/api/shops/${shop.id}/sepay/webhook-logs`);
      if (res.ok) {
        const json = await res.json();
        const list = json.data || [];
        const formatted = list.map((item: any) => ({
          time: item.created_at ? new Date(item.created_at).toLocaleString('vi-VN') : '',
          code: item.transaction_id || 'N/A',
          bank: item.bank_account ? `${item.gateway || ''} (${item.bank_account})` : (item.gateway || 'N/A'),
          content: item.content || '',
          amount: parseFloat(item.transfer_amount) || 0,
          status: item.status === 'success' ? 'success' as const : 'ignored' as const,
          note: item.error_message || '',
        }));
        setWebhookLogs(formatted);
      }
    } catch (e) {
      console.error('Failed to fetch webhook logs:', e);
    }
  }

  useEffect(() => {
    if (activeTab === 'sepay' && showWebhook) {
      void fetchWebhookLogs();
      const interval = setInterval(() => {
        void fetchWebhookLogs();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab, showWebhook]);

  function set(key: keyof typeof form, value: any) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaveStates((prev) => ({ ...prev, [activeTab]: 'idle' }));
  }

  async function handleSaveSubForm(tab: 'general' | 'sales' | 'debt' | 'sepay' | 'crm') {
    setSaveStates(prev => ({ ...prev, [tab]: 'saving' }));
    try {
      let payload: any = {};
      if (tab === 'general') {
        if (form.industry_type !== industryType) {
          const targetConfig = VERTICAL_REGISTRY[form.industry_type as IndustryType];
          const sourceConfig = VERTICAL_REGISTRY[industryType as IndustryType] ?? VERTICAL_REGISTRY.retail;
          const ok = await confirm({
            title: '⚠️ Xác nhận chuyển đổi ngành nghề chi nhánh',
            description: `Hệ thống sẽ chuyển chi nhánh này từ "${sourceConfig.label}" sang "${targetConfig?.label}".\n\n• Giao diện bán hàng (POS) và luồng nghiệp vụ của chi nhánh sẽ được tái cấu hình lập tức.\n• Quyết định này không ảnh hưởng đến các chi nhánh khác trong cùng tổ chức.`,
            confirmLabel: 'Tôi đồng ý, chuyển đổi',
            variant: 'danger',
          });
          if (!ok) return;
        }
        payload = {
          shop_name: form.shop_name || undefined,
          address: form.address || undefined,
          phone: form.phone || undefined,
          tax_id: form.tax_id || undefined,
          wifi_info: form.wifi_info || undefined,
          receipt_footer: form.receipt_footer || undefined,
          industry_type: form.industry_type || undefined,
          print_bilingual: form.print_bilingual,
          show_brand_attribution: form.show_brand_attribution,
        };
      } else if (tab === 'sales') {
        payload = {
          currency: form.currency,
          timezone: form.timezone,
          tax_rate: parseFloat(form.tax_rate) || 0,
          invoice_prefix: form.invoice_prefix,
          low_stock_threshold: parseInt(form.low_stock_threshold, 10) || 0,
          default_price_type: form.default_price_type,
          allow_negative_stock: form.allow_negative_stock,
          enable_shift_management: form.enable_shift_management,
          strict_shift_lock: form.strict_shift_lock,
          auto_print_receipt: form.auto_print_receipt,
          mute_pos_sound: form.mute_pos_sound,
          skip_cleaning_process: form.skip_cleaning_process,
          skip_return_confirmation: form.skip_return_confirmation,
          qr_auto_approve_session: form.qr_auto_approve_session,
        };
      } else if (tab === 'debt') {
        payload = {
          default_max_debt_days: parseInt(form.default_max_debt_days, 10) || 0,
          default_max_debt_amount: parseFloat(form.default_max_debt_amount) || 0,
          allow_sell_over_debt_limit: form.allow_sell_over_debt_limit,
        };
      } else if (tab === 'sepay') {
        payload = {
          bank_code: form.bank_code,
          bank_account_number: form.bank_account_number,
          bank_account_name: form.bank_account_name,
          qr_template: form.qr_template,
          receipt_footer: form.receipt_footer || undefined,
          sepay_webhook_token: form.sepay_webhook_token || undefined,
          sepay_auth_method: form.sepay_auth_method,
          sepay_hmac_key: form.sepay_hmac_key || null,
          sepay_api_key: form.sepay_api_key || null,
          sepay_bank_filter: form.sepay_bank_filter || null,
          sepay_transaction_type: form.sepay_transaction_type,
        };
      } else if (tab === 'crm') {
        payload = {
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
          share_customers: form.share_customers,
        };
      }

      const res = await fetch(`/api/shops/${shop.id}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error();
      setSaveStates(prev => ({ ...prev, [tab]: 'saved' }));
      toast.success(`Đã lưu ${tab === 'general' ? 'Cài đặt chung' : tab === 'sales' ? 'Cấu hình Bán hàng & Kho' : tab === 'debt' ? 'Cài đặt Công nợ & Cảnh báo' : tab === 'sepay' ? 'Cổng đối soát SePay' : 'Cài đặt CRM'} thành công!`);
      setTimeout(() => setSaveStates(prev => ({ ...prev, [tab]: 'idle' })), 2500);
    } catch {
      setSaveStates(prev => ({ ...prev, [tab]: 'error' }));
      toast.error('Có lỗi xảy ra khi lưu cấu hình. Vui lòng thử lại.');
      setTimeout(() => setSaveStates(prev => ({ ...prev, [tab]: 'idle' })), 3000);
    }
  }

  // Format Date Time to YYYY-MM-DD HH:mm:ss
  function formatDateTime(d: Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  // Handle mock SePay webhook trigger from Simulator Panel
  async function handleSimulateWebhook() {
    if (!form.sepay_webhook_token) {
      toast.error('Vui lòng tạo/điền Mã Bảo mật trước khi chạy thử nghiệm!');
      return;
    }
    
    const logsInit = [{ 
      text: `[${new Date().toLocaleTimeString()}] [SYSTEM] Khởi tạo giả lập giao dịch chuyển khoản VietQR...`, 
      type: 'info' as const 
    }];
    
    setSimState(prev => ({ ...prev, loading: true, logs: logsInit }));

    const mockPayload = {
      id: Math.floor(Math.random() * 90000000 + 10000000),
      gateway: form.bank_code || 'Vietcombank',
      transactionDate: new Date().toISOString().replace('T', ' ').substring(0, 19),
      accountNumber: form.bank_account_number || '0123456789',
      subAccount: '',
      amountIn: parseInt(simState.amount) || 150000,
      amountOut: 0,
      accumulated: 5000000,
      code: 'FT' + Math.floor(Math.random() * 90000000),
      transactionContent: simState.content || 'ORD-A3F9D2',
      referenceNumber: 'REF-' + Math.floor(Math.random() * 9000000),
      body: 'MOCK PAYLOAD'
    };

    try {
      const url = `/api/webhooks/payment/sepay?token=${form.sepay_webhook_token}`;
      
      setSimState(prev => ({
        ...prev,
        logs: [
          ...prev.logs,
          { text: `[${new Date().toLocaleTimeString()}] [HTTP] Gửi POST đến endpoint nhận Webhook:`, type: 'sent' },
          { text: `🔗 ${window.location.origin}${url}`, type: 'sent' },
          { text: `📦 Payload: ${JSON.stringify(mockPayload, null, 2)}`, type: 'sent' }
        ]
      }));

      // Fire simulation POST call
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-SePay-Signature': 'mock-signature-for-settings-simulation'
        },
        body: JSON.stringify(mockPayload)
      });

      const resBody = await response.json();

      setSimState(prev => ({
        ...prev,
        loading: false,
        logs: [
          ...prev.logs,
          { text: `[${new Date().toLocaleTimeString()}] [HTTP] Nhận phản hồi phản hồi từ server:`, type: 'recv' },
          { text: `🟢 Status Code: ${response.status} ${response.statusText}`, type: 'recv' },
          { text: `📄 Chi tiết phản hồi: ${JSON.stringify(resBody, null, 2)}`, type: 'recv' },
          { text: `[KẾT QUẢ] ${response.status === 200 ? 'ĐỐI SOÁT & GẠCH NỢ GIẢ LẬP HOÀN TẤT THÀNH CÔNG!' : 'Giao dịch bị bỏ qua hoặc từ chối.'}`, type: response.status === 200 ? 'success' : 'err' }
        ]
      }));

      if (response.status === 200) {
        toast.success('Bắn tín hiệu giả lập thành công! Hóa đơn đã được gạch nợ.');
        setTimeout(() => { void fetchWebhookLogs(); }, 800);
      } else {
        toast.warning(`Giao dịch bị từ chối/bỏ qua (Status ${response.status}).`);
        setTimeout(() => { void fetchWebhookLogs(); }, 800);
      }
    } catch (err: any) {
      setSimState(prev => ({
        ...prev,
        loading: false,
        logs: [
          ...prev.logs,
          { text: `[${new Date().toLocaleTimeString()}] [ERROR] Lỗi kết nối: ${err.message}`, type: 'err' }
        ]
      }));
      toast.error('Không thể kết nối đến Webhook endpoint.');
      setWebhookLogs(prev => [
        {
          time: formatDateTime(new Date()),
          code: mockPayload.code,
          bank: mockPayload.gateway,
          content: mockPayload.transactionContent,
          amount: mockPayload.amountIn,
          status: 'ignored',
          note: `Lỗi kết nối: ${err.message}`
        },
        ...prev
      ]);
    }
  }


  const tabState = saveStates[activeTab];

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start w-full">
      {/* Sleek Vertical Tab Sidebar */}
      <div className="w-full lg:w-72 lg:sticky lg:top-6 flex-shrink-0 flex flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs self-start">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3.5 mb-2.5 block">Danh mục cài đặt</span>
        {[
          { 
            id: 'general', 
            label: 'Cài đặt chung', 
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            ), 
            desc: 'Thông tin chi nhánh & Wifi', 
            permission: true 
          },
          { 
            id: 'sales', 
            label: 'Bán hàng & Kho', 
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            ), 
            desc: 'Thuế, giá, ca POS, luồng kho', 
            permission: canManage 
          },
          { 
            id: 'debt', 
            label: 'Công nợ & Cảnh báo', 
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ), 
            desc: 'Hạn mức nợ & Chốt chặn POS', 
            permission: canManage 
          },
          { 
            id: 'sepay', 
            label: 'Đối soát tự động (SePay)', 
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            ), 
            desc: 'Cổng đối soát VietQR & Webhook', 
            permission: canManageQr 
          },
          { 
            id: 'crm', 
            label: 'CRM & Thành viên', 
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ), 
            desc: 'Tích điểm & Hạng hội viên', 
            permission: canManage 
          },
          { 
            id: 'telegram', 
            label: 'Kênh thông báo', 
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            ), 
            desc: 'Cấu hình Telegram Bot & Mobile Push', 
            permission: canManage 
          },
          { 
            id: 'payment-methods', 
            label: 'Phương thức thanh toán', 
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            ), 
            desc: 'Cấu hình phương thức thanh toán', 
            permission: canManage 
          },
        ].filter(t => t.permission).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id as any);
            }}
            className={[
              'w-full text-left rounded-xl px-3.5 py-3 transition-all duration-200 cursor-pointer flex items-start gap-3 group border border-transparent',
              activeTab === tab.id
                ? 'bg-primary/5 border-primary/20 text-primary font-semibold'
                 : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50',
            ].join(' ')}
          >
            <span className={`p-1.5 rounded-lg transition-transform group-hover:scale-110 flex items-center justify-center ${activeTab === tab.id ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500'}`}>
              {tab.icon}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold leading-tight">{tab.label}</div>
              <div className="text-[10px] text-slate-400 font-normal truncate mt-0.5">{tab.desc}</div>
            </div>
          </button>
        ))}

      </div>

      {/* Settings Form Content Area */}
      <div className="flex-1 w-full space-y-6">
        
        {/* ── TAB 1: CÀI ĐẶT CHUNG ── */}
        {activeTab === 'general' && (
          <form onSubmit={(e) => { e.preventDefault(); handleSaveSubForm('general'); }} className="space-y-6">
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

            <Section title="Thông tin Hóa đơn & Tiện ích" description="Các thông tin sẽ được in trên bill thanh toán cho khách">
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
              <div className="border-t border-slate-100 pt-4 mt-4 space-y-4">
                <Field label="In song ngữ (Tiếng Việt / English)" hint="Hiển thị song ngữ (Việt - Anh) các tiêu đề, cột thông tin và tiền phòng/giờ trên hóa đơn in ra">
                  <div
                    onClick={() => canManage && set('print_bilingual', !form.print_bilingual)}
                    className="flex cursor-pointer items-center gap-3 mt-1"
                  >
                    <div
                      className={`relative h-6 w-11 rounded-full transition-colors ${form.print_bilingual ? 'bg-primary' : 'bg-slate-200'} ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.print_bilingual ? 'translate-x-5' : ''}`}
                      />
                    </div>
                    <span className="text-sm text-slate-600 select-none font-medium">
                      {form.print_bilingual ? 'Bật in hóa đơn song ngữ' : 'Chỉ in tiếng Việt (Mặc định)'}
                    </span>
                  </div>
                </Field>
                <Field label="Giới thiệu thương hiệu ONI.vn" hint="Hiển thị dòng chữ quảng bá 'Hệ thống quản lý bán hàng ONI.vn' ở chân hóa đơn in ra">
                  <div
                    onClick={() => canManage && set('show_brand_attribution', !form.show_brand_attribution)}
                    className="flex cursor-pointer items-center gap-3 mt-1"
                  >
                    <div
                      className={`relative h-6 w-11 rounded-full transition-colors ${form.show_brand_attribution ? 'bg-primary' : 'bg-slate-200'} ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.show_brand_attribution ? 'translate-x-5' : ''}`}
                      />
                    </div>
                    <span className="text-sm text-slate-600 select-none font-medium">
                      {form.show_brand_attribution ? 'Bật giới thiệu ONI.vn ở chân bill (Mặc định)' : 'Tắt giới thiệu thương hiệu'}
                    </span>
                  </div>
                </Field>
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

            <Section title="Ngành kinh doanh chi nhánh" description="Cấu hình nghiệp vụ và giao diện bán hàng chuyên biệt cho chi nhánh này">
              <div className="relative mt-2">
                {!isIndustryUnlocked && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-50/70 backdrop-blur-[2px] rounded-2xl border border-slate-200/50 p-6 text-center animate-fade-in">
                    <p className="text-xs font-semibold text-slate-700 max-w-md leading-relaxed mb-3">
                      ⚠️ Việc thay đổi ngành nghề kinh doanh sẽ ảnh hưởng trực tiếp đến cấu trúc dữ liệu và các dữ liệu liên quan khác, hãy chắc chắn rằng bạn hiểu rõ về việc này, nếu lựa chọn sai và mất dữ liệu, chúng tôi sẽ không chịu trách nhiệm...
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsIndustryUnlocked(true)}
                      className="cursor-pointer rounded-xl bg-orange-600 hover:bg-orange-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all active:scale-95"
                    >
                      Tôi biết mình đang làm gì...
                    </button>
                  </div>
                )}
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 pr-1 transition-all duration-300 ${!isIndustryUnlocked ? 'blur-[1.5px] pointer-events-none select-none opacity-60' : ''}`}>
                  {INDUSTRY_TYPES.map((type) => {
                    const config = VERTICAL_REGISTRY[type];
                    const isActive = form.industry_type === type;
                    const isCurrent = industryType === type;
                    
                    const cardVisuals = {
                      retail: 'from-blue-500/10 to-indigo-500/10 border-blue-500/30 text-indigo-700 bg-blue-50/20',
                      fnb: 'from-orange-500/10 to-rose-500/10 border-orange-500/30 text-rose-700 bg-orange-50/20',
                      billiards: 'from-emerald-500/10 to-teal-500/10 border-emerald-500/30 text-emerald-700 bg-emerald-50/20',
                      sports_court: 'from-violet-500/10 to-fuchsia-500/10 border-violet-500/30 text-violet-700 bg-violet-50/20',
                      lodging: 'from-cyan-500/10 to-blue-500/10 border-cyan-500/30 text-blue-700 bg-cyan-50/20',
                      fashion: 'from-pink-500/10 to-rose-500/10 border-pink-500/30 text-pink-700 bg-pink-50/20',
                      service_hourly: 'from-amber-500/10 to-orange-500/10 border-amber-500/30 text-amber-700 bg-amber-50/20',
                    };
                    const vStyle = cardVisuals[type] || cardVisuals.retail;

                    return (
                      <button
                        key={type}
                        type="button"
                        disabled={!canManage}
                        onClick={() => set('industry_type', type)}
                        className={`cursor-pointer group relative rounded-2xl border-2 p-3 text-left transition-all duration-300 hover:-translate-y-0.5 flex flex-col justify-between ${isActive
                            ? `${vStyle} border-primary ring-2 ring-primary/10 shadow-sm`
                            : 'border-slate-100 bg-white hover:border-slate-300 hover:shadow-xs'
                          } ${!canManage ? 'opacity-65 cursor-not-allowed' : ''}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 transition-transform duration-300 group-hover:scale-110 shrink-0">
                            <IndustryIcon type={type} className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-bold text-slate-800 leading-snug truncate">
                                {config.label}
                              </p>
                              {isCurrent && (
                                <span className="text-[8px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-1 py-0.5 rounded-full border border-primary/20 shrink-0 scale-90">
                                  Đang dùng
                                </span>
                              )}
                            </div>
                            <p className="text-[9px] text-slate-400 mt-0.5 line-clamp-1">
                              {config.description}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </Section>

            {canManage && (
              <div className="flex items-center gap-3 bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
                <button
                  type="submit"
                  disabled={tabState === 'saving'}
                  className="cursor-pointer rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60 transition-all active:scale-95 shadow-sm shadow-primary/20"
                >
                  {tabState === 'saving' ? 'Đang lưu...' : 'Lưu Cài đặt chung'}
                </button>
                {tabState === 'saved' && (
                  <p className="text-xs text-green-600 font-semibold flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Đã lưu thành công.
                  </p>
                )}
                {tabState === 'error' && (
                  <p className="text-xs text-red-600 font-semibold flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Lưu thất bại. Thử lại.
                  </p>
                )}
              </div>
            )}
          </form>
        )}

        {/* ── TAB 2: BÁN HÀNG & KHO ── */}
        {activeTab === 'sales' && (
          <form onSubmit={(e) => { e.preventDefault(); handleSaveSubForm('sales'); }} className="space-y-6">
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

              <div className="border-t border-slate-100 pt-4 mt-4 space-y-4">
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
                    <span className="text-sm text-slate-600 select-none font-medium">
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
                    <span className="text-sm text-slate-600 select-none font-medium">
                      {form.enable_shift_management ? 'Bắt buộc đóng/mở ca khi bán hàng tại POS (Hạn chế thất thoát)' : 'Bán hàng liên tục không chia ca (Phù hợp hộ kinh doanh/SME)'}
                    </span>
                  </div>
                </Field>

                {form.enable_shift_management && (
                  <div className="ml-6 mt-3 border-l-2 border-slate-100 pl-4 space-y-4">
                    <Field label="Chế độ bảo mật chốt ca nghiêm ngặt">
                      <div
                        onClick={() => canManage && set('strict_shift_lock', !form.strict_shift_lock)}
                        className="flex cursor-pointer items-center gap-3 mt-1"
                      >
                        <div
                          className={`relative h-6 w-11 rounded-full transition-colors ${form.strict_shift_lock ? 'bg-primary' : 'bg-slate-200'} ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.strict_shift_lock ? 'translate-x-5' : ''}`}
                          />
                        </div>
                        <span className="text-sm text-slate-600 select-none">
                          {form.strict_shift_lock ? 'Ẩn số tiền lý thuyết (Blind Close) & Ca đã chốt không thể sửa' : 'Hiện số tiền lý thuyết & Cho phép tự do sửa ca đã chốt (Khuyên dùng cho SME/Chủ shop)'}
                        </span>
                      </div>
                    </Field>
                  </div>
                )}

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
                    <span className="text-sm text-slate-600 select-none font-medium">
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
                    <span className="text-sm text-slate-600 select-none font-medium">
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
                    <span className="text-sm text-slate-600 select-none font-medium">
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
                    <span className="text-sm text-slate-600 select-none font-medium">
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
                    <span className="text-sm text-slate-600 select-none font-medium">
                      {form.qr_auto_approve_session 
                        ? `Tự động kích hoạt ${resourceLabel} ngay khi khách quét QR` 
                        : `Khách quét QR gửi yêu cầu, nhân viên phải duyệt mở ${resourceLabel} bằng tay (Mặc định)`}
                    </span>
                  </div>
                </Field>
              </div>
            </Section>

            {canManage && (
              <div className="flex items-center gap-3 bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
                <button
                  type="submit"
                  disabled={tabState === 'saving'}
                  className="cursor-pointer rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60 transition-all active:scale-95 shadow-sm shadow-primary/20"
                >
                  {tabState === 'saving' ? 'Đang lưu...' : 'Lưu Cấu hình Bán hàng & Kho'}
                </button>
                {tabState === 'saved' && (
                  <p className="text-xs text-green-600 font-semibold flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Đã lưu thành công.
                  </p>
                )}
                {tabState === 'error' && (
                  <p className="text-xs text-red-600 font-semibold flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Lưu thất bại. Thử lại.
                  </p>
                )}
              </div>
            )}
          </form>
        )}

        {/* ── TAB 2.5: CÀI ĐẶT CÔNG NỢ & CẢNH BÁO ── */}
        {activeTab === 'debt' && (
          <form onSubmit={(e) => { e.preventDefault(); handleSaveSubForm('debt'); }} className="space-y-6">
            <Section title="Cấu hình Cảnh báo & Giới hạn Công nợ" description="Thiết lập hạn mức công nợ tối đa, số ngày nợ cho phép mặc định và chốt chặn bán hàng cấp Shop">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Số ngày nợ tối đa cho phép (ngày)" hint="Mặc định: 30 ngày. 0 = không giới hạn số ngày">
                  <input
                    type="number" min="0"
                    value={form.default_max_debt_days}
                    onChange={(e) => set('default_max_debt_days', e.target.value)}
                    disabled={!canManage}
                    className={inputCls}
                    placeholder="30"
                  />
                </Field>
                <Field label="Hạn mức dư nợ tối đa (đ)" hint="Mặc định: 10.000.000đ. Hạn mức tiền nợ tối đa trên mỗi khách hàng">
                  <input
                    type="text"
                    value={formatWithDots(form.default_max_debt_amount)}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^0-9]/g, '')
                      set('default_max_debt_amount', clean)
                    }}
                    disabled={!canManage}
                    className={inputCls}
                    placeholder="10.000.000"
                  />
                </Field>
              </div>

              <div className="border-t border-slate-100 pt-4 mt-4 space-y-4">
                <Field label="Chốt chặn bán hàng khi quá hạn mức">
                  <div
                    onClick={() => canManage && set('allow_sell_over_debt_limit', !form.allow_sell_over_debt_limit)}
                    className="flex cursor-pointer items-center gap-3 mt-1"
                  >
                    <div
                      className={`relative h-6 w-11 rounded-full transition-colors ${!form.allow_sell_over_debt_limit ? 'bg-primary' : 'bg-slate-200'} ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${!form.allow_sell_over_debt_limit ? 'translate-x-5' : ''}`}
                      />
                    </div>
                    <span className="text-sm text-slate-600 select-none font-medium">
                      {!form.allow_sell_over_debt_limit 
                        ? 'Chặn bán hàng cứng (Vô hiệu hóa nút thanh toán tại POS/Đơn hàng nếu quá hạn)' 
                        : 'Cho phép bán tiếp & Cảnh báo mềm (Nhắc nhở nhân viên nhưng vẫn cho bán)'}
                    </span>
                  </div>
                </Field>
              </div>
            </Section>

            {canManage && (
              <div className="flex items-center gap-3 bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
                <button
                  type="submit"
                  disabled={tabState === 'saving'}
                  className="cursor-pointer rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60 transition-all active:scale-95 shadow-sm shadow-primary/20"
                >
                  {tabState === 'saving' ? 'Đang lưu...' : 'Lưu Cấu hình Công nợ'}
                </button>
                {tabState === 'saved' && (
                  <p className="text-xs text-green-600 font-semibold flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Đã lưu thành công.
                  </p>
                )}
                {tabState === 'error' && (
                  <p className="text-xs text-red-600 font-semibold flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Lưu thất bại. Thử lại.
                  </p>
                )}
              </div>
            )}
          </form>
        )}

        {/* ── TAB 3: ĐỐI SOÁT SEPAY ── */}
        {activeTab === 'sepay' && (
          <div className="space-y-6">
            
            {/* Section: Thông tin ngân hàng nhận tiền */}
            <form onSubmit={(e) => { e.preventDefault(); handleSaveSubForm('sepay'); }} className="space-y-6">
              <Section title="Tài khoản Ngân hàng nhận VietQR" description="Dùng để sinh mã chuyển khoản động tại POS và làm tài khoản đối soát">
                <Field label="Ngân hàng nhận thanh toán" hint="Chọn ngân hàng của chi nhánh">
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
                  <div className="border-t border-slate-100 pt-4 mt-4 lg:flex lg:gap-6">
                    <div className="flex-1 space-y-4">
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
                    </div>

                    <div className="w-full lg:w-48 xl:w-56 mt-6 lg:mt-0 flex flex-col items-center border-l-0 lg:border-l border-slate-100 lg:pl-6">
                      <span className="text-xs font-semibold text-slate-400 uppercase mb-3 text-center block w-full tracking-wider">Xem trước VietQR</span>
                      {form.bank_account_number && form.bank_account_name ? (
                        <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex-shrink-0">
                          <img 
                            src={`https://img.vietqr.io/image/${form.bank_code}-${form.bank_account_number}-${form.qr_template}.png?amount=990000&addInfo=ONIAB12CD34&accountName=${encodeURIComponent(form.bank_account_name)}`} 
                            alt="VietQR Preview" 
                            className="w-full max-w-[200px] h-auto rounded-lg shadow-sm"
                          />
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 italic text-center p-4 bg-slate-50 rounded-xl border border-slate-200 border-dashed w-full h-full flex items-center justify-center min-h-[150px]">
                          Nhập số TK và Tên để xem trước.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Section>

              {/* Section: Webhook SEPay */}
              <Section
                id="sepay-config"
                title="Cấu hình Cổng đối soát Webhook SEPay"
                description="Liên kết biến động số dư VietQR động theo thời gian thực và gạch nợ tự động"
              >
                <div className="space-y-5">
                  {/* Webhook Enable Toggle Switch */}
                  <Field label="Kích hoạt Đối soát & Gạch nợ tự động qua Webhook">
                    <div
                      onClick={() => {
                        if (!canManage) return;
                        const nextVal = !showWebhook;
                        setShowWebhook(nextVal);
                        if (!nextVal) {
                          // Clear webhook fields when disabled to avoid confusion
                          set('sepay_webhook_token', '');
                          set('sepay_auth_method', 'token_query');
                          set('sepay_hmac_key', '');
                          set('sepay_api_key', '');
                          set('sepay_bank_filter', '');
                          set('sepay_transaction_type', 'all');
                        } else {
                          // Generate a random webhook token automatically when enabled
                          const randToken = 'sepay_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                          set('sepay_webhook_token', randToken);
                        }
                      }}
                      className="flex cursor-pointer items-center gap-3 mt-1"
                    >
                      <div
                        className={`relative h-6 w-11 rounded-full transition-colors ${showWebhook ? 'bg-primary' : 'bg-slate-200'} ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${showWebhook ? 'translate-x-5' : ''}`}
                        />
                      </div>
                      <span className="text-sm text-slate-600 select-none font-medium">
                        {showWebhook ? 'Đang kích hoạt đối soát và gạch nợ tự động qua SEPay' : 'Tạm dừng/Chỉ sử dụng VietQR tĩnh không gạch nợ'}
                      </span>
                    </div>
                  </Field>

                  {showWebhook && (
                    <div className="space-y-5 border-t border-slate-100 pt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Phương thức xác thực Webhook" hint="Khuyên dùng Query Token để đơn giản">
                          <select
                            value={form.sepay_auth_method}
                            onChange={(e) => set('sepay_auth_method', e.target.value)}
                            disabled={!canManage}
                            className={inputCls}
                          >
                            <option value="token_query">Xác thực qua Query Token (Khuyên dùng)</option>
                            <option value="api_key">Xác thực qua API Key (Bearer Header)</option>
                            <option value="hmac">Xác thực chữ ký HMAC Signature</option>
                            <option value="none">Không xác thực bảo mật</option>
                          </select>
                        </Field>

                        <Field label="Bộ lọc loại giao dịch nhận" hint="Chuyển khoản gạch nợ thường chỉ cần Tiền vào">
                          <select
                            value={form.sepay_transaction_type}
                            onChange={(e) => set('sepay_transaction_type', e.target.value)}
                            disabled={!canManage}
                            className={inputCls}
                          >
                            <option value="all">Nhận cả Tiền vào & Tiền ra</option>
                            <option value="in_only">Chỉ nhận giao dịch Tiền vào (Inbound Only)</option>
                            <option value="out_only">Chỉ nhận giao dịch Tiền ra (Outbound Only)</option>
                          </select>
                        </Field>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {form.sepay_auth_method === 'hmac' && (
                          <Field label="Khóa giải mã ký HMAC Key (Secret Key)" hint="Nhập Key từ SePay">
                            <input
                              type="password"
                              value={form.sepay_hmac_key}
                              onChange={(e) => set('sepay_hmac_key', e.target.value)}
                              disabled={!canManage}
                              className={`${inputCls} font-mono`}
                              placeholder="Nhập HMAC Secret..."
                            />
                          </Field>
                        )}
                        {form.sepay_auth_method === 'api_key' && (
                          <Field label="Mã API Key (Bearer Token)" hint="Dùng để xác thực header">
                            <input
                              type="password"
                              value={form.sepay_api_key}
                              onChange={(e) => set('sepay_api_key', e.target.value)}
                              disabled={!canManage}
                              className={`${inputCls} font-mono`}
                              placeholder="Bearer API Key..."
                            />
                          </Field>
                        )}
                        <Field label="Lọc số tài khoản ngân hàng cụ thể" hint="Bỏ trống nếu nhận tất cả">
                          <input
                            type="text"
                            value={form.sepay_bank_filter}
                            onChange={(e) => set('sepay_bank_filter', e.target.value)}
                            disabled={!canManage}
                            className={inputCls}
                            placeholder="Ví dụ: 0987654321"
                          />
                        </Field>
                      </div>

                      {form.sepay_webhook_token && (
                        <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200 border-dashed mt-2">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                              Đường dẫn nhận Webhook URL của bạn (Cấu hình trên SEPay.vn)
                            </label>
                            <div className="flex items-center gap-2 bg-white p-2.5 rounded-lg border border-slate-200">
                              <code className="text-xs text-slate-600 font-mono break-all flex-1 select-all">
                                {typeof window !== 'undefined'
                                  ? `${window.location.origin}/api/webhooks/payment/sepay?token=${form.sepay_webhook_token}`
                                  : `https://[domain-cua-ban]/api/webhooks/payment/sepay?token=${form.sepay_webhook_token}`}
                              </code>
                              <button
                                type="button"
                                onClick={() => {
                                  const url = typeof window !== 'undefined'
                                    ? `${window.location.origin}/api/webhooks/payment/sepay?token=${form.sepay_webhook_token}`
                                    : `https://[domain-cua-ban]/api/webhooks/payment/sepay?token=${form.sepay_webhook_token}`;
                                  navigator.clipboard.writeText(url);
                                  setCopied(true);
                                  toast.success('Đã sao chép đường dẫn Webhook!');
                                  setTimeout(() => setCopied(false), 2000);
                                }}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 rounded-md transition-all cursor-pointer flex-shrink-0 flex items-center gap-1"
                              >
                                {copied ? (
                                  <>
                                    <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>Đã chép</span>
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                                    </svg>
                                    <span>Sao chép</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="border-t border-slate-200 pt-3 mt-1">
                            <h4 className="text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1.5">
                              <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span>Hướng dẫn cấu hình trên SEPay.vn:</span>
                            </h4>
                            <ol className="list-decimal list-inside text-xs text-slate-500 space-y-1 pl-1 leading-relaxed">
                              <li>Đăng nhập vào <strong>sepay.vn</strong> &rarr; Cấu hình <strong>Webhook</strong>.</li>
                              <li>Bấm <strong>Thêm Webhook mới</strong>.</li>
                              <li>Dán link Webhook URL đã copy ở trên vào mục <strong>Địa chỉ URL nhận Webhook</strong>.</li>
                              <li>Chọn phương thức gửi là <strong>POST</strong>, kiểu xác thực khớp với <strong>Phương thức xác thực</strong> đã cấu hình bên trên.</li>
                              <li>Bấm Lưu lại. Hệ thống sẽ tự động gạch nợ hóa đơn POS mỗi khi có tiền vào trùng mã hóa đơn.</li>
                            </ol>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Section>

              {canManageQr && (
                <div className="flex items-center gap-3 bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
                  <button
                    type="submit"
                    disabled={tabState === 'saving'}
                    className="cursor-pointer rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60 transition-all active:scale-95 shadow-sm shadow-primary/20"
                  >
                    {tabState === 'saving' ? 'Đang lưu...' : 'Lưu Cài đặt Đối soát & VietQR'}
                  </button>
                  {tabState === 'saved' && (
                    <p className="text-xs text-green-600 font-semibold flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Đã lưu thành công.
                    </p>
                  )}
                  {tabState === 'error' && (
                    <p className="text-xs text-red-600 font-semibold flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Lưu thất bại. Thử lại.
                    </p>
                  )}
                </div>
              )}
            </form>

            {/* Khung Kiểm thử & Giả lập Webhook (Simulator Console) */}
            {showWebhook && form.sepay_webhook_token && (
              <Section 
                title="Khung kiểm thử & Giả lập Webhook (Live Webhook Simulator)" 
                description="Bắn tín hiệu giao dịch chuyển khoản giả lập cục bộ để kiểm tra tự động đối soát gạch nợ"
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Số tiền cần bắn thử (đ)">
                      <input
                        type="number"
                        value={simState.amount}
                        onChange={(e) => setSimState(prev => ({ ...prev, amount: e.target.value }))}
                        className={inputCls}
                        placeholder="150000"
                      />
                    </Field>
                    <Field label="Nội dung chuyển khoản (Mã đơn POS)">
                      <input
                        type="text"
                        value={simState.content}
                        onChange={(e) => setSimState(prev => ({ ...prev, content: e.target.value }))}
                        className={`${inputCls} font-mono`}
                        placeholder="Ví dụ: ORD-A3F9D2"
                      />
                    </Field>
                  </div>

                  <div className="flex justify-start">
                    <button
                      type="button"
                      onClick={handleSimulateWebhook}
                      disabled={simState.loading}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:opacity-60 transition-all cursor-pointer shadow-md shadow-indigo-500/20 active:scale-95"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Bắn giao dịch giả lập
                    </button>
                  </div>

                  {simState.logs.length > 0 && (
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-[11px] shadow-inner">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                        <span className="font-bold text-slate-400 uppercase tracking-wider" style={{ color: '#94a3b8' }}>Terminal Webhook Monitor</span>
                        <button
                          type="button"
                          onClick={() => setSimState(prev => ({ ...prev, logs: [] }))}
                          className="text-slate-500 hover:text-slate-300 text-[10px] cursor-pointer"
                        >
                          Clear [X]
                        </button>
                      </div>
                      <div className="max-h-60 overflow-y-auto space-y-1.5 scrollbar-thin select-all">
                        {simState.logs.map((log, idx) => {
                          let color = '#cbd5e1'; // text-slate-300
                          if (log.type === 'info') color = '#94a3b8'; // text-slate-400
                          if (log.type === 'sent') color = '#60a5fa'; // text-blue-400
                          if (log.type === 'recv') color = '#fbbf24'; // text-amber-400
                          if (log.type === 'success') color = '#34d399'; // text-emerald-400
                          if (log.type === 'err') color = '#f87171'; // text-rose-400

                          return (
                            <pre key={idx} style={{ color }} className="whitespace-pre-wrap leading-relaxed">
                              {log.text}
                            </pre>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </div>
              </Section>
            )}

            {/* Webhook Activity Logs Console */}
            {showWebhook && form.sepay_webhook_token && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Nhật ký Webhook nhận gần đây</h3>
                    <p className="text-[11px] text-slate-400">Giám sát trực quan dữ liệu đối soát VietQR chuyển khoản ngân hàng</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                    Đang lắng nghe Live...
                  </span>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-500">
                      <thead className="bg-slate-100 text-[10px] font-semibold uppercase text-slate-700">
                        <tr>
                          <th className="px-4 py-2">Thời gian</th>
                          <th className="px-4 py-2">Mã GD / Ngân hàng</th>
                          <th className="px-4 py-2">Nội dung chuyển khoản</th>
                          <th className="px-4 py-2 text-right">Số tiền</th>
                          <th className="px-4 py-2 text-center">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-mono">
                        {webhookLogs.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-slate-400 font-sans">
                              <div className="flex flex-col items-center justify-center gap-2">
                                <svg className="w-8 h-8 text-slate-350" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <span className="font-semibold text-slate-600 text-xs">Chưa có dữ liệu nhật ký giao dịch thực tế</span>
                                <p className="text-[10px] text-slate-400 max-w-xs font-normal">Sử dụng thanh công cụ mô phỏng phía trên để bắn thử dữ liệu webhook VietQR</p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          webhookLogs.map((log, i) => (
                            <tr key={i} className="hover:bg-white transition-colors">
                              <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">{log.time}</td>
                              <td className="px-4 py-2.5">
                                <div className="font-semibold text-slate-700">{log.code}</div>
                                <div className="text-[10px] text-slate-400 font-sans">{log.bank}</div>
                              </td>
                              <td className="px-4 py-2.5 text-slate-600 font-semibold max-w-xs truncate" title={log.content}>{log.content}</td>
                              <td className="px-4 py-2.5 text-right font-bold text-slate-700">+{log.amount.toLocaleString('vi-VN')}đ</td>
                              <td className="px-4 py-2.5 text-center">
                                <span className={[
                                  'inline-flex items-center rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                                  log.status === 'success'
                                    ? 'bg-green-50 text-green-700 border border-green-200'
                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                                ].join(' ')} title={log.note}>
                                  {log.status === 'success' ? 'Thành công' : 'Bỏ qua'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── TAB 4: CRM & THÀNH VIÊN ── */}
        {activeTab === 'crm' && (
          !initial.has_crm_access ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs space-y-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
              
              <div className="max-w-2xl space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Tính năng Cao cấp (Pro)
                </div>
                
                <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Hệ thống Chăm sóc Khách hàng Thân thiết & CRM
                </h2>
                
                <p className="text-sm text-slate-500 leading-relaxed">
                  Thiết lập cơ chế tích điểm thông minh, phân hạng hội viên tự động và tạo các chương trình ưu đãi độc quyền. Kích thích khách hàng cũ quay lại nhiều hơn, tối đa hóa giá trị vòng đời khách hàng và thúc đẩy tăng trưởng doanh số vượt bậc.
                </p>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="flex gap-4 items-start p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100/60 transition-colors">
                  <span className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">Tích lũy điểm thưởng tự động</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">Tùy biến linh hoạt tỷ lệ tích lũy điểm trên hóa đơn và quy đổi điểm thành tiền giảm trừ trực tiếp.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100/60 transition-colors">
                  <span className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">Phân hạng Hội viên thông minh</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">Phân nhóm khách hàng theo hạng Đồng, Bạc, Vàng, Kim Cương hoàn toàn tự động dựa trên tổng doanh số.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100/60 transition-colors">
                  <span className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">Báo cáo & Phân tích hành vi</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">Đo lường chi tiết tần suất ghé thăm, tổng chi tiêu và hiệu quả các chiến dịch tiếp thị chăm sóc.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100/60 transition-colors">
                  <span className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">Cá nhân hóa ưu đãi VIP</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">Tự động cấu hình mức chiết khấu hóa đơn riêng hoặc áp dụng chính sách giá nội bộ đặc quyền.</p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-indigo-500/5 to-purple-500/5 rounded-2xl border border-indigo-150 p-6 flex flex-col md:flex-row gap-6 justify-between items-center">
                <div className="space-y-1.5 max-w-lg text-center md:text-left">
                  <h4 className="text-sm font-bold text-slate-900">Yêu cầu nâng cấp gói Chuyên nghiệp (Pro)</h4>
                  <p className="text-xs text-slate-500">Mở khóa toàn bộ các tính năng CRM & Điểm thưởng cho tất cả các chi nhánh của bạn chỉ trong 30 giây.</p>
                </div>
                
                <div className="flex gap-3 w-full md:w-auto flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const pathSegments = window.location.pathname.split('/');
                      const tenantSlug = pathSegments[2] || shop.slug;
                      window.location.href = `/t/${tenantSlug}/billing`;
                    }}
                    className="w-full md:w-auto text-center cursor-pointer rounded-xl bg-indigo-600 hover:bg-indigo-750 text-white px-5 py-2.5 text-xs font-bold transition-all shadow-md active:scale-95"
                  >
                    Nâng cấp gói Pro
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open('https://zalo.me/your-support-id', '_blank')}
                    className="w-full md:w-auto text-center cursor-pointer rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-5 py-2.5 text-xs font-semibold transition-all active:scale-95"
                  >
                    Liên hệ tư vấn
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); handleSaveSubForm('crm'); }} className="space-y-6">
              <Section title="Cài đặt CRM & Tích điểm" description="Cấu hình hệ thống khách hàng thân thiết, tích lũy điểm thưởng khi mua hàng">
                <div className="space-y-4">
                  <Field label="Kích hoạt tích điểm thành viên">
                    <div
                      onClick={() => canManageCrm && set('loyalty_points_enabled', !form.loyalty_points_enabled)}
                      className="flex cursor-pointer items-center gap-3 mt-1"
                    >
                      <div
                        className={`relative h-6 w-11 rounded-full transition-colors ${form.loyalty_points_enabled ? 'bg-primary' : 'bg-slate-200'} ${canManageCrm ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.loyalty_points_enabled ? 'translate-x-5' : ''}`}
                        />
                      </div>
                      <span className="text-sm text-slate-600 select-none font-medium">
                        {form.loyalty_points_enabled ? 'Đang kích hoạt chương trình điểm thưởng khách hàng' : 'Đang tạm dừng tích lũy điểm'}
                      </span>
                    </div>
                  </Field>

                  {form.loyalty_points_enabled && (
                    <div className="grid gap-4 sm:grid-cols-2 pt-2">
                      <Field label="Tỷ lệ tích lũy (Số tiền = 1 điểm)" hint="Ví dụ: 100.000đ đổi lấy 1 điểm">
                        <div className="relative flex items-center">
                          <input
                            type="text"
                            value={formatWithDots(form.loyalty_money_to_point)}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, '');
                              set('loyalty_money_to_point', raw);
                            }}
                            disabled={!canManageCrm}
                            className="w-full rounded-xl border border-slate-200 bg-white pl-4 pr-12 py-2.5 text-sm focus:border-primary focus:outline-none"
                            placeholder="100.005"
                          />
                          <span className="absolute right-4 text-xs font-semibold text-slate-400">đ</span>
                        </div>
                      </Field>
                      <Field label="Tỷ lệ quy đổi tiêu dùng (1 điểm = Số tiền)" hint="Ví dụ: 1 điểm trừ 1.000đ khi thanh toán">
                        <div className="relative flex items-center">
                          <input
                            type="text"
                            value={formatWithDots(form.loyalty_point_to_money)}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, '');
                              set('loyalty_point_to_money', raw);
                            }}
                            disabled={!canManageCrm}
                            className="w-full rounded-xl border border-slate-200 bg-white pl-4 pr-12 py-2.5 text-sm focus:border-primary focus:outline-none"
                            placeholder="1.000"
                          />
                          <span className="absolute right-4 text-xs font-semibold text-slate-400">đ</span>
                        </div>
                      </Field>
                    </div>
                  )}
                </div>
              </Section>

              {form.loyalty_points_enabled && (
                <Section title="Phân hạng & Ưu đãi Thành viên" description="Quản trị các hạng thành viên (Cost Center) và mức chiết khấu được hưởng">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Loại phần thưởng theo Hạng">
                      <select
                        value={form.tier_reward_type}
                        onChange={(e) => set('tier_reward_type', e.target.value)}
                        disabled={!canManageCrm}
                        className={inputCls}
                      >
                        <option value="discount_bill">Chiết khấu trực tiếp trên Hóa đơn (%)</option>
                        <option value="price_list" disabled>Áp dụng Bảng giá riêng biệt (Nâng cấp Pro)</option>
                      </select>
                    </Field>
                    <Field label="Thời gian xét duyệt duy trì hạng (Số năm)" hint="Đánh giá dựa trên tổng chi tiêu">
                      <input
                        type="number" min="1" max="10"
                        value={form.tier_evaluation_years}
                        onChange={(e) => set('tier_evaluation_years', e.target.value)}
                        disabled={!canManageCrm}
                        className={inputCls}
                      />
                    </Field>
                  </div>

                  <div className="border-t border-slate-100 pt-4 mt-4 space-y-4">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Danh sách các hạng thành viên</h3>
                    <div className="space-y-3">
                      <div className="hidden sm:grid sm:grid-cols-12 gap-3 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <div className="col-span-4">Tên Hạng</div>
                        <div className="col-span-4">Mức doanh thu tích lũy (đ)</div>
                        <div className="col-span-3">Mức chiết khấu bill</div>
                        <div className="col-span-1 text-center">Xóa</div>
                      </div>

                      <div className="space-y-3">
                        {form.membership_tiers.map((tier: any, idx: number) => (
                          <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3 bg-slate-50 sm:bg-transparent rounded-xl border border-slate-100 sm:border-0 items-center">
                            <div className="col-span-4">
                              <label className="sm:hidden text-[10px] font-bold text-slate-450 uppercase mb-1 block">Tên Hạng</label>
                              <input
                                type="text"
                              value={tier.name}
                              onChange={(e) => {
                                const updated = [...form.membership_tiers];
                                updated[idx].name = e.target.value;
                                set('membership_tiers', updated);
                              }}
                              disabled={!canManageCrm}
                              className={inputCls}
                              placeholder="Hạng hội viên"
                            />
                          </div>

                          {/* Col 2: Threshold */}
                          <div className="col-span-4">
                            <label className="sm:hidden text-[10px] font-bold text-slate-455 uppercase mb-1 block">Doanh số tối thiểu (đ)</label>
                            <div className="relative flex items-center">
                              <input
                                type="text"
                                value={formatWithDots(tier.threshold)}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/[^0-9]/g, '');
                                  const updated = [...form.membership_tiers];
                                  updated[idx].threshold = raw;
                                  set('membership_tiers', updated);
                                }}
                                disabled={!canManageCrm}
                                className="w-full rounded-xl border border-slate-200 bg-white pl-4 pr-12 py-2.5 text-sm focus:border-primary focus:outline-none"
                                placeholder="0"
                              />
                              <span className="absolute right-4 text-xs font-semibold text-slate-400">đ</span>
                            </div>
                          </div>

                          {/* Col 3: Discount percentage */}
                          <div className="col-span-3">
                            <label className="sm:hidden text-[10px] font-bold text-slate-455 uppercase mb-1 block">Mức chiết khấu</label>
                            <div className="relative flex items-center">
                              <input
                                type="text"
                                value={tier.discount}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/[^0-9]/g, '');
                                  const val = Math.min(100, parseInt(raw) || 0);
                                  const updated = [...form.membership_tiers];
                                  updated[idx].discount = val;
                                  set('membership_tiers', updated);
                                }}
                                disabled={!canManageCrm}
                                className="w-full rounded-xl border border-slate-200 bg-white pl-4 pr-8 py-2.5 text-sm focus:border-primary focus:outline-none"
                                placeholder="5"
                              />
                              <span className="absolute right-4 text-xs font-semibold text-slate-400">%</span>
                            </div>
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
              </Section>
            )}

            {canManageCrm && (
              <div className="flex items-center gap-3 bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
                <button
                  type="submit"
                  disabled={tabState === 'saving'}
                  className="cursor-pointer rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60 transition-all active:scale-95 shadow-sm shadow-primary/20"
                >
                  {tabState === 'saving' ? 'Đang lưu...' : 'Lưu Cài đặt CRM'}
                </button>
                {tabState === 'saved' && (
                  <p className="text-xs text-green-600 font-semibold flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Đã lưu thành công.
                  </p>
                )}
                {tabState === 'error' && (
                  <p className="text-xs text-red-600 font-semibold flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Lưu thất bại. Thử lại.
                  </p>
                )}
              </div>
            )}
          </form>
        )
      )}

      {activeTab === 'telegram' && (
        !canUsePushNotify && !canUseCustomNotify ? (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="border-b border-slate-100 px-6 py-4">
                <h2 className="text-sm font-semibold text-slate-900">Thông báo Push (Telegram/Zalo)</h2>
                <p className="text-xs text-slate-400 mt-0.5">Nhận thông báo đơn hàng và báo cáo doanh thu tự động qua Telegram/Zalo.</p>
              </div>
              <div className="px-6 py-10 flex flex-col items-center text-center max-w-lg mx-auto">
                {/* Top circle holding the blue bell icon */}
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600 mb-5 border border-blue-100">
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                  </svg>
                </div>
                
                <h3 className="text-base font-bold text-slate-900 mb-2">Thông báo Push (Telegram / Zalo)</h3>
                
                <p className="text-xs text-slate-500 leading-relaxed mb-6">
                  Tính năng gửi thông báo tức thời qua <strong>Telegram & Zalo</strong> giúp bạn kiểm soát dòng tiền, báo cáo doanh thu và đơn hàng tự động mọi lúc mọi nơi. Tính năng này yêu cầu gói cước <strong>Chuyên nghiệp (Pro)</strong> trở lên.
                </p>
                
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-plan-modal'))}
                  className="cursor-pointer rounded-lg bg-blue-600 hover:bg-blue-700 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <span>Nâng cấp lên Pro</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Cấu hình Nhận Thông Báo</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Cài đặt nhận thông báo tự động về các hoạt động của hệ thống qua Telegram Bot hoặc thiết bị di động (Mobile Push).
                </p>
              </div>

              {canUsePushNotify && (
                <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
                  <h3 className="text-sm font-semibold text-blue-900 mb-2">Push Notification (Cơ bản)</h3>
                  {localTelegramConfig && !localTelegramConfig.bot_token ? (
                    <div className="flex items-center justify-between text-sm text-green-700 bg-green-50 p-3 rounded-md border border-green-200">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Đã kết nối thành công tới Group Telegram.</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRevoke}
                        disabled={isPending || !canManage}
                        className="text-xs font-medium text-red-600 hover:text-red-800 bg-white border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        Hủy kết nối
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-blue-800">Để kết nối, thực hiện theo các bước sau:</p>
                      <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
                        <li>Tạo một Group Telegram cho cửa hàng.</li>
                        <li>Mời bot <strong>@OniSaasBot</strong> vào Group đó.</li>
                        <li>Nhấn nút bên dưới để lấy mã ghép nối.</li>
                        <li>Gửi tin nhắn <code>/connect [MÃ]</code> vào trong Group.</li>
                      </ol>
                      {!pairingCode ? (
                        <button
                          type="button"
                          onClick={handleGenerateCode}
                          disabled={isGeneratingCode || !canManage}
                          className="mt-2 inline-flex items-center justify-center rounded-md bg-[#fa5907] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#e04f06] disabled:opacity-50 cursor-pointer"
                        >
                          {isGeneratingCode ? 'Đang tạo mã...' : 'Tạo mã ghép nối'}
                        </button>
                      ) : (
                        <div className="mt-2 flex flex-col gap-2">
                          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded p-2 max-w-sm justify-between">
                            <code className="text-lg font-bold text-slate-900">/connect {pairingCode}</code>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(`/connect ${pairingCode}`);
                                toast.success('Đã sao chép mã!');
                              }}
                              className="text-xs font-medium text-[#fa5907] hover:text-[#e04f06] bg-orange-50 hover:bg-orange-100 px-2 py-1 rounded transition-colors cursor-pointer"
                            >
                              Copy
                            </button>
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <span className="text-slate-500 italic">
                              Mã có hiệu lực: <span className="font-medium text-slate-700">{Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
                            </span>
                            <button
                              type="button"
                              onClick={handleCancelPairing}
                              className="text-red-600 hover:text-red-700 font-medium underline underline-offset-2 cursor-pointer"
                            >
                              Hủy bỏ
                            </button>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-blue-600 mt-1">
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={2}></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Đang chờ xác nhận từ Telegram...
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {canUseCustomNotify && (
                <div className="space-y-4 max-w-xl rounded-lg border border-slate-100 p-4">
                  <h3 className="text-sm font-semibold text-slate-900 mb-2">Custom Notification (Bot Riêng)</h3>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Bot Token</label>
                    <input
                      type="password"
                      className="block w-full rounded-md border border-slate-300 py-2 px-3 text-sm focus:border-[#fa5907] focus:outline-none focus:ring-1 focus:ring-[#fa5907]"
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      disabled={!canManage || isPending}
                      placeholder="123456789:ABCdefGHIjklmNOPQrsTUVwxyz..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Chat ID</label>
                    <input
                      type="text"
                      className="block w-full rounded-md border border-slate-300 py-2 px-3 text-sm focus:border-[#fa5907] focus:outline-none focus:ring-1 focus:ring-[#fa5907]"
                      value={chatId}
                      onChange={(e) => setChatId(e.target.value)}
                      disabled={!canManage || isPending}
                      placeholder="-1001234567890"
                    />
                  </div>
                </div>
              )}

              <hr className="border-slate-100" />

              <div>
                <h3 className="text-sm font-medium text-slate-900 mb-3">Sự kiện nhận thông báo</h3>
                <div className="space-y-4">
                  {AVAILABLE_EVENTS.map((ev) => (
                    <div key={ev.id} className="border-b border-slate-100 pb-4 last:border-b-0">
                      <label className="flex items-center cursor-pointer max-w-sm">
                        <div className="relative">
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={events[ev.id]}
                            disabled={!canManage || isPending}
                            onChange={(e) => setEvents({ ...events, [ev.id]: e.target.checked })}
                          />
                          <div className={`block w-10 h-6 rounded-full transition-colors ${events[ev.id] ? 'bg-[#fa5907]' : 'bg-slate-300'}`}></div>
                          <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${events[ev.id] ? 'transform translate-x-4' : ''}`}></div>
                        </div>
                        <div className="ml-3 text-sm font-semibold text-slate-800">
                          {ev.label}
                        </div>
                      </label>

                      {events[ev.id] && (
                        <div className="ml-13 mt-3 space-y-3 p-3 bg-slate-50/60 rounded-xl border border-slate-100 max-w-lg">
                          <label className={`flex items-center ${localTelegramConfig?.chat_id ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-[#fa5907] focus:ring-[#fa5907] h-4 w-4"
                              checked={!!localTelegramConfig?.chat_id && (eventChannels[ev.id]?.telegram?.enabled ?? true)}
                              disabled={!canManage || isPending || !localTelegramConfig?.chat_id}
                              onChange={(e) => {
                                const prevCfg = eventChannels[ev.id] || { telegram: { enabled: true }, push: { enabled: true, roles: [] } };
                                setEventChannels({
                                  ...eventChannels,
                                  [ev.id]: {
                                    ...prevCfg,
                                    telegram: { enabled: e.target.checked }
                                  }
                                });
                              }}
                            />
                            <span className="ml-2 text-xs text-slate-600 font-medium">
                              Gửi tới Telegram Group {!localTelegramConfig?.chat_id && <span className="text-red-500 font-normal">(Chưa kết nối Telegram)</span>}
                            </span>
                          </label>

                          <div className="space-y-2">
                            <label className="flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                className="rounded border-slate-300 text-[#fa5907] focus:ring-[#fa5907] h-4 w-4"
                                checked={eventChannels[ev.id]?.push?.enabled ?? true}
                                disabled={!canManage || isPending}
                                onChange={(e) => {
                                  const prevCfg = eventChannels[ev.id] || { telegram: { enabled: true }, push: { enabled: true, roles: [] } };
                                  setEventChannels({
                                    ...eventChannels,
                                    [ev.id]: {
                                      ...prevCfg,
                                      push: {
                                        ...prevCfg.push,
                                        enabled: e.target.checked
                                      }
                                    }
                                  });
                                }}
                              />
                              <span className="ml-2 text-xs text-slate-600 font-medium">Gửi Push Notification (App Mobile)</span>
                            </label>

                            {(eventChannels[ev.id]?.push?.enabled ?? true) && (
                              <div className="ml-6 pl-3 border-l-2 border-slate-200 py-1 space-y-1.5">
                                <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                  Giới hạn người nhận theo vai trò:
                                </span>
                                <div className="space-y-1 max-w-sm">
                                  {(roles && roles.length > 0 ? roles : [
                                    { code: 'owner', name: 'Chủ sở hữu' },
                                    { code: 'admin', name: 'Quản lý' },
                                    { code: 'staff', name: 'Nhân viên' }
                                  ]).map((role) => {
                                    const selectedRoles = eventChannels[ev.id]?.push?.roles || [];
                                    const isSelected = selectedRoles.includes(role.code);
                                    return (
                                      <button
                                        key={role.code}
                                        type="button"
                                        disabled={!canManage || isPending}
                                        onClick={() => {
                                          const prevCfg = eventChannels[ev.id] || { telegram: { enabled: true }, push: { enabled: true, roles: [] } };
                                          const nextRoles = isSelected
                                            ? selectedRoles.filter(r => r !== role.code)
                                            : [...selectedRoles, role.code];
                                          setEventChannels({
                                            ...eventChannels,
                                            [ev.id]: {
                                              ...prevCfg,
                                              push: {
                                                ...prevCfg.push,
                                                roles: nextRoles
                                              }
                                            }
                                          });
                                        }}
                                        className="flex items-center gap-2 w-full text-left py-1 px-2 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer group"
                                      >
                                        {isSelected ? (
                                          <svg className="w-4 h-4 text-[#fa5907] flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                          </svg>
                                        ) : (
                                          <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <rect x="3" y="3" width="18" height="18" rx="4" />
                                          </svg>
                                        )}
                                        <span className={`text-xs ${isSelected ? 'text-slate-900 font-semibold' : 'text-slate-600 font-normal'}`}>
                                          {role.name}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1 italic leading-relaxed">
                                  * Bỏ chọn tất cả để gửi cho toàn bộ thành viên trong chi nhánh.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {canManage && (
                <div className="pt-4 flex items-center gap-4">
                  <button
                    onClick={handleSaveTelegram}
                    disabled={isPending}
                    className="rounded-md bg-[#fa5907] px-4 py-2 text-sm font-medium text-white hover:bg-[#e04f06] disabled:opacity-50 cursor-pointer"
                  >
                    {isPending ? 'Đang lưu...' : 'Lưu cấu hình'}
                  </button>
                  {telegramSuccessMsg && <span className="text-sm text-green-600 font-medium">{telegramSuccessMsg}</span>}
                </div>
              )}
            </div>
          )
        )}

      {activeTab === 'payment-methods' && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          <Section title="Danh mục Phương thức thanh toán" description="Quản lý danh sách các phương thức thanh toán tại quầy thu ngân (Tiền mặt, Chuyển khoản, Ví điện tử...)">
            
            {/* Form thêm mới / chỉnh sửa */}
            {(isAddingMethod || editingMethod) ? (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 mb-4 animate-in fade-in-50 duration-200">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  {editingMethod ? 'Cập nhật phương thức thanh toán' : 'Thêm phương thức thanh toán mới'}
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Tên phương thức thanh toán" hint="Ví dụ: Chuyển khoản, Ví MoMo, Thẻ ATM/POS...">
                    <input
                      value={methodForm.name}
                      onChange={(e) => setMethodForm({ ...methodForm, name: e.target.value })}
                      className={inputCls}
                      placeholder="Nhập tên phương thức..."
                    />
                  </Field>

                  <Field label="Mã code lưu ở DB" hint={editingMethod ? "Mã code cố định không thể chỉnh sửa" : "Nhập mã code dùng trong dữ liệu đơn hàng (ví dụ: cash, momo, bank_transfer...)"}>
                    <input
                      value={methodForm.code}
                      disabled={!!editingMethod}
                      onChange={(e) => setMethodForm({ ...methodForm, code: e.target.value })}
                      className={inputCls}
                      placeholder="Nhập mã code (ví dụ: zalopay)..."
                    />
                  </Field>

                  <Field label="Loại hình thanh toán" hint="Ánh xạ loại hình để khớp với nhóm quỹ khi thanh toán">
                    <select
                      value={methodForm.type}
                      onChange={(e) => setMethodForm({ ...methodForm, type: e.target.value as any })}
                      className={inputCls}
                    >
                      <option value="cash">Tiền mặt</option>
                      <option value="bank">Ngân hàng (Chuyển khoản, Card)</option>
                      <option value="wallet">Ví điện tử (Momo, ZaloPay...)</option>
                      <option value="prepaid">Ví trả trước</option>
                      <option value="debt">Ghi nợ</option>
                    </select>
                  </Field>
                </div>

                <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <Field label="Đặt làm mặc định" hint="Tự động chọn phương thức này khi mở màn hình thanh toán cho nhóm tương ứng">
                    <div
                      onClick={() => setMethodForm({ ...methodForm, is_default: !methodForm.is_default })}
                      className="flex cursor-pointer items-center gap-3 mt-1"
                    >
                      <div
                        className={`relative h-6 w-11 rounded-full transition-colors ${methodForm.is_default ? 'bg-primary' : 'bg-slate-200'}`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${methodForm.is_default ? 'translate-x-5' : ''}`}
                        />
                      </div>
                      <span className="text-sm text-slate-600 select-none font-medium">
                        {methodForm.is_default ? 'Đặt làm mặc định' : 'Không đặt làm mặc định'}
                      </span>
                    </div>
                  </Field>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMethod(null);
                        setIsAddingMethod(false);
                      }}
                      className="cursor-pointer rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-5 py-2.5 text-sm font-semibold transition-all active:scale-95 shadow-3xs flex items-center justify-center gap-1.5"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveMethod}
                      className="cursor-pointer rounded-xl bg-primary hover:bg-primary-dark text-white px-5 py-2.5 text-sm font-semibold transition-all active:scale-95 shadow-sm shadow-primary/20 flex items-center justify-center gap-1.5"
                    >
                      Xác nhận lưu
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs text-slate-400">Danh sách các phương thức hiện đang cấu hình trong hệ thống</span>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      setMethodForm({
                        id: '',
                        code: '',
                        name: '',
                        type: 'cash',
                        is_default: false,
                      });
                      setEditingMethod(null);
                      setIsAddingMethod(true);
                    }}
                    className="cursor-pointer rounded-xl bg-primary hover:bg-primary-dark text-white px-4 py-2 text-xs font-semibold transition-all active:scale-95 shadow-sm shadow-primary/20 flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Thêm phương thức
                  </button>
                )}
              </div>
            )}

            {/* Danh sách Phương thức */}
            {methodsLoading ? (
              <div className="py-12 flex flex-col justify-center items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="text-xs text-slate-400">Đang tải danh sách phương thức thanh toán...</span>
              </div>
            ) : methods.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                <p className="text-sm text-slate-400 italic">Chưa cấu hình phương thức thanh toán nào cho chi nhánh này.</p>
              </div>
            ) : (
              <div className="overflow-hidden border border-slate-200 rounded-2xl bg-white shadow-xs">
                <table className="min-w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-550 uppercase font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-3">Tên phương thức</th>
                      <th className="px-5 py-3">Mã code lưu ở DB</th>
                      <th className="px-5 py-3">Loại</th>
                      <th className="px-5 py-3 text-center">Trạng thái</th>
                      <th className="px-5 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150">
                    {methods.map((method) => {
                      const isDefault = method.is_default === 'TRUE' || method.is_default === true;
                      const isActive = method.active === 'TRUE' || method.active === true;
                      
                      let typeBadge = '';
                      let typeColor = '';
                      if (method.type === 'cash') {
                        typeBadge = 'Tiền mặt';
                        typeColor = 'bg-emerald-50 text-emerald-700 border border-emerald-100';
                      } else if (method.type === 'bank') {
                        typeBadge = 'Ngân hàng / POS';
                        typeColor = 'bg-blue-50 text-blue-700 border border-blue-100';
                      } else if (method.type === 'wallet') {
                        typeBadge = 'Ví điện tử';
                        typeColor = 'bg-pink-50 text-pink-700 border border-pink-100';
                      } else if (method.type === 'prepaid') {
                        typeBadge = 'Ví trả trước';
                        typeColor = 'bg-indigo-50 text-indigo-700 border border-indigo-100';
                      } else if (method.type === 'debt') {
                        typeBadge = 'Ghi nợ';
                        typeColor = 'bg-amber-50 text-amber-700 border border-amber-100';
                      }

                      return (
                        <tr key={method.id} className={`hover:bg-slate-50/50 transition-colors ${!isActive ? 'opacity-65 bg-slate-50/30' : ''}`}>
                          <td className="px-5 py-3.5 font-bold text-slate-800">
                            <div className="flex items-center gap-2">
                              <span>{method.name}</span>
                              {isDefault && (
                                <span className="text-[9px] font-bold bg-primary/10 text-primary border border-primary/20 rounded-md px-1.5 py-0.5">
                                  Mặc định
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 font-mono text-[11px] text-slate-600">
                            {method.code || method.id}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`text-[10px] font-bold rounded-lg px-2 py-0.5 ${typeColor}`}>
                              {typeBadge}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <div className="flex items-center justify-center">
                              {/* Toggle switch for status without row label */}
                              <div
                                onClick={() => canManage && handleToggleMethodActive(method.id, isActive)}
                                className={`relative h-5.5 w-10 rounded-full transition-all duration-200 ${
                                  isActive ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-200 hover:bg-slate-300'
                                } ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                              >
                                <span
                                  className={`absolute top-0.5 left-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-all duration-200 ${
                                    isActive ? 'translate-x-4.5' : ''
                                  }`}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setMethodForm({
                                    id: method.id,
                                    code: method.code || method.id,
                                    name: method.name,
                                    type: method.type,
                                    is_default: isDefault,
                                  });
                                  setEditingMethod(method);
                                  setIsAddingMethod(false);
                                }}
                                className="cursor-pointer rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-xs font-bold transition-all active:scale-95 shadow-3xs flex items-center gap-1.5"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Sửa
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => handleDeleteMethod(method.id, method.name)}
                                className="cursor-pointer rounded-xl bg-white border border-red-200 hover:bg-red-50 text-red-600 px-3 py-1.5 text-xs font-bold transition-all active:scale-95 shadow-3xs flex items-center gap-1.5"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Xóa
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      )}

      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Section({ id, title, description, children }: { id?: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <div id={id} className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
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
      </div>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed';
