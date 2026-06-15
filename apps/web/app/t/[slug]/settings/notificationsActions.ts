'use server';

import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { revalidatePath } from 'next/cache';

export async function saveNotificationSettings(
  tenantId: string,
  shopId: string,
  slug: string,
  botToken: string,
  chatId: string,
  events: { name: string; enabled: boolean; channels_config?: any }[]
) {
  const admin = getSupabaseAdminClient();

  // 1. Save or Update Telegram Channel
  if (botToken && chatId) {
    const config = { bot_token: botToken, chat_id: chatId };
    const { data: existingChannel } = await admin
      .from('tenant_notification_channels')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('shop_id', shopId)
      .eq('provider', 'telegram')
      .maybeSingle();

    if (existingChannel) {
      await admin
        .from('tenant_notification_channels')
        .update({ config, is_active: true })
        .eq('id', existingChannel.id);
    } else {
      await admin
        .from('tenant_notification_channels')
        .insert({
          tenant_id: tenantId,
          shop_id: shopId,
          provider: 'telegram',
          config,
          is_active: true
        });
    }
  } else if (!botToken && !chatId) {
    // If both are empty, user cleared custom bot config. Disable channel.
    // If it's a shared bot (!botToken && chatId), do nothing to the channel config here.
    await admin
      .from('tenant_notification_channels')
      .update({ is_active: false })
      .eq('tenant_id', tenantId)
      .eq('shop_id', shopId)
      .eq('provider', 'telegram');
  }

  // 2. Save Events
  for (const ev of events) {
    const { data: existingEvent } = await admin
      .from('tenant_notification_events')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('shop_id', shopId)
      .eq('event_name', ev.name)
      .maybeSingle();

    const updateObj: Record<string, any> = { is_enabled: ev.enabled };
    if (ev.channels_config) {
      updateObj.channels_config = ev.channels_config;
    }

    if (existingEvent) {
      await admin
        .from('tenant_notification_events')
        .update(updateObj)
        .eq('id', existingEvent.id);
    } else {
      await admin
        .from('tenant_notification_events')
        .insert({
          tenant_id: tenantId,
          shop_id: shopId,
          event_name: ev.name,
          is_enabled: ev.enabled,
          channels_config: ev.channels_config || {
            telegram: { enabled: true },
            push: { enabled: true, roles: [] }
          }
        });
    }
  }

  revalidatePath(`/t/${slug}/${shopId}/settings`);
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
