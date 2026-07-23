import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  Platform,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadApiBaseUrl, getApiHeaders } from '../../lib/api/config';

// ─── Interfaces ─────────────────────────────────────────────────────────────
export interface PlanRow {
  id: number;
  code: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  metadata: Record<string, any>;
}

export interface SubscriptionInfo {
  planCode: string;
  planName: string;
  periodStart?: string;
  periodEnd?: string;
}

type BillingCycle = 'monthly' | 'yearly';

const PLAN_LEVELS: Record<string, number> = {
  plan_mini: 1,
  plan_pro: 2,
  plan_enterprise: 3,
};

const META_DEFAULTS: Record<string, Record<string, any>> = {
  plan_mini: {
    create_shop: 1,
    create_shop_user: 1,
    max_products: 100,
    max_orders_per_month: 300,
    create_connector: 1,
    create_domain: 0,
    tax_report: true,
    qr_table_ordering: false,
    crm: false,
  },
  plan_pro: {
    create_shop: 10,
    create_shop_user: 20,
    max_products: -1,
    max_orders_per_month: -1,
    create_connector: 2,
    create_domain: 3,
    tax_report: true,
    qr_table_ordering: true,
    crm: true,
  },
  plan_enterprise: {
    create_shop: -1,
    create_shop_user: -1,
    max_products: -1,
    max_orders_per_month: -1,
    create_connector: -1,
    create_domain: -1,
    tax_report: true,
    qr_table_ordering: true,
    crm: true,
  },
};

// Client memory cache for plans
let plansCache: PlanRow[] | null = null;

function getPlanMeta(p: PlanRow): Record<string, any> {
  const rawMeta = typeof p.metadata === 'string' ? (JSON.parse(p.metadata) || {}) : (p.metadata || {});
  const defaults = META_DEFAULTS[p.code] || {};
  return { ...defaults, ...rawMeta };
}

function formatVal(val: number | undefined | null): string {
  if (val === undefined || val === null || val === -1) return 'Không giới hạn';
  if (val === 0) return 'Không hỗ trợ';
  return val.toLocaleString('vi-VN');
}

function getPlanLimitsSummary(meta: Record<string, any>, code: string): Record<string, string> {
  const shopStr = formatVal(meta.create_shop);
  const prodStr = formatVal(meta.max_products);
  const orderStr = (meta.max_orders_per_month === -1 || meta.max_orders_per_month === undefined)
    ? 'Không giới hạn'
    : `${meta.max_orders_per_month.toLocaleString('vi-VN')} / tháng`;
  const userStr = formatVal(meta.create_shop_user);

  let dbStr = 'Shared';
  if (meta.create_connector === -1) dbStr = 'Không giới hạn';
  else if (meta.create_connector > 1 || code === 'plan_pro') dbStr = 'BYOD (Riêng tư)';
  else if (code === 'plan_enterprise') dbStr = 'Dedicated CSDL';

  return {
    'Chi nhánh': shopStr,
    'Sản phẩm': prodStr,
    'Đơn hàng': orderStr,
    'Nhân viên': userStr,
    'CSDL': dbStr,
  };
}

