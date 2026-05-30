'use server';

import { getSupabaseServerClient } from '../../../lib/server/supabaseServer';

export async function resendVerificationEmail(email: string, slug: string) {
  if (!email || !slug) throw new Error('Thiếu thông tin Email hoặc tên miền.');

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
  const protocol = rootDomain.startsWith('localhost') ? 'http' : 'https';
  const supabase = await getSupabaseServerClient();

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: `${protocol}://${slug}.${rootDomain}/auth/callback`,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return { success: true };
}
