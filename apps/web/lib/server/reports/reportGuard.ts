// Keeps report endpoints from starving the shared Postgres pool.
//
// Per worker process:
//  - at most MAX_CONCURRENT report jobs talk to the DB at once; the rest wait
//    up to QUEUE_TIMEOUT_MS, then fail with ReportBusyError (→ HTTP 503), so
//    POS writes always keep pool connections;
//  - identical requests in flight share one job (single-flight);
//  - results are cached for `ttlMs` per key; `fresh` skips the cached value
//    (still single-flight + semaphore).

const MAX_CONCURRENT = 3
const QUEUE_TIMEOUT_MS = 15_000
const MAX_CACHE_ENTRIES = 1_000

export class ReportBusyError extends Error {
  readonly status = 503
  constructor() {
    super('Hệ thống đang bận tính báo cáo, vui lòng thử lại sau ít giây')
  }
}

let running = 0
const waiters: Array<() => void> = []
const inflight = new Map<string, Promise<unknown>>()
const cache = new Map<string, { value: unknown; expiresAt: number }>()

function acquire(): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running++
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const grant = () => {
      clearTimeout(timer)
      running++
      resolve()
    }
    const timer = setTimeout(() => {
      const idx = waiters.indexOf(grant)
      if (idx >= 0) waiters.splice(idx, 1)
      reject(new ReportBusyError())
    }, QUEUE_TIMEOUT_MS)
    waiters.push(grant)
  })
}

function release() {
  running--
  const next = waiters.shift()
  if (next) next()
}

function remember(key: string, value: unknown, ttlMs: number) {
  if (ttlMs <= 0) return
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const now = Date.now()
    for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k)
    // Still full: drop the oldest insertion
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string)
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

export async function runReport<T>(
  key: string,
  opts: { ttlMs: number; fresh?: boolean },
  fn: () => Promise<T>,
): Promise<T> {
  if (!opts.fresh) {
    const hit = cache.get(key)
    if (hit && hit.expiresAt > Date.now()) return hit.value as T
  }

  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>

  const job = (async () => {
    await acquire()
    try {
      const value = await fn()
      remember(key, value, opts.ttlMs)
      return value
    } finally {
      release()
    }
  })()

  inflight.set(key, job)
  try {
    return await job
  } finally {
    inflight.delete(key)
  }
}

/** Test hook: clears cache and in-flight bookkeeping. */
export function resetReportGuard() {
  cache.clear()
  inflight.clear()
}
