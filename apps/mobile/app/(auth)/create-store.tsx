import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import {Ionicons} from '@expo/vector-icons';
import {useRouter} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {getApiHeaders, loadApiBaseUrl} from '../../lib/api/config';
import {supabase} from '../../lib/supabase';

const INDUSTRY_TYPES = [
  {id: 'retail', label: 'Bán lẻ & Siêu thị', icon: 'storefront-outline'},
  {id: 'fnb', label: 'Nhà hàng & Cafe', icon: 'cafe-outline'},
  {id: 'billiards', label: 'Billiards & Bi-a', icon: 'ellipse-outline'},
  {id: 'sports_court', label: 'Sân thể thao', icon: 'football-outline'},
  {id: 'lodging', label: 'Khách sạn & Homestay', icon: 'bed-outline'},
  {id: 'fashion', label: 'Thời trang & Phụ kiện', icon: 'shirt-outline'},
  {id: 'service_hourly', label: 'Spa & Dịch vụ', icon: 'sparkles-outline'},
] as const;

const INVITATION_CODE_REGEX = /^[A-Z0-9_-]+$/;

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken';

type PromoDetails = {
  valid: boolean;
  message?: string;
  trial_days?: number | null;
  plan?: {
    code: string;
    name: string;
    price_monthly?: number;
    price_yearly?: number;
  } | null;
};

type RegisteredInfo = {
  tenantId: string;
  slug: string;
  name: string;
  email: string;
  phone: string;
  temporaryPassword: string;
  hasExistingPassword: boolean;
};

