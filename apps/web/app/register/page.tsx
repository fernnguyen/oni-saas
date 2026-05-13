import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { RegisterForm } from './RegisterForm';

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { domain } = await searchParams;
  const admin = getSupabaseAdminClient();
  
  // Fetch available plans from the database, ordered by ID (e.g. Mini -> Pro -> Enterprise)
  const { data: dbPlans } = await admin.from('plans').select('*').order('id', { ascending: true });
  
  // Fallback to empty array if no plans exist in the DB
  const plans = dbPlans || [];

  return <RegisterForm plans={plans} initialDomain={typeof domain === 'string' ? domain : undefined} />;
}
