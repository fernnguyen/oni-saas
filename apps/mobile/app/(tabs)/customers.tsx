import React, {useState, useCallback} from 'react';
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
  Linking,
  FlatList,
  TouchableWithoutFeedback,
  Pressable
} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect, useRouter} from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {db, expoDb} from '../../lib/db/client';
import * as schema from '../../lib/db/schema';
import {eq, like, or, and, desc} from 'drizzle-orm';
import {getApiBaseUrl, getApiHeaders} from '../../lib/api/config';
import {Header} from '../../components/layout/Header';
import {DrawerMenu} from '../../components/erp/DrawerMenu';
import * as Clipboard from 'expo-clipboard';
import {formatCurrency, formatDateTime} from '../../lib/utils/format';
import { usePermissions } from '../../lib/auth/PermissionsContext';

const PAYMENT_METHOD_VI: Record<string, string> = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  transfer: 'Chuyển khoản',
  card: 'Quẹt thẻ',
  debit: 'Quẹt thẻ',
  momo: 'Ví MoMo',
  vnpay: 'VNPay',
  zalopay: 'ZaloPay',
  debt: 'Ghi nợ',
  prepaid: 'Ví trả trước',
  wallet: 'Ví điện tử',
};

const translateMethod = (code: string): string => {
  if (!code) return 'Tiền mặt';
  const cleanCode = code.toLowerCase();
  
  if (cleanCode.startsWith('cash') || cleanCode === 'tiền mặt') return 'Tiền mặt';
  if (cleanCode.startsWith('bank_transfer') || cleanCode.startsWith('transfer') || cleanCode === 'chuyển khoản') return 'Chuyển khoản';
  if (cleanCode.startsWith('card') || cleanCode.startsWith('debit') || cleanCode === 'quẹt thẻ') return 'Quẹt thẻ';
  if (cleanCode.startsWith('momo')) return 'Ví MoMo';
  if (cleanCode.startsWith('vnpay')) return 'VNPay';
  if (cleanCode.startsWith('zalopay')) return 'ZaloPay';
  if (cleanCode.startsWith('debt') || cleanCode === 'ghi nợ') return 'Ghi nợ';
  if (cleanCode.startsWith('prepaid') || cleanCode === 'ví trả trước') return 'Ví trả trước';
  if (cleanCode.startsWith('wallet') || cleanCode === 'ví điện tử') return 'Ví điện tử';

  return PAYMENT_METHOD_VI[cleanCode] || code || 'Tiền mặt';
};

const getPaymentMethodDisplay = (pm: string) => {
  if (!pm) return 'Tiền mặt';
  if (pm.startsWith('[') || pm.startsWith('{')) {
    try {
      const parsed = JSON.parse(pm);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((p: any) => translateMethod(p.METHOD || p.method)).join(' + ');
      }
    } catch (e) {
      return 'Thanh toán hỗn hợp';
    }
  }
  return translateMethod(pm);
};

