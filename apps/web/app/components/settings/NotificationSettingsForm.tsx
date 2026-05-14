'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { saveNotificationSettings, generatePairingCode, checkSharedBotConnection, clearPairingCode, revokeSharedBotConnection } from '@/app/t/[slug]/settings/notificationsActions';

interface NotificationSettingsFormProps {
  tenantId: string;
  slug: string;
  canManage: boolean;
  canUsePushNotify: boolean;
  canUseCustomNotify: boolean;
  telegramConfig: { bot_token?: string; chat_id: string } | null;
  eventsConfig: Record<string, boolean>;
}

const AVAILABLE_EVENTS = [
  { id: 'ORDER_CREATED', label: 'Đơn hàng mới' },
  { id: 'PAYMENT_RECEIVED', label: 'Thanh toán thành công' },
  { id: 'CUSTOMER_CREATED', label: 'Khách hàng mới' },
  { id: 'ORDER_CANCELLED', label: 'Hủy đơn hàng' },
  { id: 'ORDER_RETURNED', label: 'Khách trả hàng' },
];

export function NotificationSettingsForm({
  tenantId,
  slug,
  canManage,
  canUsePushNotify,
  canUseCustomNotify,
  telegramConfig,
  eventsConfig,
}: NotificationSettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [botToken, setBotToken] = useState(telegramConfig?.bot_token || '');
  const [chatId, setChatId] = useState(telegramConfig?.chat_id || '');
  const [events, setEvents] = useState<Record<string, boolean>>(
    AVAILABLE_EVENTS.reduce((acc, ev) => ({ ...acc, [ev.id]: eventsConfig[ev.id] ?? false }), {})
  );
  const [successMsg, setSuccessMsg] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!pairingCode) return;
    
    // Poll connection status every 3 seconds
    const interval = setInterval(async () => {
      const isConnected = await checkSharedBotConnection(tenantId);
      if (isConnected) {
        toast.success('Kết nối thành công!');
        setPairingCode('');
        setTimeLeft(0);
        router.refresh();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [pairingCode, tenantId, router]);

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

  const handleSave = () => {
    setSuccessMsg('');
    startTransition(async () => {
      const eventsList = Object.keys(events).map(name => ({
        name,
        enabled: events[name]
      }));
      await saveNotificationSettings(tenantId, slug, botToken, chatId, eventsList);
      setSuccessMsg('Đã lưu cấu hình thông báo');
      setTimeout(() => setSuccessMsg(''), 3000);
    });
  };

  const handleGenerateCode = async () => {
    setIsGeneratingCode(true);
    try {
      const code = await generatePairingCode(tenantId);
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

  const handleRevoke = () => {
    if (!confirm('Bạn có chắc chắn muốn hủy kết nối với Group Telegram này? Bạn sẽ không nhận được thông báo nữa cho đến khi kết nối lại.')) return;
    startTransition(async () => {
      try {
        await revokeSharedBotConnection(tenantId, slug);
        toast.success('Đã hủy kết nối Telegram');
        router.refresh();
      } catch (e: any) {
        toast.error(e.message);
      }
    });
  };

  if (!canUsePushNotify && !canUseCustomNotify) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 opacity-75">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Thông báo Push (Telegram/Zalo)</h2>
        <p className="text-sm text-slate-500">
          Tính năng này không khả dụng cho gói dịch vụ hiện tại của bạn. Vui lòng nâng cấp để sử dụng hệ thống thông báo.
        </p>
      </div>
    );
  }

  const hasSharedBotConnected = telegramConfig && !telegramConfig.bot_token;
  const hasCustomBotConnected = telegramConfig && telegramConfig.bot_token;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Cấu hình Telegram Bot</h2>
        <p className="text-sm text-slate-500 mt-1">
          Nhận thông báo tự động về các hoạt động của hệ thống qua Telegram.
        </p>
      </div>

      {canUsePushNotify && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">Push Notification (Cơ bản)</h3>
          {hasSharedBotConnected ? (
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
                className="text-xs font-medium text-red-600 hover:text-red-800 bg-white border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
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
                  className="mt-2 inline-flex items-center justify-center rounded-md bg-[#fa5907] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#e04f06] disabled:opacity-50"
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
                      className="text-xs font-medium text-[#fa5907] hover:text-[#e04f06] bg-orange-50 hover:bg-orange-100 px-2 py-1 rounded transition-colors"
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
                      className="text-red-600 hover:text-red-700 font-medium underline underline-offset-2"
                    >
                      Hủy bỏ
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-blue-600 mt-1">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
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
        <div className="space-y-3">
          {AVAILABLE_EVENTS.map((ev) => (
            <label key={ev.id} className="flex items-center cursor-pointer max-w-sm">
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
              <div className="ml-3 text-sm text-slate-700">
                {ev.label}
              </div>
            </label>
          ))}
        </div>
      </div>

      {canManage && (
        <div className="pt-4 flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="rounded-md bg-[#fa5907] px-4 py-2 text-sm font-medium text-white hover:bg-[#e04f06] disabled:opacity-50"
          >
            {isPending ? 'Đang lưu...' : 'Lưu cấu hình'}
          </button>
          {successMsg && <span className="text-sm text-green-600 font-medium">{successMsg}</span>}
        </div>
      )}
    </div>
  );
}
