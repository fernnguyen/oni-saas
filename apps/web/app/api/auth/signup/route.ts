import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../../lib/server/supabaseAdmin';
import { verifyTurnstileToken } from '../../../../lib/server/turnstile';
import { formatPhoneAsEmail, isValidVNPhone } from '../../../../lib/utils/phone';

const schema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(6),
  turnstileToken: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const json = await req.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu không hợp lệ' }, { status: 400 });
  }

  const { identifier, password, turnstileToken } = parsed.data;

  // Validate format
  const isEmail = identifier.includes('@');
  if (!isEmail && !isValidVNPhone(identifier)) {
    return NextResponse.json({ message: 'Định dạng Email hoặc Số điện thoại không hợp lệ' }, { status: 400 });
  }

  const email = isEmail ? identifier : formatPhoneAsEmail(identifier);

  // Cloudflare Turnstile Verification
  const ip = req.headers.get('x-forwarded-for') || undefined;
  const isTurnstileValid = await verifyTurnstileToken(turnstileToken, ip);
  if (!isTurnstileValid) {
    return NextResponse.json(
      { message: 'Security verification failed or expired. Please try again.' },
      { status: 400 },
    );
  }

  if (email.endsWith('.oni.vn')) {
    const admin = getSupabaseAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
  } else {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}