export default function CustomersScreen() {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [branchName, setBranchName] = useState('Tạp hóa Linh Ka');
  const [selectedFilter, setSelectedFilter] = useState('all'); // all, VIP, Thân thiết, Thành viên

  // State thêm khách hàng mới (Đầy đủ trường thông tin giống Web)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustType, setNewCustType] = useState('Thành viên'); // VIP, Thân thiết, Thành viên
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [newCustCreditLimit, setNewCustCreditLimit] = useState('');
  const [newCustNote, setNewCustNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // State phân trang lazy load
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isMoreLoading, setIsMoreLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // State chi tiết khách hàng
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'overview' | 'debt' | 'orders' | 'payments'>('overview');
  const [detailOrders, setDetailOrders] = useState<any[]>([]);
  const [detailTransactions, setDetailTransactions] = useState<any[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isOfflineDetails, setIsOfflineDetails] = useState(false);

  // State hộp thoại xác nhận cuộc gọi
  const [isCallConfirmOpen, setIsCallConfirmOpen] = useState(false);
  const [confirmCallCustomer, setConfirmCallCustomer] = useState<any>(null);

  // Tải dữ liệu khách hàng từ SQLite (Native) hoặc REST API trực tiếp (Web) theo trang
  const loadCustomersData = async (pageNumber = 1, shouldAppend = false) => {
    try {
      if (pageNumber === 1) {
        setIsLoading(true);
      } else {
        setIsMoreLoading(true);
      }

      const activeShopName = await AsyncStorage.getItem('active_shop_name') || 'Tạp hóa Linh Ka';
      setBranchName(activeShopName);
      
      const limit = 20;
      const offset = (pageNumber - 1) * limit;

      let data = [];
      if (Platform.OS === 'web') {
        const headers = await getApiHeaders();
        const url = getApiBaseUrl();
        const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
        
        let apiQuery = `page=${pageNumber}&limit=${limit}`;
        if (searchQuery) apiQuery += `&search=${encodeURIComponent(searchQuery)}`;
        if (selectedFilter !== 'all') apiQuery += `&customer_type=${encodeURIComponent(selectedFilter)}`;

        const res = await fetch(`${url}/api/shops/${shopId}/customers?${apiQuery}`, {headers});
        if (res.ok) {
          const resJson = await res.json();
          data = resJson.data || [];
        }
      } else {
        // Query Drizzle SQLite
        let conditions = [];
        if (searchQuery) {
          conditions.push(
            or(
              like(schema.customers.name, `%${searchQuery}%`),
              like(schema.customers.phone, `%${searchQuery}%`)
            )
          );
        }
        if (selectedFilter !== 'all') {
          conditions.push(eq(schema.customers.customer_type, selectedFilter));
        }

        let baseQuery = db.select().from(schema.customers);
        if (conditions.length > 0) {
          baseQuery = baseQuery.where(and(...conditions));
        }

        data = await baseQuery.limit(limit).offset(offset);
      }

      if (shouldAppend) {
        setCustomersList(prev => {
          const seenIds = new Set(prev.map((c: any) => c.id || c.customer_id));
          const uniqueNewData = data.filter((c: any) => !seenIds.has(c.id || c.customer_id));
          return [...prev, ...uniqueNewData];
        });
      } else {
        setCustomersList(data);
      }

      setHasMore(data.length === limit);
      setPage(pageNumber);
      setIsLoading(false);
      setIsMoreLoading(false);
    } catch (err) {
      console.error('Lỗi tải danh sách khách hàng:', err);
      setIsLoading(false);
      setIsMoreLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadCustomersData(1, false);
    }, [searchQuery, selectedFilter])
  );

  const loadMore = () => {
    if (!hasMore || isMoreLoading || isLoading) return;
    loadCustomersData(page + 1, true);
  };

  // Đồng bộ chủ động toàn bộ danh sách khách hàng từ Server
  const handleSyncCustomersFromServer = async () => {
    try {
      setIsSyncing(true);
      const headers = await getApiHeaders();
      const url = getApiBaseUrl();
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';

      let currentPage = 1;
      let allFetchedCustomers: any[] = [];
      let fetchMore = true;

      // Loop page-by-page to bypass API limits and fetch the entire list
      while (fetchMore) {
        const res = await fetch(`${url}/api/shops/${shopId}/customers?limit=1000&page=${currentPage}`, {headers});
        if (res.ok) {
          const resJson = await res.json();
          const fetchedData = resJson.data || [];
          allFetchedCustomers.push(...fetchedData);
          
          if (fetchedData.length < 1000 || allFetchedCustomers.length >= resJson.total) {
            fetchMore = false;
          } else {
            currentPage++;
          }
        } else {
          throw new Error(`Lỗi kết nối máy chủ khi tải trang ${currentPage}`);
        }
      }

      if (Platform.OS !== 'web') {
        // SQLite: Sync to local database
        // Delete non-pending (already synced) customers to refresh the database state
        await expoDb.execSync("DELETE FROM customers WHERE sync_status != 'pending';");

        // Insert all retrieved customers into local DB
        for (const cust of allFetchedCustomers) {
          const spent = parseInt(cust.total_spent || '0', 10);
          const oCount = parseInt(cust.orders_count || '0', 10);
          const creditLimitVal = parseInt(cust.credit_limit || '0', 10);
          const prepaidVal = parseInt(cust.prepaid_balance || '0', 10);
          const loyaltyPointsVal = parseInt(cust.loyalty_points || '0', 10);
          const debtAmountVal = parseInt(cust.debt_amount || '0', 10);
          await db.insert(schema.customers).values({
            id: cust.id || cust.customer_id,
            name: cust.name || '',
            phone: cust.phone || '',
            email: cust.email || null,
            address: cust.address || null,
            customer_code: cust.customer_code || null,
            customer_type: cust.customer_type || 'Thành viên',
            total_spent: isNaN(spent) ? 0 : spent,
            orders_count: isNaN(oCount) ? 0 : oCount,
            sync_status: 'synced',
            credit_limit: isNaN(creditLimitVal) ? 0 : creditLimitVal,
            note: cust.note || null,
            prepaid_balance: isNaN(prepaidVal) ? 0 : prepaidVal,
            loyalty_points: isNaN(loyaltyPointsVal) ? 0 : loyaltyPointsVal,
            debt_amount: isNaN(debtAmountVal) ? 0 : debtAmountVal,
          }).onConflictDoNothing();
        }
      }

      Alert.alert('Thành công', `Đã đồng bộ và tải về ${allFetchedCustomers.length} khách hàng.`);
      await loadCustomersData(1, false);
    } catch (err: any) {
      console.error('Lỗi đồng bộ khách hàng từ server:', err);
      Alert.alert('Thất bại', 'Không thể đồng bộ: ' + (err.message || 'Kiểm tra lại kết nối mạng.'));
    } finally {
      setIsSyncing(false);
    }
  };

  // Tải chi tiết thông tin (Lịch sử đơn hàng, giao dịch ví) của một khách hàng
  const loadCustomerDetails = async (customer: any) => {
    setIsLoadingDetails(true);
    setIsOfflineDetails(false);
    setDetailOrders([]);
    setDetailTransactions([]);

    try {
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const headers = await getApiHeaders();
      const url = getApiBaseUrl();

      if (Platform.OS === 'web') {
        // 1. Tải thông tin cá nhân mới nhất để cập nhật số dư thực tế
        const profileRes = await fetch(`${url}/api/shops/${shopId}/customers/${customer.id || customer.customer_id}`, {headers});
        if (profileRes.ok) {
          const updatedCustomer = await profileRes.json();
          setSelectedCustomer(updatedCustomer);
        }

        // 2. Lịch sử đơn hàng
        const ordersRes = await fetch(`${url}/api/shops/${shopId}/orders?customer_id=${customer.id || customer.customer_id}&limit=100`, {headers});
        if (ordersRes.ok) {
          const ordersJson = await ordersRes.json();
          setDetailOrders(ordersJson.data || []);
        }

        // 3. Lịch sử giao dịch sổ quỹ
        const txRes = await fetch(`${url}/api/shops/${shopId}/cashbook?reference_id=${customer.id || customer.customer_id}&limit=100&is_virtual=all`, {headers});
        if (txRes.ok) {
          const txJson = await txRes.json();
          setDetailTransactions(txJson.data || []);
        }
      } else {
        // Native SQLite với API first, local fallback
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);

          // 1. Tải thông tin cá nhân mới nhất để cập nhật số dư thực tế
          const profileRes = await fetch(`${url}/api/shops/${shopId}/customers/${customer.id || customer.customer_id}`, {
            headers,
            signal: controller.signal
          });
          if (profileRes.ok) {
            const updatedCustomer = await profileRes.json();
            setSelectedCustomer(updatedCustomer);

            // Tự động đồng bộ ngược lại SQLite nội địa để dữ liệu ngoại tuyến luôn mới nhất
            const spent = parseInt(updatedCustomer.total_spent || '0', 10);
            const oCount = parseInt(updatedCustomer.orders_count || '0', 10);
            const creditLimitVal = parseInt(updatedCustomer.credit_limit || '0', 10);
            const prepaidVal = parseInt(updatedCustomer.prepaid_balance || '0', 10);
            const loyaltyPointsVal = parseInt(updatedCustomer.loyalty_points || '0', 10);
            const debtAmountVal = parseInt(updatedCustomer.debt_amount || '0', 10);

            await db.update(schema.customers)
              .set({
                total_spent: isNaN(spent) ? 0 : spent,
                orders_count: isNaN(oCount) ? 0 : oCount,
                credit_limit: isNaN(creditLimitVal) ? 0 : creditLimitVal,
                note: updatedCustomer.note || null,
                prepaid_balance: isNaN(prepaidVal) ? 0 : prepaidVal,
                loyalty_points: isNaN(loyaltyPointsVal) ? 0 : loyaltyPointsVal,
                debt_amount: isNaN(debtAmountVal) ? 0 : debtAmountVal,
                email: updatedCustomer.email || null,
                address: updatedCustomer.address || null,
                customer_code: updatedCustomer.customer_code || null,
              })
              .where(eq(schema.customers.id, customer.id || customer.customer_id));
          }

          const ordersRes = await fetch(`${url}/api/shops/${shopId}/orders?customer_id=${customer.id || customer.customer_id}&limit=100`, {
            headers,
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (ordersRes.ok) {
            const ordersJson = await ordersRes.json();
            setDetailOrders(ordersJson.data || []);
          } else {
            throw new Error('Server error');
          }

          const txRes = await fetch(`${url}/api/shops/${shopId}/cashbook?reference_id=${customer.id || customer.customer_id}&limit=100&is_virtual=all`, {
            headers
          });
          if (txRes.ok) {
            const txJson = await txRes.json();
            setDetailTransactions(txJson.data || []);
          }
        } catch (netErr) {
          console.warn('Lỗi mạng, chuyển sang tải ngoại tuyến:', netErr);
          setIsOfflineDetails(true);

          // Tải dữ liệu khách hàng ngoại tuyến từ SQLite nội địa
          const localProfile = await db.select()
            .from(schema.customers)
            .where(eq(schema.customers.id, customer.id || customer.customer_id));
          if (localProfile && localProfile.length > 0) {
            setSelectedCustomer(localProfile[0]);
          }

          // Tải danh sách đơn hàng ngoại tuyến từ SQLite
          const localOrders = await db.select()
            .from(schema.orders)
            .where(eq(schema.orders.customer_id, customer.id || customer.customer_id))
            .orderBy(desc(schema.orders.created_at));
          setDetailOrders(localOrders || []);
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải chi tiết khách hàng:', err);
      setIsOfflineDetails(true);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleOpenDetails = async (customer: any) => {
    setSelectedCustomer(customer);
    setActiveDetailTab('overview');
    setIsDetailModalOpen(true);
    await loadCustomerDetails(customer);
  };

  const handlePhoneClick = (customer: any) => {
    setConfirmCallCustomer(customer);
    setIsCallConfirmOpen(true);
  };

  const executePhoneCall = () => {
    if (confirmCallCustomer?.phone) {
      const telUrl = `tel:${confirmCallCustomer.phone}`;
      Linking.canOpenURL(telUrl)
        .then((supported) => {
          if (supported) {
            Linking.openURL(telUrl);
          } else {
            Alert.alert('Thông báo', 'Thiết bị không hỗ trợ tính năng cuộc gọi trực tiếp.');
          }
        })
        .catch((err) => console.error(err));
    }
    setIsCallConfirmOpen(false);
  };

  // Lưu khách hàng mới (Offline-first + Auto cloud sync)
  const handleSaveCustomer = async () => {
    if (!newCustName || !newCustPhone) {
      Alert.alert('Thông báo', 'Vui lòng nhập Tên và Số điện thoại!');
      return;
    }

    setIsSaving(true);
    try {
      const shopId = await AsyncStorage.getItem('active_shop_id') || 'default-shop';
      const custId = `CUST-${Date.now()}`;
      const custCode = `KH-${Date.now().toString().substring(8)}`;
      const limitVal = parseInt(newCustCreditLimit || '0', 10);

      // 1. Ghi nhận offline vào SQLite di động
      await db.insert(schema.customers).values({
        id: custId,
        name: newCustName,
        phone: newCustPhone,
        customer_type: newCustType,
        customer_code: custCode,
        total_spent: 0,
        orders_count: 0,
        sync_status: 'pending', // Đánh dấu chờ đồng bộ đám mây
        email: newCustEmail || null,
        address: newCustAddress || null,
        credit_limit: isNaN(limitVal) ? 0 : limitVal,
        note: newCustNote || null,
      });

      // Reload giao diện tức thì
      await loadCustomersData(1, false);
      setIsAddModalOpen(false);

      // Reset form fields
      setNewCustName('');
      setNewCustPhone('');
      setNewCustType('Thành viên');
      setNewCustEmail('');
      setNewCustAddress('');
      setNewCustCreditLimit('');
      setNewCustNote('');

      Alert.alert('Thành công', 'Đã lưu thông tin khách hàng cục bộ ngoại tuyến.');

      // 2. Gửi đồng bộ lên Next.js Cloud REST API ngay lập tức
      const headers = await getApiHeaders();
      const response = await fetch(`${getApiBaseUrl()}/api/shops/${shopId}/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: newCustName,
          phone: newCustPhone,
          customer_type: newCustType,
          customer_code: custCode,
          email: newCustEmail || `${newCustPhone}@oni-pos.vn`,
          address: newCustAddress || 'Tạo từ ONI Mobile',
          credit_limit: String(isNaN(limitVal) ? 0 : limitVal),
          note: newCustNote || '',
        }),
      });

      if (response.ok) {
        // Cập nhật trạng thái SQLite thành synced
        await db
          .update(schema.customers)
          .set({sync_status: 'synced'})
          .where(eq(schema.customers.id, custId));
        
        await loadCustomersData(1, false);
        console.log(`Đồng bộ khách hàng #${custId} lên Cloud thành công!`);
      }
    } catch (err) {
      console.warn('Lỗi đồng bộ khách hàng mới:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const renderCustomerItem = ({ item: customer }: { item: any }) => {
    const isPending = customer.sync_status === 'pending';
    const avatarChar = customer.name ? customer.name.charAt(0).toUpperCase() : 'K';

    return (
      <TouchableOpacity 
        key={customer.id} 
        className="p-4 bg-white border border-slate-200 rounded-3xl shadow-sm mb-3.5 flex-row justify-between items-center"
        onPress={() => handleOpenDetails(customer)}
      >
        <View className="flex-row items-center flex-1 mr-3">
          <View className="w-11 h-11 rounded-2xl items-center justify-center border-2 mr-3 bg-orange-50 border-orange-200 text-orange-600">
            <Text className="font-medium text-base text-orange-600">{avatarChar}</Text>
          </View>

          <View className="flex-shrink-1">
            <View className="flex-row items-center flex-wrap">
              <Text className="font-medium text-sm text-slate-800 mr-2">
                {customer.name}
              </Text>
              
              <View className="px-1.5 py-0.5 rounded-md border bg-slate-100 border-slate-200">
                <Text className="text-micro font-medium text-slate-500">
                  {customer.customer_type || 'Thành viên'}
                </Text>
              </View>
            </View>
            
            <Text className="text-tiny text-slate-400 font-semibold mt-1">
              📞 {customer.phone || '—'}
            </Text>
          </View>
        </View>

        <View className="items-end">
          <Text className="text-xxs font-medium text-slate-400">Tích lũy</Text>
          <Text className="text-slate-800 font-medium text-xs mt-0.5">
            {formatCurrency(customer.total_spent || 0)}
          </Text>
          
          <View className="flex-row items-center mt-2.5">
            {isPending ? (
              <View className="bg-amber-50 px-2 py-0.5 rounded border border-amber-300 mr-2">
                <Text className="text-micro font-semibold text-amber-700">Offline</Text>
              </View>
            ) : (
              <View className="bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300 mr-2">
                <Text className="text-micro font-semibold text-emerald-700">Đã đồng bộ</Text>
              </View>
            )}

            {customer.phone ? (
              <TouchableOpacity 
                className="w-7 h-7 bg-orange-50 border border-orange-200 rounded-lg items-center justify-center active:bg-orange-100"
                onPress={(e) => {
                  e.stopPropagation();
                  handlePhoneClick(customer);
                }}
              >
                <Ionicons name="call" size={11} color="#fa5908" />
              </TouchableOpacity>
            ) : (
              <Text className="text-slate-400 font-semibold text-xs ml-1.5">—</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50">
      
      {/* 1. SHARED HEADER - Thống nhất 100% */}
      <Header onPressMenu={() => setIsDrawerOpen(true)} />

      {/* 2. SEARCH BAR & FILTER TABS */}
      <View className="p-4 bg-white border-b border-slate-200">
        <View className="flex-row items-center mb-3">
          <View className="flex-1 flex-row items-center bg-slate-100 border border-slate-200 px-3.5 py-2.5 rounded-2xl">
            <Ionicons name="search-outline" size={16} color="#94a3b8" className="mr-2" />
            <TextInput
              placeholder="Tìm theo tên hoặc số điện thoại..."
              placeholderTextColor="#94a3b8"
              className="flex-1 text-slate-800 text-xs font-semibold p-0"
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={{
                paddingVertical: 0,
                textAlignVertical: 'center',
                lineHeight: undefined,
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
              }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity 
            className="w-[36px] h-[36px] bg-white border border-slate-200 rounded-2xl items-center justify-center ml-2.5 active:bg-slate-50 shadow-sm"
            onPress={handleSyncCustomersFromServer}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color="#fa5908" />
            ) : (
              <Ionicons name="sync-outline" size={16} color="#fa5908" />
            )}
          </TouchableOpacity>
        </View>

        {/* Khung lọc theo nhóm khách hàng */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
          <TouchableOpacity
            className="mr-2 px-4 py-2 rounded-xl border"
            style={selectedFilter === 'all' ? {
              backgroundColor: '#fa5908',
              borderColor: '#fa5908',
              ...Platform.select({
                ios: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.1,
                  shadowRadius: 2,
                },
                android: {
                  elevation: 1.5,
                },
              }),
            } : {
              backgroundColor: '#f1f5f9',
              borderColor: '#e2e8f0',
            }}
            onPress={() => setSelectedFilter('all')}
          >
            <Text className={`text-tiny font-medium ${selectedFilter === 'all' ? 'text-white' : 'text-slate-600'}`}>
              Tất cả
            </Text>
          </TouchableOpacity>

          {['VIP', 'Thân thiết', 'Thành viên'].map(tier => (
            <TouchableOpacity
              key={tier}
              className="mr-2 px-4 py-2 rounded-xl border"
              style={selectedFilter === tier ? {
                backgroundColor: '#fa5908',
                borderColor: '#fa5908',
                ...Platform.select({
                  ios: {
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                  },
                  android: {
                    elevation: 1.5,
                  },
                }),
              } : {
                backgroundColor: '#f1f5f9',
                borderColor: '#e2e8f0',
              }}
              onPress={() => setSelectedFilter(tier)}
            >
              <Text className={`text-tiny font-medium ${selectedFilter === tier ? 'text-white' : 'text-slate-600'}`}>
                {tier}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* 3. CUSTOMER LIST */}
      {isLoading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#fa5908" />
          <Text className="text-xs text-slate-450 font-medium mt-2">Đang tải khách hàng...</Text>
        </View>
      ) : (
        <FlatList
          data={customersList}
          keyExtractor={(item, index) => item.id || item.customer_id || index.toString()}
          renderItem={renderCustomerItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16 }}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View className="items-center justify-center py-16 bg-white border border-slate-200 rounded-3xl mt-2">
              <Ionicons name="people-outline" size={48} color="#cbd5e1" />
              <Text className="text-slate-400 font-medium text-xs mt-3">Không tìm thấy khách hàng</Text>
            </View>
          }
          ListFooterComponent={
            isMoreLoading ? (
              <View className="py-4 justify-center items-center">
                <ActivityIndicator size="small" color="#fa5908" />
              </View>
            ) : (
              <View className="h-24" />
            )
          }
        />
      )}

      {/* 4. FLOATING ACTION BUTTON (THÊM KHÁCH HÀNG MỚI) */}
      <TouchableOpacity 
        className="absolute bottom-6 right-6 w-12 h-12 bg-orange-500 active:bg-orange-600 rounded-2xl items-center justify-center shadow-lg shadow-orange-500/20"
        onPress={() => setIsAddModalOpen(true)}
      >
        <Ionicons name="person-add" size={20} color="white" />
      </TouchableOpacity>

      {/* 5. MODAL FORM THÊM KHÁCH HÀNG MỚI (ĐẦY ĐỦ TRƯỜNG THÔNG TIN) */}
      <Modal
        visible={isAddModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsAddModalOpen(false)}
      >
        <View className="flex-1 justify-end">
          <Pressable
            className="absolute inset-0 bg-black/60"
            onPress={() => setIsAddModalOpen(false)}
          />
          <View className="h-[80%] rounded-t-[32px] p-6 justify-between bg-white relative">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-3">
              <Text className="text-lg font-medium text-slate-800">Thêm khách hàng mới</Text>
              <TouchableOpacity onPress={() => setIsAddModalOpen(false)} className="p-1">
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView className="flex-1 my-4" showsVerticalScrollIndicator={false}>
              <Text className="text-xs text-slate-500 font-medium mb-1.5">Tên khách hàng <Text className="text-red-500">*</Text></Text>
              <TextInput
                placeholder="Nguyễn Văn A"
                placeholderTextColor="#cbd5e1"
                className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 mb-4"
                value={newCustName}
                onChangeText={setNewCustName}
                style={{
                  paddingVertical: 0,
                  textAlignVertical: 'center',
                  lineHeight: undefined,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                }}
              />

              <Text className="text-xs text-slate-500 font-medium mb-1.5">Số điện thoại <Text className="text-red-500">*</Text></Text>
              <TextInput
                placeholder="0909xxxxxx"
                placeholderTextColor="#cbd5e1"
                keyboardType="phone-pad"
                className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 mb-4"
                value={newCustPhone}
                onChangeText={setNewCustPhone}
                style={{
                  paddingVertical: 0,
                  textAlignVertical: 'center',
                  lineHeight: undefined,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                }}
              />

              <Text className="text-xs text-slate-500 font-medium mb-1.5">Hạng thành viên</Text>
              <View className="flex-row justify-between mb-4">
                {['Thành viên', 'Thân thiết', 'VIP'].map(tier => (
                  <TouchableOpacity
                    key={tier}
                    className="flex-1 mx-1 py-2.5 rounded-xl border-2 items-center"
                    style={newCustType === tier ? {
                      backgroundColor: '#fff7ed', // bg-orange-50
                      borderColor: '#fa5908', // border-orange-500
                    } : {
                      backgroundColor: '#ffffff', // bg-white
                      borderColor: '#e2e8f0', // border-slate-200
                    }}
                    onPress={() => setNewCustType(tier)}
                  >
                    <Text className={`text-tiny font-semibold ${
                      newCustType === tier ? 'text-orange-500' : 'text-slate-500'
                    }`}>
                      {tier}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text className="text-xs text-slate-500 font-medium mb-1.5">Địa chỉ Email</Text>
              <TextInput
                placeholder="email@example.com"
                placeholderTextColor="#cbd5e1"
                keyboardType="email-address"
                className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 mb-4"
                value={newCustEmail}
                onChangeText={setNewCustEmail}
                style={{
                  paddingVertical: 0,
                  textAlignVertical: 'center',
                  lineHeight: undefined,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                }}
              />

              <Text className="text-xs text-slate-500 font-medium mb-1.5">Địa chỉ nhà</Text>
              <TextInput
                placeholder="Số nhà, đường, phường/xã..."
                placeholderTextColor="#cbd5e1"
                className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 mb-4"
                value={newCustAddress}
                onChangeText={setNewCustAddress}
                style={{
                  paddingVertical: 0,
                  textAlignVertical: 'center',
                  lineHeight: undefined,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                }}
              />

              <Text className="text-xs text-slate-500 font-medium mb-1.5">Hạn mức nợ (đ)</Text>
              <TextInput
                placeholder="0"
                placeholderTextColor="#cbd5e1"
                keyboardType="numeric"
                className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 mb-4"
                value={newCustCreditLimit}
                onChangeText={setNewCustCreditLimit}
                style={{
                  paddingVertical: 0,
                  textAlignVertical: 'center',
                  lineHeight: undefined,
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                }}
              />

              <Text className="text-xs text-slate-500 font-medium mb-1.5">Ghi chú đặc biệt</Text>
              <TextInput
                placeholder="Nhập ghi chú khách hàng..."
                placeholderTextColor="#cbd5e1"
                multiline={true}
                numberOfLines={3}
                className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 mb-4 h-20"
                value={newCustNote}
                onChangeText={setNewCustNote}
                style={{
                  lineHeight: undefined,
                  textAlignVertical: 'top',
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {})
                }}
              />
            </ScrollView>

            <TouchableOpacity 
              className="bg-orange-500 active:bg-orange-600 py-4 rounded-2xl items-center shadow-lg flex-row justify-center mt-2"
              onPress={handleSaveCustomer}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={16} color="white" />
                  <Text className="text-white font-medium text-sm ml-1.5">Lưu khách hàng (Offline & Sync)</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 6. MODAL CHI TIẾT KHÁCH HÀNG */}
      <Modal
        visible={isDetailModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsDetailModalOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <TouchableOpacity 
            className="absolute inset-0" 
            activeOpacity={1} 
            onPress={() => setIsDetailModalOpen(false)} 
          />
          
          <View className="h-[75%] rounded-t-[32px] p-6 bg-white shadow-2xl">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-3">
              <View className="flex-row items-center">
                <View className="w-10 h-10 bg-orange-50 rounded-2xl items-center justify-center border border-orange-200 mr-3">
                  <Text className="font-bold text-orange-600 text-base">
                    {selectedCustomer?.name ? selectedCustomer.name.charAt(0).toUpperCase() : 'K'}
                  </Text>
                </View>
                <View>
                  <Text className="text-base font-bold text-slate-800">{selectedCustomer?.name}</Text>
                  <Text className="text-xxs font-semibold text-slate-400 mt-0.5">
                    Mã: {selectedCustomer?.customer_code || selectedCustomer?.id || '—'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setIsDetailModalOpen(false)} className="p-1">
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Thanh chọn Tabs */}
            <View className="flex-row border-b border-slate-100 my-3">
              {[
                { id: 'overview', label: 'Tổng quan' },
                { id: 'debt', label: 'Ghi nợ' },
                { id: 'orders', label: 'Đơn hàng' },
                { id: 'payments', label: 'Lịch sử trả nợ' }
              ].map(tab => (
                <TouchableOpacity
                  key={tab.id}
                  className="flex-1 pb-2 items-center border-b-2"
                  style={{
                    borderColor: activeDetailTab === tab.id ? '#fa5908' : 'transparent'
                  }}
                  onPress={() => setActiveDetailTab(tab.id as any)}
                >
                  <Text className={`text-xs font-semibold ${
                    activeDetailTab === tab.id ? 'text-orange-500' : 'text-slate-500'
                  }`}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Nội dung Tab */}
            {isLoadingDetails ? (
              <View className="flex-1 justify-center items-center">
                <ActivityIndicator size="large" color="#fa5908" />
                <Text className="text-xs text-slate-450 mt-2 font-medium">Đang tải chi tiết...</Text>
              </View>
            ) : (
              <View className="flex-1">
                {activeDetailTab === 'overview' && (
                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                    {/* Financial Quick Cards - 3 Column Layout */}
                    <View className="flex-row justify-between gap-2.5 mt-2.5">
                      <View 
                        style={{ borderColor: '#dbeafe', backgroundColor: '#eff6ff' }}
                        className="flex-1 rounded-2xl border p-3 items-center justify-center"
                      >
                        <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Điểm tích lũy</Text>
                        <Text className="text-sm font-bold text-blue-600 mt-1">
                          {Number(selectedCustomer?.loyalty_points || 0).toLocaleString('vi-VN')}
                        </Text>
                      </View>
                      
                      <View 
                        style={{ borderColor: '#d1fae5', backgroundColor: '#ecfdf5' }}
                        className="flex-1 rounded-2xl border p-3 items-center justify-center"
                      >
                        <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Ví trả trước</Text>
                        <Text className="text-sm font-bold text-emerald-600 mt-1">
                          {formatCurrency(parseFloat(selectedCustomer?.prepaid_balance || '0'))}
                        </Text>
                      </View>
                      
                      <View 
                        style={{ borderColor: '#fee2e2', backgroundColor: '#fef2f2' }}
                        className="flex-1 rounded-2xl border p-3 items-center justify-center"
                      >
                        <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Nợ hiện tại</Text>
                        <Text className="text-sm font-bold text-red-600 mt-1">
                          {formatCurrency(
                            selectedCustomer?.debt_amount !== undefined 
                              ? parseFloat(selectedCustomer.debt_amount || '0') 
                              : detailOrders.reduce((sum: number, order: any) => {
                                  if (order.status !== 'cancelled') {
                                    return sum + Math.max(0, (order.total_amount || 0) - (order.paid_amount || 0));
                                  }
                                  return sum;
                                }, 0)
                          )}
                        </Text>
                      </View>
                    </View>

                    <View 
                      style={{ borderColor: '#e2e8f0', backgroundColor: '#f8fafc', marginTop: 20 }}
                      className="p-4 rounded-2xl border"
                    >
                      <View className="flex-row justify-between py-2 border-b border-slate-100 items-center">
                        <Text className="text-xs text-slate-450 font-medium">Mã khách hàng</Text>
                        <View className="flex-row items-center">
                          <Text className="text-xs text-slate-800 font-semibold mr-1.5">
                            {selectedCustomer?.customer_code || selectedCustomer?.id || '—'}
                          </Text>
                          {(selectedCustomer?.customer_code || selectedCustomer?.id) && (
                            <TouchableOpacity 
                              onPress={async () => {
                                const code = selectedCustomer?.customer_code || selectedCustomer?.id || selectedCustomer?.customer_id;
                                if (code) {
                                  await Clipboard.setStringAsync(code);
                                  Alert.alert('Đã sao chép', 'Đã sao chép mã khách hàng vào bộ nhớ tạm.');
                                }
                              }}
                              className="p-1 active:opacity-60"
                            >
                              <Ionicons name="copy-outline" size={13} color="#fa5908" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>

                      <View className="flex-row justify-between py-2 border-b border-slate-100 items-center">
                        <Text className="text-xs text-slate-455 font-medium">Hạng thành viên</Text>
                        <View className="px-2 py-0.5 bg-orange-100 rounded-md border border-orange-200">
                          <Text className="text-micro font-bold text-orange-600">
                            {selectedCustomer?.customer_type || 'Thành viên'}
                          </Text>
                        </View>
                      </View>
                      
                      <View className="flex-row justify-between py-2 border-b border-slate-100 items-center">
                        <Text className="text-xs text-slate-455 font-medium">Số điện thoại</Text>
                        <View className="flex-row items-center">
                          <Text className="text-xs text-slate-800 font-semibold mr-2">
                            {selectedCustomer?.phone || '—'}
                          </Text>
                          {selectedCustomer?.phone && (
                            <TouchableOpacity 
                              className="w-7 h-7 bg-orange-50 border border-orange-200 rounded-lg items-center justify-center active:bg-orange-100"
                              onPress={() => handlePhoneClick(selectedCustomer)}
                            >
                              <Ionicons name="call" size={12} color="#fa5908" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                      
                      <View className="flex-row justify-between py-2 border-b border-slate-100">
                        <Text className="text-xs text-slate-455 font-medium">Email</Text>
                        <Text className="text-xs text-slate-800 font-semibold">{selectedCustomer?.email || '—'}</Text>
                      </View>

                      <View className="flex-row justify-between py-2 border-b border-slate-100">
                        <Text className="text-xs text-slate-455 font-medium">Ví trả trước</Text>
                        <Text className="text-xs text-emerald-600 font-bold">
                          {formatCurrency(parseFloat(selectedCustomer?.prepaid_balance || '0'))}
                        </Text>
                      </View>

                      <View className="flex-row justify-between py-2">
                        <Text className="text-xs text-slate-455 font-medium">Số đơn hàng</Text>
                        <Text className="text-xs text-slate-800 font-bold">
                          {selectedCustomer?.orders_count || 0} đơn
                        </Text>
                      </View>
                    </View>

                    {selectedCustomer?.address && (
                      <View 
                        style={{ borderColor: '#e2e8f0', backgroundColor: '#f8fafc', marginTop: 20 }}
                        className="p-4 rounded-2xl border"
                      >
                        <Text className="text-xs text-slate-455 font-medium mb-1.5">Địa chỉ</Text>
                        <Text className="text-xs text-slate-700 font-medium leading-relaxed">
                          {selectedCustomer.address}
                        </Text>
                      </View>
                    )}

                    {selectedCustomer?.note && (
                      <View 
                        style={{ borderColor: '#e2e8f0', backgroundColor: '#f8fafc', marginTop: 20 }}
                        className="p-4 rounded-2xl border"
                      >
                        <Text className="text-xs text-slate-455 font-medium mb-1.5">Ghi chú đặc biệt</Text>
                        <Text className="text-xs text-slate-600 italic leading-relaxed">
                          {selectedCustomer.note}
                        </Text>
                      </View>
                    )}
                  </ScrollView>
                )}

                {activeDetailTab === 'debt' && (
                  <View className="flex-1">
                    <View 
                      style={{ borderColor: '#fee2e2', backgroundColor: '#fef2f2', marginBottom: 16 }}
                      className="p-5 rounded-2xl border items-center mt-1"
                    >
                      <Text className="text-xs text-red-700 font-semibold uppercase tracking-wider mb-1">Nợ cần thu hiện tại</Text>
                      <Text className="text-2xl font-bold text-red-600">
                        {formatCurrency(
                          selectedCustomer?.debt_amount !== undefined 
                            ? parseFloat(selectedCustomer.debt_amount || '0') 
                            : detailOrders.reduce((sum, order) => {
                                if (order.status !== 'cancelled') {
                                  return sum + Math.max(0, (order.total_amount || 0) - (order.paid_amount || 0));
                                }
                                return sum;
                              }, 0)
                        )}
                      </Text>
                    </View>

                    {parseFloat(selectedCustomer?.debt_amount || '0') > 0 && hasPermission('cashbook.manage') && (
                      <TouchableOpacity
                        onPress={() => {
                          setIsDetailModalOpen(false);
                          router.push(`/cashbook?customer_id=${selectedCustomer.id || selectedCustomer.customer_id}`);
                        }}
                        className="bg-orange-500 py-3.5 rounded-2xl items-center shadow-md flex-row justify-center mb-4 active:scale-95"
                        style={{ backgroundColor: '#fa5908' }}
                      >
                        <Ionicons name="wallet-outline" size={16} color="white" />
                        <Text className="text-white font-semibold text-xs ml-2">Thu nợ (Lập phiếu Sổ Quỹ)</Text>
                      </TouchableOpacity>
                    )}

                    <View 
                      style={{ borderColor: '#e2e8f0', backgroundColor: '#f8fafc' }}
                      className="p-4 rounded-2xl border space-y-2"
                    >
                      <View className="flex-row justify-between items-center py-1">
                        <Text className="text-xs text-slate-500 font-semibold">Hạn mức nợ cho phép</Text>
                        <Text className="text-xs text-slate-800 font-bold">
                          {formatCurrency(parseFloat(selectedCustomer?.credit_limit || '0'))}
                        </Text>
                      </View>
                      <View className="flex-row justify-between items-center py-1">
                        <Text className="text-xs text-slate-500 font-semibold">Số dư ví trả trước</Text>
                        <Text className="text-xs text-emerald-600 font-bold">
                          {formatCurrency(parseFloat(selectedCustomer?.prepaid_balance || '0'))}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                {activeDetailTab === 'orders' && (
                  <FlatList
                    data={detailOrders}
                    keyExtractor={(item, index) => item.id || index.toString()}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                      <View className="items-center justify-center py-12">
                        <Ionicons name="document-text-outline" size={36} color="#cbd5e1" />
                        <Text className="text-slate-455 font-medium text-xs mt-2">Chưa có lịch sử mua hàng</Text>
                      </View>
                    }
                    renderItem={({ item: order }) => {
                      const debt = Math.max(0, (order.total_amount || 0) - (order.paid_amount || 0));
                      const orderCode = order.order_no || order.id?.substring(0, 12);
                      return (
                        <View className="p-3 bg-slate-50 border border-slate-200 rounded-2xl mb-2.5">
                          <View className="flex-row justify-between items-center mb-1.5 flex-wrap gap-1">
                            <View className="flex-row items-center flex-shrink-1">
                              <Text className="text-xs font-bold text-slate-800 mr-1.5" numberOfLines={1}>
                                #{orderCode}
                              </Text>
                              <TouchableOpacity 
                                onPress={async () => {
                                  const code = order.order_no || order.id;
                                  if (code) {
                                    await Clipboard.setStringAsync(code);
                                    Alert.alert('Đã sao chép', 'Đã sao chép mã đơn hàng vào bộ nhớ tạm.');
                                  }
                                }}
                                className="p-1 active:opacity-60 bg-slate-200/50 rounded"
                              >
                                <Ionicons name="copy-outline" size={11} color="#fa5908" />
                              </TouchableOpacity>
                            </View>
                            <View className={`px-2 py-0.5 rounded text-micro font-semibold ${
                              order.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                              order.status === 'cancelled' ? 'bg-red-50 text-red-700 border border-red-200' :
                              'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              <Text className="text-micro font-semibold">
                                {order.status === 'completed' ? 'Đã hoàn thành' :
                                 order.status === 'cancelled' ? 'Đã hủy' : 'Chờ duyệt'}
                              </Text>
                            </View>
                          </View>

                          <View className="flex-row justify-between items-center mb-1">
                            <Text className="text-xxs text-slate-400 font-medium">
                              ⏱️ {order.created_at ? formatDateTime(order.created_at) : '—'}
                            </Text>
                            <Text className="text-xs text-slate-800 font-bold">
                              {formatCurrency(order.total_amount || 0)}
                            </Text>
                          </View>

                          <View className="flex-row justify-between items-center mt-1 border-t border-slate-100 pt-1.5 flex-wrap gap-1">
                            <Text className="text-xxs text-slate-500 flex-1 mr-2" numberOfLines={1}>
                              💳 {getPaymentMethodDisplay(order.payment_method)}
                            </Text>
                            {debt > 0 && order.status !== 'cancelled' && (
                              <Text className="text-xxs font-bold text-rose-600">
                                Còn nợ {formatCurrency(debt)}
                              </Text>
                            )}
                          </View>
                        </View>
                      );
                    }}
                  />
                )}

                {activeDetailTab === 'payments' && (
                  <View className="flex-1">
                    {isOfflineDetails && (
                      <View className="bg-amber-50 border border-amber-200 p-3 rounded-2xl mb-3 flex-row items-center">
                        <Ionicons name="warning" size={16} color="#d97706" className="mr-2" />
                        <Text className="text-amber-800 font-semibold text-xs flex-1">
                          Đang ở chế độ ngoại tuyến. Lịch sử trả nợ chỉ xem được khi trực tuyến.
                        </Text>
                      </View>
                    )}
                    
                    <FlatList
                      data={detailTransactions}
                      keyExtractor={(item, index) => item.transaction_id || index.toString()}
                      showsVerticalScrollIndicator={false}
                      ListEmptyComponent={
                        <View className="items-center justify-center py-12">
                          <Ionicons name="receipt-outline" size={36} color="#cbd5e1" />
                          <Text className="text-slate-450 font-medium text-xs mt-2">Chưa có lịch sử thu nợ/giao dịch ví</Text>
                        </View>
                      }
                      renderItem={({ item: tx }) => {
                        const isReceipt = tx.type === 'receipt';
                        const amount = parseFloat(tx.amount || '0');
                        return (
                          <View className="p-3 bg-slate-50 border border-slate-200 rounded-2xl mb-2.5 flex-row justify-between items-center">
                            <View className="flex-1 mr-2">
                              <Text className="text-xs font-bold text-slate-800">
                                {tx.category === 'debt_collection' ? 'Thu nợ khách hàng' :
                                 tx.category === 'prepaid_deposit' ? 'Nạp tiền ví trả trước' : 'Giao dịch khác'}
                              </Text>
                              <Text className="text-xxs text-slate-400 font-medium mt-1">
                                {tx.created_at ? tx.created_at.replace('T', ' ').substring(0, 16) : '—'}
                              </Text>
                              {tx.note && (
                                <Text className="text-micro text-slate-500 italic mt-1 leading-tight">
                                  {tx.note}
                                </Text>
                              )}
                            </View>
                            <View className="items-end">
                              <Text className={`text-xs font-bold ${isReceipt ? 'text-emerald-600' : 'text-red-655'}`}>
                                {isReceipt ? '+' : '-'}{formatCurrency(amount)}
                              </Text>
                              <View className="mt-1.5 px-1.5 py-0.5 bg-slate-200 rounded border border-slate-300">
                                <Text className="text-micro font-semibold text-slate-655">
                                  {tx.method === 'cash' || tx.method?.startsWith('cash-') ? 'Tiền mặt' : 'Chuyển khoản'}
                                </Text>
                              </View>
                            </View>
                          </View>
                        );
                      }}
                    />
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* HỘP THOẠI XÁC NHẬN GỌI ĐIỆN */}
      <Modal
        visible={isCallConfirmOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsCallConfirmOpen(false)}
      >
        <View className="flex-1 justify-center items-center px-6">
          <Pressable
            className="absolute inset-0 bg-black/55"
            onPress={() => setIsCallConfirmOpen(false)}
          />
          <View className="bg-white rounded-3xl p-6 w-full max-w-[320px] shadow-2xl relative">
            <View className="items-center mb-4">
              <View className="w-12 h-12 bg-green-50 rounded-full items-center justify-center mb-3 border border-green-200">
                <Ionicons name="call" size={24} color="#10b981" />
              </View>
              <Text className="text-base font-bold text-slate-800 text-center">Xác nhận cuộc gọi</Text>
              <Text className="text-xs text-slate-500 text-center mt-2.5 leading-relaxed">
                Bạn có chắc chắn muốn gọi điện thoại cho:{"\n"}
                <Text className="font-bold text-slate-800">{confirmCallCustomer?.name}</Text>{"\n"}
                SĐT: <Text className="font-bold text-emerald-600">{confirmCallCustomer?.phone}</Text> ?
              </Text>
            </View>

            <View className="flex-row gap-3">
              <TouchableOpacity 
                className="flex-1 py-3 rounded-xl border border-slate-200 bg-white items-center active:bg-slate-50"
                onPress={() => setIsCallConfirmOpen(false)}
              >
                <Text className="text-slate-655 font-semibold text-sm">Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className="flex-1 py-3 rounded-xl bg-emerald-500 items-center active:bg-emerald-600 shadow-sm"
                onPress={executePhoneCall}
              >
                <Text className="text-white font-semibold text-sm">Gọi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Drawer Hamburger Sidebar */}
      <DrawerMenu 
        visible={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)} 
        branchName={branchName}
      />
    </SafeAreaView>
  );
}
