import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../../../lib/server/supabaseServer';
import { extractGoogleSheetId, sanitizeInternalPath } from '../../../../../lib/googleSheets';

const oauthInitSchema = z.object({
  shop_id: z.string().uuid(),
  mode: z.literal('oauth_init'),
  source: z.enum(['existing', 'template']),
  sheet_input: z.string().optional(),
  template_name: z.string().optional(),
  return_to: z.string().optional(),
});

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const json = await req.json();

  const oauthInit = oauthInitSchema.safeParse(json);
  if (oauthInit.success) {
    const { shop_id, source, sheet_input, template_name, return_to } = oauthInit.data;

    let sheet_id: string | null = null;
    if (source === 'existing') {
      sheet_id = extractGoogleSheetId(sheet_input ?? '');
      if (!sheet_id) {
        return NextResponse.json({ message: 'Link Google Sheet không hợp lệ' }, { status: 400 });
      }
    }

    if (source === 'template' && !template_name?.trim()) {
      return NextResponse.json({ message: 'Tên file template là bắt buộc' }, { status: 400 });
    }

    const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const appOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? origin;
    const state = Buffer.from(JSON.stringify({
      shop_id,
      source,
      sheet_id,
      template_name: template_name?.trim() || null,
      return_origin: origin,
      return_to: sanitizeInternalPath(return_to, '/dashboard/connectors'),
    })).toString('base64url');

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: `${appOrigin}/api/connectors/google-sheets/callback`,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return NextResponse.json({ redirect_url: `${GOOGLE_AUTH_URL}?${params}` });
  }

  return NextResponse.json({ message: 'Invalid input' }, { status: 400 });
}
