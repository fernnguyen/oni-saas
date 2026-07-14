/**
 * useRealtimeSync.ts
 * Supabase Broadcast realtime sync for POS table/room changes.
 * Mirrors mobile app's useRealtimeSync hook — subscribes to
 * channel `pos_sync_{tenantCode}_{shopId}` for cross-device sync.
 */
import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useTenantStore } from '@/stores/tenant-store';
import { useTableStore } from '@/stores/table-store';

export type SyncEvent = 'TABLE_UPDATED' | 'ORDER_COMPLETED' | 'NEW_ORDER';

export interface SyncPayload {
  event: SyncEvent;
  tableId?: string;
  orderId?: string;
  source: string;
}

const SOURCE_ID = 'zalo_mini_app';

export function useRealtimeSync(
  shopId: string,
  onSyncRequired: (payload?: SyncPayload) => void,
) {
  const tenant = useTenantStore((s) => s.tenant);
  const shopSettings = useTableStore((s) => s.shopSettings);
  const channelRef = useRef<any>(null);
  const syncCallbackRef = useRef(onSyncRequired);

  // Keep callback ref up to date
  useEffect(() => {
    syncCallbackRef.current = onSyncRequired;
  }, [onSyncRequired]);

  const isEnabled = !!shopSettings?.enable_realtime_sync;
  const tenantCode = tenant?.slug || 'unknown';

  // Subscribe to broadcast channel
  useEffect(() => {
    if (!isEnabled || !shopId || !tenantCode) return;

    const channelName = `pos_sync_${tenantCode}_${shopId}`;
    console.log('[RealtimeSync] Subscribing to', channelName);

    channelRef.current = supabase.channel(channelName);
    channelRef.current
      .on('broadcast', { event: 'sync_event' }, (msg: any) => {
        const payload = msg?.payload as SyncPayload | undefined;
        // Ignore events from ourselves
        if (payload?.source === SOURCE_ID) return;
        console.log('[RealtimeSync] Received sync event:', payload);
        syncCallbackRef.current(payload);
      })
      .subscribe((status: string) => {
        console.log('[RealtimeSync] Channel status:', status);
      });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isEnabled, shopId, tenantCode]);

  // Broadcast helper
  const broadcastSync = useCallback(
    async (event: SyncEvent, extra?: { tableId?: string; orderId?: string }) => {
      if (!isEnabled || !channelRef.current) return;
      try {
        await channelRef.current.send({
          type: 'broadcast',
          event: 'sync_event',
          payload: { event, ...extra, source: SOURCE_ID } satisfies SyncPayload,
        });
      } catch (e) {
        console.warn('[RealtimeSync] Failed to broadcast:', e);
      }
    },
    [isEnabled],
  );

  return { broadcastSync, isEnabled };
}
