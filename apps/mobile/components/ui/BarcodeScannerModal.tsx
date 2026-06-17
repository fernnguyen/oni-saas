import React, {useState, useEffect, useRef} from 'react';
import {
 Modal,
 View,
 Text,
 TouchableOpacity,
 TextInput,
 StyleSheet,
 ActivityIndicator,
 Platform,
 Animated,
 Easing,
 KeyboardAvoidingView,
 TouchableWithoutFeedback,
 Keyboard,
 Linking,
 ScrollView
} from 'react-native';
import {CameraView, useCameraPermissions} from 'expo-camera';
import {Ionicons} from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {Audio} from 'expo-av';
import {usePathname} from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface BarcodeScannerModalProps {
 visible: boolean;
 onClose: () => void;
 onScan: (barcode: string, type: string) => void;
 title?: string;
 placeholder?: string;
}

export function BarcodeScannerModal({
 visible,
 onClose,
 onScan,
 title = 'Quét mã vạch',
 placeholder = 'Nhập mã sản phẩm hoặc SKU...'
}: BarcodeScannerModalProps) {
 const pathname = usePathname();
 const [permission, requestPermission] = useCameraPermissions();
 const [manualBarcode, setManualBarcode] = useState('');
 const [scanned, setScanned] = useState(false);
 const [isFlashOn, setIsFlashOn] = useState(false);
 const [zoom, setZoom] = useState(0);
 const [showManualInput, setShowManualInput] = useState(false);

 const toggleZoom = () => {
 setZoom(prev => {
 if (prev === 0) return 0.08; // 1.5x zoom
 if (prev === 0.08) return 0.16; // 2x zoom
 return 0; // reset to 1x
});
};

 // Laser line animation
 const laserAnim = useRef(new Animated.Value(0)).current;
 const laserAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

 useEffect(() => {
 if (visible && permission?.granted && Platform.OS !== 'web') {
 setScanned(false);
 startLaserAnimation();
} else {
 stopLaserAnimation();
}
}, [visible, permission?.granted]);

 // Tự động gọi xin quyền camera khi mở modal lần đầu (chưa quyết định)
 useEffect(() => {
   if (visible && permission && permission.status === 'undetermined') {
     requestPermission();
   }
 }, [visible, permission]);

 const startLaserAnimation = () => {
 laserAnim.setValue(0);
 laserAnimationRef.current = Animated.loop(
 Animated.sequence([
 Animated.timing(laserAnim, {
 toValue: 1,
 duration: 2000,
 easing: Easing.inOut(Easing.ease),
 useNativeDriver: true,
}),
 Animated.timing(laserAnim, {
 toValue: 0,
 duration: 2000,
 easing: Easing.inOut(Easing.ease),
 useNativeDriver: true,
}),
 ])
 );
 laserAnimationRef.current.start();
};

 const stopLaserAnimation = () => {
 if (laserAnimationRef.current) {
 laserAnimationRef.current.stop();
}
};

 // Interpolate laser line vertical movement (from top to bottom of the 220px scanner box)
 const translateY = laserAnim.interpolate({
 inputRange: [0, 1],
 outputRange: [10, 210],
});

 const playBeep = async () => {
 try {
 const {sound} = await Audio.Sound.createAsync(
 require('../../assets/beep.wav')
 );
 await sound.playAsync();
 // Tự động giải phóng tài nguyên sau khi phát xong
 sound.setOnPlaybackStatusUpdate((status) => {
 if (status.isLoaded && status.didJustFinish) {
 sound.unloadAsync();
}
});
} catch (error) {
 console.log('Không thể phát tiếng bíp:', error);
}
};

 const handleBarcodeScanned = ({data, type}: {data: string; type: string}) => {
 if (scanned) return;
 
 setScanned(true);
 // Haptic feedback
 Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
 
 // Phát âm thanh beep tít
 playBeep();
 
 // Call user-provided scan callback
 onScan(data, type);
 
 // Delay resetting scanned state to avoid rapid scanning
 setTimeout(() => {
 setScanned(false);
}, 1500);
};

 const handleManualSubmit = () => {
 if (!manualBarcode.trim()) return;
 
 Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
 onScan(manualBarcode.trim(), 'manual');
 setManualBarcode('');
 setShowManualInput(false);
};

  // Render requesting permission status
  const renderPermissionGate = () => {
    if (!permission) {
      // Loading camera status
      return (
        <View className="flex-1 justify-center items-center py-10 bg-slate-50">
          <ActivityIndicator size="large" color="#fa5908" />
          <Text className="text-xs text-slate-500 font-medium mt-3">Đang kết nối camera...</Text>
        </View>
      );
    }

    // Đang chờ người dùng quyết định xin quyền từ prompt hệ thống
    if (permission.status === 'undetermined') {
      return (
        <View className="flex-1 justify-center items-center py-10 bg-slate-50">
          <ActivityIndicator size="large" color="#fa5908" />
          <Text className="text-xs text-slate-500 font-medium mt-3">Đang yêu cầu quyền truy cập camera...</Text>
        </View>
      );
    }

    if (!permission.granted) {
      // Permission denied - Hiển thị hướng dẫn mở cài đặt thiết bị kèm ô nhập tay trực tiếp làm phương án thay thế
      return (
        <ScrollView 
          className="flex-1 bg-slate-50" 
          contentContainerStyle={{ padding: 20, justifyContent: 'center', flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Cảnh báo từ chối camera nhẹ nhàng ở trên */}
          <View className="bg-orange-50/85 border border-orange-100 p-4 rounded-2xl flex-row items-center mb-5">
            <Ionicons name="camera-outline" size={24} color="#fa5908" />
            <View className="flex-1 ml-3 mr-2">
              <Text className="text-xs font-semibold text-slate-800">Quyền Camera bị từ chối</Text>
              <Text className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                Để quét bằng camera, hãy cấp quyền trong Cài đặt. Hiện tại bạn vẫn có thể nhập mã sản phẩm thủ công dưới đây.
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={async () => {
                try {
                  const path = `${pathname}?restore_barcode_scanner=true`;
                  await AsyncStorage.setItem('pending_restore_path', path);
                } catch (err) {
                  console.warn('Lỗi lưu đường dẫn khôi phục scanner:', err);
                }
                Linking.openSettings().catch(() => {});
              }}
              className="bg-orange-100 px-3 py-1.5 rounded-lg border border-orange-200 active:scale-95"
            >
              <Text className="text-[10px] font-bold text-orange-700">Cài đặt</Text>
            </TouchableOpacity>
          </View>

          {/* Ô nhập tay mã vạch làm phương án thay thế trực tiếp */}
          <View className="w-full bg-white border border-slate-200 rounded-2xl p-4.5" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2}}>
            <Text className="text-[9.5px] text-slate-400 font-medium mb-2">Nhập mã vạch thủ công:</Text>
            <View className="flex-row items-center border border-slate-200 rounded-xl px-3 py-1 bg-slate-50 focus-within:border-orange-400">
              <Ionicons name="barcode-outline" size={16} color="#94a3b8" />
              <TextInput
                className="flex-1 ml-2 text-xs text-slate-800 py-2.5"
                placeholder={placeholder}
                placeholderTextColor="#94a3b8"
                value={manualBarcode}
                onChangeText={setManualBarcode}
                onSubmitEditing={handleManualSubmit}
                autoFocus={true}
                style={{
                  paddingVertical: 0,
                  textAlignVertical: 'center',
                  lineHeight: undefined,
                  ...(Platform.OS === 'web' ? {outlineStyle: 'none'} as any : {})
                }}
              />
              {manualBarcode.length > 0 && (
                <TouchableOpacity onPress={() => setManualBarcode('')}>
                  <Ionicons name="close-circle" size={16} color="#cbd5e1" />
                </TouchableOpacity>
              )}
            </View>
            
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleManualSubmit}
              disabled={!manualBarcode.trim()}
              className={`mt-3 py-3 rounded-xl items-center justify-center flex-row ${
                manualBarcode.trim() ? 'bg-orange-500' : 'bg-slate-200'
              }`}
            >
              <Ionicons 
                name="checkmark-circle-outline" 
                size={16} 
                color={manualBarcode.trim() ? "white" : "#94a3b8"} 
              />
              <Text className={`text-xs font-semibold ml-2 ${
                manualBarcode.trim() ? 'text-white' : 'text-slate-400'
              }`}>
                Xác nhận mã vạch
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      );
    }

    return null;
  };

 const isCameraReady = permission?.granted && Platform.OS !== 'web';

 return (
 <Modal
 visible={visible}
 animationType="slide"
 transparent={true}
 onRequestClose={onClose}
 >
 <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
 <View className="flex-1 justify-end" style={{backgroundColor: 'rgba(0, 0, 0, 0.65)'}}>
 <KeyboardAvoidingView
 behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
 className="w-full"
 >
 <View className="h-[75%] rounded-t-3xl bg-white flex justify-between overflow-hidden" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: -10}, shadowOpacity: 0.15, shadowRadius: 18, elevation: 15}}>
 
 {/* HEADER */}
 <View className="flex-row justify-between items-center px-6 py-4.5 border-b border-slate-100 bg-white z-10">
 <View className="flex-row items-center">
 <View className="bg-orange-50 p-1.5 rounded-lg border border-orange-100 mr-2">
 <Ionicons name="scan-outline" size={18} color="#fa5908" />
 </View>
 <Text className="text-base font-semibold text-slate-800">
 {title}
 </Text>
 </View>
 <TouchableOpacity onPress={onClose} className="p-1.5 bg-slate-100 rounded-full active:scale-95">
 <Ionicons name="close" size={18} color="#64748b" />
 </TouchableOpacity>
 </View>

 {/* BODY CONTAINER */}
 <View className="flex-1 bg-slate-50 relative">
 
 {/* 1. CAMERA LAYOUT (NATIVE) */}
 {isCameraReady ? (
 <View className="flex-1 relative justify-center items-center">
 
 {/* CAMERA SENSOR */}
 <CameraView
 style={StyleSheet.absoluteFillObject}
 facing="back"
 enableTorch={isFlashOn}
 zoom={zoom}
 barcodeScannerSettings={{
 barcodeTypes: [
 'ean13',
 'code128',
 'ean8',
 'qr',
 'code39',
 'upc_a',
 'upc_e'
 ],
}}
 onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
 />

 {/* DYNAMIC SEMI-TRANSPARENT MASK OVERLAY */}
 <View 
 style={StyleSheet.absoluteFillObject} 
 pointerEvents="box-none" 
 className="justify-between items-center"
 >
 {/* Top Mask */}
 <View pointerEvents="none" className="w-full flex-1 bg-black/60 justify-center items-center px-4">
 <Text className="text-tiny text-white/90 font-medium bg-orange-600 px-3.5 py-1.5 rounded-full mb-1">
 Đặt mã vạch vào khung ngắm
 </Text>
 <Text className="text-[8.5px] text-slate-300 font-semibold text-center mt-1">
 Giữ camera ổn định. Nhấn nút zoom để hỗ trợ quét mã vạch nhỏ.
 </Text>
 </View>
 
 {/* Middle Mask row (Viewfinder Row) */}
 <View pointerEvents="none" className="w-full h-[220px] flex-row">
 <View className="flex-1 bg-black/60" />
 
 {/* KÍNH NGẮM VIEWFINDER */}
 <View className="w-[280px] h-[220px] bg-transparent relative overflow-hidden">
 {/* 4 Corners border highlights */}
 {/* Top-Left */}
 <View className="absolute top-0 left-0 w-6 h-6 border-t-[4px] border-l-[4px] border-orange-500 rounded-tl-lg" />
 {/* Top-Right */}
 <View className="absolute top-0 right-0 w-6 h-6 border-t-[4px] border-r-[4px] border-orange-500 rounded-tr-lg" />
 {/* Bottom-Left */}
 <View className="absolute bottom-0 left-0 w-6 h-6 border-b-[4px] border-l-[4px] border-orange-500 rounded-bl-lg" />
 {/* Bottom-Right */}
 <View className="absolute bottom-0 right-0 w-6 h-6 border-b-[4px] border-r-[4px] border-orange-500 rounded-br-lg" />
 
 {/* Animated Laser Line */}
 <Animated.View
 style={[
 styles.laserLine,
 {transform: [{translateY}]}
 ]}
 />
 </View>
 
 <View className="flex-1 bg-black/60" />
 </View>

 {/* Bottom Mask */}
 <View pointerEvents="box-none" className="w-full flex-1 bg-black/60 items-center justify-between py-6">
 {/* Camera controls row */}
 <View className="flex-row items-center justify-center gap-6 mt-2">
 {/* Flashlight toggle */}
 <TouchableOpacity
 activeOpacity={0.8}
 onPress={() => setIsFlashOn(!isFlashOn)}
 className={`w-12 h-12 rounded-full items-center justify-center border ${
 isFlashOn 
 ? 'bg-orange-500 border-orange-600' 
 : 'bg-black/45 border-white/20'
}`}
 >
 <Ionicons 
 name={isFlashOn ? "flash" : "flash-off"} 
 size={20} 
 color="white" 
 />
 </TouchableOpacity>

 {/* Zoom toggle button */}
 <TouchableOpacity
 activeOpacity={0.8}
 onPress={toggleZoom}
 className={`w-12 h-12 rounded-full items-center justify-center border bg-black/45 border-white/20 active:scale-95`}
 >
 <Text className="text-white text-xs font-semibold">
 {zoom === 0 ? '1x' : zoom === 0.08 ? '1.5x' : '2x'}
 </Text>
 </TouchableOpacity>
 </View>

 {/* Collapsible toggle manual input button */}
 <TouchableOpacity
 activeOpacity={0.8}
 onPress={() => setShowManualInput(!showManualInput)}
 className="flex-row items-center bg-black/45 border border-white/20 px-4 py-2.5 rounded-xl mb-4"
 >
 <Ionicons name="keypad-outline" size={14} color="white" />
 <Text className="text-tiny font-medium text-white ml-2">
 {showManualInput ? "Ẩn bàn phím nhập tay" : "Không quét được? Nhập tay"}
 </Text>
 </TouchableOpacity>
 </View>
 </View>

 </View>
 ) : (
 
 // 2. FALLBACK INTERFACE FOR WEB / SIMULATOR OR PERMISSION FAILURE
 <View className="flex-1">
 {permission?.granted === false ? (
 renderPermissionGate()
 ) : (
 // Web / Simulator Fallback Content
 <View className="flex-1 justify-center items-center p-6 bg-slate-50">
 <View className="bg-orange-50 p-4.5 rounded-full border border-orange-100 mb-3">
 <Ionicons name="desktop-outline" size={32} color="#fa5908" />
 </View>
 <Text className="text-sm font-medium text-slate-800 text-center mb-1">
 Chế độ giả lập & Web
 </Text>
 <Text className="text-[10.5px] text-slate-455 text-center mb-6 max-w-xs leading-relaxed">
 Bạn đang chạy ứng dụng trên Web hoặc trình giả lập (Simulator). Camera native không khả dụng, hãy nhập mã vạch bằng tay ở ô phía dưới.
 </Text>
 
 <View className="w-full bg-white border border-slate-200 rounded-2xl p-4.5" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2}}>
 <Text className="text-[9.5px] text-slate-400 font-medium mb-2">Nhập mã vạch thủ công:</Text>
 <View className="flex-row items-center border border-slate-200 rounded-xl px-3 py-1 bg-slate-50 focus-within:border-orange-400">
 <Ionicons name="barcode-outline" size={16} color="#94a3b8" />
 <TextInput
 className="flex-1 ml-2 text-xs text-slate-800 py-2.5"
 placeholder={placeholder}
 placeholderTextColor="#94a3b8"
 value={manualBarcode}
 onChangeText={setManualBarcode}
 onSubmitEditing={handleManualSubmit}
 autoFocus={true}
 style={{
    paddingVertical: 0,
    textAlignVertical: 'center',
    lineHeight: undefined,
    ...(Platform.OS === 'web' ? {outlineStyle: 'none'} as any : {})
  }}
 />
 {manualBarcode.length > 0 && (
 <TouchableOpacity onPress={() => setManualBarcode('')}>
 <Ionicons name="close-circle" size={16} color="#cbd5e1" />
 </TouchableOpacity>
 )}
 </View>
 
 <TouchableOpacity
 activeOpacity={0.8}
 onPress={handleManualSubmit}
 disabled={!manualBarcode.trim()}
 className={`mt-3 py-3 rounded-xl items-center justify-center flex-row ${
 manualBarcode.trim() ? 'bg-orange-500' : 'bg-slate-200'
}`}
 >
 <Ionicons 
 name="checkmark-circle-outline" 
 size={16} 
 color={manualBarcode.trim() ? "white" : "#94a3b8"} 
 />
 <Text className={`text-xs font-semibold ml-2 ${
 manualBarcode.trim() ? 'text-white' : 'text-slate-400'
}`}>
 Xác nhận mã vạch
 </Text>
 </TouchableOpacity>
 </View>
 </View>
 )}
 </View>
 )}

 {/* 3. MANUALLY INPUT COLLAPSIBLE COMPONENT (ON NATIVE MODE) */}
 {isCameraReady && showManualInput && (
 <View className="absolute bottom-0 left-0 right-0 p-4.5 bg-white border-t border-slate-100 rounded-t-2xl z-20" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: -4}, shadowOpacity: 0.08, shadowRadius: 8, elevation: 10}}>
 <View className="flex-row justify-between items-center mb-2">
 <Text className="text-[9.5px] text-slate-400 font-medium">Nhập mã vạch sản phẩm:</Text>
 <TouchableOpacity onPress={() => setShowManualInput(false)}>
 <Text className="text-tiny text-orange-600 font-medium">Đóng</Text>
 </TouchableOpacity>
 </View>
 <View className="flex-row items-center border border-slate-200 rounded-xl px-3 py-0.5 bg-slate-50">
 <Ionicons name="keypad-outline" size={14} color="#94a3b8" />
 <TextInput
 className="flex-1 ml-2 text-xs text-slate-850 py-2"
 placeholder={placeholder}
 placeholderTextColor="#cbd5e1"
 value={manualBarcode}
 onChangeText={setManualBarcode}
 onSubmitEditing={handleManualSubmit}
 style={{
    paddingVertical: 0,
    textAlignVertical: 'center',
    lineHeight: undefined,
    ...(Platform.OS === 'web' ? {outlineStyle: 'none'} as any : {})
  }}
 />
 {manualBarcode.length > 0 && (
 <TouchableOpacity onPress={() => setManualBarcode('')}>
 <Ionicons name="close-circle" size={14} color="#cbd5e1" />
 </TouchableOpacity>
 )}
 </View>
 <TouchableOpacity
 activeOpacity={0.8}
 onPress={handleManualSubmit}
 disabled={!manualBarcode.trim()}
 className={`mt-2.5 py-2.5 rounded-lg items-center justify-center flex-row ${
 manualBarcode.trim() ? 'bg-orange-500' : 'bg-slate-200'
}`}
 >
 <Text className={`text-tiny font-semibold ${
 manualBarcode.trim() ? 'text-white' : 'text-slate-450'
}`}>
 Xác nhận mã
 </Text>
 </TouchableOpacity>
 </View>
 )}

 </View>

 </View>
 </KeyboardAvoidingView>
 </View>
 </TouchableWithoutFeedback>
 </Modal>
 );
}

const styles = StyleSheet.create({
 laserLine: {
 position: 'absolute',
 left: '5%',
 width: '90%',
 height: 2.5,
 backgroundColor: '#fa5908',
 borderRadius: 2,
 shadowColor: '#fa5908',
 shadowOffset: {width: 0, height: 0},
 shadowOpacity: 0.85,
 shadowRadius: 5,
 elevation: 6,
},
});
