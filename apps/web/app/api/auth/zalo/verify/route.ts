import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const { accessToken } = await req.json();

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Missing access_token' },
        { status: 400 }
      );
    }

    // Verify token with Zalo Graph API
    const zaloRes = await fetch('https://graph.zalo.me/v2.0/me?fields=id,name,picture', {
      headers: {
        access_token: accessToken,
      },
    });

    const zaloData = await zaloRes.json();
    if (zaloData.error || !zaloData.id) {
      return NextResponse.json(
        { error: 'Invalid Zalo access token' },
        { status: 400 }
      );
    }

    const zaloId = zaloData.id;

    // Check if this Zalo ID is linked to any user in our system
    const admin = getSupabaseAdminClient();
    const { data: identity, error: identityError } = await admin
      .from('user_identities')
      .select('user_id')
      .eq('provider', 'zalo')
      .eq('provider_id', zaloId)
      .single();

    if (identityError || !identity) {
      return NextResponse.json({ 
        status: 'NOT_LINKED',
        zaloProfile: {
          id: zaloId,
          name: zaloData.name,
          avatar: zaloData.picture?.data?.url
        }
      });
    }

    // Found linked user! Generate session for them.
    const userId = identity.user_id;
    
    // Fetch user email
    const { data: userResponse, error: userError } = await admin.auth.admin.getUserById(userId);
    
    if (userError || !userResponse?.user?.email) {
      return NextResponse.json({ error: 'Failed to retrieve user' }, { status: 500 });
    }
    
    const userEmail = userResponse.user.email;
    
    // Generate magic link
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
    });

    if (linkError || !linkData?.properties) {
      return NextResponse.json({ error: 'Failed to generate session' }, { status: 500 });
    }

    const actionUrl = new URL(linkData.properties.action_link, process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://oni.vn');
    const otpToken = actionUrl.searchParams.get('token');
    const tokenHash = linkData.properties?.hashed_token || otpToken;

    if (!tokenHash) {
      return NextResponse.json({ error: 'No token in action link' }, { status: 500 });
    }

    // Verify token to get session using anon key
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase public environment variables');
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, { 
      auth: { persistSession: false } 
    });

    const { data: sessionData, error: verifyError } = await authClient.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'magiclink'
    });

    if (verifyError || !sessionData.session) {
      return NextResponse.json({ error: 'Failed to verify session', details: verifyError }, { status: 500 });
    }

    return NextResponse.json({ 
      status: 'LOGGED_IN', 
      session: sessionData.session 
    });
  } catch (err: any) {
    console.error('Zalo Verify API Error:', err);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: err?.message || String(err)
    }, { status: 500 });
  }
}

