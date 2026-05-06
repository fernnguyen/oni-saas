import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { encryptConnectorField } from '../../../../../lib/crypto';
import { buildOniTemplateSheets, sanitizeInternalPath } from '../../../../../lib/googleSheets';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const parsedState = parseState(state);
  const shop_id = parsedState?.shop_id;
  const source = parsedState?.source;
  const returnOrigin = sanitizeReturnOrigin(parsedState?.return_origin) ?? origin;
  const returnTo = sanitizeInternalPath(parsedState?.return_to, '/dashboard/connectors');

  if (!code || !shop_id || !source) {
    return NextResponse.redirect(`${returnOrigin}${withStatus(returnTo, 'oauth_missing_params')}`);
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
    return NextResponse.redirect(`${returnOrigin}${withStatus(returnTo, 'token_exchange_failed')}`);
  }

  const tokens = await tokenRes.json();
  const accessToken = tokens.access_token as string | undefined;
  const refreshToken = tokens.refresh_token as string | undefined;
  if (!accessToken) {
    return NextResponse.redirect(`${returnOrigin}${withStatus(returnTo, 'token_missing')}`);
  }

  const encrypted_access_token = encryptConnectorField(tokens.access_token);
  const encrypted_refresh_token = refreshToken ? encryptConnectorField(refreshToken) : null;
  const token_expiry = tokens.expires_in
    ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
    : null;

  const supabase = getSupabaseAdminClient();
  const { data: shopInfo } = await supabase
    .from('shops')
    .select('name')
    .eq('id', shop_id)
    .maybeSingle();

  const sheet = source === 'template'
    ? await createTemplateSpreadsheet(accessToken, parsedState?.template_name || shopInfo?.name || 'ONI Sheet')
    : await verifyExistingSpreadsheet(accessToken, parsedState?.sheet_id);

  if (!sheet.ok) {
    return NextResponse.redirect(`${returnOrigin}${withStatus(returnTo, sheet.error)}`);
  }

  const connectorPayload = {
    shop_id,
    type: 'google_sheets',
    status: 'active',
    config: {
      sheet_id: sheet.sheetId,
      sheet_title: sheet.title,
      sheet_url: `https://docs.google.com/spreadsheets/d/${sheet.sheetId}/edit`,
      encrypted_refresh_token,
      encrypted_access_token,
      token_expiry,
    },
    updated_at: new Date().toISOString(),
  };

  const { data: existingConnector, error: existingError } = await supabase
    .from('connectors')
    .select('id')
    .eq('shop_id', shop_id)
    .eq('type', 'google_sheets')
    .maybeSingle();

  if (existingError) {
    console.error('google-sheets callback: failed to load existing connector', existingError);
    return NextResponse.redirect(`${returnOrigin}${withStatus(returnTo, 'save_failed')}`);
  }

  const { error } = existingConnector
    ? await supabase
        .from('connectors')
        .update(connectorPayload)
        .eq('id', existingConnector.id)
    : await supabase
        .from('connectors')
        .insert({ ...connectorPayload, created_at: new Date().toISOString() });

  if (error) {
    console.error('google-sheets callback: failed to save connector', error);
    return NextResponse.redirect(`${returnOrigin}${withStatus(returnTo, 'save_failed')}`);
  }

  return NextResponse.redirect(`${returnOrigin}${withStatus(returnTo, 'connected')}`);
}

function parseState(value: string | null): {
  shop_id: string;
  source: 'existing' | 'template';
  sheet_id?: string | null;
  template_name?: string | null;
  return_origin?: string;
  return_to?: string;
} | null {
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (!parsed?.shop_id || !parsed?.source) return null;
    return parsed;
  } catch {
    return null;
  }
}

function withStatus(path: string, status: string): string {
  const url = new URL(path, 'http://local');
  url.searchParams.set(status === 'connected' ? 'success' : 'error', status);
  return `${url.pathname}${url.search}`;
}

function sanitizeReturnOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function verifyExistingSpreadsheet(accessToken: string, sheetId?: string | null) {
  if (!sheetId) return { ok: false as const, error: 'sheet_access_denied' };

  const verifyRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=spreadsheetId,properties.title`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!verifyRes.ok) {
    return { ok: false as const, error: 'sheet_access_denied' };
  }

  const sheet = await verifyRes.json();
  return {
    ok: true as const,
    sheetId: (sheet.spreadsheetId as string) ?? sheetId,
    title: (sheet.properties?.title as string | undefined) ?? 'Google Sheet',
  };
}

async function createTemplateSpreadsheet(accessToken: string, templateName: string) {
  const title = `ONI - ${templateName}`.trim();
  const templateSheets = buildOniTemplateSheets();

  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: templateSheets.map((sheet) => ({ properties: { title: sheet.title } })),
    }),
  });

  if (!createRes.ok) {
    return { ok: false as const, error: 'template_create_failed' };
  }

  const created = await createRes.json();
  const spreadsheetId = created.spreadsheetId as string | undefined;
  if (!spreadsheetId) {
    return { ok: false as const, error: 'template_create_failed' };
  }

  const valuesRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: templateSheets.map((sheet) => ({
        range: `${sheet.title}!A1:${columnLabel(sheet.headers.length)}1`,
        values: [sheet.headers],
      })),
    }),
  });

  if (!valuesRes.ok) {
    return { ok: false as const, error: 'template_seed_failed' };
  }

  return {
    ok: true as const,
    sheetId: spreadsheetId,
    title: (created.properties?.title as string | undefined) ?? title,
  };
}

function columnLabel(columnCount: number): string {
  let n = columnCount;
  let label = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}
