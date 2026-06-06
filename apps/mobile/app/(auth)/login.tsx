import React, {useState, useEffect} from 'react';
import {Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert, Modal, Platform, Image} from 'react-native';
import {useRouter} from 'expo-router';
import {Ionicons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from '../../lib/supabase';
import {loadApiBaseUrl, saveApiBaseUrl} from '../../lib/api/config';
import * as Haptics from 'expo-haptics';

export default function LoginScreen() {
 const router = useRouter();
 const [tenantCode, setTenantCode] = useState('');
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [showPassword, setShowPassword] = useState(false);
 const [isLoading, setIsLoading] = useState(false);
 const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);

 // States cài đặt Server URL
 const [isServerModalOpen, setIsServerModalOpen] = useState(false);
 const [customServerUrl, setCustomServerUrl] = useState('');

 // 1. Tự động tải dữ liệu & URL Server đã cấu hình
 useEffect(() => {
 const loadInitialData = async () => {
 try {
 const savedCode = await AsyncStorage.getItem('saved_tenant_code');
 if (savedCode) {
 setTenantCode(savedCode);
}
 
 const savedEmail = await AsyncStorage.getItem('saved_email');
 if (savedEmail) {
 setEmail(savedEmail);
 setIsBiometricAvailable(true);
}

 // Tải server URL hiện tại
 const url = await loadApiBaseUrl();
 setCustomServerUrl(url);
} catch (error) {
 console.error('Không thể tải cấu hình khởi động:', error);
}
};
 loadInitialData();
}, []);

 // 2. Xử lý lưu URL Server mới
 const handleSaveServerUrl = async () => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
 if (!customServerUrl.trim()) {
 Alert.alert('Thông báo', 'Vui lòng nhập địa chỉ Server hợp lệ!');
 return;
}
 try {
 await saveApiBaseUrl(customServerUrl.trim());
 setIsServerModalOpen(false);
 Alert.alert('Thành công', 'Đã cập nhật địa chỉ Server API thành công.');
} catch (err) {
 Alert.alert('Lỗi', 'Không thể lưu địa chỉ Server mới.');
}
};

 // 3. Xử lý Đăng nhập
 const handleLogin = async () => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
 if (!tenantCode || !email || !password) {
 Alert.alert('Thông báo', 'Vui lòng nhập đầy đủ thông tin đăng nhập!');
 return;
}
 
 setIsLoading(true);
 try {
 const trimmedTenant = tenantCode.trim().toLowerCase();
 const trimmedEmail = email.trim();

 // Lưu lại thông tin đăng nhập thành công
 await AsyncStorage.setItem('saved_tenant_code', trimmedTenant);
 await AsyncStorage.setItem('saved_email', trimmedEmail);
 await AsyncStorage.setItem('active_tenant_code', trimmedTenant);

 // Gọi Supabase Auth thực tế
 const {data, error} = await supabase.auth.signInWithPassword({
 email: trimmedEmail,
 password: password,
});

 if (error) {
 Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
 Alert.alert('Đăng nhập thất bại', 'Sai thông tin tài khoản hoặc mật khẩu.');
 setIsLoading(false);
 return;
}

 Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
 setIsLoading(false);
 // Đi tới chọn Chi nhánh
 router.push('/(auth)/select-branch');
} catch (error: any) {
 console.error('Lỗi khi đăng nhập:', error);
 Alert.alert('Lỗi kết nối', error.message || 'Không thể kết nối đến máy chủ.');
 setIsLoading(false);
}
};

 // 4. Giả lập đăng nhập Sinh trắc học (Vân tay / Face ID)
 const handleBiometricLogin = async () => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
 if (!tenantCode) {
 Alert.alert('Thông báo', 'Vui lòng điền Gian hàng trước khi sử dụng sinh trắc học.');
 return;
}

 setIsLoading(true);
 // Quét sinh trắc học giả lập
 setTimeout(async () => {
 try {
 const {data: {session}} = await supabase.auth.getSession();
 if (session) {
 await AsyncStorage.setItem('saved_tenant_code', tenantCode.trim().toLowerCase());
 await AsyncStorage.setItem('active_tenant_code', tenantCode.trim().toLowerCase());
 setIsLoading(false);
 router.push('/(auth)/select-branch');
} else {
 setIsLoading(false);
 Alert.alert(
 'Xác thực sinh trắc học',
 'Đã nhận diện thành công!\n\nVui lòng đăng nhập bằng mật khẩu thủ công một lần để liên kết Sinh trắc học trên thiết bị di động này.'
 );
}
} catch (err) {
 setIsLoading(false);
 Alert.alert('Thất bại', 'Không khớp sinh trắc học.');
}
}, 800);
};

 return (
 <SafeAreaView style={{flex: 1, backgroundColor: '#f8fafc', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 24, position: 'relative'}}>
 
 {/* Nút Cấu hình Server (Góc trái trên) - Loại bỏ hoàn toàn viền đen bằng thuộc tính border chuẩn */}
 <TouchableOpacity 
 activeOpacity={0.7}
 onPress={() => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
 setIsServerModalOpen(true);
}}
 style={{
 position: 'absolute', 
 top: 50, 
 left: 24, 
 zIndex: 99, 
 width: 36, 
 height: 36, 
 borderRadius: 10, 
 borderWidth: 1, 
 borderColor: '#cbd5e1', 
 backgroundColor: '#ffffff', 
 alignItems: 'center', 
 justifyContent: 'center' 
}}
 >
 <Ionicons name="server-outline" size={16} color="#fa5908" />
 </TouchableOpacity>

 {/* Spacer trên để đẩy phần logo xuống hợp lý */}
 <View style={{height: 20}} />

 {/* 1. BRAND HEADER & LOGO THƯƠNG HIỆU */}
 <View style={{alignItems: 'center', marginTop: 30}}>
 {/* Logo thực tế được copy từ WebUI */}
 <Image 
 source={require('../../assets/logo.png')} 
 style={{width: 76, height: 76, resizeMode: 'contain', marginBottom: 12}} 
 />
 {/* Tên thương hiệu và khẩu hiệu cực kỳ thân thiện với hộ kinh doanh */}
 <Text style={{fontSize: 26, fontWeight: '800', color: '#1e293b', letterSpacing: 0.5}}>Bán hàng với ONI</Text>
 <Text style={{fontSize: 13, color: '#64748b', marginTop: 8, fontWeight: '500', textAlign: 'center', lineHeight: 18, paddingHorizontal: 16}}>
 Giải pháp bán hàng và quản trị đơn giản, hiệu quả
 </Text>
 </View>

 {/* 2. CREDENTIAL CARD (Bố trí chuẩn, thoáng rộng, cực kỳ mượt mà, loại bỏ mọi viền đen thô sơ) */}
 <View style={{
 backgroundColor: '#ffffff', 
 borderRadius: 28, 
 borderWidth: 1, 
 borderColor: '#f1f5f9', 
 padding: 24, 
 shadowColor: '#94a3b8', 
 shadowOffset: {width: 0, height: 10}, 
 shadowOpacity: 0.08, 
 shadowRadius: 15, 
 elevation: 4,
 marginVertical: 20
}}>
 <Text style={{fontSize: 20, fontWeight: '700', color: '#1e293b', marginBottom: 20}}>Đăng nhập</Text>

 {/* Gian hàng (Mã Tenant) */}
 <Text style={{fontSize: 16, color: '#64748b', fontWeight: '600', letterSpacing: 0.5, marginBottom: 6}}>
 Gian hàng
 </Text>
 <View style={{
 flexDirection: 'row', 
 alignItems: 'center', 
 borderWidth: 1, 
 borderColor: '#cbd5e1', 
 borderRadius: 12, 
 backgroundColor: '#ffffff', 
 paddingHorizontal: 14, 
 height: 52, 
 marginBottom: 16 
}}>
 <Ionicons name="storefront-outline" size={16} color="#94a3b8" />
 <TextInput
 placeholder="ten-cua-hang"
 placeholderTextColor="#cbd5e1"
 value={tenantCode}
 onChangeText={setTenantCode}
 autoCapitalize="none"
 style={Platform.OS === 'web' 
 ? ({flex: 1, marginLeft: 10, fontSize: 16, fontWeight: '600', color: '#1e293b', outlineStyle: 'none', borderStyle: 'none', borderWidth: 0, padding: 0} as any)
 : {flex: 1, marginLeft: 10, fontSize: 16, fontWeight: '600', color: '#1e293b', padding: 0}
}
 />
 <Text style={{fontSize: 16, fontWeight: '600', color: '#94a3b8', marginLeft: 8}}>.oni.vn</Text>
 </View>

 {/* Tên Đăng nhập / Email */}
 <Text style={{fontSize: 16, color: '#64748b', fontWeight: '600', letterSpacing: 0.5, marginBottom: 6}}>
 Tên đăng nhập / Email
 </Text>
 <View style={{
 flexDirection: 'row', 
 alignItems: 'center', 
 borderWidth: 1, 
 borderColor: '#cbd5e1', 
 borderRadius: 12, 
 backgroundColor: '#ffffff', 
 paddingHorizontal: 14, 
 height: 52, 
 marginBottom: 16 
}}>
 <Ionicons name="mail-outline" size={16} color="#94a3b8" />
 <TextInput
 placeholder="admin@oni.vn"
 placeholderTextColor="#cbd5e1"
 value={email}
 onChangeText={setEmail}
 keyboardType="email-address"
 autoCapitalize="none"
 style={Platform.OS === 'web' 
 ? ({flex: 1, marginLeft: 10, fontSize: 16, fontWeight: '600', color: '#1e293b', outlineStyle: 'none', borderStyle: 'none', borderWidth: 0, padding: 0} as any)
 : {flex: 1, marginLeft: 10, fontSize: 16, fontWeight: '600', color: '#1e293b', padding: 0}
}
 />
 </View>

 {/* Mật khẩu */}
 <Text style={{fontSize: 16, color: '#64748b', fontWeight: '600', letterSpacing: 0.5, marginBottom: 6}}>
 Mật khẩu
 </Text>
 <View style={{
 flexDirection: 'row', 
 alignItems: 'center', 
 borderWidth: 1, 
 borderColor: '#cbd5e1', 
 borderRadius: 12, 
 backgroundColor: '#ffffff', 
 paddingHorizontal: 14, 
 height: 52, 
 marginBottom: 20 
}}>
 <Ionicons name="lock-closed-outline" size={16} color="#94a3b8" />
 <TextInput
 placeholder="••••••••"
 placeholderTextColor="#cbd5e1"
 value={password}
 onChangeText={setPassword}
 secureTextEntry={!showPassword}
 autoCapitalize="none"
 style={Platform.OS === 'web' 
 ? ({flex: 1, marginLeft: 10, fontSize: 16, fontWeight: '500', color: '#1e293b', outlineStyle: 'none', borderStyle: 'none', borderWidth: 0, padding: 0} as any)
 : {flex: 1, marginLeft: 10, fontSize: 16, fontWeight: '500', color: '#1e293b', padding: 0}
}
 />
 <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{padding: 4}}>
 <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#94a3b8" />
 </TouchableOpacity>
 </View>

 {/* Nút Đăng nhập & Sinh trắc học */}
 <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
 <TouchableOpacity 
 activeOpacity={0.8}
 onPress={handleLogin}
 disabled={isLoading}
 style={{
 backgroundColor: '#fa5908', 
 flex: 1, 
 height: 52, 
 borderRadius: 26, 
 alignItems: 'center', 
 justifyContent: 'center', 
 flexDirection: 'row',
 marginRight: 12,
 shadowColor: '#fa5908',
 shadowOffset: {width: 0, height: 4},
 shadowOpacity: 0.15,
 shadowRadius: 8,
 elevation: 3
}}
 >
 {isLoading ? (
 <ActivityIndicator size="small" color="white" />
 ) : (
 <>
 <Text style={{color: '#ffffff', fontWeight: '500', fontSize: 16, letterSpacing: 0.8, marginRight: 6}}>ĐĂNG NHẬP</Text>
 <Ionicons name="arrow-forward" size={16} color="white" />
 </>
 )}
 </TouchableOpacity>

 {/* Biometrics Fingerprint */}
 <TouchableOpacity 
 activeOpacity={0.7}
 onPress={handleBiometricLogin}
 disabled={isLoading}
 style={{
 width: 52, 
 height: 52, 
 borderRadius: 26, 
 borderWidth: 1, 
 borderColor: '#fa5908', 
 backgroundColor: '#ffffff', 
 alignItems: 'center', 
 justifyContent: 'center' 
}}
 >
 <Ionicons name="finger-print" size={24} color="#fa5908" />
 </TouchableOpacity>
 </View>
 </View>

 {/* 3. CHÂN TRANG FOOTER - Loại bỏ Hotline */}
 <View style={{alignItems: 'center', marginBottom: 10}}>
 <TouchableOpacity activeOpacity={0.6} style={{marginVertical: 10, alignSelf: 'center'}}>
 <Text style={{fontSize: 12, color: '#64748b', fontWeight: '700', letterSpacing: 0.5}}>
 QUÊN MẬT KHẨU?
 </Text>
 </TouchableOpacity>
 </View>

 {/* MODAL CẤU HÌNH SERVER URL */}
 <Modal
 visible={isServerModalOpen}
 animationType="slide"
 transparent={true}
 onRequestClose={() => setIsServerModalOpen(false)}
 >
 <View style={{flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.6)'}}>
 <View style={{backgroundColor: '#ffffff', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, minHeight: '40%', paddingBottom: 32}}>
 <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 12, marginBottom: 16}}>
 <Text style={{fontSize: 18, fontWeight: '900', color: '#1e293b'}}>Cấu hình máy chủ</Text>
 <TouchableOpacity onPress={() => setIsServerModalOpen(false)} style={{padding: 4}}>
 <Ionicons name="close" size={24} color="#64748b" />
 </TouchableOpacity>
 </View>

 <View style={{flex: 1, marginBottom: 24}}>
 <Text style={{fontSize: 10, color: '#64748b', fontWeight: '900', letterSpacing: 0.5, marginBottom: 8}}>
 ĐỊA CHỈ SERVER API (HOST URL)
 </Text>
 <View style={{flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, backgroundColor: '#ffffff', paddingHorizontal: 14, height: 48}}>
 <Ionicons name="link-outline" size={16} color="#fa5908" style={{marginRight: 8}} />
 <TextInput
 placeholder="https://oni.vn"
 placeholderTextColor="#cbd5e1"
 value={customServerUrl}
 onChangeText={setCustomServerUrl}
 autoCapitalize="none"
 style={Platform.OS === 'web' 
 ? ({flex: 1, marginLeft: 10, fontSize: 14, fontWeight: '700', color: '#1e293b', outlineStyle: 'none', borderStyle: 'none', borderWidth: 0, padding: 0} as any)
 : {flex: 1, marginLeft: 10, fontSize: 14, fontWeight: '700', color: '#1e293b', padding: 0}
}
 />
 </View>
 <Text style={{fontSize: 9, color: '#94a3b8', fontWeight: '600', marginTop: 10, lineHeight: 14}}>
 * Mặc định là https://oni.vn. Bạn có thể cấu hình tên miền đám mây hoặc máy chủ cục bộ riêng của doanh nghiệp.
 </Text>
 </View>

 <TouchableOpacity 
 onPress={handleSaveServerUrl}
 style={{
 backgroundColor: '#fa5908', 
 height: 48, 
 borderRadius: 24, 
 alignItems: 'center', 
 justifyContent: 'center', 
 flexDirection: 'row',
 shadowColor: '#fa5908',
 shadowOffset: {width: 0, height: 4},
 shadowOpacity: 0.15,
 shadowRadius: 8,
 elevation: 3
}}
 >
 <Ionicons name="checkmark-circle-outline" size={16} color="white" style={{marginRight: 6}} />
 <Text style={{color: '#ffffff', fontWeight: '900', fontSize: 13, letterSpacing: 0.8}}>Lưu cấu hình</Text>
 </TouchableOpacity>
 </View>
 </View>
 </Modal>

 </SafeAreaView>
 );
}
