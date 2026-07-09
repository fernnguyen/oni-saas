import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { OnboardingForm } from './OnboardingForm';

import { getSupabaseServerClient } from '@/lib/server/supabaseServer';

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { domain, industry } = await searchParams;
  const admin = getSupabaseAdminClient();
  const supabase = await getSupabaseServerClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || '';
  const userAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '';
  const userEmail = user?.email || '';
  
  // Fetch available plans from the database, ordered by ID (e.g. Mini -> Pro -> Enterprise)
  const { data: dbPlans } = await admin.from('plans').select('*').order('id', { ascending: true });
  
  // Fetch system settings for registration mode
  const { data: settingsData } = await admin
    .from('system_settings')
    .select('config')
    .eq('id', 'global')
    .single();
  const config = settingsData?.config || {};
  const registrationMode = config.registration_mode || 'free'; // 'free' | 'code' | 'disabled'
  const starterTrialDays = parseInt(config.starter_trial_days) || 90;

  // Only show public plans during registration
  const plans = (dbPlans || []).filter((p: any) => p.metadata?.show_public !== false);

  return (
    <OnboardingForm 
      plans={plans} 
      initialDomain={typeof domain === 'string' ? domain : undefined} 
      initialIndustry={typeof industry === 'string' ? industry : undefined}
      registrationMode={registrationMode}
      starterTrialDays={starterTrialDays}
      userName={userName}
      userAvatar={userAvatar}
      userEmail={userEmail}
    />
  );
}
