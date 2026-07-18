'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { hydrateAll, getLastHydratedAt, isHydrationStale } from '@/lib/localDb/hydration'
import { activateLocalDbScope, migrateLegacyLocalDbToScope } from '@/lib/localDb/schema'
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
  const scopeId = `${shopId}:${branchId}`
  activateLocalDbScope(scopeId)
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
      await hydrateAll(shopId, branchId, scopeId)
      const ts = await getLastHydratedAt(scopeId)
      setLastHydratedAt(ts)
      setIsStale(false)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [shopId, branchId, scopeId])

  // Initial hydration
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        setStatus('loading')
        await migrateLegacyLocalDbToScope(scopeId, shopId, branchId)
        if (cancelled) return
        const stale = await isHydrationStale(STALE_TTL_MS, scopeId)
        const ts = await getLastHydratedAt(scopeId)
        if (!cancelled) {
          setLastHydratedAt(ts)
          setIsStale(stale)
        }
        if (stale && navigator.onLine && !cancelled) {
          await refresh()
        } else if (!cancelled) {
          setStatus('ready')
        }
      } catch (error) {
        console.error('Failed to initialize scoped POS database:', error)
        if (!cancelled) setStatus('error')
      }
    }
    init()
    return () => { cancelled = true }
  }, [refresh, scopeId, shopId, branchId])

  // Re-hydrate every 5 minutes while online
  useEffect(() => {
    refreshTimer.current = setInterval(async () => {
      const stale = await isHydrationStale(STALE_TTL_MS, scopeId)
      if (stale && navigator.onLine) refresh()
    }, REFRESH_INTERVAL_MS)
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current)
    }
  }, [refresh, scopeId])

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