function getPlanFeaturesList(meta: Record<string, any>, code: string): string[] {
  const features: string[] = [];

  if (meta.create_shop === -1) features.push('Không giới hạn chi nhánh');
  else features.push(`${meta.create_shop} chi nhánh hoạt động`);

  if (meta.max_products === -1) features.push('Không giới hạn sản phẩm & đơn hàng');
  else features.push(`Tối đa ${meta.max_products.toLocaleString('vi-VN')} sản phẩm`);

  if (meta.max_products !== -1) {
    if (meta.max_orders_per_month === -1) features.push('Không giới hạn đơn hàng / tháng');
    else features.push(`Tối đa ${meta.max_orders_per_month.toLocaleString('vi-VN')} đơn hàng / tháng`);
  }

  if (meta.create_shop_user === -1) features.push('Không giới hạn nhân viên');
  else features.push(`Tối đa ${meta.create_shop_user} nhân viên`);

  if (code === 'plan_mini') {
    features.push('CSDL dùng chung (Shared PostgreSQL)');
    features.push('Báo cáo thuế S1a-HKD (tự động)');
    features.push('Quản lý sổ quỹ, kho, đối tác');
  } else if (code === 'plan_pro') {
    features.push(`Cơ sở dữ liệu riêng (BYOD - ${meta.create_connector ?? 2} Connectors)`);
    if (meta.create_domain) features.push(`Tên miền tùy chỉnh (${meta.create_domain} domains)`);
    if (meta.qr_table_ordering) features.push('QR Table Ordering (đặt bàn tại chỗ)');
    if (meta.crm) features.push('CRM & Thẻ thành viên thông minh');
    features.push('Zalo & Telegram Alerts tự động');
  } else if (code === 'plan_enterprise') {
    features.push('Dedicated PostgreSQL / Supabase BYOD');
    features.push('Custom Notifications & API/Webhooks');
    features.push('SLA cam kết ổn định 99.9%');
    features.push('Onboarding & Đào tạo 1-1');
  }

  return features;
}

