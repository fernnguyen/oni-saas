'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { hydrateAll, getLastHydratedAt, isHydrationStale } from '@/lib/localDb/hydration'
import { listenPOSEvents } from '@/lib/localDb/tabSync'
import { useNetworkStatus } from './useNetworkStatus'

const STALE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const REFRESH_INTERVAL_MS = 5 * 60 * 1000

type HydrationStatus = 'idle' | 'loading' | 'ready' | 'error'

interface UsePOSHydrationResult {
  status: HydrationStatus
  lastHydratedAt: string | null
  refresh: () => Promise<void>
  isStale: boolean
}

export function usePOSHydration(shopId: string, branchId: string): UsePOSHydrationResult {
  const [status, setStatus] = useState<HydrationStatus>('idle')
  const [lastHydratedAt, setLastHydratedAt] = useState<string | null>(null)
  const [isStale, setIsStale] = useState(true)
  const isOnline = useNetworkStatus()
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const wasOffline = useRef(false)

  const refresh = useCallback(async () => {
    if (!navigator.onLine) return
    setStatus('loading')
    try {
      await hydrateAll(shopId, branchId)
      const ts = await getLastHydratedAt()
      setLastHydratedAt(ts)
      setIsStale(false)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [shopId, branchId])

  // Initial hydration
  useEffect(() => {
    let cancelled = false
    async function init() {
      const stale = await isHydrationStale(STALE_TTL_MS)
      const ts = await getLastHydratedAt()
      if (!cancelled) {
        setLastHydratedAt(ts)
        setIsStale(stale)
      }
      if (stale && navigator.onLine && !cancelled) {
        await refresh()
      } else if (!cancelled) {
        setStatus('ready')
      }
    }
    init()
    return () => { cancelled = true }
  }, [refresh])

  // Re-hydrate every 5 minutes while online
  useEffect(() => {
    refreshTimer.current = setInterval(async () => {
      const stale = await isHydrationStale(STALE_TTL_MS)
      if (stale && navigator.onLine) refresh()
    }, REFRESH_INTERVAL_MS)
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current)
    }
  }, [refresh])

  // Re-hydrate when network restores after being offline
  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true
    } else if (wasOffline.current) {
      wasOffline.current = false
      refresh()
    }
  }, [isOnline, refresh])

  // Re-hydrate when another tab broadcasts HYDRATE_REFRESH
  useEffect(() => {
    const unsubscribe = listenPOSEvents({
      onHydrateRefresh: () => refresh(),
    })
    return unsubscribe
  }, [refresh])

  return { status, lastHydratedAt, refresh, isStale }
}
