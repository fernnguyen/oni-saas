'use client'
import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { localDb } from '@/lib/localDb/schema'

interface Props {
  isOnline: boolean
  onRetryFailed: () => void
  onRetryAll: () => void
}

interface SyncCounts {
  pending: number
  syncing: number
  failed: number
}

export function SyncStatusBar({ isOnline, onRetryFailed, onRetryAll }: Props) {
  const [counts, setCounts] = useState<SyncCounts>({ pending: 0, syncing: 0, failed: 0 })

  useEffect(() => {
    const subscription = liveQuery(async () => {
      const [pending, syncing, failed] = await Promise.all([
        localDb.syncQueue.where('status').equals('pending').count(),
        localDb.syncQueue.where('status').equals('syncing').count(),
        localDb.syncQueue.where('status').equals('failed').count(),
      ])
      return { pending, syncing, failed }
    }).subscribe({
      next: setCounts,
      error: () => {},
    })
    return () => subscription.unsubscribe()
  }, [])

  const { pending, syncing, failed } = counts

  if (failed > 0) {
    return (
      <div className="flex items-center gap-1.5 shrink-0 ml-2 border-l border-slate-200 pl-2">
        <span className="text-[10px] font-medium text-red-500">Lỗi {failed} đơn</span>
        <button
          onClick={onRetryFailed}
          className="rounded bg-red-50 border border-red-200 px-1.5 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-100 transition-colors"
        >
          Thử lại
        </button>
      </div>
    )
  }

  if (syncing > 0) {
    return (
      <div className="flex items-center gap-1.5 shrink-0 ml-2 border-l border-slate-200 pl-2 text-[10px] font-medium text-yellow-600">
        <svg className="h-3 w-3 animate-spin text-yellow-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="hidden sm:inline">Đang sync {syncing}...</span>
      </div>
    )
  }

  if (pending > 0) {
    return (
      <div className="flex items-center gap-1.5 shrink-0 ml-2 border-l border-slate-200 pl-2 text-[10px] font-medium text-yellow-600">
        <span className="hidden sm:inline">{pending} chờ sync</span>
        {!isOnline && <span className="text-orange-500">(Offline)</span>}
      </div>
    )
  }

  return null
}