export function PlanBadge() {
  const insets = useSafeAreaInsets();
  const [subInfo, setSubInfo] = useState<SubscriptionInfo>({
    planCode: 'plan_mini',
    planName: 'Gói Tiên phong',
  });
  const [tenantSlug, setTenantSlug] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('yearly');

  // Upgrade Guidance Dialog
  const [upgradeTargetPlan, setUpgradeTargetPlan] = useState<PlanRow | null>(null);
  const [copiedToast, setCopiedToast] = useState(false);

  // Load tenant subscription info
  useEffect(() => {
    const loadSub = async () => {
      try {
        const slug = (await AsyncStorage.getItem('active_tenant_code')) || '';
        setTenantSlug(slug);

        const baseUrl = await loadApiBaseUrl();
        const headers = await getApiHeaders();
        const tenantId = (await AsyncStorage.getItem('active_tenant_id')) || '';

        const res = await fetch(`${baseUrl}/api/subscriptions?tenant_id=${tenantId}`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data && data.planCode) {
            setSubInfo({
              planCode: data.planCode,
              planName: data.planName || 'Gói Tiên phong',
              periodStart: data.periodStart,
              periodEnd: data.periodEnd,
            });
          }
        }
      } catch (err) {
        console.warn('[PlanBadge] Lỗi tải thông tin gói cước:', err);
      }
    };
    loadSub();
  }, []);

  // Fetch plan definitions when modal opens
  useEffect(() => {
    if (!isModalOpen) return;
    if (plansCache && plansCache.length > 0) {
      setPlans(plansCache);
      return;
    }

    const fetchPlansData = async () => {
      setLoadingPlans(true);
      try {
        const baseUrl = await loadApiBaseUrl();
        const res = await fetch(`${baseUrl}/api/plans`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            plansCache = data as PlanRow[];
            setPlans(plansCache);
          }
        }
      } catch (err) {
        console.warn('[PlanBadge] Lỗi tải danh sách gói cước:', err);
      } finally {
        setLoadingPlans(false);
      }
    };
    fetchPlansData();
  }, [isModalOpen]);

  // Expiration text
  let durationText = 'Không giới hạn';
  if (subInfo.planCode === 'plan_mini') {
    durationText = 'Vĩnh viễn';
  } else if (subInfo.periodEnd) {
    const end = new Date(subInfo.periodEnd).getTime();
    const now = Date.now();
    const diffMs = end - now;
    if (diffMs > 0) {
      const diffDays = Math.floor(diffMs / (1000 * 3600 * 24));
      const diffHours = Math.floor((diffMs % (1000 * 3600 * 24)) / (1000 * 3600));
      if (diffDays > 0) durationText = `Còn ${diffDays} ngày`;
      else durationText = `Còn ${diffHours} giờ`;
    } else {
      durationText = 'Quá hạn';
    }
  }

  const formatPrice = (price: number) => {
    if (!price || price === 0) return 'Miễn phí';
    if (price >= 1000000) return `${(price / 1000000).toFixed(1).replace('.0', '')}M`;
    if (price >= 1000) return `${price / 1000}K`;
    return price.toString();
  };

  const getPlanPriceText = (p: PlanRow, cycle: BillingCycle) => {
    if (p.code === 'plan_mini') return 'Miễn phí';
    if (p.code === 'plan_enterprise') return 'Liên hệ';
    const price = cycle === 'yearly' ? p.price_yearly : p.price_monthly;
    return formatPrice(price);
  };

  // Construct tenant web portal URL (subdomain e.g. https://shop1.oni.vn)
  const getTenantWebUrl = () => {
    if (tenantSlug) {
      return `https://${tenantSlug}.oni.vn`;
    }
    return 'https://oni.vn';
  };

  const handleOpenWeb = async () => {
    const url = getTenantWebUrl();
    try {
      await Linking.openURL(url);
    } catch (e) {
      console.warn('Không thể mở liên kết web:', e);
    }
  };

  const handleCopyWebUrl = async () => {
    const url = getTenantWebUrl();
    await Clipboard.setStringAsync(url);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2500);
  };

  const isMini = subInfo.planCode === 'plan_mini';
  const isEnterprise = subInfo.planCode === 'plan_enterprise';
  const isPro = subInfo.planCode === 'plan_pro';

  return (
    <View style={{ marginBottom: 12, paddingHorizontal: 4 }}>
      {/* ── Side Drawer Trigger Badge ── */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          setIsModalOpen(true);
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 12,
          borderRadius: 16,
          backgroundColor: isMini ? '#4f46e5' : isPro ? '#f97316' : '#0f172a',
          shadowColor: isPro ? '#f97316' : '#2563eb',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 4,
          elevation: 3,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
            {isEnterprise ? (
              <Ionicons name="diamond" size={15} color="#facc15" />
            ) : isPro ? (
              <MaterialCommunityIcons name="crown" size={16} color="#fef08a" />
            ) : (
              <Ionicons name="flash-outline" size={15} color="#ffffff" />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontWeight: '700', fontSize: 12, color: '#ffffff', marginRight: 6 }} numberOfLines={1}>
                {subInfo.planName}
              </Text>
              {/* <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
                <Text style={{ fontSize: 8, fontWeight: '800', color: '#ffffff' }}>GÓI MẸ</Text>
              </View> */}
            </View>
            <Text style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.8)', fontWeight: '500', marginTop: 2 }} numberOfLines={1}>
              Thời hạn: {durationText}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#ffffff', marginRight: 2 }}>Quản lý</Text>
          <Ionicons name="chevron-forward" size={12} color="white" />
        </View>
      </Pressable>

      {/* ── Mobile Plan Management Modal ── */}
      <Modal
        visible={isModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsModalOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            onPress={() => setIsModalOpen(false)}
          />
          <View
            style={{
              backgroundColor: '#f8fafc',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              overflow: 'hidden',
              height: '90%',
              width: '100%',
              paddingBottom: Math.max(insets.bottom, 16),
            }}
          >
            {/* Header */}
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: isMini ? '#4f46e5' : isPro ? '#f97316' : '#0f172a',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  {isEnterprise ? (
                    <Ionicons name="diamond" size={16} color="#facc15" />
                  ) : isPro ? (
                    <MaterialCommunityIcons name="crown" size={16} color="#fef08a" />
                  ) : (
                    <Ionicons name="flash-outline" size={16} color="#ffffff" />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', fontSize: 14, color: '#ffffff' }}>{subInfo.planName}</Text>
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '500', marginTop: 1 }}>Hạn dùng: {durationText}</Text>
                </View>
              </View>

              <Pressable
                onPress={() => setIsModalOpen(false)}
                style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}
              >
                <Ionicons name="close" size={16} color="white" />
              </Pressable>
            </View>

            {/* Billing Cycle Selector */}
            <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontWeight: '800', fontSize: 14, color: '#0f172a' }}>Gói dịch vụ Oni</Text>
                <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: '500' }}>Bảo lưu thời hạn khi đổi gói</Text>
              </View>

              {/* Cycle Toggle Pill Tabs */}
              <View style={{ flexDirection: 'row', backgroundColor: '#f1f5f9', padding: 4, borderRadius: 999 }}>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setBillingCycle('monthly');
                  }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: billingCycle === 'monthly' ? '#ffffff' : 'transparent',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: billingCycle === 'monthly' ? 0.1 : 0,
                    shadowRadius: 2,
                    elevation: billingCycle === 'monthly' ? 1 : 0,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: billingCycle === 'monthly' ? '#0f172a' : '#64748b' }}>
                    Tháng
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setBillingCycle('yearly');
                  }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: billingCycle === 'yearly' ? '#ffffff' : 'transparent',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: billingCycle === 'yearly' ? 0.1 : 0,
                    shadowRadius: 2,
                    elevation: billingCycle === 'yearly' ? 1 : 0,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: billingCycle === 'yearly' ? '#ea580c' : '#64748b' }}>
                    Năm
                  </Text>
                  <View style={{ marginLeft: 4, backgroundColor: '#dcfce7', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 }}>
                    <Text style={{ fontSize: 8, fontWeight: '900', color: '#15803d' }}>-15%</Text>
                  </View>
                </Pressable>
              </View>
            </View>

            {/* Body: Plans Cards List */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            >
              {loadingPlans ? (
                <View style={{ paddingVertical: 80, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator size="large" color="#f97316" />
                  <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '500', marginTop: 8 }}>Đang tải cấu hình gói...</Text>
                </View>
              ) : (
                plans.map((p) => {
                  const isCurrent = p.code === subInfo.planCode;
                  const isEnterprisePlan = p.code === 'plan_enterprise';
                  const isMiniPlan = p.code === 'plan_mini';
                  const meta = getPlanMeta(p);
                  const limits = getPlanLimitsSummary(meta, p.code);
                  const features = getPlanFeaturesList(meta, p.code);

                  const currentLevel = PLAN_LEVELS[subInfo.planCode] || 1;
                  const targetLevel = PLAN_LEVELS[p.code] || 1;

                  let actionText = 'Nâng cấp ngay';
                  if (isCurrent) {
                    actionText = isMiniPlan ? 'Gói miễn phí vĩnh viễn' : 'Gia hạn gói cước';
                  } else if (isEnterprisePlan) {
                    actionText = 'Tư vấn giải pháp';
                  } else if (targetLevel < currentLevel) {
                    actionText = 'Hạ cấp gói cước';
                  }

                  const priceText = getPlanPriceText(p, billingCycle);
                  const periodText = isMiniPlan || isEnterprisePlan ? '' : billingCycle === 'yearly' ? '/năm' : '/tháng';

                  return (
                    <View
                      key={p.code}
                      style={{
                        backgroundColor: '#ffffff',
                        borderRadius: 24,
                        padding: 20,
                        marginBottom: 16,
                        borderWidth: isCurrent ? 2 : 1,
                        borderColor: isCurrent ? '#f97316' : '#e2e8f0',
                        position: 'relative',
                      }}
                    >
                      {/* Active Plan Check Badge */}
                      {isCurrent && (
                        <View style={{ position: 'absolute', top: 16, right: 16, backgroundColor: '#ffedd5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: '#fed7aa', flexDirection: 'row', alignItems: 'center' }}>
                          <Ionicons name="checkmark-circle" size={12} color="#f97316" />
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#ea580c', marginLeft: 4 }}>ĐANG DÙNG</Text>
                        </View>
                      )}

                      {/* Plan Header & Price */}
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                        {p.code === 'plan_pro' ? 'Phổ biến nhất' : 'Gói dịch vụ'}
                      </Text>
                      <Text style={{ fontSize: 20, fontWeight: '800', color: '#0f172a', marginBottom: 8 }}>{p.name}</Text>

                      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                        <Text style={{ fontSize: 24, fontWeight: '900', color: '#0f172a', marginRight: 4 }}>{priceText}</Text>
                        {periodText ? <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '500' }}>{periodText}</Text> : null}
                      </View>

                      {/* Limit Stats Grid */}
                      <View style={{ backgroundColor: '#f8fafc', borderRadius: 16, padding: 12, marginBottom: 16, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', borderWidth: 1, borderColor: '#f1f5f9' }}>
                        {Object.entries(limits).map(([key, value]) => (
                          <View key={key} style={{ width: '48%', marginBottom: 8 }}>
                            <Text style={{ fontSize: 9, color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' }}>{key}</Text>
                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#334155' }}>{value}</Text>
                          </View>
                        ))}
                      </View>

                      {/* Features List */}
                      <View style={{ marginBottom: 20 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Quyền lợi</Text>
                        {features.map((feat, idx) => (
                          <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                            <Ionicons name="checkmark-circle-outline" size={14} color="#f97316" style={{ marginTop: 1, marginRight: 6 }} />
                            <Text style={{ fontSize: 12, color: '#475569', flex: 1, fontWeight: '500', lineHeight: 18 }}>{feat}</Text>
                          </View>
                        ))}
                      </View>

                      {/* Action Button */}
                      <Pressable
                        disabled={isCurrent && isMiniPlan}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                          setUpgradeTargetPlan(p);
                        }}
                        style={{
                          width: '100%',
                          paddingVertical: 12,
                          borderRadius: 12,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isCurrent && isMiniPlan ? '#f1f5f9' : isCurrent ? '#1e293b' : '#f97316',
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '800', color: isCurrent && isMiniPlan ? '#94a3b8' : '#ffffff' }}>
                          {actionText}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>

        {/* ── Web Purchase Guidance Alert Dialog ── */}
        {upgradeTargetPlan && (
          <Modal
            transparent
            animationType="fade"
            visible={!!upgradeTargetPlan}
            onRequestClose={() => setUpgradeTargetPlan(null)}
          >
            <Pressable
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}
              onPress={() => setUpgradeTargetPlan(null)}
            >
              <Pressable
                style={{ backgroundColor: '#ffffff', width: '100%', maxWidth: 360, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#f1f5f9' }}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#ffedd5' }}>
                    <Ionicons name="globe-outline" size={24} color="#f97316" />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a', textAlign: 'center' }}>
                    Thực hiện nâng cấp trên Website
                  </Text>
                  <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 8, lineHeight: 18 }}>
                    Để nâng cấp gói <Text style={{ fontWeight: '700', color: '#0f172a' }}>{upgradeTargetPlan.name}</Text> và thanh toán VietQR tự động, vui lòng truy cập website gian hàng của bạn:
                  </Text>
                </View>

                {/* Subdomain Display Box */}
                <View style={{ backgroundColor: '#f8fafc', padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 20, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#ea580c' }}>
                    {getTenantWebUrl()}
                  </Text>
                </View>

                {/* Toast Copy */}
                {copiedToast && (
                  <View style={{ backgroundColor: '#10b981', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginBottom: 12, alignItems: 'center' }}>
                    <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>✓ Đã sao chép liên kết gian hàng</Text>
                  </View>
                )}

                {/* Actions */}
                <View>
                  <Pressable
                    onPress={handleOpenWeb}
                    style={{ width: '100%', paddingVertical: 12, backgroundColor: '#f97316', borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginBottom: 8 }}
                  >
                    <Ionicons name="open-outline" size={15} color="white" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>
                      Mở gian hàng ({tenantSlug || 'oni.vn'})
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={handleCopyWebUrl}
                    style={{ width: '100%', paddingVertical: 10, backgroundColor: '#f1f5f9', borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginBottom: 8 }}
                  >
                    <Ionicons name="copy-outline" size={14} color="#64748b" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#334155', fontWeight: '700', fontSize: 12 }}>
                      Sao chép liên kết
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setUpgradeTargetPlan(null)}
                    style={{ width: '100%', paddingVertical: 8, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: '#94a3b8', fontWeight: '600', fontSize: 12 }}>Đóng</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        )}
      </Modal>
    </View>
  );
}
