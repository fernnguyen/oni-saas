import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../../../lib/server/supabaseServer';
import { encryptConnectorField } from '../../../../../lib/crypto';

const manualSchema = z.object({
  shop_id: z.string().uuid(),
  mode: z.literal('manual'),
  sheet_id: z.string().min(1),
  access_token: z.string().min(1),
});

const oauthInitSchema = z.object({
  shop_id: z.string().uuid(),
  mode: z.literal('oauth_init'),
});

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const json = await req.json();

  // ── Option A: Manual — paste Sheet ID + Access Token
  const manual = manualSchema.safeParse(json);
  if (manual.success) {
    const { shop_id, sheet_id, access_token } = manual.data;
    const encrypted_token = encryptConnectorField(access_token);

    const { data, error } = await supabase
      .from('connectors')
      .upsert(
        {
          shop_id,
          type: 'google_sheets',
          status: 'pending',
          config: { sheet_id, encrypted_token },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'shop_id' },
      )
      .select()
      .single();

    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ connector: data });
  }

  // ── Option B: OAuth redirect — return Google consent URL
  const oauthInit = oauthInitSchema.safeParse(json);
  if (oauthInit.success) {
    const { shop_id } = oauthInit.data;
    const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: `${origin}/api/connectors/google-sheets/callback`,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state: shop_id,
    });

    return NextResponse.json({ redirect_url: `${GOOGLE_AUTH_URL}?${params}` });
  }

  return NextResponse.json({ message: 'Invalid input' }, { status: 400 });
}
