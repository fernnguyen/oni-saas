'use server';

import { getSupabaseAdminClient } from '../../../lib/server/supabaseAdmin';
import { getSuperAdminUser } from '../../../lib/server/auth';
import { revalidatePath } from 'next/cache';

export async function createInvitationCode(code: string, maxUses: number | null, expiresAt: string | null) {
  const user = await getSuperAdminUser();
  if (!user) throw new Error('Unauthorized');

  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) throw new Error('Mã mời không thể để trống.');

  const admin = getSupabaseAdminClient();

  const { error } = await admin
    .from('invitation_codes')
    .insert({
      code: cleanCode,
      max_uses: maxUses === 0 || maxUses === null ? null : maxUses,
      expires_at: expiresAt || null,
      used_count: 0,
    });

  if (error) {
    if (error.message.toLowerCase().includes('duplicate') || error.message.toLowerCase().includes('already')) {
      throw new Error('Mã mời này đã tồn tại trên hệ thống.');
    }
    throw new Error(error.message);
  }

  revalidatePath('/super/invitations');
  return { success: true };
}

export async function deleteInvitationCode(code: string) {
  const user = await getSuperAdminUser();
  if (!user) throw new Error('Unauthorized');

  const admin = getSupabaseAdminClient();

  const { error } = await admin
    .from('invitation_codes')
    .delete()
    .eq('code', code);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/super/invitations');
  return { success: true };
}
