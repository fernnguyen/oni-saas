// Bar/Bếp — who did it (audit of cancelled dishes). Always taken from the authenticated request on
// the server, never from what a client sends: a device cannot claim to be someone else.
//
// The name is a snapshot at the time of the action so the record stays readable after the
// account is renamed or removed; reports prefer the current profile name when it still exists.

export interface KitchenActor {
  id: string
  name: string
}

interface AuthUserLike {
  id?: string | null
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}

export function kitchenActorOf(user: AuthUserLike | null | undefined): KitchenActor | undefined {
  if (!user?.id) return undefined
  const meta = user.user_metadata || {}
  const pick = (k: string) => (typeof meta[k] === 'string' ? String(meta[k]).trim() : '')
  const name = pick('display_name') || pick('full_name') || pick('name') || pick('username') || String(user.email || '').trim()
  return { id: String(user.id).slice(0, 255), name: (name || 'Nhân viên').slice(0, 255) }
}
