import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../lib/server/supabaseAdmin';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.trim();
  if (!code) {
    return NextResponse.json({ valid: false, message: 'Vui lòng cung cấp mã mời.' });
  }

  const admin = getSupabaseAdminClient();

  // Query invitation code from DB
  const { data: codeData, error } = await admin
    .from('invitation_codes')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  if (error || !codeData) {
    return NextResponse.json({ valid: false, message: 'Mã mời không tồn tại hoặc không hợp lệ.' });
  }

  // Check expiration date
  if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, message: 'Mã mời này đã hết hạn sử dụng.' });
  }

  // Check maximum usage count
  if (codeData.max_uses !== null && codeData.used_count >= codeData.max_uses) {
    return NextResponse.json({ valid: false, message: 'Mã mời này đã đạt giới hạn sử dụng tối đa.' });
  }

  return NextResponse.json({ valid: true });
}
