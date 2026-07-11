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
    .ilike('code', code)
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

  let plan = null;
  if (codeData.plan_id) {
    const { data: planData } = await admin
      .from('plans')
      .select('id, code, name, price_monthly, price_yearly')
      .eq('id', codeData.plan_id)
      .maybeSingle();
    plan = planData;
  }

  return NextResponse.json({
    valid: true,
    trial_days: codeData.trial_days,
    plan: plan
  });
}
