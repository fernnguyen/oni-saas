import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request) {
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
    const { data: identity, error: identityError } = await admin
      .from('user_identities')
      .select('name, avatar')
      .eq('provider', 'zalo')
      .eq('user_id', user.id)
      .single();

    if (identityError || !identity) {
      return NextResponse.json({ linked: false });
    }

    return NextResponse.json({ 
      linked: true,
      profile: {
        name: identity.name,
        avatar: identity.avatar
      }
    });
  } catch (err: any) {
    console.error('Zalo Status API Error:', err);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: err?.message || String(err)
    }, { status: 500 });
  }
}
