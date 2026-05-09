/**
 * _shared/auth.ts
 *
 * Shared JWT verification helper for ONI edge functions.
 *
 * Background: Supabase's "Verify JWT with legacy secret" setting is disabled
 * (config.toml: verify_jwt = false per function), so the built-in JWT middleware
 * no longer validates tokens. Functions that need auth call this helper instead:
 *
 *   const user = await verifyUser(req, admin)  // throws AuthError on failure
 */

import { SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2'

export class AuthError extends Error {
  constructor(public code = 'unauthorized', public status = 401) {
    super(code)
  }
}

/**
 * Verify the Bearer token in the Authorization header using the admin client.
 * Returns the authenticated User on success.
 * Throws AuthError({ code: 'unauthorized', status: 401 }) on failure.
 */
export async function verifyUser(
  req: Request,
  admin: SupabaseClient
): Promise<User> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) throw new AuthError()

  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) throw new AuthError()

  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) throw new AuthError()

  return user
}
