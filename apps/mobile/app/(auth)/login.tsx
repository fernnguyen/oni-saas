import React, {useState, useEffect} from 'react';
import {Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert, Modal, Platform, Image, Pressable, KeyboardAvoidingView, ScrollView, Linking} from 'react-native';
import {useRouter} from 'expo-router';
import {Ionicons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from '../../lib/supabase';
import {loadApiBaseUrl, saveApiBaseUrl} from '../../lib/api/config';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';


export default function LoginScreen() {
 const router = useRouter();
 const [tenantCode, setTenantCode] = useState('');
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [showPassword, setShowPassword] = useState(false);
 const [isLoading, setIsLoading] = useState(false);
 const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
 const [isTenantCodeSaved, setIsTenantCodeSaved] = useState(false);
 const [isBiometricSaved, setIsBiometricSaved] = useState(false);

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
 setIsTenantCodeSaved(true);
}
 
 const savedEmail = await AsyncStorage.getItem('saved_email');
 if (savedEmail) {
 setEmail(savedEmail);
 setIsBiometricAvailable(true);
}

 // Kiểm tra sinh trắc học đã lưu
 const secureStoreAvailable = await SecureStore.isAvailableAsync();
 if (secureStoreAvailable) {
   const savedBiometricCreds = await SecureStore.getItemAsync('biometric_credentials');
   if (savedBiometricCreds) {
     setIsBiometricSaved(true);
   }
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

 const checkAndOfferBiometrics = async (tenant: string, loginEmail: string, loginPass: string) => {
    try {
      const secureStoreAvailable = await SecureStore.isAvailableAsync();
      if (!secureStoreAvailable) return false;

      // Kiểm tra nếu người dùng đã từ chối trước đó thì không nhắc lại
      const declined = await AsyncStorage.getItem('biometrics_declined');
      if (declined === 'true') {
        return false;
      }

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (hasHardware && isEnrolled) {
        const savedBiometricCreds = await SecureStore.getItemAsync('biometric_credentials');
        let shouldOffer = false;
        let alertTitle = 'Kích hoạt sinh trắc học';
        let alertMsg = 'Bạn có muốn kích hoạt đăng nhập nhanh bằng Vân tay / Face ID cho lần sau không?';

        if (!savedBiometricCreds) {
          shouldOffer = true;
        } else {
          try {
            const creds = JSON.parse(savedBiometricCreds);
            if (creds.tenant !== tenant || creds.email !== loginEmail) {
              shouldOffer = true;
              alertTitle = 'Cập nhật sinh trắc học';
              alertMsg = `Bạn muốn cập nhật đăng nhập sinh trắc học cho tài khoản mới: ${loginEmail} (${tenant})?`;
            }
          } catch (e) {
            shouldOffer = true;
          }
        }

        if (shouldOffer) {
          Alert.alert(
            alertTitle,
            alertMsg,
            [
              {
                text: 'Để sau',
                style: 'cancel',
                onPress: async () => {
                  try {
                    await AsyncStorage.setItem('biometrics_declined', 'true');
                  } catch (e) {}
                  router.push('/(auth)/select-branch');
                }
              },
              {
                text: savedBiometricCreds ? 'Cập nhật' : 'Kích hoạt',
                onPress: async () => {
                  try {
                    const authResult = await LocalAuthentication.authenticateAsync({
                      promptMessage: 'Xác thực để liên kết sinh trắc học',
                    });

                    if (authResult.success) {
                      await SecureStore.setItemAsync(
                        'biometric_credentials',
                        JSON.stringify({ tenant, email: loginEmail, password: loginPass })
                      );
                      setIsBiometricSaved(true);
                      try {
                        await AsyncStorage.removeItem('biometrics_declined');
                      } catch (e) {}
                      Alert.alert('Thành công', 'Đã lưu cấu hình đăng nhập sinh trắc học!', [
                        {
                          text: 'OK',
                          onPress: () => router.push('/(auth)/select-branch')
                        }
                      ]);
                    } else {
                      Alert.alert('Thất bại', 'Xác thực không thành công, vui lòng thử lại sau.', [
                        {
                          text: 'OK',
                          onPress: () => router.push('/(auth)/select-branch')
                        }
                      ]);
                    }
                  } catch (ae) {
                    router.push('/(auth)/select-branch');
                  }
                }
              }
            ]
          );
          return true;
        }
      }
    } catch (err) {
      console.log('Lỗi kiểm tra đề xuất sinh trắc học:', err);
    }
    return false;
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
 setIsTenantCodeSaved(true);

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

 if (data?.user) {
    const fullName = data.user.user_metadata?.full_name || data.user.user_metadata?.name || trimmedEmail.split('@')[0];
    await AsyncStorage.setItem('user_name', fullName);
  }

 Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
 setIsLoading(false);

 // Đề xuất sinh trắc học nếu khả dụng
 const didOffer = await checkAndOfferBiometrics(trimmedTenant, trimmedEmail, password);
 if (!didOffer) {
   router.push('/(auth)/select-branch');
 }
} catch (error: any) {
 console.error('Lỗi khi đăng nhập:', error);
 Alert.alert('Lỗi kết nối', error.message || 'Không thể kết nối đến máy chủ.');
 setIsLoading(false);
}
};

  // 4. Đăng nhập Sinh trắc học thực tế
  const handleBiometricLogin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    
    try {
      const secureStoreAvailable = await SecureStore.isAvailableAsync();
      if (!secureStoreAvailable) {
        Alert.alert('Thông báo', 'Thiết bị hoặc nền tảng không hỗ trợ bảo mật sinh trắc học.');
        return;
      }

      const savedBiometricCreds = await SecureStore.getItemAsync('biometric_credentials');
      if (!savedBiometricCreds) {
        Alert.alert(
          'Xác thực sinh trắc học',
          'Bạn chưa liên kết Sinh trắc học. Vui lòng đăng nhập bằng mật khẩu thủ công một lần để kích hoạt.'
        );
        return;
      }

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware) {
        Alert.alert('Thông báo', 'Thiết bị của bạn không hỗ trợ tính năng bảo mật sinh trắc học.');
        return;
      }
      if (!isEnrolled) {
        Alert.alert('Thông báo', 'Thiết bị chưa được đăng ký Vân tay hoặc Face ID trong Cài đặt hệ thống.');
        return;
      }

      setIsLoading(true);

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Xác thực sinh trắc học để đăng nhập',
        fallbackLabel: 'Nhập mật khẩu thiết bị',
        disableDeviceFallback: false,
      });

      if (result.success) {
        let creds;
        try {
          creds = JSON.parse(savedBiometricCreds);
        } catch (e) {
          setIsLoading(false);
          Alert.alert('Lỗi', 'Dữ liệu đăng nhập sinh trắc học bị hỏng. Vui lòng đăng nhập bằng mật khẩu để liên kết lại.');
          return;
        }

        const { tenant, email: savedEmail, password: savedPassword } = creds;
        
        setTenantCode(tenant);
        setEmail(savedEmail);
        setPassword(savedPassword);
        setIsTenantCodeSaved(true);

        const { data, error } = await supabase.auth.signInWithPassword({
          email: savedEmail.trim(),
          password: savedPassword,
        });

        if (error) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          Alert.alert('Đăng nhập thất bại', 'Thông tin đăng nhập đã lưu không hợp lệ hoặc tài khoản đã bị đổi mật khẩu.');
          setIsLoading(false);
          return;
        }

        if (data?.user) {
          const fullName = data.user.user_metadata?.full_name || data.user.user_metadata?.name || savedEmail.split('@')[0];
          await AsyncStorage.setItem('user_name', fullName);
        }

        await AsyncStorage.setItem('saved_tenant_code', tenant);
        await AsyncStorage.setItem('saved_email', savedEmail);
        await AsyncStorage.setItem('active_tenant_code', tenant);

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setIsLoading(false);
        router.push('/(auth)/select-branch');
      } else {
        setIsLoading(false);
        if (result.error !== 'user_cancel') {
          Alert.alert('Xác thực thất bại', 'Không khớp sinh trắc học hoặc xác thực bị từ chối.');
        }
      }
    } catch (error: any) {
      setIsLoading(false);
      console.error('Lỗi khi đăng nhập sinh trắc học:', error);
      Alert.alert('Lỗi kết nối', error.message || 'Không thể kết nối đến máy chủ.');
    }
  };

 return (
 <SafeAreaView style={{flex: 1, backgroundColor: '#f8fafc', position: 'relative'}}>
 
 {/* Nút Cấu hình Server (Góc phải trên) - Loại bỏ hoàn toàn viền đen bằng thuộc tính border chuẩn */}
 <TouchableOpacity 
 activeOpacity={0.7}
 onPress={() => {
 Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
 setIsServerModalOpen(true);
}}
 style={{
 position: 'absolute', 
 top: 50, 
 right: 24, 
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
 <Ionicons name="settings-outline" size={16} color="#fa5908" />
 </TouchableOpacity>

  <KeyboardAvoidingView 
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    style={{flex: 1}}
  >
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingVertical: 24
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={{flex: 1, justifyContent: 'space-between'}}>
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
 <Text style={{fontSize: 26, fontWeight: '800', color: '#1e293b', letterSpacing: 0.5}}>Oni POS</Text>
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

  {isTenantCodeSaved ? (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{fontSize: 14, color: '#64748b', fontWeight: '600', letterSpacing: 0.5}}>
          Gian hàng
        </Text>
        <TouchableOpacity 
          activeOpacity={0.6} 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setIsTenantCodeSaved(false);
          }}
        >
          <Text style={{ fontSize: 13, color: '#fa5908', fontWeight: '600' }}>
            Thay đổi
          </Text>
        </TouchableOpacity>
      </View>
      <View style={{
        flexDirection: 'row', 
        alignItems: 'center', 
        borderWidth: 1, 
        borderColor: '#e2e8f0', 
        borderRadius: 12, 
        backgroundColor: '#f8fafc', 
        paddingHorizontal: 14, 
        height: 52, 
        marginBottom: 16 
      }}>
        <Ionicons name="storefront-outline" size={16} color="#fa5908" />
        <Text style={{flex: 1, marginLeft: 10, fontSize: 16, fontWeight: '600', color: '#1e293b'}}>
          {tenantCode}.oni.vn
        </Text>
      </View>
    </>
  ) : (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{fontSize: 14, color: '#64748b', fontWeight: '600', letterSpacing: 0.5}}>
          Gian hàng
        </Text>
      </View>
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
    </>
  )}

  {/* Tên Đăng nhập / Email */}
  <Text style={{fontSize: 14, color: '#64748b', fontWeight: '600', letterSpacing: 0.5, marginBottom: 6}}>
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

  {/* Nhãn Mật khẩu & Quên mật khẩu? */}
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
    <Text style={{fontSize: 14, color: '#64748b', fontWeight: '600', letterSpacing: 0.5}}>
      Mật khẩu
    </Text>
    <TouchableOpacity 
      activeOpacity={0.6} 
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        Alert.alert(
          'Quên mật khẩu', 
          `Vui lòng liên hệ chủ Doanh nghiệp ${tenantCode ? `'${tenantCode}'` : 'của bạn'} để được cấp lại mật khẩu.`
        );
      }}
    >
      <Text style={{ fontSize: 13, color: '#fa5908', fontWeight: '600' }}>
        Quên mật khẩu?
      </Text>
    </TouchableOpacity>
  </View>
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

    {/* Chưa có gian hàng? Tạo ngay */}
    <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 8}}>
      <Text style={{fontSize: 14, color: '#64748b', fontWeight: '500'}}>
        Chưa có gian hàng?{' '}
      </Text>
      <TouchableOpacity 
        activeOpacity={0.7} 
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          Linking.openURL('https://oni.vn/register').catch(err => console.error('Không thể mở trang đăng ký:', err));
        }}
      >
        <Text style={{fontSize: 14, color: '#fa5908', fontWeight: '700'}}>
          Tạo ngay
        </Text>
      </TouchableOpacity>
    </View>

    {/* Cộng đồng hỗ trợ Zalo */}
    <TouchableOpacity 
      activeOpacity={0.7} 
      onPress={async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        const webUrl = 'https://zalo.me/g/owlxjd9bqfhocunnrjos';
        const appUrl = 'zalo://qr/g/owlxjd9bqfhocunnrjos';
        try {
          await Linking.openURL(appUrl);
        } catch (err) {
          Linking.openURL(webUrl).catch(webErr => {
            console.error('Không thể mở liên kết Zalo:', webErr);
            Alert.alert('Thông báo', 'Không thể mở liên kết Zalo. Vui lòng truy cập https://zalo.me/g/owlxjd9bqfhocunnrjos bằng trình duyệt.');
          });
        }
      }}
      style={{ 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: '#eff6ff', 
        paddingVertical: 6, 
        paddingHorizontal: 12, 
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#dbeafe',
        marginTop: 6
      }}
    >
      <Text style={{ fontSize: 13, color: '#1e40af', fontWeight: '600', marginRight: 6 }}>
        Cần hỗ trợ?
      </Text>
      <Image 
        source={require('../../assets/zalo.png')} 
        style={{ width: 16, height: 16, borderRadius: 3, marginRight: 4 }} 
      />
      <Text style={{ fontSize: 13, color: '#0068ff', fontWeight: '700' }}>
        Tham gia nhóm Zalo
      </Text>
    </TouchableOpacity>
  </View>

      </View>
    </ScrollView>
  </KeyboardAvoidingView>

  {/* MODAL CẤU HÌNH SERVER URL */}
  <Modal
    visible={isServerModalOpen}
    animationType="fade"
    transparent={true}
    onRequestClose={() => setIsServerModalOpen(false)}
  >
    <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.6)', paddingHorizontal: 24}}>
      <Pressable style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}} onPress={() => setIsServerModalOpen(false)} />
      <View style={{backgroundColor: '#ffffff', borderRadius: 28, padding: 24, width: '100%', maxWidth: 360, shadowColor: '#000', shadowOffset: {width: 0, height: 10}, shadowOpacity: 0.1, shadowRadius: 20, elevation: 5}}>
        
        {/* Header Modal */}
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 14, marginBottom: 16}}>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Ionicons name="settings-outline" size={18} color="#fa5908" style={{marginRight: 8}} />
            <Text style={{fontSize: 16, fontWeight: '700', color: '#1e293b'}}>Cấu hình máy chủ</Text>
          </View>
          <TouchableOpacity onPress={() => setIsServerModalOpen(false)} style={{padding: 4}}>
            <Ionicons name="close" size={20} color="#64748b" />
          </TouchableOpacity>
        </View>

        {/* Thân Modal */}
        <View style={{marginBottom: 20}}>
          <Text style={{fontSize: 10, color: '#64748b', fontWeight: '700', letterSpacing: 0.5, marginBottom: 8}}>
            ĐỊA CHỈ SERVER API (HOST URL)
          </Text>
          <View style={{flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, backgroundColor: '#f8fafc', paddingHorizontal: 12, height: 50}}>
            <Ionicons name="link-outline" size={16} color="#fa5908" style={{marginRight: 8}} />
            <TextInput
              placeholder="https://oni.vn"
              placeholderTextColor="#cbd5e1"
              value={customServerUrl}
              onChangeText={setCustomServerUrl}
              autoCapitalize="none"
              keyboardType="url"
              style={Platform.OS === 'web' 
                ? ({flex: 1, fontSize: 14, fontWeight: '600', color: '#1e293b', outlineStyle: 'none', borderStyle: 'none', borderWidth: 0, padding: 0} as any)
                : {flex: 1, fontSize: 14, fontWeight: '600', color: '#1e293b', padding: 0}
              }
            />
            {customServerUrl !== 'https://oni.vn' && (
              <TouchableOpacity 
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setCustomServerUrl('https://oni.vn');
                }}
                style={{padding: 6, backgroundColor: '#f1f5f9', borderRadius: 8, marginLeft: 6}}
              >
                <Text style={{fontSize: 10, fontWeight: '700', color: '#fa5908'}}>Reset</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={{fontSize: 11, color: '#94a3b8', fontWeight: '500', marginTop: 10, lineHeight: 16}}>
            Mặc định là https://oni.vn. Bạn có thể cấu hình tên miền đám mây hoặc máy chủ cục bộ riêng của doanh nghiệp.
          </Text>
        </View>

        {/* Nút hành động */}
        <View style={{flexDirection: 'row', gap: 10}}>
          <TouchableOpacity 
            onPress={() => setIsServerModalOpen(false)}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              height: 48,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#ffffff'
            }}
          >
            <Text style={{color: '#64748b', fontWeight: '600', fontSize: 14}}>Hủy</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={handleSaveServerUrl}
            style={{
              flex: 1,
              backgroundColor: '#fa5908', 
              height: 48, 
              borderRadius: 14, 
              alignItems: 'center', 
              justifyContent: 'center', 
              shadowColor: '#fa5908',
              shadowOffset: {width: 0, height: 4},
              shadowOpacity: 0.15,
              shadowRadius: 8,
              elevation: 2
            }}
          >
            <Text style={{color: '#ffffff', fontWeight: '600', fontSize: 14}}>Lưu cấu hình</Text>
          </TouchableOpacity>
        </View>

      </View>
    </View>
  </Modal>

 </SafeAreaView>
 );
}
