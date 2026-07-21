import React, { useEffect, useState } from 'react';
import { TouchableOpacity, View, Platform, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import { eq, and, or, like } from 'drizzle-orm';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SyncDotStatus = 'synced' | 'pending' | 'offline' | 'error' | 'syncing';

export interface SyncDotButtonProps {
  shopId?: string;
  forceStatus?: 'synced' | 'pending' | 'offline' | 'error';
  onPress?: () => void;
  isSyncing?: boolean;
  pendingCount?: number;
}

const STATUS_CONFIG: Record<SyncDotStatus, { dot: string; icon: string; iconColor: string }> = {
  synced:  { dot: '#22c55e', icon: 'sync-outline',          iconColor: '#16a34a' },
  pending: { dot: '#fa5908', icon: 'sync-outline',          iconColor: '#fa5908' },
  offline: { dot: '#d97706', icon: 'cloud-offline-outline', iconColor: '#d97706' },
  error:   { dot: '#e11d48', icon: 'alert-circle-outline',  iconColor: '#e11d48' },
  syncing: { dot: 'transparent', icon: 'sync-outline',      iconColor: '#fa5908' },
};

export function SyncDotButton({
  shopId,
  forceStatus,
  onPress,
  isSyncing = false,
  pendingCount: customPendingCount,
}: SyncDotButtonProps) {
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  // Animated rotation for syncing state
  const spinAnim = React.useRef(new Animated.Value(0)).current;
  const spinAnimation = React.useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isSyncing) {
      spinAnimation.current = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spinAnimation.current.start();
    } else {
      spinAnimation.current?.stop();
      spinAnim.setValue(0);
    }
    return () => {
      spinAnimation.current?.stop();
    };
  }, [isSyncing]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Network connectivity check
  useEffect(() => {
    const checkConnectivity = () => {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
        setIsOnline(navigator.onLine);
      } else {
        setIsOnline(true);
      }
    };
    checkConnectivity();
    const interval = setInterval(checkConnectivity, 5000);
    return () => clearInterval(interval);
  }, []);

  // SQLite pending count polling
  useEffect(() => {
    const checkPendingData = async () => {
      try {
        if (Platform.OS === 'web') return;
        const activeShopId = shopId || (await AsyncStorage.getItem('active_shop_id')) || '';
        if (!activeShopId) return;

        const pendingOrders = await db
          .select({ id: schema.orders.id })
          .from(schema.orders)
          .where(and(
            eq(schema.orders.sync_status, 'pending'),
            like(schema.orders.shift_id, `shift-${activeShopId}-%`)
          ));

        const pendingCashbook = await db
          .select({ id: schema.cashbook.id })
          .from(schema.cashbook)
          .where(and(
            or(
              eq(schema.cashbook.sync_status, 'pending'),
              eq(schema.cashbook.sync_status, 'failed')
            ),
            eq(schema.cashbook.branch_id, activeShopId)
          ));

        const pendingShifts = await db
          .select({ id: schema.shop_shifts.id })
          .from(schema.shop_shifts)
          .where(and(
            eq(schema.shop_shifts.sync_status, 'pending'),
            like(schema.shop_shifts.id, `shift-${activeShopId}-%`)
          ));

        const pendingMovements = await db
          .select({ id: schema.stockMovements.id })
          .from(schema.stockMovements)
          .where(and(
            eq(schema.stockMovements.sync_status, 'pending'),
            eq(schema.stockMovements.branch_id, activeShopId)
          ));

        setPendingCount(
          pendingOrders.length +
          pendingCashbook.length +
          pendingShifts.length +
          pendingMovements.length
        );
      } catch (err) {
        console.warn('Lỗi đếm số mục pending trong SyncDotButton:', err);
      }
    };

    checkPendingData();
    const interval = setInterval(checkPendingData, 4000);
    return () => clearInterval(interval);
  }, [shopId]);

  // Determine status
  let status: SyncDotStatus = 'synced';
  if (isSyncing) {
    status = 'syncing';
  } else if (forceStatus) {
    status = forceStatus;
  } else if (!isOnline) {
    status = 'offline';
  } else {
    const displayCount = customPendingCount !== undefined ? customPendingCount : pendingCount;
    if (displayCount > 0) status = 'pending';
  }

  const cfg = STATUS_CONFIG[status];

  return (
    // Outer wrapper — so the status dot can overflow outside the button boundary
    <View style={{ position: 'relative' }}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        style={{
          padding: 7,
          backgroundColor: '#f8fafc',
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#f1f5f9',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        accessibilityLabel={`Đồng bộ: ${status}`}
      >
        <Animated.View style={status === 'syncing' ? { transform: [{ rotate: spin }] } : undefined}>
          <Ionicons name={cfg.icon as any} size={22} color={cfg.iconColor} />
        </Animated.View>
      </TouchableOpacity>

      {/* Status dot — outside button, top-right corner */}
      {status !== 'syncing' && (
        <View
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            width: 9,
            height: 9,
            borderRadius: 5,
            backgroundColor: cfg.dot,
            borderWidth: 1.5,
            borderColor: 'white',
            zIndex: 10,
          }}
        />
      )}
    </View>
  );
}
