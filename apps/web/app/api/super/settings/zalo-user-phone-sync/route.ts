import { NextRequest, NextResponse } from 'next/server'
import { getSuperAdminUser } from '@/lib/server/auth'
import { buildZaloPhoneSyncReport, syncZaloPhoneCandidates } from '@/lib/server/zaloUserPhoneSync'

export async function GET() {
  const user = await getSuperAdminUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const report = await buildZaloPhoneSyncReport()
    return NextResponse.json(report)
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load Zalo phone sync report' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const user = await getSuperAdminUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const action = typeof body.action === 'string' ? body.action : ''
    const userIds = Array.isArray(body.userIds)
      ? body.userIds.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
      : []

    if (action === 'sync_safe') {
      return NextResponse.json(await syncZaloPhoneCandidates({ mode: 'safe' }))
    }

    if (action === 'sync_manual_review') {
      if (userIds.length === 0) {
        return NextResponse.json({ error: 'Missing userIds for manual review sync' }, { status: 400 })
      }
      return NextResponse.json(await syncZaloPhoneCandidates({ mode: 'manual_review', userIds }))
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to sync Zalo phone users' },
      { status: 500 }
    )
  }
}
