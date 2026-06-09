import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl, getApiHeaders } from '../../lib/api/config';

type RealtimePayload = {
  event: 'TABLE_UPDATED' | 'ORDER_COMPLETED' | 'NEW_ORDER';
  tableId?: string;
  orderId?: string;
  source: string;
};

export function useRealtimeSync(activeShopId: string, isOnline: boolean, onSyncRequired: (payload?: any) => void) {
  const channelRef = useRef<any>(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const syncCallbackRef = useRef(onSyncRequired);

  useEffect(() => {
    syncCallbackRef.current = onSyncRequired;
  }, [onSyncRequired]);

  useEffect(() => {
    let isMounted = true;
    
    const initRealtime = async () => {
      if (!isOnline || !activeShopId) return;

      try {
        // Fetch settings from API to check if realtime sync is enabled globally
        const currentUrl = getApiBaseUrl();
        const headers = await getApiHeaders();
        const res = await fetch(`${currentUrl}/api/shops/${activeShopId}/settings`, { headers });
        if (res.ok) {
          const settings = await res.json();
          if (isMounted) setIsEnabled(!!settings.enable_realtime_sync);
        }
      } catch (e) {
        console.warn('Cannot fetch shop settings for realtime sync', e);
      }
    };

    initRealtime();
    return () => { isMounted = false; };
  }, [activeShopId, isOnline]);

  useEffect(() => {
    if (!isEnabled || !activeShopId) return;

    let tenantCode = '';
    AsyncStorage.getItem('active_tenant_code').then((code) => {
      tenantCode = code || 'unknown';
      const channelName = `pos_sync_${tenantCode}_${activeShopId}`;

      channelRef.current = supabase.channel(channelName);
      channelRef.current
        .on('broadcast', { event: 'sync_event' }, (payload: any) => {
          console.log('[RealtimeSync] Received sync event:', payload);
          // Only trigger if source is not this device
          if (payload?.payload?.source !== 'mobile_app') {
            syncCallbackRef.current(payload?.payload);
          }
        })
        .subscribe((status: string) => {
          console.log('[RealtimeSync] Subscribed with status:', status);
        });
    });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isEnabled, activeShopId]);

  const broadcastSync = async (payload: Omit<RealtimePayload, 'source'>) => {
    if (!isEnabled || !channelRef.current) return;
    
    try {
      await channelRef.current.send({
        type: 'broadcast',
        event: 'sync_event',
        payload: {
          ...payload,
          source: 'mobile_app'
        }
      });
      console.log('[RealtimeSync] Broadcasted sync event:', payload);
    } catch (e) {
      console.warn('[RealtimeSync] Failed to broadcast:', e);
    }
  };

  return { broadcastSync, isEnabled };
}
