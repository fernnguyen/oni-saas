import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../../lib/server/supabaseServer';
import { verifyTurnstileToken } from '../../../../lib/server/turnstile';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  turnstileToken: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const json = await req.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid input' }, { status: 400 });
  }

  const { email, password, turnstileToken } = parsed.data;

  // Cloudflare Turnstile Verification
  const ip = req.headers.get('x-forwarded-for') || undefined;
  const isTurnstileValid = await verifyTurnstileToken(turnstileToken, ip);
  if (!isTurnstileValid) {
    return NextResponse.json(
      { message: 'Security verification failed or expired. Please try again.' },
      { status: 400 },
    );
  }

  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
