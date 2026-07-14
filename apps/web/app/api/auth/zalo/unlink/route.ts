import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header' },
        { status: 401 }
      );
    }
    
    const jwt = authHeader.replace('Bearer ', '');
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase public environment variables');
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, { 
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } }
    });
    
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Invalid user session' },
        { status: 401 }
      );
    }

    const admin = getSupabaseAdminClient();
    const { error: deleteError } = await admin
      .from('user_identities')
      .delete()
      .eq('provider', 'zalo')
      .eq('user_id', user.id);

    if (deleteError) {
      return NextResponse.json(
        { error: 'Failed to unlink account', details: deleteError },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Zalo Unlink API Error:', err);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: err?.message || String(err)
    }, { status: 500 });
  }
}
