import {Tabs} from 'expo-router';
import {Ionicons, MaterialCommunityIcons} from '@expo/vector-icons';
import {Platform, TouchableOpacity, View} from 'react-native';

export default function TabLayout() {
 const isDark = false; // Khóa cứng giao diện Sáng theo yêu cầu thương hiệu

 return (
 <Tabs
 screenOptions={{
 headerShown: false,
 tabBarActiveTintColor: '#fa5908', // Màu cam thương hiệu ONI
 tabBarInactiveTintColor: '#94a3b8', // Slate-400
 tabBarStyle: {
 backgroundColor: '#ffffff',
 borderTopColor: '#e2e8f0',
 height: Platform.OS === 'ios' ? 68 : 56, // Chiều cao chuẩn gọn gàng
 paddingBottom: Platform.OS === 'ios' ? 20 : 8,
 paddingTop: 6,
 elevation: 12,
 shadowColor: '#000000',
 shadowOffset: {width: 0, height: -3},
 shadowOpacity: 0.05,
 shadowRadius: 10,
},
 tabBarLabelStyle: {
 fontSize: 10,
 fontWeight: '700',
 marginTop: 2,
},
}}
 >
 {/* 1. TỔNG QUAN */}
 <Tabs.Screen
 name="index"
 options={{
 title: 'Tổng quan',
 tabBarIcon: ({color, focused}) => (
 <Ionicons name={focused ? 'analytics' : 'analytics-outline'} size={22} color={color} />
 ),
}}
 />

 {/* 2. HÓA ĐƠN */}
 <Tabs.Screen
 name="orders"
 options={{
 title: 'Hóa đơn',
 tabBarIcon: ({color, focused}) => (
 <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={22} color={color} />
 ),
}}
 />

 <Tabs.Screen
 name="pos"
 options={{
 title: 'Bán hàng',
 tabBarButton: (props) => {
 const {delayLongPress, children, ...restProps} = props as any;
 return (
 <TouchableOpacity
 {...restProps}
 style={[
 restProps.style,
 {
 justifyContent: 'center',
 alignItems: 'center',
}
 ]}
 activeOpacity={0.85}
 >
 <View
 style={{
 position: 'absolute',
 top: -18, // Chỉ nổi quả bóng cam nhô lên trên thanh nav
 width: 56,
 height: 56,
 borderRadius: 28,
 backgroundColor: '#fa5908', // Màu cam branch
 justifyContent: 'center',
 alignItems: 'center',
 shadowColor: '#fa5908',
 shadowOffset: {width: 0, height: 4},
 shadowOpacity: 0.35,
 shadowRadius: 6,
 elevation: 6,
 borderWidth: 3,
 borderColor: '#ffffff', // Viền trắng phân cách sang trọng
}}
 >
 <MaterialCommunityIcons name="cash-register" size={26} color="white" />
 </View>
 </TouchableOpacity>
 );
},
}}
 />

 {/* 4. KHÁCH HÀNG */}
 <Tabs.Screen
 name="customers"
 options={{
 title: 'Khách hàng',
 tabBarIcon: ({color, focused}) => (
 <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />
 ),
}}
 />

 {/* 5. CÀI ĐẶT */}
 <Tabs.Screen
 name="settings"
 options={{
 title: 'Cài đặt',
 tabBarIcon: ({color, focused}) => (
 <Ionicons name={focused ? 'settings' : 'settings-outline'} size={22} color={color} />
 ),
}}
 />
 </Tabs>
 );
}
