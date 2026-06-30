'use server';

import { getSupabaseAdminClient } from '../../../lib/server/supabaseAdmin';
import { revalidatePath } from 'next/cache';

export async function togglePlanPushNotify(planId: number, currentMeta: any, key: string, newValue: boolean) {
  const admin = getSupabaseAdminClient();
  const newMeta = { ...currentMeta, [key]: newValue };

  const { error } = await admin
    .from('plans')
    .update({ metadata: newMeta })
    .eq('id', planId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/super/plans');
}

export async function updatePlanLimits(planId: number, currentMeta: any, limits: Record<string, number>) {
  const admin = getSupabaseAdminClient();
  const newMeta = { ...currentMeta, ...limits };

  const { error } = await admin
    .from('plans')
    .update({ metadata: newMeta })
    .eq('id', planId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/super/plans');
}
