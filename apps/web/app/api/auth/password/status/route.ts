import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';

function maskPhone(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return `${digits.slice(0, 3)}xxx${digits.slice(-2)}`;
}

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Phiên đăng nhập không hợp lệ' }, { status: 401 });
    }

    const admin = getSupabaseAdminClient();
    const { data: hasPassword, error: passwordStateError } = await admin.rpc(
      'get_auth_user_has_password',
      { p_user_id: user.id }
    );

    if (passwordStateError) {
      console.error('Password status RPC error:', passwordStateError);
      return NextResponse.json(
        { error: 'Không thể kiểm tra trạng thái mật khẩu' },
        { status: 500 }
      );
    }

    const rawPhone =
      user.phone ||
      (typeof user.user_metadata?.phone === 'string' ? user.user_metadata.phone : '') ||
      '';

    return NextResponse.json({
      hasPassword: Boolean(hasPassword),
      phone: rawPhone,
      maskedPhone: maskPhone(rawPhone),
    });
  } catch (error: any) {
    console.error('Password status API error:', error);
    return NextResponse.json({ error: 'Lỗi máy chủ' }, { status: 500 });
  }
}
