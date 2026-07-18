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

export async function resolveLinkedZaloSession(accessToken: string): Promise<LinkedZaloSessionResult> {
  const zaloRes = await fetch('https://graph.zalo.me/v2.0/me?fields=id,name,picture', {
    headers: {
      access_token: accessToken,
    },
  });

  const zaloData = await zaloRes.json();
  if (zaloData.error || !zaloData.id) {
    throw new Error('Invalid Zalo access token');
  }

  const zaloProfile: ZaloProfile = {
    id: zaloData.id,
    name: typeof zaloData.name === 'string' ? zaloData.name : null,
    avatar: typeof zaloData.picture?.data?.url === 'string' ? zaloData.picture.data.url : null,
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
  const userEmail = userResponse?.user?.email;

  if (userError || !userEmail) {
    throw new Error('Failed to retrieve user');
  }

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
