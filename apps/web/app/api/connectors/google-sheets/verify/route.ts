import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { getServiceAccountToken } from '../../../../../lib/server/googleServiceAccount';

const schema = z.object({ connector_id: z.string().uuid() });

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const json = await req.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: 'Invalid input' }, { status: 400 });

  const { connector_id } = parsed.data;

  const admin = getSupabaseAdminClient();
  const { data: connector, error } = await admin
    .from('connectors')
    .select('id, config')
    .eq('id', connector_id)
    .single();

  if (error || !connector) return NextResponse.json({ message: 'Connector not found' }, { status: 404 });

  const sheetId = connector.config?.sheet_id as string | undefined;
  if (!sheetId) return NextResponse.json({ ok: false, message: 'Connector chưa có sheet_id' }, { status: 400 });

  let token: string;
  try {
    token = await getServiceAccountToken();
  } catch (err) {
    console.error('google-sheets verify: service account error', err);
    return NextResponse.json({ ok: false, message: 'Service account chưa được cấu hình' }, { status: 500 });
  }

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=spreadsheetId,properties.title`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    await admin
      .from('connectors')
      .update({ status: 'error', updated_at: new Date().toISOString() })
      .eq('id', connector_id);
    return NextResponse.json({ ok: false, message: 'Không thể truy cập Sheet — kiểm tra lại quyền chia sẻ' }, { status: 400 });
  }

  const sheet = (await res.json()) as { properties?: { title?: string } };
  const sheet_title = sheet.properties?.title ?? null;

  await admin
    .from('connectors')
    .update({
      status: 'active',
      config: { ...connector.config, sheet_title },
      updated_at: new Date().toISOString(),
    })
    .eq('id', connector_id);

  return NextResponse.json({ ok: true, title: sheet_title });
}
