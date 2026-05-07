import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { extractGoogleSheetId } from '../../../../../lib/googleSheets';
import { getServiceAccountToken } from '../../../../../lib/server/googleServiceAccount';

const schema = z.object({
  shop_id: z.string().uuid(),
  sheet_input: z.string(),
});

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const json = await req.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: 'Dữ liệu không hợp lệ' }, { status: 400 });

  const { shop_id, sheet_input } = parsed.data;

  const sheet_id = extractGoogleSheetId(sheet_input);
  if (!sheet_id) return NextResponse.json({ message: 'Link Google Sheet không hợp lệ' }, { status: 400 });

  let token: string;
  try {
    token = await getServiceAccountToken();
  } catch (err) {
    console.error('google-sheets connect: service account error', err);
    return NextResponse.json(
      { message: 'Service account chưa được cấu hình. Liên hệ admin.', code: 'service_account_error' },
      { status: 500 },
    );
  }

  const sheetRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheet_id}?fields=spreadsheetId,properties.title`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!sheetRes.ok) {
    return NextResponse.json(
      {
        message: 'Không truy cập được sheet. Kiểm tra lại đã chia sẻ đúng email service account chưa.',
        code: 'sheet_access_denied',
      },
      { status: 400 },
    );
  }

  const sheetData = (await sheetRes.json()) as { spreadsheetId?: string; properties?: { title?: string } };
  const sheet_title = sheetData.properties?.title ?? 'Google Sheet';

  const admin = getSupabaseAdminClient();
  const { data: existing, error: lookupError } = await admin
    .from('connectors')
    .select('id')
    .eq('shop_id', shop_id)
    .eq('type', 'google_sheets')
    .maybeSingle();

  if (lookupError) {
    console.error('google-sheets connect: lookup error', lookupError);
    return NextResponse.json({ message: 'Lỗi truy vấn cơ sở dữ liệu' }, { status: 500 });
  }

  const now = new Date().toISOString();
  const payload = {
    shop_id,
    type: 'google_sheets',
    status: 'active',
    config: {
      sheet_id,
      sheet_title,
      sheet_url: `https://docs.google.com/spreadsheets/d/${sheet_id}/edit`,
    },
    updated_at: now,
  };

  let connector_id: string;

  if (existing) {
    const { error: saveError } = await admin.from('connectors').update(payload).eq('id', existing.id);
    if (saveError) {
      console.error('google-sheets connect: update error', saveError);
      return NextResponse.json({ message: 'Lưu kết nối thất bại' }, { status: 500 });
    }
    connector_id = existing.id;
  } else {
    const { data: inserted, error: saveError } = await admin
      .from('connectors')
      .insert({ ...payload, created_at: now })
      .select('id')
      .single();
    if (saveError || !inserted) {
      console.error('google-sheets connect: insert error', saveError);
      return NextResponse.json({ message: 'Lưu kết nối thất bại' }, { status: 500 });
    }
    connector_id = inserted.id;
  }

  return NextResponse.json({ ok: true, connector_id, sheet_id, sheet_title });
}
