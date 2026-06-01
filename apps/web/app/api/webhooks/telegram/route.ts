import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Ignore non-message updates
    if (!body.message || !body.message.text) {
      return NextResponse.json({ ok: true });
    }

    const { chat, text } = body.message;
    const chatId = chat.id;

    if (text.startsWith('/connect ')) {
      const code = text.split(' ')[1]?.trim();
      if (!code) return NextResponse.json({ ok: true });

      const admin = getSupabaseAdminClient();

      // Find the pairing code
      const { data: pairingCode } = await admin
        .from('bot_pairing_codes')
        .select('tenant_id, shop_id')
        .eq('code', code)
        .gte('expires_at', new Date().toISOString())
        .maybeSingle();

      if (!pairingCode) {
        await sendTelegramMessage(chatId, '❌ Mã ghép nối không hợp lệ hoặc đã hết hạn.');
        return NextResponse.json({ ok: true });
      }

      const tenantId = pairingCode.tenant_id;
      const shopId = pairingCode.shop_id;

      // Upsert notification channel for this tenant & shop (Shared Bot)
      const config = { chat_id: String(chatId) }; // No bot_token means shared bot

      const { data: existing } = await admin
        .from('tenant_notification_channels')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('shop_id', shopId)
        .eq('provider', 'telegram')
        .is('config->bot_token', null) // find shared bot channel
        .maybeSingle();

      if (existing) {
        await admin
          .from('tenant_notification_channels')
          .update({ config, is_active: true })
          .eq('id', existing.id);
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

      // Delete the code so it cannot be reused
      await admin.from('bot_pairing_codes').delete().eq('code', code);

      await sendTelegramMessage(
        chatId,
        '✅ Kết nối thành công! Nhóm này sẽ nhận các thông báo từ ONI SaaS.'
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}

async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
