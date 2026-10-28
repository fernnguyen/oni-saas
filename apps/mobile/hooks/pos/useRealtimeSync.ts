import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl, getApiHeaders } from '../../lib/api/config';

type RealtimePayload = {
  event:
    | 'TABLE_UPDATED'
    | 'TABLE_OPENED'
    | 'TABLE_PAID'
    | 'TABLE_CANCELLED'
    | 'TABLE_TRANSFERRED'
    | 'TABLE_MERGED'
    | 'TABLE_CLEANED'
    | 'ORDER_COMPLETED'
    | 'NEW_ORDER'
    | string;
  tableId?: string;
  orderId?: string;
  source: string;
};

export function useRealtimeSync(activeShopId: string, isOnline: boolean, onSyncRequired: (payload?: any) => void) {
  const channelRef = useRef<any>(null);
  const shopChannelRef = useRef<any>(null);
  const [isEnabled, setIsEnabled] = useState(true);
  const syncCallbackRef = useRef(onSyncRequired);
  const deviceSourceIdRef = useRef(`mobile_app_${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    syncCallbackRef.current = onSyncRequired;
  }, [onSyncRequired]);

  useEffect(() => {
    let isMounted = true;
    
    const initRealtime = async () => {
      if (!isOnline || !activeShopId) return;

      try {
        // Fetch settings from API; default to enabled unless explicitly set to false
        const currentUrl = getApiBaseUrl();
        const headers = await getApiHeaders();
        const res = await fetch(`${currentUrl}/api/shops/${activeShopId}/settings`, { headers });
        if (res.ok) {
          const settings = await res.json();
          const explicitlyDisabled =
            settings.enable_realtime_sync === false || settings.enable_realtime_sync === 'false';
          if (isMounted) setIsEnabled(!explicitlyDisabled);
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

    let lastHandledAt = 0;
    const handleBroadcast = (payload: any) => {
      if (payload?.payload?.source !== deviceSourceIdRef.current) {
        const now = Date.now();
        if (now - lastHandledAt < 300) return;
        lastHandledAt = now;
        console.log('[RealtimeSync] Received sync event:', payload);
        syncCallbackRef.current(payload?.payload);
      }
    };

    const shopChannelName = `pos_sync_shop_${activeShopId}`;
    shopChannelRef.current = supabase.channel(shopChannelName);
    shopChannelRef.current
      .on('broadcast', { event: 'sync_event' }, handleBroadcast)
      .subscribe((status: string) => {
        console.log('[RealtimeSync] Subscribed shop channel with status:', status);
      });

    AsyncStorage.getItem('active_tenant_code').then((code) => {
      const tenantCode = code || 'unknown';
      const channelName = `pos_sync_${tenantCode}_${activeShopId}`;

      channelRef.current = supabase.channel(channelName);
      channelRef.current
        .on('broadcast', { event: 'sync_event' }, handleBroadcast)
        .subscribe((status: string) => {
          console.log('[RealtimeSync] Subscribed tenant channel with status:', status);
        });
    });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (shopChannelRef.current) {
        supabase.removeChannel(shopChannelRef.current);
        shopChannelRef.current = null;
      }
    };
  }, [isEnabled, activeShopId]);

  const broadcastSync = async (payload: Omit<RealtimePayload, 'source'>) => {
    if (!isEnabled) return;

    const msg = {
      type: 'broadcast',
      event: 'sync_event',
      payload: {
        ...payload,
        source: deviceSourceIdRef.current,
      },
    };

    try {
      if (channelRef.current) {
        await channelRef.current.send(msg);
      }
      if (shopChannelRef.current) {
        await shopChannelRef.current.send(msg);
      }
      console.log('[RealtimeSync] Broadcasted sync event:', payload);
    } catch (e) {
      console.warn('[RealtimeSync] Failed to broadcast:', e);
    }
  };

  return { broadcastSync, isEnabled };
}
