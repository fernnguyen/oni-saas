import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { toVNPhonePlus84 } from '@/lib/utils/phone'

type AuthUser = Awaited<
  ReturnType<ReturnType<typeof getSupabaseAdminClient>['auth']['admin']['listUsers']>
>['data']['users'][number]

export type ZaloPhoneSyncStatus =
  | 'already_synced'
  | 'safe_to_sync'
  | 'manual_review'
  | 'no_phone_source'

export type ZaloPhoneSyncCandidate = {
  userId: string
  email: string | null
  displayName: string | null
  zaloId: string | null
  authPhone: string | null
  metadataPhone: string | null
  legacyEmailPhone: string | null
  recommendedPhone: string | null
  status: ZaloPhoneSyncStatus
  statusLabel: string
  note: string
}

export type ZaloPhoneSyncReport = {
  summary: {
    scannedAuthUsers: number
    zaloUsers: number
    alreadySynced: number
    safeToSync: number
    manualReview: number
    noPhoneSource: number
  }
  candidates: ZaloPhoneSyncCandidate[]
}

export type ZaloPhoneSyncRunResult = {
  syncedCount: number
  skippedCount: number
  syncedUserIds: string[]
  skipped: Array<{ userId: string; reason: string }>
  report: ZaloPhoneSyncReport
}

const PAGE_SIZE = 200
const IDENTITY_PAGE_SIZE = 1000

function getUserMetadataValue(user: AuthUser, key: string) {
  const metadata = user.user_metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function extractLegacyPhoneFromZaloEmail(email: string | null | undefined) {
  if (!email) return null
  const matched = email.match(/^zalo_([^@]+)@oni\.vn$/i)
  if (!matched) return null
  return toVNPhonePlus84(matched[1])
}

function classifyCandidate(user: AuthUser, zaloId: string | null): ZaloPhoneSyncCandidate {
  const email = user.email ?? null
  const displayName =
    getUserMetadataValue(user, 'full_name') ||
    getUserMetadataValue(user, 'display_name') ||
    email

  const authPhone = user.phone ? toVNPhonePlus84(user.phone) : null
  const metadataPhoneRaw = getUserMetadataValue(user, 'phone')
  const metadataPhone = metadataPhoneRaw ? toVNPhonePlus84(metadataPhoneRaw) : null
  const legacyEmailPhone = extractLegacyPhoneFromZaloEmail(email)

  if (authPhone) {
    return {
      userId: user.id,
      email,
      displayName,
      zaloId,
      authPhone,
      metadataPhone,
      legacyEmailPhone,
      recommendedPhone: authPhone,
      status: 'already_synced',
      statusLabel: 'Đã sync',
      note: 'Đã có auth.users.phone, không cần đồng bộ thêm.',
    }
  }

  if (legacyEmailPhone) {
    return {
      userId: user.id,
      email,
      displayName,
      zaloId,
      authPhone: null,
      metadataPhone,
      legacyEmailPhone,
      recommendedPhone: legacyEmailPhone,
      status: 'safe_to_sync',
      statusLabel: 'Sync an toàn',
      note: 'Có thể đồng bộ trực tiếp từ email Zalo legacy chứa số điện thoại.',
    }
  }

  if (metadataPhone) {
    return {
      userId: user.id,
      email,
      displayName,
      zaloId,
      authPhone: null,
      metadataPhone,
      legacyEmailPhone: null,
      recommendedPhone: metadataPhone,
      status: 'manual_review',
      statusLabel: 'Cần review',
      note: 'Chỉ còn phone trong metadata lịch sử. Chỉ sync khi superadmin đã xác minh thủ công.',
    }
  }

  return {
    userId: user.id,
    email,
    displayName,
    zaloId,
    authPhone: null,
    metadataPhone: null,
    legacyEmailPhone: null,
    recommendedPhone: null,
    status: 'no_phone_source',
    statusLabel: 'Thiếu dữ liệu',
    note: 'Không tìm thấy nguồn số điện thoại đủ tin cậy để đồng bộ.',
  }
}

async function listAllAuthUsers() {
  const admin = getSupabaseAdminClient()
  const users: AuthUser[] = []
  let page = 1

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
    if (error) throw error

    const current = data?.users ?? []
    users.push(...current)
    if (current.length < PAGE_SIZE) break
    page += 1
  }

  return users
}

