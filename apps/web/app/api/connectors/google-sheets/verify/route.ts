import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../../../lib/server/supabaseServer';
import { decryptConnectorField } from '../../../../../lib/crypto';

const schema = z.object({ connector_id: z.string().uuid() });

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const json = await req.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ message: 'Invalid input' }, { status: 400 });

  const { connector_id } = parsed.data;

  const { data: connector, error } = await supabase
    .from('connectors')
    .select('*')
    .eq('id', connector_id)
    .single();

  if (error || !connector) return NextResponse.json({ message: 'Connector not found' }, { status: 404 });

  try {
    const tokenCipher = connector.config.encrypted_access_token ?? connector.config.encrypted_token;
    if (!tokenCipher) {
      return NextResponse.json({ ok: false, message: 'Connector chưa có access token' }, { status: 400 });
    }

    const token = decryptConnectorField(tokenCipher);
    const sheetId = connector.config.sheet_id;
    if (!sheetId) {
      return NextResponse.json({ ok: false, message: 'Connector chưa có sheet_id' }, { status: 400 });
    }

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=spreadsheetId,properties.title`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) {
      await supabase
        .from('connectors')
        .update({ status: 'error', updated_at: new Date().toISOString() })
        .eq('id', connector_id);
      return NextResponse.json({ ok: false, message: 'Không thể truy cập Sheet — kiểm tra lại quyền' }, { status: 400 });
    }

    const sheet = await res.json();

    await supabase
      .from('connectors')
      .update({
        status: 'active',
        config: { ...connector.config, sheet_title: sheet.properties?.title ?? null },
        updated_at: new Date().toISOString(),
      })
      .eq('id', connector_id);

    return NextResponse.json({ ok: true, title: sheet.properties?.title });
  } catch {
    return NextResponse.json({ ok: false, message: 'Verification failed' }, { status: 500 });
  }
}
