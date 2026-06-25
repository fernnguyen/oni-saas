import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, Linking, Platform, ActivityIndicator, Image, Alert } from 'react-native';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { Feather, Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { getApiBaseUrl } from '../lib/api/config';
import { VersionContext } from '../contexts/VersionContext';

const compareSemver = (v1: string, v2: string) => {
  // Clean strings to only keep numbers and dots (e.g. "1.0.1 (2)" -> "1.0.1")
  const cleanV1 = v1.match(/\d+(\.\d+)+/)?.[0] || '0.0.0';
  const cleanV2 = v2.match(/\d+(\.\d+)+/)?.[0] || '0.0.0';
  
  const p1 = cleanV1.split('.').map(Number);
  const p2 = cleanV2.split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
};

export function VersionCheckGuard({ children }: { children: React.ReactNode }) {
  const [isChecking, setIsChecking] = useState(true);
  const [forceUpdate, setForceUpdate] = useState(false);
  const [storeUrl, setStoreUrl] = useState('');
  
  // OTA states
  const [otaAvailable, setOtaAvailable] = useState(false); // Controls the modal visibility
  const [hasOtaPending, setHasOtaPending] = useState(true); // Global flag for dashboard banner (set to true for testing)
  const [otaDownloading, setOtaDownloading] = useState(false);
  const [otaMinimized, setOtaMinimized] = useState(false);
  const [otaReady, setOtaReady] = useState(false);

  useEffect(() => {
    checkVersions();
  }, []);

  const checkVersions = async () => {
    try {
      // 1. Get remote config from API endpoint
      const apiUrl = `${getApiBaseUrl()}/api/mobile/version`;
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }
      
      const config = await response.json();
      
      const platformConfig = Platform.OS === 'ios' ? config?.ios : config?.android;
      
      // In Expo Go, nativeApplicationVersion returns Expo Go's version (e.g., 54.0.6)
      // We use the version from app.json in development/Expo Go.
      let nativeVersion = Application.nativeApplicationVersion || '1.0.0';
      if (__DEV__ || nativeVersion.startsWith('5')) {
        nativeVersion = Constants.expoConfig?.version || '1.0.0';
      }

      // 2. Check Force Update
      if (platformConfig?.min_version && compareSemver(nativeVersion, platformConfig.min_version) < 0) {
        setStoreUrl(platformConfig.store_url || '');
        setForceUpdate(true);
        setIsChecking(false);
        return;
      }

      // 3. Check OTA Update if enabled
      if (config.ota_enabled && !__DEV__) {
        const updateCheck = await Updates.checkForUpdateAsync();
        if (updateCheck.isAvailable) {
          setOtaAvailable(true);
          setHasOtaPending(true);
        }
      }
    } catch (e) {
      console.log('Version check failed:', e);
    } finally {
      setIsChecking(false);
    }
  };

  const handleDownloadOta = async () => {
    // Check if in Expo Go/Dev before triggering rapid state changes that break iOS Modals
    if (__DEV__ || Application.nativeApplicationVersion?.startsWith('5')) {
      setOtaAvailable(false);
      setTimeout(() => {
        Alert.alert(
          'Lỗi cập nhật', 
          'Tính năng tải bản vá OTA không khả dụng trên môi trường Expo Go. Vui lòng build app thật để test.'
        );
      }, 300);
      return;
    }

    setOtaDownloading(true);
    try {
      await Updates.fetchUpdateAsync();
      setOtaReady(true);
    } catch (e: any) {
      setOtaAvailable(false); // Hide the popup completely so user can continue
      
      // Delay the alert slightly to prevent UI freeze caused by firing an Alert while a Modal is unmounting (known iOS issue)
      setTimeout(() => {
        Alert.alert(
          'Lỗi cập nhật', 
          'Không thể tải bản cập nhật lúc này. Vui lòng thử lại sau.'
        );
      }, 500);
    } finally {
      setOtaDownloading(false);
    }
  };

  const handleReload = async () => {
    await Updates.reloadAsync();
  };

  if (isChecking) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#fa5908" />
      </View>
    );
  }

  // Force Update Screen (Blocks entire app)
  if (forceUpdate) {
    return (
      <View className="flex-1 bg-white items-center justify-center px-6">
        <View className="w-24 h-24 bg-orange-100 rounded-full items-center justify-center mb-6">
          <Ionicons name="rocket-outline" size={48} color="#fa5908" />
        </View>
        <Text className="text-2xl font-Inter-Bold text-slate-900 mb-2 text-center">
          Đã đến lúc nâng cấp!
        </Text>
        <Text className="text-base text-slate-500 text-center mb-8 font-Inter-Regular">
          Phiên bản bạn đang sử dụng đã cũ. Vui lòng cập nhật ứng dụng lên phiên bản mới nhất để tiếp tục bán hàng với trải nghiệm mượt mà nhất.
        </Text>
        <TouchableOpacity
          onPress={() => Linking.openURL(storeUrl)}
          className="bg-orange-500 w-full py-4 rounded-xl items-center shadow-sm"
        >
          <Text className="text-white font-Inter-SemiBold text-lg">
            Cập nhật ngay
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <VersionContext.Provider value={{ hasOtaPending, showOtaPrompt: () => setOtaAvailable(true) }}>
      <View className="flex-1">
        {children}

      {/* OTA Update Modals & Toasts */}
      
      {/* 1. Prompt to download OTA */}
      <Modal visible={otaAvailable && !otaDownloading && !otaReady && !otaMinimized} transparent animationType="fade">
        <View className="flex-1 bg-black/50 items-center justify-center px-4">
          <View className="bg-white w-full rounded-2xl p-6 items-center">
            <View className="w-16 h-16 bg-orange-50 rounded-full items-center justify-center mb-4">
              <Feather name="download" size={32} color="#fa5908" />
            </View>
            <Text className="text-xl font-Inter-Bold text-slate-900 mb-2 text-center">Oni POS</Text>
            <Text className="text-sm text-slate-500 text-center mb-6">
              Phần mềm Oni POS vừa phát hành một bản vá nhỏ giúp ứng dụng chạy nhanh và ổn định hơn. Bạn có muốn tải xuống ngay không?
            </Text>
            <View className="flex-row gap-3 w-full">
              <TouchableOpacity 
                onPress={() => setOtaAvailable(false)} // Skip for now
                className="flex-1 py-3 bg-slate-100 rounded-xl items-center"
              >
                <Text className="font-Inter-Medium text-slate-700">Để sau</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={handleDownloadOta}
                className="flex-1 py-3 bg-orange-500 rounded-xl items-center"
              >
                <Text className="font-Inter-Medium text-white">Tải ngay</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. Downloading OTA (Minimized state or Modal state) */}
      <Modal visible={otaDownloading && !otaMinimized} transparent animationType="fade">
        <View className="flex-1 bg-black/50 items-center justify-center px-4">
          <View className="bg-white w-full rounded-2xl p-6 items-center">
            <ActivityIndicator size="large" color="#fa5908" className="mb-4" />
            <Text className="text-lg font-Inter-Bold text-slate-900 mb-2">Đang cập nhật Oni POS...</Text>
            <Text className="text-sm text-slate-500 text-center mb-6">
              Quá trình này sẽ mất vài giây. Bạn có thể thu nhỏ cửa sổ này để tiếp tục bán hàng.
            </Text>
            <TouchableOpacity 
              onPress={() => setOtaMinimized(true)}
              className="py-3 px-6 bg-slate-100 rounded-xl items-center flex-row gap-2"
            >
              <Feather name="chevron-down" size={20} color="#64748b" />
              <Text className="font-Inter-Medium text-slate-700">Thu nhỏ chạy ngầm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 3. Minimized Floating Banner when downloading */}
      {otaMinimized && otaDownloading && (
        <View className="absolute top-12 self-center bg-slate-900 rounded-full px-4 py-2 flex-row items-center gap-2 shadow-lg z-50">
          <ActivityIndicator size="small" color="#fa5908" />
          <Text className="text-white font-Inter-Medium text-xs">Đang cập nhật Oni POS...</Text>
        </View>
      )}

      {/* 4. Download complete, prompt to reload */}
      <Modal visible={otaReady} transparent animationType="fade">
        <View className="flex-1 bg-black/50 items-center justify-center px-4">
          <View className="bg-white w-full rounded-2xl p-6 items-center">
            <View className="w-16 h-16 bg-orange-50 rounded-full items-center justify-center mb-4">
              <Feather name="refresh-cw" size={32} color="#fa5908" />
            </View>
            <Text className="text-xl font-Inter-Bold text-slate-900 mb-2 text-center">Đã cập nhật Oni POS!</Text>
            <Text className="text-sm text-slate-500 text-center mb-6">
              Bản vá đã tải xong. Hãy khởi động lại ứng dụng để áp dụng ngay. Thao tác này chỉ mất 1 giây.
            </Text>
            <View className="flex-row gap-3 w-full">
              <TouchableOpacity 
                onPress={() => setOtaReady(false)} // Skip reload
                className="flex-1 py-3 bg-slate-100 rounded-xl items-center"
              >
                <Text className="font-Inter-Medium text-slate-700">Để sau</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={handleReload}
                className="flex-1 py-3 bg-orange-500 rounded-xl items-center"
              >
                <Text className="font-Inter-Medium text-white">Khởi động lại</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      </View>
    </VersionContext.Provider>
  );
}
