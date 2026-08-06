'use server';

import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getSupabaseServerClient } from '@/lib/server/supabaseServer';
import { getUserPermissions } from '@/lib/server/permissions';
import {
  NOTIFICATION_EVENT_CATALOG,
  getDefaultNotificationChannels,
  getNotificationEventDefinition,
} from '@/lib/notifications/eventCatalog';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const eventNames = new Set(NOTIFICATION_EVENT_CATALOG.map((event) => event.id));

const notificationEventSchema = z.object({
  name: z.string().refine((name) => eventNames.has(name), 'Sự kiện thông báo không hợp lệ.'),
  enabled: z.boolean(),
  channels_config: z.object({
    telegram: z.object({
      enabled: z.boolean(),
      chat_id: z.string().trim().max(128).optional(),
    }),
    push: z.object({
      enabled: z.boolean(),
      roles: z.array(z.string().trim().min(1).max(64)).max(50),
    }),
  }).optional(),
});

const saveNotificationSettingsSchema = z.object({
  tenantId: z.string().uuid(),
  shopId: z.string().uuid(),
  slug: z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  botToken: z.string().trim().max(512),
  chatId: z.string().trim().max(128),
  events: z.array(notificationEventSchema).max(NOTIFICATION_EVENT_CATALOG.length),
});

export async function saveNotificationSettings(
  tenantId: string,
  shopId: string,
  slug: string,
  botToken: string,
  chatId: string,
  events: { name: string; enabled: boolean; channels_config?: any }[]
) {
  const input = saveNotificationSettingsSchema.parse({
    tenantId,
    shopId,
    slug,
    botToken,
    chatId,
    events,
  });
  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new Error('Bạn cần đăng nhập để thay đổi cấu hình thông báo.');
  }

  const admin = getSupabaseAdminClient();
  const { data: shop, error: shopError } = await admin
    .from('shops')
    .select('id, tenant_id, slug')
    .eq('id', input.shopId)
    .eq('tenant_id', input.tenantId)
    .maybeSingle();

  if (shopError) throw new Error(shopError.message);
  if (!shop) throw new Error('Chi nhánh không tồn tại hoặc không thuộc doanh nghiệp này.');

  const permissions = await getUserPermissions(
    authData.user.id,
    input.tenantId,
    input.shopId,
  );
  if (!permissions.includes('settings.manage') && !permissions.includes('shops.manage')) {
    throw new Error('Bạn không có quyền thay đổi cấu hình thông báo.');
  }

  // 1. Save or Update Telegram Channel
  if (input.botToken && input.chatId) {
    const config = { bot_token: input.botToken, chat_id: input.chatId };
    const { data: existingChannel, error: channelLookupError } = await admin
      .from('tenant_notification_channels')
      .select('id')
      .eq('tenant_id', input.tenantId)
      .eq('shop_id', input.shopId)
      .eq('provider', 'telegram')
      .maybeSingle();
    if (channelLookupError) throw new Error(channelLookupError.message);

    if (existingChannel) {
      const { error } = await admin
        .from('tenant_notification_channels')
        .update({ config, is_active: true })
        .eq('id', existingChannel.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin
        .from('tenant_notification_channels')
        .insert({
          tenant_id: input.tenantId,
          shop_id: input.shopId,
          provider: 'telegram',
          config,
          is_active: true
        });
      if (error) throw new Error(error.message);
    }
  } else if (!input.botToken && !input.chatId) {
    // If both are empty, user cleared custom bot config. Disable channel.
    // If it's a shared bot (!botToken && chatId), do nothing to the channel config here.
    const { error } = await admin
      .from('tenant_notification_channels')
      .update({ is_active: false })
      .eq('tenant_id', input.tenantId)
      .eq('shop_id', input.shopId)
      .eq('provider', 'telegram');
    if (error) throw new Error(error.message);
  }

  // 2. Save Events
  if (input.events.length > 0) {
    const rows = input.events.map((event) => {
      const definition = getNotificationEventDefinition(event.name);
      const channels = event.channels_config ?? getDefaultNotificationChannels(event.name);
      return {
        tenant_id: input.tenantId,
        shop_id: input.shopId,
        event_name: event.name,
        is_enabled: event.enabled,
        channels_config: {
          telegram: definition?.allowTelegram
            ? channels.telegram
            : { enabled: false },
          push: {
            ...channels.push,
            roles: definition?.audience === 'all' ? channels.push.roles : [],
          },
        },
      };
    });
    const { error } = await admin
      .from('tenant_notification_events')
      .upsert(rows, { onConflict: 'shop_id,event_name' });
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/t/${input.slug}/${shop.slug}/settings/notification`);
  return { success: true };
}

export async function generatePairingCode(tenantId: string, shopId: string) {
  const admin = getSupabaseAdminClient();
  const code = 'ONI-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

  const { error } = await admin.from('bot_pairing_codes').insert({
    code,
    tenant_id: tenantId,
    shop_id: shopId,
    expires_at: expiresAt
  });

  if (error) throw new Error(error.message);
  return code;
}

export async function checkSharedBotConnection(tenantId: string, shopId: string) {
  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('tenant_notification_channels')
    .select('id, config')
    .eq('tenant_id', tenantId)
    .eq('shop_id', shopId)
    .eq('provider', 'telegram')
    .is('config->bot_token', null)
    .eq('is_active', true)
    .maybeSingle();

  return data ? { connected: true, config: data.config } : { connected: false };
}

export async function clearPairingCode(code: string) {
  const admin = getSupabaseAdminClient();
  await admin.from('bot_pairing_codes').delete().eq('code', code);
}

export async function revokeSharedBotConnection(tenantId: string, shopId: string, slug: string) {
  const admin = getSupabaseAdminClient();
  await admin
    .from('tenant_notification_channels')
    .update({ is_active: false, config: {} })
    .eq('tenant_id', tenantId)
    .eq('shop_id', shopId)
    .eq('provider', 'telegram')
    .is('config->bot_token', null);
    
  revalidatePath(`/t/${slug}/${shopId}/settings`);
  return { success: true };
}
