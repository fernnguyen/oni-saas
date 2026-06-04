import React, {useEffect, useState} from 'react';
import {Text, View, Platform, TouchableOpacity} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {db} from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import {eq} from 'drizzle-orm';
import {Badge} from '../ui/Badge';

export interface SyncBannerProps {
 shopId?: string;
 forceStatus?: 'synced' | 'pending' | 'offline' | 'error';
 onPressSync?: () => void;
 isSyncing?: boolean;
}

export function SyncBanner({shopId, forceStatus, onPressSync, isSyncing = false}: SyncBannerProps) {
 const [pendingCount, setPendingCount] = useState(0);
 const [isOnline, setIsOnline] = useState(true);

 // Lắng nghe trạng thái internet trên di động/web đơn giản
 useEffect(() => {
 // Trình duyệt Web hoặc Android/iOS mặc định bắt trạng thái online
 const checkConnectivity = () => {
 if (typeof navigator !== 'undefined') {
 setIsOnline(navigator.onLine);
}
};
 
 checkConnectivity();
 const interval = setInterval(checkConnectivity, 5000);
 return () => clearInterval(interval);
}, []);

 // Truy vấn SQLite liên tục (mỗi 4 giây) để đếm số đơn hàng chưa đồng bộ
 useEffect(() => {
 if (forceStatus) return; // Nếu truyền cứng status thì không tự query

 const checkPendingOrders = async () => {
 try {
 if (Platform.OS === 'web') return; // SQLite giả lập trên Web không cần kiểm tra đơn
 
 const pendingOrders = await db
 .select()
 .from(schema.orders)
 .where(eq(schema.orders.sync_status, 'pending'));
 
 setPendingCount(pendingOrders.length);
} catch (err) {
 console.warn('Lỗi đếm số đơn pending trong SyncBanner:', err);
}
};

 checkPendingOrders();
 const interval = setInterval(checkPendingOrders, 4000);
 return () => clearInterval(interval);
}, [forceStatus]);

 // Nếu đang đồng bộ chạy ngầm, hiển thị chỉ báo đang tải
 if (isSyncing) {
 return (
 <View className="flex-row items-center bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-xl">
 <Ionicons name="sync-outline" size={11} color="#fa5908" className="animate-spin" />
 <Text className="text-xxs font-extrabold text-orange-600 ml-1">
 Đang tải...
 </Text>
 </View>
 );
}

 // Xác định trạng thái cuối cùng
 let status: 'synced' | 'pending' | 'offline' | 'error' = 'synced';
 if (forceStatus) {
 status = forceStatus;
} else if (!isOnline) {
 status = 'offline';
} else if (pendingCount > 0) {
 status = 'pending';
}

 // Nếu đã đồng bộ hoàn toàn và không có gì cản trở, hiển thị huy hiệu lục bảo nhỏ xinh hoặc ẩn đi
 if (status === 'synced') {
 return (
 <TouchableOpacity 
 activeOpacity={0.8}
 onPress={onPressSync}
 className="flex-row items-center"
 >
 <Badge variant="success" label="Đã đồng bộ" showDot={true} size="sm" />
 </TouchableOpacity>
 );
}

 if (status === 'offline') {
 return (
 <TouchableOpacity 
 activeOpacity={0.8}
 onPress={onPressSync}
 className="flex-row items-center bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-xl"
 >
 <Ionicons name="cloud-offline-outline" size={11} color="#d97706" />
 <Text className="text-xxs font-bold text-amber-700 ml-1">
 Ngoại tuyến {pendingCount > 0 ? `• Hoạt động (${pendingCount} đơn chờ)` : ''}
 </Text>
 </TouchableOpacity>
 );
}

 if (status === 'pending') {
 return (
 <TouchableOpacity
 activeOpacity={0.8}
 onPress={onPressSync}
 className="flex-row items-center bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-xl"
 >
 <Ionicons name="sync-outline" size={11} color="#fa5908" className="animate-spin" />
 <Text className="text-xxs font-extrabold text-orange-600 ml-1">
 Chờ đồng bộ ({pendingCount} đơn)
 </Text>
 </TouchableOpacity>
 );
}

 return (
 <TouchableOpacity
 activeOpacity={0.8}
 onPress={onPressSync}
 className="flex-row items-center bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-xl"
 >
 <Ionicons name="alert-circle-outline" size={11} color="#e11d48" />
 <Text className="text-xxs font-extrabold text-rose-600 ml-1">
 Lỗi kết nối
 </Text>
 </TouchableOpacity>
 );
}
