import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const accessToken = typeof body?.accessToken === 'string' ? body.accessToken : '';
    const profileName = typeof body?.profileName === 'string' ? body.profileName.trim() : undefined;
    const profileAvatar = typeof body?.profileAvatar === 'string' ? body.profileAvatar.trim() : undefined;

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Missing access_token' },
        { status: 400 }
      );
    }

    // Get authorization header to verify the current user
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header' },
        { status: 401 }
      );
    }
    
    const jwt = authHeader.replace('Bearer ', '');
    
    // Verify token to get session using anon key
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

    const graphName = typeof zaloData.name === 'string' && zaloData.name.trim() ? zaloData.name.trim() : null;
    const graphAvatar = typeof zaloData.picture?.data?.url === 'string' && zaloData.picture.data.url.trim() ? zaloData.picture.data.url.trim() : null;

    const resolvedName = graphName || profileName || null;
    const resolvedAvatar = graphAvatar || profileAvatar || null;

    const admin = getSupabaseAdminClient();
    
    // Check if Zalo ID is already linked to anyone
    const { data: existingLinked } = await admin
      .from('user_identities')
      .select('user_id')
      .eq('provider', 'zalo')
      .eq('provider_id', zaloData.id)
      .single();

    if (existingLinked) {
      if (existingLinked.user_id !== user.id) {
        return NextResponse.json(
          { error: 'Tài khoản Zalo này đã được liên kết với một tài khoản khác. Vui lòng hủy liên kết ở tài khoản kia trước.' },
          { status: 409 }
        );
      }

      // If already linked, update identity record with new name/avatar if available
      if (resolvedName || resolvedAvatar) {
        await admin.from('user_identities').update({
          name: resolvedName || undefined,
          avatar: resolvedAvatar || undefined,
          updated_at: new Date().toISOString(),
        }).eq('provider', 'zalo').eq('provider_id', zaloData.id);
      }

      return NextResponse.json({ success: true, message: 'Already linked' });
    }

    // Not linked to anyone, so we insert it
    const { error: insertError } = await admin.from('user_identities').insert({
      id: `zalo_${zaloData.id}`,
      user_id: user.id,
      provider: 'zalo',
      provider_id: zaloData.id,
      name: resolvedName,
      avatar: resolvedAvatar,
    });
    
    if (insertError) {
      return NextResponse.json(
        { error: 'Failed to link account', details: insertError },
        { status: 500 }
      );
    }

    // HEAL user_metadata if current name is fallback/empty
    const existingMetadata = user.user_metadata || {};
    const currentFullName = typeof existingMetadata.full_name === 'string' ? existingMetadata.full_name.trim() : '';
    const currentAvatar = typeof existingMetadata.avatar_url === 'string' ? existingMetadata.avatar_url.trim() : '';

    const isFallbackName = !currentFullName || currentFullName === 'Người dùng Zalo' || currentFullName === 'Người dùng';

    let needsMetadataUpdate = false;
    const updatedMetadata = { ...existingMetadata };

    if (isFallbackName && resolvedName && resolvedName !== 'Người dùng Zalo' && resolvedName !== 'Người dùng') {
      updatedMetadata.full_name = resolvedName;
      needsMetadataUpdate = true;
    }

    if (resolvedAvatar && resolvedAvatar !== currentAvatar) {
      updatedMetadata.avatar_url = resolvedAvatar;
      needsMetadataUpdate = true;
    }

    if (needsMetadataUpdate) {
      await admin.auth.admin.updateUserById(user.id, {
        user_metadata: updatedMetadata,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Zalo Link API Error:', err);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: err?.message || String(err)
    }, { status: 500 });
  }
}
