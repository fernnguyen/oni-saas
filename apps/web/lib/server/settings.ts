import { getSupabaseAdminClient } from './supabaseAdmin';
import { unstable_cache } from 'next/cache';

export const getSystemSettings = unstable_cache(
  async () => {
    const supabase = getSupabaseAdminClient();
    const { data } = await supabase
      .from('system_settings')
      .select('config')
      .eq('id', 'global')
      .single();
    return data?.config || {};
  },
  ['system_settings_global'],
  { tags: ['system_settings'], revalidate: 3600 }
);

export function formatTrialDurationVi(days: number) {
  if (days <= 0) return '0 ngày';
  if (days % 365 === 0) {
    const years = days / 365;
    return `${years} năm`;
  }
  if (days % 30 === 0) {
    const months = days / 30;
    return `${months} tháng`;
  }
  return `${days} ngày`;
}
