import {useEffect, useState} from 'react';
import {ActivityIndicator, View} from 'react-native';
import {useRouter} from 'expo-router';
import {supabase} from '../lib/supabase';

export default function IndexPage() {
 const router = useRouter();
 const [isChecking, setIsChecking] = useState(true);

 useEffect(() => {
 const checkSession = async () => {
 try {
 const {data: {session}} = await supabase.auth.getSession();
 if (session) {
 // Đã có phiên đăng nhập -> Chuyển vào chọn Chi nhánh (Select Branch)
 router.replace('/(auth)/select-branch');
} else {
 // Chưa đăng nhập -> Vào màn hình Login
 router.replace('/(auth)/login');
}
} catch (err) {
 console.error('Lỗi kiểm tra session:', err);
 router.replace('/(auth)/login');
} finally {
 setIsChecking(false);
}
};
 checkSession();
}, []);

 if (isChecking) {
 return (
 <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc'}}>
 <ActivityIndicator size="large" color="#fa5908" />
 </View>
 );
}

 return null;
}
