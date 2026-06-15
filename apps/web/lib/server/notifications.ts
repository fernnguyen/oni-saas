import { getSupabaseAdminClient } from './supabaseAdmin';
import { getTenantPlanMeta } from './subscriptions';

export interface NotificationPayload {
  title: string;
  message: string;
  url?: string;
  data?: Record<string, any>;
}

/**
 * Dispatch a notification event to all active channels for a tenant and shop,
 * if the tenant's plan allows it and the event is enabled.
 */
export async function dispatchNotification(
  tenantId: string,
  shopId: string,
  eventName: string,
  payload: NotificationPayload
): Promise<void> {
  try {
    // 1. Check if plan allows any type of push notification
    const meta = await getTenantPlanMeta(tenantId);
    if (!meta) return;
    
    const canUseShared = !!meta.can_use_push_notify;
    const canUseCustom = !!meta.can_use_custom_notify;

    if (!canUseShared && !canUseCustom) {
      return; // Plan does not support push notifications
    }

    const admin = getSupabaseAdminClient();

    // 2. Check if event is enabled for this shop
    const { data: eventData } = await admin
      .from('tenant_notification_events')
      .select('is_enabled, channels_config')
      .eq('tenant_id', tenantId)
      .eq('shop_id', shopId)
      .eq('event_name', eventName)
      .maybeSingle();

    if (!eventData || !eventData.is_enabled) {
      return; // Event not enabled globally
    }

    // Check specific channel override (Telegram)
    if (eventData.channels_config && typeof eventData.channels_config === 'object') {
      const tgConfig = (eventData.channels_config as any).telegram;
      if (tgConfig && tgConfig.enabled === false) {
        return; // Telegram channel explicitly disabled for this event
      }
    }

    // 3. Fetch active channels for this shop
    const { data: channels } = await admin
      .from('tenant_notification_channels')
      .select('provider, config')
      .eq('tenant_id', tenantId)
      .eq('shop_id', shopId)
      .eq('is_active', true);

    if (!channels || channels.length === 0) {
      return; // No active channels
    }

    // 4. Dispatch to each provider
    const promises = channels.map((channel) => {
      if (channel.provider === 'telegram') {
        const botToken = channel.config?.bot_token || process.env.TELEGRAM_BOT_TOKEN;
        const chatId = channel.config?.chat_id;
        
        // Ensure they have the right permission for custom vs shared
        const isCustom = !!channel.config?.bot_token;
        if (isCustom && !canUseCustom) return Promise.resolve();
        if (!isCustom && !canUseShared) return Promise.resolve();

        if (botToken && chatId) {
          return sendTelegramMessage(botToken, chatId, payload);
        }
      }
      return Promise.resolve();
    });

    await Promise.allSettled(promises);
  } catch (error) {
    console.error(`Failed to dispatch notification for tenant ${tenantId}, shop ${shopId}, event ${eventName}:`, error);
  }
}

/**
 * Adapter for Telegram Bot API
 */
async function sendTelegramMessage(botToken: string, chatId: string, payload: NotificationPayload): Promise<void> {
  const text = `*${escapeMarkdownV2(payload.title)}*\n\n${escapeMarkdownV2(payload.message)}${
    payload.url ? `\n\n[Xem chi tiết](${payload.url})` : ''
  }`;

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'MarkdownV2',
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Telegram API Error: ${err}`);
  }
}

function escapeMarkdownV2(text: string): string {
  // Characters that need to be escaped in MarkdownV2
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