type SignedInUser = {
  name: string;
  email: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data.message === 'string'
        ? data.message
        : `Yêu cầu không thành công (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

export default function CreateStoreScreen() {
  const router = useRouter();
  const codeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [industryType, setIndustryType] = useState('retail');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle');
  const [invitationCode, setInvitationCode] = useState('');
  const [promoDetails, setPromoDetails] = useState<PromoDetails | null>(null);
  const [isCheckingCode, setIsCheckingCode] = useState(false);
  const [selectedPlanCode, setSelectedPlanCode] = useState('plan_mini');
  const [signedInUser, setSignedInUser] = useState<SignedInUser | null>(null);
  const [registeredInfo, setRegisteredInfo] = useState<RegisteredInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({data: {user}}) => {
      if (!user) {
        router.replace('/(auth)/login');
        return;
      }
      setSignedInUser({
        name:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split('@')[0] ||
          'Người dùng',
        email: user.email || user.phone || 'Tài khoản social',
      });
    });
  }, [router]);

  useEffect(() => {
    if (
      slug.length < 2 ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(slug)
    ) {
      setSlugStatus('idle');
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSlugStatus('checking');
      try {
        const [baseUrl, headers] = await Promise.all([
          loadApiBaseUrl(),
          getApiHeaders(),
        ]);
        const response = await fetch(
          `${baseUrl}/api/register/check-slug?slug=${encodeURIComponent(slug)}`,
          {headers, signal: controller.signal},
        );
        const data = await readJsonResponse<{available: boolean}>(response);
        setSlugStatus(data.available ? 'available' : 'taken');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setSlugStatus('idle');
        }
      }
    }, 700);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [slug]);

  useEffect(() => {
    const normalizedCode = invitationCode.trim().toUpperCase();
    if (codeDebounceRef.current) {
      clearTimeout(codeDebounceRef.current);
    }

    if (!normalizedCode) {
      setPromoDetails(null);
      setIsCheckingCode(false);
      setSelectedPlanCode('plan_mini');
      return;
    }
    if (normalizedCode.length < 3) {
      setPromoDetails(null);
      setIsCheckingCode(false);
      setSelectedPlanCode('plan_mini');
      return;
    }
    if (!INVITATION_CODE_REGEX.test(normalizedCode)) {
      setPromoDetails({valid: false, message: 'Mã mời không đúng định dạng.'});
      setIsCheckingCode(false);
      setSelectedPlanCode('plan_mini');
      return;
    }

    const controller = new AbortController();
    setIsCheckingCode(true);
    codeDebounceRef.current = setTimeout(async () => {
      try {
        const [baseUrl, headers] = await Promise.all([
          loadApiBaseUrl(),
          getApiHeaders(),
        ]);
        const response = await fetch(
          `${baseUrl}/api/register/check-code?code=${encodeURIComponent(normalizedCode)}`,
          {headers, signal: controller.signal},
        );
        const data = await readJsonResponse<PromoDetails>(response);
        setPromoDetails(data);
        setSelectedPlanCode(data.valid && data.plan?.code ? data.plan.code : 'plan_mini');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setPromoDetails({
            valid: false,
            message: (error as Error).message || 'Không thể kiểm tra mã mời.',
          });
          setSelectedPlanCode('plan_mini');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsCheckingCode(false);
        }
      }
    }, 700);

    return () => {
      if (codeDebounceRef.current) {
        clearTimeout(codeDebounceRef.current);
      }
      controller.abort();
    };
  }, [invitationCode]);

  const handleNameChange = (value: string) => {
    setName(value);
    setSubmitError(null);
    if (!slugManuallyEdited) {
      setSlug(slugify(value));
    }
  };

  const handleSlugChange = (value: string) => {
    setSlug(
      value
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-{2,}/g, '-')
        .replace(/^-+/g, '')
        .slice(0, 50),
    );
    setSlugManuallyEdited(true);
    setSubmitError(null);
  };

  const handleSubmit = async () => {
    if (name.trim().length < 2) {
      setSubmitError('Vui lòng nhập tên gian hàng có ít nhất 2 ký tự.');
      return;
    }
    if (slugStatus !== 'available') {
      setSubmitError('Tên miền chưa sẵn sàng. Vui lòng chọn một tên miền khả dụng.');
      return;
    }
    if (invitationCode && promoDetails?.valid !== true) {
      setSubmitError('Vui lòng kiểm tra lại mã mời hoặc để trống.');
      return;
    }

    setIsLoading(true);
    setSubmitError(null);
    try {
      const [baseUrl, headers] = await Promise.all([
        loadApiBaseUrl(),
        getApiHeaders(),
      ]);
      const response = await fetch(`${baseUrl}/api/register`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          slug,
          name: name.trim(),
          industry_type: industryType,
          invitation_code: invitationCode.trim().toUpperCase(),
          plan_code: selectedPlanCode,
        }),
      });
      const data = await readJsonResponse<{
        tenant_id: string;
        slug: string;
        email: string;
        phone?: string | null;
        phone_login?: string | null;
        temporary_password?: string | null;
        has_existing_password?: boolean;
      }>(response);

      await Promise.all([
        AsyncStorage.setItem('active_tenant_id', data.tenant_id),
        AsyncStorage.setItem('active_tenant_code', data.slug),
        AsyncStorage.removeItem('active_shop_id'),
        AsyncStorage.removeItem('active_shop_name'),
      ]);

      setRegisteredInfo({
        tenantId: data.tenant_id,
        slug: data.slug,
        name: name.trim(),
        email: data.email,
        phone: data.phone_login || data.phone || '',
        temporaryPassword: data.temporary_password || '',
        hasExistingPassword: Boolean(data.has_existing_password),
      });
      setStep(3);
    } catch (error) {
      setSubmitError((error as Error).message || 'Không thể tạo gian hàng lúc này.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinue = () => {
    router.replace('/(auth)/select-branch');
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{paddingHorizontal: 24, paddingVertical: 20, gap: 20}}
        >
          <View className="flex-row items-center justify-between">
            <Pressable
              className="h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white active:bg-slate-100"
              onPress={() => (step === 2 ? setStep(1) : router.back())}
              disabled={isLoading || step === 3}
            >
              <Ionicons
                name={step === 3 ? 'checkmark' : 'arrow-back'}
                size={19}
                color={step === 3 ? '#16a34a' : '#64748b'}
              />
            </Pressable>
            <View className="flex-row items-center gap-2">
              {[1, 2, 3].map(item => (
                <View
                  key={item}
                  className={`h-2 rounded-full ${
                    item <= step ? 'w-7 bg-orange-500' : 'w-2 bg-slate-200'
                  }`}
                />
              ))}
            </View>
          </View>

          <View>
            <View className="mb-4 h-14 w-14 items-center justify-center rounded-3xl bg-orange-100">
              <Ionicons
                name={step === 3 ? 'checkmark-circle' : 'storefront'}
                size={28}
                color={step === 3 ? '#16a34a' : '#fa5908'}
              />
            </View>
            <Text selectable className="text-2xl font-bold text-slate-900">
              {step === 1
                ? 'Tạo gian hàng của bạn'
                : step === 2
                  ? 'Thông tin gian hàng'
                  : 'Gian hàng đã sẵn sàng!'}
            </Text>
            <Text selectable className="mt-2 text-sm font-medium leading-5 text-slate-500">
              {step === 1
                ? 'Chọn mô hình kinh doanh của bạn để ONI thiết lập trải nghiệm phù hợp.'
                : step === 2
                  ? 'Đặt tên gian hàng, chọn đường dẫn truy cập và áp dụng mã ưu đãi nếu có.'
                  : 'Gian hàng đã sẵn sàng. Bạn có thể bắt đầu đồng bộ và vận hành ngay.'}
            </Text>
          </View>

          {signedInUser && step !== 3 && (
            <View className="flex-row items-center rounded-3xl border border-slate-200 bg-white p-4">
              <View className="h-11 w-11 items-center justify-center rounded-2xl bg-orange-50">
                <Ionicons name="person" size={20} color="#fa5908" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Đang đăng nhập với
                </Text>
                <Text selectable className="mt-1 text-sm font-bold text-slate-800">
                  {signedInUser.name}
                </Text>
                <Text selectable numberOfLines={1} className="mt-0.5 text-xs text-slate-500">
                  {signedInUser.email}
                </Text>
              </View>
            </View>
          )}

          {step === 1 && (
            <View className="gap-3">
              <View className="flex-row flex-wrap justify-between gap-y-3">
                {INDUSTRY_TYPES.map(industry => {
                  const isSelected = industryType === industry.id;
                  return (
                    <Pressable
                      key={industry.id}
                      className={`w-[48%] rounded-3xl border-2 p-4 active:opacity-80 ${
                        isSelected
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-slate-200 bg-white'
                      }`}
                      onPress={() => setIndustryType(industry.id)}
                    >
                      <View
                        className={`mb-3 h-10 w-10 items-center justify-center rounded-2xl ${
                          isSelected ? 'bg-orange-500' : 'bg-slate-100'
                        }`}
                      >
                        <Ionicons
                          name={industry.icon}
                          size={20}
                          color={isSelected ? '#ffffff' : '#64748b'}
                        />
                      </View>
                      <Text
                        className={`text-xs font-bold leading-4 ${
                          isSelected ? 'text-orange-700' : 'text-slate-700'
                        }`}
                      >
                        {industry.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable
                className="mt-2 h-14 flex-row items-center justify-center rounded-2xl bg-orange-500 active:bg-orange-600"
                onPress={() => setStep(2)}
              >
                <Text className="mr-2 text-sm font-bold text-white">Tiếp tục</Text>
                <Ionicons name="arrow-forward" size={18} color="#ffffff" />
              </Pressable>
            </View>
          )}

          {step === 2 && (
            <View className="gap-5">
              <View>
                <Text className="mb-2 text-xs font-bold text-slate-700">Tên gian hàng</Text>
                <TextInput
                  value={name}
                  onChangeText={handleNameChange}
                  placeholder="Ví dụ: Cửa hàng thời trang Oni"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="words"
                  className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800"
                />
              </View>

              <View>
                <Text className="mb-2 text-xs font-bold text-slate-700">Đường dẫn truy cập</Text>
                <View
                  className={`h-14 flex-row items-center rounded-2xl border bg-white px-4 ${
                    slugStatus === 'taken' ? 'border-red-400' : 'border-slate-200'
                  }`}
                >
                  <TextInput
                    value={slug}
                    onChangeText={handleSlugChange}
                    placeholder="cua-hang-oni"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="flex-1 text-sm font-semibold text-slate-800"
                  />
                  <Text className="text-xs font-bold text-slate-400">.oni.vn</Text>
                </View>
                <View className="mt-2 min-h-5 flex-row items-center">
                  {slugStatus === 'checking' && (
                    <>
                      <ActivityIndicator size="small" color="#64748b" />
                      <Text className="ml-2 text-xs font-medium text-slate-500">Đang kiểm tra...</Text>
                    </>
                  )}
                  {slugStatus === 'available' && (
                    <>
                      <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                      <Text className="ml-1.5 text-xs font-semibold text-green-600">
                        Tên miền này khả dụng
                      </Text>
                    </>
                  )}
                  {slugStatus === 'taken' && (
                    <>
                      <Ionicons name="close-circle" size={16} color="#ef4444" />
                      <Text className="ml-1.5 text-xs font-semibold text-red-500">
                        Tên miền đã được sử dụng
                      </Text>
                    </>
                  )}
                  {slugStatus === 'idle' && (
                    <Text className="text-xs font-medium text-slate-400">
                      Tối thiểu 2 ký tự, chỉ gồm chữ thường, số và dấu gạch ngang.
                    </Text>
                  )}
                </View>
              </View>

              <View>
                <View className="mb-2 flex-row items-center">
                  <Text className="text-xs font-bold text-slate-700">Mã mời / Mã ưu đãi</Text>
                  <View className="ml-2 rounded-lg bg-slate-100 px-2 py-1">
                    <Text className="text-[9px] font-bold uppercase text-slate-500">Tùy chọn</Text>
                  </View>
                </View>
                <View
                  className={`h-14 flex-row items-center rounded-2xl border bg-white px-4 ${
                    promoDetails?.valid === false
                      ? 'border-red-400'
                      : promoDetails?.valid
                        ? 'border-green-400'
                        : 'border-slate-200'
                  }`}
                >
                  <TextInput
                    value={invitationCode}
                    onChangeText={value =>
                      setInvitationCode(value.toUpperCase().replace(/\s/g, ''))
                    }
                    placeholder="Nhập mã nếu có"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    className="flex-1 text-sm font-semibold text-slate-800"
                  />
                  {isCheckingCode && <ActivityIndicator size="small" color="#64748b" />}
                  {!isCheckingCode && promoDetails?.valid && (
                    <Ionicons name="checkmark-circle" size={19} color="#16a34a" />
                  )}
                </View>
                {promoDetails && (
                  <Text
                    selectable
                    className={`mt-2 text-xs font-semibold ${
                      promoDetails.valid ? 'text-green-600' : 'text-red-500'
                    }`}
                  >
                    {promoDetails.valid
                      ? `${promoDetails.plan ? `Áp dụng gói ${promoDetails.plan.name}` : 'Mã ưu đãi hợp lệ'}${
                          promoDetails.trial_days
                            ? ` · Dùng thử ${promoDetails.trial_days} ngày`
                            : ''
                        }`
                      : promoDetails.message || 'Mã mời không hợp lệ.'}
                  </Text>
                )}
              </View>

              <View className="rounded-3xl border border-orange-200 bg-orange-50 p-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <Ionicons name="shield-checkmark" size={20} color="#fa5908" />
                    <Text className="ml-2 text-sm font-bold text-slate-800">
                      {promoDetails?.valid && promoDetails.plan
                        ? promoDetails.plan.name
                        : 'Tiên phong'}
                    </Text>
                  </View>
                  <View className="rounded-lg bg-orange-500 px-2 py-1">
                    <Text className="text-[9px] font-bold uppercase text-white">
                      {promoDetails?.valid && promoDetails.trial_days
                        ? `${promoDetails.trial_days} ngày`
                        : 'Miễn phí'}
                    </Text>
                  </View>
                </View>
                <Text selectable className="mt-3 text-xs font-medium leading-5 text-orange-800">
                  {promoDetails?.valid
                    ? 'Ưu đãi sẽ được áp dụng ngay khi gian hàng được tạo.'
                    : 'Bắt đầu miễn phí. Bạn có thể nâng cấp gói dịch vụ sau.'}
                </Text>
              </View>

              {submitError && (
                <View className="flex-row rounded-2xl border border-red-200 bg-red-50 p-3.5">
                  <Ionicons name="alert-circle" size={18} color="#ef4444" />
                  <Text selectable className="ml-2 flex-1 text-xs font-semibold leading-5 text-red-600">
                    {submitError}
                  </Text>
                </View>
              )}

              <Pressable
                className={`h-14 flex-row items-center justify-center rounded-2xl ${
                  isLoading || slugStatus !== 'available'
                    ? 'bg-orange-300'
                    : 'bg-orange-500 active:bg-orange-600'
                }`}
                onPress={handleSubmit}
                disabled={isLoading || slugStatus !== 'available'}
              >
                {isLoading ? (
                  <>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text className="ml-2 text-sm font-bold text-white">Đang khởi tạo...</Text>
                  </>
                ) : (
                  <>
                    <Text className="mr-2 text-sm font-bold text-white">Tạo gian hàng</Text>
                    <Ionicons name="sparkles" size={18} color="#ffffff" />
                  </>
                )}
              </Pressable>
            </View>
          )}

          {step === 3 && registeredInfo && (
            <View className="gap-4">
              <View className="rounded-3xl bg-slate-900 p-5">
                <View className="rounded-2xl bg-white/10 p-4">
                  <Text className="text-[10px] font-bold uppercase tracking-wider text-orange-300">
                    Gian hàng mới
                  </Text>
                  <Text selectable className="mt-2 text-xl font-bold text-white">
                    {registeredInfo.name}
                  </Text>
                  <Text selectable className="mt-1 text-sm font-semibold text-slate-300">
                    {registeredInfo.slug}.oni.vn
                  </Text>
                </View>

                <View className="mt-4 gap-3">
                  <View>
                    <Text className="text-[10px] font-bold uppercase text-slate-500">Tài khoản</Text>
                    <Text selectable className="mt-1 text-sm font-semibold text-white">
                      {registeredInfo.phone || registeredInfo.email}
                    </Text>
                  </View>
                  {!!registeredInfo.temporaryPassword && (
                    <View>
                      <Text className="text-[10px] font-bold uppercase text-slate-500">
                        Mật khẩu tạm
                      </Text>
                      <Text selectable className="mt-1 text-2xl font-bold tracking-widest text-orange-300">
                        {registeredInfo.temporaryPassword}
                      </Text>
                    </View>
                  )}
                </View>

                {!!registeredInfo.temporaryPassword && (
                  <Pressable
                    className="mt-4 h-11 flex-row items-center justify-center rounded-2xl bg-white/10 active:bg-white/20"
                    onPress={() =>
                      Clipboard.setStringAsync(
                        [
                          `Gian hàng: ${registeredInfo.name}`,
                          `Tên miền: ${registeredInfo.slug}.oni.vn`,
                          `Tài khoản: ${registeredInfo.phone || registeredInfo.email}`,
                          `Mật khẩu tạm: ${registeredInfo.temporaryPassword}`,
                        ].join('\n'),
                      )
                    }
                  >
                    <Ionicons name="copy-outline" size={17} color="#ffffff" />
                    <Text className="ml-2 text-xs font-bold text-white">Sao chép thông tin</Text>
                  </Pressable>
                )}
              </View>

              <View className="flex-row rounded-2xl border border-amber-200 bg-amber-50 p-3.5">
                <Ionicons name="information-circle" size={19} color="#d97706" />
                <Text selectable className="ml-2 flex-1 text-xs font-medium leading-5 text-amber-800">
                  {registeredInfo.temporaryPassword
                    ? 'Hãy lưu mật khẩu tạm ở nơi an toàn. ONI sẽ không hiển thị lại thông tin này.'
                    : registeredInfo.hasExistingPassword
                      ? 'Mật khẩu hiện tại của tài khoản không thay đổi.'
                      : 'Bạn vẫn có thể tiếp tục đăng nhập bằng tài khoản social hiện tại.'}
                </Text>
              </View>

              <Pressable
                className="h-14 flex-row items-center justify-center rounded-2xl bg-orange-500 active:bg-orange-600"
                onPress={handleContinue}
              >
                <Text className="mr-2 text-sm font-bold text-white">Chọn chi nhánh và bắt đầu</Text>
                <Ionicons name="arrow-forward" size={18} color="#ffffff" />
              </Pressable>
            </View>
          )}

          <Text selectable className="pb-4 text-center text-[11px] font-medium leading-4 text-slate-400">
            Bằng việc tiếp tục, bạn đồng ý với Điều khoản dịch vụ và Chính sách bảo mật của ONI.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
