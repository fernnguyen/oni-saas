import { createClient, type Session } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from './supabaseAdmin';

type ZaloProfile = {
  id: string;
  name: string | null;
  avatar: string | null;
};

export type LinkedZaloSessionResult =
  | {
      status: 'LOGGED_IN';
      session: Session;
      userId: string;
      zaloProfile: ZaloProfile;
    }
  | {
      status: 'NOT_LINKED';
      zaloProfile: ZaloProfile;
    };

export async function resolveLinkedZaloSession(
  accessToken: string,
  fallbackProfile?: { name?: string | null; avatar?: string | null }
): Promise<LinkedZaloSessionResult> {
  const zaloRes = await fetch('https://graph.zalo.me/v2.0/me?fields=id,name,picture', {
    headers: {
      access_token: accessToken,
    },
  });

  const zaloData = await zaloRes.json();
  if (zaloData.error || !zaloData.id) {
    throw new Error('Invalid Zalo access token');
  }

  const graphName = typeof zaloData.name === 'string' && zaloData.name.trim() ? zaloData.name.trim() : null;
  const graphAvatar = typeof zaloData.picture?.data?.url === 'string' && zaloData.picture.data.url.trim() ? zaloData.picture.data.url.trim() : null;

  const fallbackName = typeof fallbackProfile?.name === 'string' && fallbackProfile.name.trim() ? fallbackProfile.name.trim() : null;
  const fallbackAvatar = typeof fallbackProfile?.avatar === 'string' && fallbackProfile.avatar.trim() ? fallbackProfile.avatar.trim() : null;

  const resolvedName = graphName || fallbackName;
  const resolvedAvatar = graphAvatar || fallbackAvatar;

  const zaloProfile: ZaloProfile = {
    id: zaloData.id,
    name: resolvedName,
    avatar: resolvedAvatar,
  };

  const admin = getSupabaseAdminClient();
  const { data: identity, error: identityError } = await admin
    .from('user_identities')
    .select('user_id')
    .eq('provider', 'zalo')
    .eq('provider_id', zaloProfile.id)
    .single();

  if (identityError || !identity?.user_id) {
    return {
      status: 'NOT_LINKED',
      zaloProfile,
    };
  }

  const { data: userResponse, error: userError } = await admin.auth.admin.getUserById(identity.user_id);
  const user = userResponse?.user;
  const userEmail = user?.email;

  if (userError || !user || !userEmail) {
    throw new Error('Failed to retrieve user');
  }

  // --- HEALING & PROFILE SYNC LOGIC ---
  const existingMetadata = user.user_metadata || {};
  const currentFullName = typeof existingMetadata.full_name === 'string' ? existingMetadata.full_name.trim() : '';
  const currentAvatar = typeof existingMetadata.avatar_url === 'string' ? existingMetadata.avatar_url.trim() : '';

  const isFallbackName = !currentFullName || currentFullName === 'Người dùng Zalo' || currentFullName === 'Người dùng';

  let needsMetadataUpdate = false;
  const updatedMetadata = { ...existingMetadata };

  // Heal name if current full_name is fallback/empty and a valid new name is available
  if (isFallbackName && resolvedName && resolvedName !== 'Người dùng Zalo' && resolvedName !== 'Người dùng') {
    updatedMetadata.full_name = resolvedName;
    needsMetadataUpdate = true;
  }

  // Heal or update avatar if missing or updated
  if (resolvedAvatar && resolvedAvatar !== currentAvatar) {
    updatedMetadata.avatar_url = resolvedAvatar;
    needsMetadataUpdate = true;
  }

  if (needsMetadataUpdate) {
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: updatedMetadata,
    });
  }

  // Sync user_identities table
  const identityNameUpdate =
    (updatedMetadata.full_name && updatedMetadata.full_name !== 'Người dùng Zalo' && updatedMetadata.full_name !== 'Người dùng')
      ? updatedMetadata.full_name
      : (resolvedName || currentFullName || null);
  const identityAvatarUpdate = updatedMetadata.avatar_url || resolvedAvatar || currentAvatar || null;

  await admin
    .from('user_identities')
    .update({
      name: identityNameUpdate,
      avatar: identityAvatarUpdate,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('provider', 'zalo');

  // Update returned zaloProfile with healed values
  zaloProfile.name = identityNameUpdate;
  zaloProfile.avatar = identityAvatarUpdate;

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: userEmail,
  });

  if (linkError || !linkData?.properties) {
    throw new Error('Failed to generate session');
  }

  const actionUrl = new URL(
    linkData.properties.action_link,
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://oni.vn',
  );
  const otpToken = actionUrl.searchParams.get('token');
  const tokenHash = linkData.properties.hashed_token || otpToken;

  if (!tokenHash) {
    throw new Error('No token in action link');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase public environment variables');
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const { data: sessionData, error: verifyError } = await authClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });

  if (verifyError || !sessionData.session) {
    throw new Error('Failed to verify session');
  }

  return {
    status: 'LOGGED_IN',
    session: sessionData.session,
    userId: sessionData.session.user.id,
    zaloProfile,
  };
}
