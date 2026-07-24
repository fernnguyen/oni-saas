import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router, useFocusEffect} from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import {
  getVerticalConfig,
  isValidIndustryType,
  type IndustryType,
} from '@oni/core';
import {Header} from '../components/layout/Header';
import {Dialog} from '../components/ui/Dialog';
import {SingleLineInput} from '../components/ui/single-line-input';
import {ResourceFormModal} from '../components/resources/resource-form-modal';
import {usePermissions} from '../lib/auth/PermissionsContext';
import {
  createLocationResource,
  getResourceShopSettings,
  listLocationResources,
  parseResourceMetadata,
  updateLocationResource,
  type LocationResource,
  type LocationResourcePayload,
  type ResourceStatus,
} from '../lib/api/location-resources';
import {SyncManager} from '../lib/sync/SyncManager';
import {formatCurrency} from '../lib/utils/format';

type FilterStatus = 'active' | 'maintenance' | 'deleted';

type PendingAction = {
  resource: LocationResource;
  status: ResourceStatus;
  title: string;
  description: string;
  confirmLabel: string;
  variant: 'default' | 'danger';
};

const STATUS_PRESENTATION: Record<
  string,
  {label: string; color: string; background: string; icon: keyof typeof Ionicons.glyphMap}
> = {
  available: {
    label: 'Sẵn sàng',
    color: '#059669',
    background: '#ecfdf5',
    icon: 'checkmark-circle',
  },
  occupied: {
    label: 'Đang sử dụng',
    color: '#dc2626',
    background: '#fef2f2',
    icon: 'people',
  },
  reserved: {
    label: 'Đã đặt',
    color: '#7c3aed',
    background: '#f5f3ff',
    icon: 'calendar',
  },
  cleaning: {
    label: 'Đang dọn',
    color: '#2563eb',
    background: '#eff6ff',
    icon: 'sparkles',
  },
  dirty: {
    label: 'Chờ dọn',
    color: '#d97706',
    background: '#fffbeb',
    icon: 'alert-circle',
  },
  maintenance: {
    label: 'Tạm ngừng',
    color: '#64748b',
    background: '#f1f5f9',
    icon: 'construct',
  },
  deleted: {
    label: 'Đã xóa',
    color: '#94a3b8',
    background: '#f8fafc',
    icon: 'trash',
  },
};

function parseSubTypes(
  value: unknown,
  industryType: IndustryType,
): {value: string; label: string}[] {
  try {
    const parsed =
      typeof value === 'string'
        ? JSON.parse(value)
        : value && typeof value === 'object'
          ? value
          : {};
    const custom = (parsed as Record<string, unknown>)[industryType];
    if (!Array.isArray(custom)) return [];
    return custom.filter(
      (item): item is {value: string; label: string} =>
        Boolean(
          item &&
            typeof item === 'object' &&
            typeof item.value === 'string' &&
            typeof item.label === 'string',
        ),
    );
  } catch {
    return [];
  }
}

function getRateSummary(resource: LocationResource): string | null {
  const metadata = parseResourceMetadata(resource.metadata);
  const advanced = metadata.advanced_pricing;
  if (advanced?.enabled) {
    const baseHours = advanced.base_hours || 1;
    const basePrice = advanced.base_price || 0;
    return `Block ${baseHours}h: ${formatCurrency(basePrice)}`;
  }
  const rate = Number(resource.hourly_rate || 0);
  return rate > 0 ? `${formatCurrency(rate)}/giờ` : null;
}