async function listAllZaloIdentities() {
  const admin = getSupabaseAdminClient()
  const identities: Array<{ user_id: string; provider_id: string }> = []
  let from = 0

  while (true) {
    const { data, error } = await admin
      .from('user_identities')
      .select('user_id, provider_id')
      .eq('provider', 'zalo')
      .range(from, from + IDENTITY_PAGE_SIZE - 1)

    if (error) throw error

    const current = (data ?? []) as Array<{ user_id: string; provider_id: string }>
    identities.push(...current)
    if (current.length < IDENTITY_PAGE_SIZE) break
    from += IDENTITY_PAGE_SIZE
  }

  return identities
}

function sortCandidates(a: ZaloPhoneSyncCandidate, b: ZaloPhoneSyncCandidate) {
  const statusOrder: Record<ZaloPhoneSyncStatus, number> = {
    safe_to_sync: 0,
    manual_review: 1,
    no_phone_source: 2,
    already_synced: 3,
  }

  const byStatus = statusOrder[a.status] - statusOrder[b.status]
  if (byStatus !== 0) return byStatus

  return (a.displayName || a.email || a.userId).localeCompare(b.displayName || b.email || b.userId, 'vi')
}

export async function buildZaloPhoneSyncReport(): Promise<ZaloPhoneSyncReport> {
  const [users, identities] = await Promise.all([listAllAuthUsers(), listAllZaloIdentities()])
  const zaloIdByUserId = new Map(identities.map((item) => [item.user_id, item.provider_id]))

  const candidates = users
    .filter((user) => zaloIdByUserId.has(user.id) || /^zalo_.+@oni\.vn$/i.test(user.email || ''))
    .map((user) => classifyCandidate(user, zaloIdByUserId.get(user.id) || getUserMetadataValue(user, 'zalo_id')))
    .sort(sortCandidates)

  return {
    summary: {
      scannedAuthUsers: users.length,
      zaloUsers: candidates.length,
      alreadySynced: candidates.filter((item) => item.status === 'already_synced').length,
      safeToSync: candidates.filter((item) => item.status === 'safe_to_sync').length,
      manualReview: candidates.filter((item) => item.status === 'manual_review').length,
      noPhoneSource: candidates.filter((item) => item.status === 'no_phone_source').length,
    },
    candidates,
  }
}

export async function syncZaloPhoneCandidates(options: {
  mode: 'safe' | 'manual_review'
  userIds?: string[]
}): Promise<ZaloPhoneSyncRunResult> {
  const admin = getSupabaseAdminClient()
  const report = await buildZaloPhoneSyncReport()
  const requestedUserIds = new Set(options.userIds ?? [])

  const candidates = report.candidates.filter((candidate) => {
    if (options.mode === 'safe') return candidate.status === 'safe_to_sync'
    return candidate.status === 'manual_review' && requestedUserIds.has(candidate.userId)
  })

  const syncedUserIds: string[] = []
  const skipped: Array<{ userId: string; reason: string }> = []

  for (const candidate of candidates) {
    if (!candidate.recommendedPhone) {
      skipped.push({ userId: candidate.userId, reason: 'missing_recommended_phone' })
      continue
    }

    const { error } = await admin.auth.admin.updateUserById(candidate.userId, {
      phone: candidate.recommendedPhone,
      phone_confirm: true,
    })

    if (error) {
      skipped.push({ userId: candidate.userId, reason: error.message })
      continue
    }

    syncedUserIds.push(candidate.userId)
  }

  return {
    syncedCount: syncedUserIds.length,
    skippedCount: skipped.length,
    syncedUserIds,
    skipped,
    report: await buildZaloPhoneSyncReport(),
  }
}
