'use client';

import { useState, useTransition } from 'react';
import { saveNotificationSettings, generatePairingCode } from '@/app/t/[slug]/settings/notificationsActions';

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
  const [isPending, startTransition] = useTransition();
  const [botToken, setBotToken] = useState(telegramConfig?.bot_token || '');
  const [chatId, setChatId] = useState(telegramConfig?.chat_id || '');
  const [events, setEvents] = useState<Record<string, boolean>>(
    AVAILABLE_EVENTS.reduce((acc, ev) => ({ ...acc, [ev.id]: eventsConfig[ev.id] ?? false }), {})
  );
  const [successMsg, setSuccessMsg] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);

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
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsGeneratingCode(false);
    }
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
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-md border border-green-200">
              <span className="text-lg">✅</span> Đã kết nối thành công tới Group Telegram.
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
                  className="mt-2 inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isGeneratingCode ? 'Đang tạo mã...' : 'Tạo mã ghép nối'}
                </button>
              ) : (
                <div className="mt-2 flex items-center gap-2 bg-white border border-blue-200 rounded p-2 max-w-sm">
                  <code className="text-lg font-bold text-blue-600">/connect {pairingCode}</code>
                  <span className="text-xs text-slate-500">(Mã có hiệu lực 15 phút)</span>
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
              className="block w-full rounded-md border border-slate-300 py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
              className="block w-full rounded-md border border-slate-300 py-2 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                <div className={`block w-10 h-6 rounded-full transition-colors ${events[ev.id] ? 'bg-blue-600' : 'bg-slate-300'}`}></div>
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
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isPending ? 'Đang lưu...' : 'Lưu cấu hình'}
          </button>
          {successMsg && <span className="text-sm text-green-600 font-medium">{successMsg}</span>}
        </div>
      )}
    </div>
  );
}
