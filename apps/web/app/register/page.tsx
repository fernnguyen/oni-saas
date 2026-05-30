import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { RegisterForm } from './RegisterForm';

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { domain, industry } = await searchParams;
  const admin = getSupabaseAdminClient();
  
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

  // Only show public plans during registration
  const plans = (dbPlans || []).filter((p: any) => p.metadata?.show_public !== false);

  return (
    <RegisterForm 
      plans={plans} 
      initialDomain={typeof domain === 'string' ? domain : undefined} 
      initialIndustry={typeof industry === 'string' ? industry : undefined}
      registrationMode={registrationMode}
    />
  );
}
