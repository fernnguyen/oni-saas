import { NextRequest, NextResponse } from 'next/server'
import { getSuperAdminUser } from '@/lib/server/auth'
import { isZaloOAMessageEnabled, sendZaloOAMessageToUser } from '@/lib/server/zaloOA'

export async function POST(req: NextRequest) {
  const user = await getSuperAdminUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const zaloIdByOA = typeof body.zaloIdByOA === 'string' ? body.zaloIdByOA.trim() : ''
    const message = typeof body.message === 'string' ? body.message.trim() : ''

    if (!zaloIdByOA) {
      return NextResponse.json({ error: 'Missing zaloIdByOA' }, { status: 400 })
    }
    if (!message) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 })
    }

    if (!(await isZaloOAMessageEnabled())) {
      return NextResponse.json(
        { error: 'Zalo OA sending is disabled', reason: 'disabled_by_setting' },
        { status: 409 }
      )
    }

    const result = await sendZaloOAMessageToUser(zaloIdByOA, message)
    return NextResponse.json(result, { status: result.sent ? 200 : 400 })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to send OA test message' },
      { status: 500 }
    )
  }
}
