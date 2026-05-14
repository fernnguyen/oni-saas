'use server';

import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { revalidatePath } from 'next/cache';

export async function saveNotificationSettings(
  tenantId: string,
  slug: string,
  botToken: string,
  chatId: string,
  events: { name: string; enabled: boolean }[]
) {
  const admin = getSupabaseAdminClient();

  // 1. Save or Update Telegram Channel
  if (botToken && chatId) {
    const config = { bot_token: botToken, chat_id: chatId };
    const { data: existingChannel } = await admin
      .from('tenant_notification_channels')
      .select('id')
      .eq('tenant_id', tenantId)
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
          provider: 'telegram',
          config,
          is_active: true
        });
    }
  } else {
    // If empty, disable channel
    await admin
      .from('tenant_notification_channels')
      .update({ is_active: false })
      .eq('tenant_id', tenantId)
      .eq('provider', 'telegram');
  }

  // 2. Save Events
  for (const ev of events) {
    const { data: existingEvent } = await admin
      .from('tenant_notification_events')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('event_name', ev.name)
      .maybeSingle();

    if (existingEvent) {
      await admin
        .from('tenant_notification_events')
        .update({ is_enabled: ev.enabled })
        .eq('id', existingEvent.id);
    } else {
      await admin
        .from('tenant_notification_events')
        .insert({
          tenant_id: tenantId,
          event_name: ev.name,
          is_enabled: ev.enabled
        });
    }
  }

  revalidatePath(`/t/${slug}/settings`);
  return { success: true };
}

export async function generatePairingCode(tenantId: string) {
  const admin = getSupabaseAdminClient();
  const code = 'ONI-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

  const { error } = await admin.from('bot_pairing_codes').insert({
    code,
    tenant_id: tenantId,
    expires_at: expiresAt
  });

  if (error) throw new Error(error.message);
  return code;
}
