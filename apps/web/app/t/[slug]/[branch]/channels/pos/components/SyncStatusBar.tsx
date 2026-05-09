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
  const inFlight = pending + syncing

  if (failed > 0) {
    return (
      <div className="flex items-center justify-between bg-red-500 px-4 py-1.5 text-xs text-white">
        <span>{failed} đơn không đồng bộ được — kiểm tra kết nối</span>
        <button
          onClick={onRetryFailed}
          className="rounded bg-white/20 px-2 py-0.5 font-medium hover:bg-white/30 transition-colors"
        >
          Thử lại
        </button>
      </div>
    )
  }

  if (!isOnline) {
    return (
      <div className="bg-orange-500 px-4 py-1.5 text-xs text-white">
        Offline{inFlight > 0 ? ` — ${inFlight} đơn chờ đồng bộ khi có mạng` : ' — đơn hàng vẫn được lưu'}
      </div>
    )
  }

  if (syncing > 0) {
    return (
      <div className="flex items-center justify-between border-b border-yellow-200 bg-yellow-50 px-4 py-1.5 text-xs text-yellow-700">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-yellow-500 border-t-transparent" />
          <span>Đang đồng bộ {syncing} đơn...</span>
        </div>
        <button
          onClick={onRetryAll}
          className="rounded bg-yellow-200 px-2 py-0.5 font-medium hover:bg-yellow-300 transition-colors"
        >
          Thử lại
        </button>
      </div>
    )
  }

  if (pending > 0) {
    return (
      <div className="border-b border-yellow-200 bg-yellow-50 px-4 py-1.5 text-xs text-yellow-700">
        {pending} đơn chờ đồng bộ...
      </div>
    )
  }

  return null
}