function ResourceCard({
  resource,
  resourceLabel,
  canCreate,
  canEdit,
  canDelete,
  onEdit,
  onDuplicate,
  onAction,
}: {
  resource: LocationResource;
  resourceLabel: string;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (resource: LocationResource) => void;
  onDuplicate: (resource: LocationResource) => void;
  onAction: (action: PendingAction) => void;
}) {
  const metadata = parseResourceMetadata(resource.metadata);
  const status = STATUS_PRESENTATION[resource.status] || STATUS_PRESENTATION.available;
  const rateSummary = getRateSummary(resource);
  const amenities = Array.isArray(metadata.amenities) ? metadata.amenities : [];
  const isBusy =
    resource.status === 'occupied' ||
    resource.status === 'reserved' ||
    Boolean(resource.current_order_id);

  const requestSuspend = () =>
    onAction({
      resource,
      status: 'maintenance',
      title: `Tạm ngừng "${resource.name}"?`,
      description: `${resource.name} sẽ bị ẩn khỏi màn hình POS cho đến khi được khôi phục.`,
      confirmLabel: 'Tạm ngừng',
      variant: 'danger',
    });

  const requestDelete = () =>
    onAction({
      resource,
      status: 'deleted',
      title: `Xóa "${resource.name}"?`,
      description:
        'Dữ liệu lịch sử vẫn được giữ lại. Bạn có thể khôi phục mục này sau.',
      confirmLabel: 'Xóa',
      variant: 'danger',
    });

  const requestRestore = () =>
    onAction({
      resource,
      status: 'available',
      title: `Khôi phục "${resource.name}"?`,
      description: `${resource.name} sẽ xuất hiện trở lại trên màn hình POS.`,
      confirmLabel: 'Khôi phục',
      variant: 'default',
    });

  return (
    <View className="rounded-2xl border border-slate-100 bg-white p-4">
      <View className="flex-row items-start gap-3">
        <View
          className="h-11 w-11 items-center justify-center rounded-xl"
          style={{backgroundColor: status.background}}
        >
          <Ionicons name={status.icon} size={21} color={status.color} />
        </View>
        <View className="flex-1">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1">
              <Text selectable className="text-sm font-bold text-slate-900">
                {resource.name}
              </Text>
              <Text className="mt-0.5 text-xxs text-slate-400">
                {resource.zone || 'Chưa phân vùng'}
                {resource.capacity ? ` • ${resource.capacity} người` : ''}
              </Text>
            </View>
            <View
              className="flex-row items-center rounded-full px-2.5 py-1.5"
              style={{backgroundColor: status.background}}
            >
              <Text
                className="text-micro font-bold"
                style={{color: status.color}}
              >
                {status.label}
              </Text>
            </View>
          </View>

          <View className="mt-3 flex-row flex-wrap gap-2">
            {metadata.sub_type ? (
              <View className="rounded-lg bg-slate-100 px-2 py-1.5">
                <Text className="text-micro font-semibold text-slate-600">
                  {String(metadata.sub_type)}
                </Text>
              </View>
            ) : null}
            {rateSummary ? (
              <View className="rounded-lg bg-orange-50 px-2 py-1.5">
                <Text className="text-micro font-bold text-orange-700">
                  {rateSummary}
                </Text>
              </View>
            ) : null}
            {metadata.overnight_rate ? (
              <View className="rounded-lg bg-indigo-50 px-2 py-1.5">
                <Text className="text-micro font-semibold text-indigo-700">
                  Qua đêm {formatCurrency(Number(metadata.overnight_rate))}
                </Text>
              </View>
            ) : null}
          </View>

          {amenities.length ? (
            <Text
              selectable
              numberOfLines={2}
              className="mt-2 text-xxs leading-4 text-slate-500"
            >
              Tiện nghi: {amenities.join(', ')}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="mt-4 flex-row gap-2 border-t border-slate-100 pt-3">
        {canEdit && resource.status !== 'deleted' ? (
          <TouchableOpacity
            onPress={() => onEdit(resource)}
            className="flex-1 flex-row items-center justify-center rounded-xl bg-orange-50 py-2.5"
          >
            <Ionicons name="create-outline" size={15} color="#ea580c" />
            <Text className="ml-1.5 text-xxs font-bold text-orange-700">Sửa</Text>
          </TouchableOpacity>
        ) : null}
        {canCreate && resource.status !== 'deleted' ? (
          <TouchableOpacity
            onPress={() => onDuplicate(resource)}
            className="flex-1 flex-row items-center justify-center rounded-xl bg-slate-100 py-2.5"
          >
            <Ionicons name="copy-outline" size={15} color="#475569" />
            <Text className="ml-1.5 text-xxs font-bold text-slate-600">Nhân bản</Text>
          </TouchableOpacity>
        ) : null}
        {resource.status === 'maintenance' || resource.status === 'deleted' ? (
          canEdit ? (
            <TouchableOpacity
              onPress={requestRestore}
              className="flex-1 flex-row items-center justify-center rounded-xl bg-emerald-50 py-2.5"
            >
              <Ionicons name="refresh" size={15} color="#059669" />
              <Text className="ml-1.5 text-xxs font-bold text-emerald-700">
                Khôi phục
              </Text>
            </TouchableOpacity>
          ) : null
        ) : !isBusy && canEdit ? (
          <TouchableOpacity
            onPress={requestSuspend}
            className="h-10 w-10 items-center justify-center rounded-xl bg-amber-50"
            accessibilityLabel={`Tạm ngừng ${resourceLabel}`}
          >
            <Ionicons name="pause" size={16} color="#d97706" />
          </TouchableOpacity>
        ) : null}
        {!isBusy && canDelete && resource.status !== 'deleted' ? (
          <TouchableOpacity
            onPress={requestDelete}
            className="h-10 w-10 items-center justify-center rounded-xl bg-red-50"
            accessibilityLabel={`Xóa ${resourceLabel}`}
          >
            <Ionicons name="trash-outline" size={16} color="#dc2626" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export default function ResourceManagementScreen() {
  const {hasPermission} = usePermissions();
  const canCreate = hasPermission('products.create');
  const canEdit = hasPermission('products.edit') || hasPermission('pos.use');
  const canDelete = hasPermission('products.delete');

  const [shopId, setShopId] = useState('');
  const [industryType, setIndustryType] = useState<IndustryType>('retail');
  const [resources, setResources] = useState<LocationResource[]>([]);
  const [customSubTypes, setCustomSubTypes] = useState<
    {value: string; label: string}[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('active');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [formVisible, setFormVisible] = useState(false);
  const [formResource, setFormResource] = useState<LocationResource | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const vertical = useMemo(
    () => getVerticalConfig(industryType),
    [industryType],
  );
  const resourceLabel =
    vertical.resourceTemplate?.label || vertical.resourceLabel || 'Phòng/Bàn';

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' = 'success') => {
      setToast({message, type});
      Haptics.notificationAsync(
        type === 'success'
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error,
      ).catch(() => {});
      Animated.sequence([
        Animated.timing(toastOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.delay(1800),
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(() => setToast(null));
    },
    [toastOpacity],
  );

  const loadData = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);
      setErrorMessage('');

      try {
        const activeShopId = (await AsyncStorage.getItem('active_shop_id')) || '';
        const storedIndustry =
          (await AsyncStorage.getItem('active_shop_industry')) || 'retail';
        const resolvedIndustry = isValidIndustryType(storedIndustry)
          ? storedIndustry
          : 'retail';

        setShopId(activeShopId);
        setIndustryType(resolvedIndustry);

        if (!activeShopId) {
          throw new Error('Chưa chọn chi nhánh làm việc.');
        }

        const [resourceData, settings] = await Promise.all([
          listLocationResources(activeShopId),
          getResourceShopSettings(activeShopId).catch(() => ({resource_sub_types: undefined})),
        ]);

        setResources(resourceData);
        setCustomSubTypes(
          parseSubTypes(settings.resource_sub_types, resolvedIndustry),
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Không thể tải danh sách phòng/bàn.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const zones = useMemo(
    () =>
      Array.from(
        new Set(
          resources
            .filter(resource => resource.status !== 'deleted')
            .map(resource => resource.zone?.trim())
            .filter((zone): zone is string => Boolean(zone)),
        ),
      ).sort((a, b) => a.localeCompare(b, 'vi')),
    [resources],
  );

  const subTypes = useMemo(() => {
    const base = vertical.resourceTemplate?.subTypes || [];
    return Array.from(
      new Map(
        [...base, ...customSubTypes].map(item => [item.value, item]),
      ).values(),
    );
  }, [customSubTypes, vertical]);

  const filteredResources = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLocaleLowerCase('vi');
    return resources
      .filter(resource => {
        if (statusFilter === 'active') {
          if (resource.status === 'maintenance' || resource.status === 'deleted') {
            return false;
          }
        } else if (resource.status !== statusFilter) {
          return false;
        }

        if (zoneFilter !== 'all' && (resource.zone || '') !== zoneFilter) {
          return false;
        }

        if (!normalizedSearch) return true;
        const metadata = parseResourceMetadata(resource.metadata);
        return [
          resource.name,
          resource.zone,
          metadata.sub_type,
          ...(Array.isArray(metadata.amenities) ? metadata.amenities : []),
        ]
          .filter(Boolean)
          .some(value =>
            String(value).toLocaleLowerCase('vi').includes(normalizedSearch),
          );
      })
      .sort((a, b) => {
        const zoneCompare = (a.zone || '').localeCompare(b.zone || '', 'vi');
        if (zoneCompare !== 0) return zoneCompare;
        return Number(a.sort_order || 0) - Number(b.sort_order || 0);
      });
  }, [resources, searchQuery, statusFilter, zoneFilter]);

  const openCreate = () => {
    setFormResource(null);
    setEditingId(null);
    setFormVisible(true);
  };

  const openEdit = (resource: LocationResource) => {
    setFormResource(resource);
    setEditingId(resource.id);
    setFormVisible(true);
  };

  const openDuplicate = (resource: LocationResource) => {
    setFormResource({...resource, name: `${resource.name} (copy)`});
    setEditingId(null);
    setFormVisible(true);
  };

  const handleSave = async (payload: LocationResourcePayload) => {
    if (!shopId) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateLocationResource(shopId, editingId, payload);
        showToast(`Đã cập nhật ${payload.name}`);
      } else {
        await createLocationResource(shopId, payload);
        showToast(`Đã tạo ${payload.name}`);
      }
      setFormVisible(false);
      setFormResource(null);
      setEditingId(null);
      await loadData(true);
      await SyncManager.pullTableLayoutAndActiveOrders(shopId);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Không thể lưu thông tin.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmAction = async () => {
    if (!shopId || !pendingAction) return;
    setActionLoading(true);
    try {
      await updateLocationResource(shopId, pendingAction.resource.id, {
        status: pendingAction.status,
      });
      showToast(
        pendingAction.status === 'deleted'
          ? `Đã xóa ${pendingAction.resource.name}`
          : pendingAction.status === 'maintenance'
            ? `Đã tạm ngừng ${pendingAction.resource.name}`
            : `Đã khôi phục ${pendingAction.resource.name}`,
      );
      setPendingAction(null);
      await loadData(true);
      await SyncManager.pullTableLayoutAndActiveOrders(shopId);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Không thể cập nhật trạng thái.',
        'error',
      );
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50">
        <Header title="Quản lý Phòng/Bàn" showBack onPressBack={() => router.back()} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#fa5908" />
          <Text className="mt-3 text-xs font-medium text-slate-400">
            Đang tải dữ liệu...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!vertical.features.location_resource) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50">
        <Header title="Quản lý Phòng/Bàn" showBack onPressBack={() => router.back()} />
        <View className="flex-1 items-center justify-center px-8">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            <Ionicons name="business-outline" size={28} color="#64748b" />
          </View>
          <Text className="text-center text-base font-bold text-slate-800">
            Ngành hàng chưa dùng phòng/bàn
          </Text>
          <Text className="mt-2 text-center text-xs leading-5 text-slate-500">
            Tính năng này áp dụng cho nhà hàng, lưu trú, bi-a, sân thể thao và
            dịch vụ theo giờ.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <Header
        title={`Quản lý ${resourceLabel}`}
        showBack
        onPressBack={() => router.back()}
      />

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            tintColor="#fa5908"
          />
        }
        contentContainerStyle={{padding: 16, paddingBottom: 120, gap: 14}}
      >
        <View className="rounded-2xl bg-slate-900 p-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-xxs font-semibold uppercase tracking-wider text-slate-400">
                {vertical.label}
              </Text>
              <Text selectable className="mt-1 text-lg font-bold text-white">
                {resources.filter(item => item.status !== 'deleted').length}{' '}
                {resourceLabel.toLowerCase()}
              </Text>
              <Text className="mt-1 text-xxs text-slate-400">
                Giá dịch vụ, block giờ và tiện nghi đồng bộ với POS
              </Text>
            </View>
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Ionicons
                name={industryType === 'lodging' ? 'bed' : 'grid'}
                size={24}
                color="white"
              />
            </View>
          </View>
        </View>

        {errorMessage ? (
          <TouchableOpacity
            onPress={() => loadData()}
            className="rounded-2xl border border-red-200 bg-red-50 p-4"
          >
            <Text selectable className="text-xs font-semibold text-red-700">
              {errorMessage}
            </Text>
            <Text className="mt-1 text-xxs font-medium text-red-500">
              Chạm để thử lại
            </Text>
          </TouchableOpacity>
        ) : null}

        <SingleLineInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={`Tìm ${resourceLabel.toLowerCase()}, khu vực, tiện nghi...`}
          placeholderTextColor="#94a3b8"
          containerClassName="rounded-2xl border border-slate-100 bg-white px-3.5"
          inputClassName="pl-2 text-xs font-medium text-slate-700"
          leading={<Ionicons name="search" size={18} color="#94a3b8" />}
          trailing={
            searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={19} color="#cbd5e1" />
              </TouchableOpacity>
            ) : null
          }
        />

        <View className="flex-row rounded-xl bg-slate-200/70 p-1">
          {(
            [
              ['active', 'Hoạt động'],
              ['maintenance', 'Tạm ngừng'],
              ['deleted', 'Đã xóa'],
            ] as const
          ).map(([value, label]) => {
            const active = statusFilter === value;
            return (
              <TouchableOpacity
                key={value}
                onPress={() => setStatusFilter(value)}
                className={`flex-1 items-center rounded-lg py-2.5 ${
                  active ? 'bg-white' : ''
                }`}
              >
                <Text
                  className={`text-xxs font-bold ${
                    active ? 'text-slate-800' : 'text-slate-500'
                  }`}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {zones.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{gap: 8}}
          >
            {['all', ...zones].map(zone => {
              const active = zoneFilter === zone;
              return (
                <TouchableOpacity
                  key={zone}
                  onPress={() => setZoneFilter(zone)}
                  className={`rounded-full border px-3.5 py-2.5 ${
                    active
                      ? 'border-orange-300 bg-orange-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <Text
                    className={`text-xxs font-bold ${
                      active ? 'text-orange-700' : 'text-slate-600'
                    }`}
                  >
                    {zone === 'all' ? 'Tất cả khu vực' : zone}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        <View className="flex-row items-center justify-between px-1">
          <Text className="text-xs font-bold text-slate-700">
            {filteredResources.length} kết quả
          </Text>
          {statusFilter === 'active' ? (
            <View className="flex-row items-center">
              <View className="mr-1.5 h-2 w-2 rounded-full bg-emerald-500" />
              <Text className="text-xxs font-medium text-slate-400">
                Đồng bộ Cloud
              </Text>
            </View>
          ) : null}
        </View>

        {filteredResources.length ? (
          filteredResources.map(resource => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              resourceLabel={resourceLabel}
              canCreate={canCreate}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={openEdit}
              onDuplicate={openDuplicate}
              onAction={setPendingAction}
            />
          ))
        ) : (
          <View className="items-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12">
            <Ionicons name="file-tray-outline" size={32} color="#cbd5e1" />
            <Text className="mt-3 text-sm font-bold text-slate-700">
              Chưa có {resourceLabel.toLowerCase()}
            </Text>
            <Text className="mt-1 text-center text-xs text-slate-400">
              Thay đổi bộ lọc hoặc tạo mới để bắt đầu quản lý.
            </Text>
          </View>
        )}
      </ScrollView>

      {canCreate ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={openCreate}
          className="absolute bottom-7 right-5 flex-row items-center rounded-2xl bg-orange-500 px-5 py-4"
          style={{
            boxShadow: '0 8px 20px rgba(250, 89, 8, 0.28)',
          }}
        >
          <Ionicons name="add" size={20} color="white" />
          <Text className="ml-2 text-xs font-bold text-white">
            Thêm {resourceLabel}
          </Text>
        </TouchableOpacity>
      ) : null}

      <ResourceFormModal
        visible={formVisible}
        resource={formResource}
        resourceLabel={resourceLabel}
        vertical={vertical}
        existingZones={zones}
        subTypes={subTypes}
        saving={saving}
        onClose={() => {
          if (saving) return;
          setFormVisible(false);
          setFormResource(null);
          setEditingId(null);
        }}
        onSubmit={handleSave}
      />

      <Dialog
        visible={Boolean(pendingAction)}
        onClose={() => {
          if (!actionLoading) setPendingAction(null);
        }}
        onConfirm={confirmAction}
        loading={actionLoading}
        disableOutsideClick
        title={pendingAction?.title || ''}
        description={pendingAction?.description}
        confirmLabel={pendingAction?.confirmLabel}
        cancelLabel="Hủy"
        variant={pendingAction?.variant || 'default'}
      />

      {toast ? (
        <Animated.View
          pointerEvents="none"
          className={`absolute left-5 right-5 flex-row items-center rounded-2xl px-4 py-3.5 ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}
          style={{
            top: 8,
            zIndex: 999999,
            elevation: 9999,
            opacity: toastOpacity,
          }}
        >
          <Ionicons
            name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
            size={18}
            color="white"
          />
          <Text selectable className="ml-2.5 flex-1 text-xs font-bold text-white">
            {toast.message}
          </Text>
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}

