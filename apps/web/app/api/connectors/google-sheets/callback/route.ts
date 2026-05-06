import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../../lib/server/supabaseServer';
import { encryptConnectorField } from '../../../../../lib/crypto';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const shop_id = searchParams.get('state'); // passed as state in OAuth init

  if (!code || !shop_id) {
    return NextResponse.redirect(`${origin}/dashboard?error=oauth_missing_params`);
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: `${origin}/api/connectors/google-sheets/callback`,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${origin}/dashboard?shop=${shop_id}&error=token_exchange_failed`);
  }

  const tokens = await tokenRes.json();
  const encrypted_refresh_token = encryptConnectorField(tokens.refresh_token);
  const encrypted_access_token = encryptConnectorField(tokens.access_token);

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from('connectors')
    .upsert(
      {
        shop_id,
        type: 'google_sheets',
        status: 'active',
        config: {
          encrypted_refresh_token,
          encrypted_access_token,
          token_expiry: tokens.expiry_date ?? null,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'shop_id' },
    );

  if (error) {
    return NextResponse.redirect(`${origin}/dashboard?shop=${shop_id}&error=save_failed`);
  }

  // Redirect back to the shop's page
  const { data: shop } = await supabase
    .from('shops')
    .select('slug')
    .eq('id', shop_id)
    .single();

  const redirectSlug = shop?.slug ?? '';
  return NextResponse.redirect(`${origin}/s/${redirectSlug}?success=connected`);
}
