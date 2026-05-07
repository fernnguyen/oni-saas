import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { buildOniTemplateSheets, ONI_DEFAULT_SETTINGS } from '../../../../../lib/googleSheets';
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
  const { data: connector } = await admin
    .from('connectors')
    .select('config')
    .eq('id', connector_id)
    .single();

  if (!connector) return NextResponse.json({ message: 'Connector not found' }, { status: 404 });

  const sheetId = connector.config?.sheet_id as string | undefined;
  if (!sheetId) return NextResponse.json({ message: 'Connector chưa có sheet_id' }, { status: 400 });

  let token: string;
  try {
    token = await getServiceAccountToken();
  } catch (err) {
    console.error('seed: service account error', err);
    return NextResponse.json({ message: 'Service account chưa được cấu hình' }, { status: 500 });
  }

  const templateSheets = buildOniTemplateSheets();

  // ── Step 1: get existing tab names ──────────────────────────────────────────
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!metaRes.ok) {
    return NextResponse.json({ message: 'Không đọc được metadata của sheet' }, { status: 400 });
  }
  const meta = (await metaRes.json()) as { sheets?: Array<{ properties: { title: string } }> };
  const existingTitles = new Set((meta.sheets ?? []).map((s) => s.properties.title));

  // ── Step 2: add missing tabs ─────────────────────────────────────────────────
  const missingTabs = templateSheets.filter((t) => !existingTitles.has(t.title));
  if (missingTabs.length > 0) {
    const addRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: missingTabs.map((tab) => ({ addSheet: { properties: { title: tab.title } } })),
      }),
    });
    if (!addRes.ok) {
      const errBody = await addRes.text().catch(() => '');
      console.error('seed: addSheet failed', errBody);
      return NextResponse.json({ message: 'Không tạo được tab mới' }, { status: 500 });
    }
  }

  // ── Step 3: check row 1 of every tab ────────────────────────────────────────
  const batchGetUrl =
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?` +
    templateSheets.map((t) => `ranges=${encodeURIComponent(`${t.title}!A1:ZZ1`)}`).join('&');

  const batchGetRes = await fetch(batchGetUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!batchGetRes.ok) {
    return NextResponse.json({ message: 'Không đọc được dữ liệu sheet' }, { status: 500 });
  }
  const batchGetData = (await batchGetRes.json()) as {
    valueRanges: Array<{ values?: string[][] }>;
  };
  const valueRanges = batchGetData.valueRanges ?? [];

  // ── Step 4: write headers only to tabs where row 1 is empty ─────────────────
  const created: string[] = missingTabs.map((t) => t.title);
  const seeded: string[] = [];
  const skipped: string[] = [];

  const needsHeaders = templateSheets.filter((tab, i) => {
    const row1 = valueRanges[i]?.values?.[0];
    const isEmpty = !row1 || row1.length === 0 || row1.every((c) => !c);
    if (!isEmpty) {
      skipped.push(tab.title);
      return false;
    }
    if (!missingTabs.find((m) => m.title === tab.title)) {
      seeded.push(tab.title);
    }
    return true;
  });

  if (needsHeaders.length > 0) {
    const writeRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valueInputOption: 'RAW',
          data: needsHeaders.map((tab) => ({
            range: `${tab.title}!A1`,
            values: [tab.headers],
          })),
        }),
      },
    );
    if (!writeRes.ok) {
      const errBody = await writeRes.text().catch(() => '');
      console.error('seed: write headers failed', errBody);
      return NextResponse.json({ message: 'Không ghi được header vào sheet' }, { status: 500 });
    }
  }

  // ── Step 5: seed default Settings rows if Settings has no data rows ──────────
  const settingsIndex = templateSheets.findIndex((t) => t.title === 'Settings');
  const settingsRow1 = valueRanges[settingsIndex]?.values?.[0];
  const settingsWasEmpty = !settingsRow1 || settingsRow1.length === 0 || settingsRow1.every((c) => !c);

  if (settingsWasEmpty) {
    // Check rows 2+ for existing data
    const settingsDataRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent('Settings!A2:C100')}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const settingsData = settingsDataRes.ok
      ? ((await settingsDataRes.json()) as { values?: string[][] })
      : { values: undefined };

    const hasDataRows = (settingsData.values?.length ?? 0) > 0;

    if (!hasDataRows) {
      const seedSettingsRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent('Settings!A2')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            values: ONI_DEFAULT_SETTINGS.map(([key, value, description]) => [key, value, description]),
          }),
        },
      );
      if (!seedSettingsRes.ok) {
        console.error('seed: settings seed failed', await seedSettingsRes.text().catch(() => ''));
      }
    }
  }

  return NextResponse.json({ ok: true, created, seeded, skipped });
}
