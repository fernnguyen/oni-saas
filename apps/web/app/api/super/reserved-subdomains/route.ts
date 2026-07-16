import { NextResponse } from 'next/server';
import { getSuperAdminUser } from '../../../../lib/server/auth';
import { getSupabaseAdminClient } from '../../../../lib/server/supabaseAdmin';

export async function GET() {
  const user = await getSuperAdminUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('reserved_subdomains')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const user = await getSuperAdminUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { subdomain } = await request.json();
  if (!subdomain) {
    return NextResponse.json({ error: 'Missing subdomain' }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('reserved_subdomains')
    .insert({ subdomain: subdomain.toLowerCase().trim() });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const user = await getSuperAdminUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const subdomain = searchParams.get('subdomain');
  
  if (!subdomain) {
    return NextResponse.json({ error: 'Missing subdomain' }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('reserved_subdomains')
    .delete()
    .eq('subdomain', subdomain);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
