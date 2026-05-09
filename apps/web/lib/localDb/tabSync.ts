import type { LocalOrder } from './schema'

type POSEventType = 'ORDER_CREATED' | 'SYNC_DONE' | 'HYDRATE_REFRESH'

interface POSEvent {
  type: POSEventType
  order?: LocalOrder
  local_id?: string
  server_id?: string
}

export interface POSEventHandlers {
  onOrderCreated?: (order: LocalOrder) => void
  onSyncDone?: (ids: { local_id: string; server_id: string }) => void
  onHydrateRefresh?: () => void
}

const channel = typeof window !== 'undefined'
  ? new BroadcastChannel('oni-pos')
  : null

export function broadcastOrderCreated(order: LocalOrder) {
  channel?.postMessage({ type: 'ORDER_CREATED', order } satisfies POSEvent)
}

export function broadcastOrderSynced(ids: { local_id: string; server_id: string }) {
  channel?.postMessage({ type: 'SYNC_DONE', ...ids } satisfies POSEvent)
}

export function broadcastHydrateRefresh() {
  channel?.postMessage({ type: 'HYDRATE_REFRESH' } satisfies POSEvent)
}

export function listenPOSEvents(handlers: POSEventHandlers): () => void {
  if (!channel) return () => {}

  const listener = (e: MessageEvent<POSEvent>) => {
    switch (e.data.type) {
      case 'ORDER_CREATED':
        if (e.data.order) handlers.onOrderCreated?.(e.data.order)
        break
      case 'SYNC_DONE':
        if (e.data.local_id && e.data.server_id)
          handlers.onSyncDone?.({ local_id: e.data.local_id, server_id: e.data.server_id })
        break
      case 'HYDRATE_REFRESH':
        handlers.onHydrateRefresh?.()
        break
    }
  }

  channel.addEventListener('message', listener)
  return () => channel.removeEventListener('message', listener)
}
