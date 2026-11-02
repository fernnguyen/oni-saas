import { NextResponse } from 'next/server'
import { TableSyncError } from '@/lib/server/tableSync/engine'
import { handleApiError } from '../../_helpers'

export function tableSyncErrorResponse(e: unknown, label: string): NextResponse {
  if (e instanceof TableSyncError) {
    return NextResponse.json(
      { error: e.code, message: e.message, ...((e as any).details || {}) },
      { status: e.status }
    )
  }
  return handleApiError(e, label)
}
