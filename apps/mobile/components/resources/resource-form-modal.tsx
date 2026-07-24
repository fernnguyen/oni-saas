import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {VerticalConfig} from '@oni/core';
import {SingleLineInput} from '../ui/single-line-input';
import {Switch} from '../ui/Switch';
import type {
  LocationResource,
  LocationResourcePayload,
  ResourceMetadata,
} from '../../lib/api/location-resources';
import {parseResourceMetadata} from '../../lib/api/location-resources';

const DEFAULT_AMENITIES = [
  'WiFi',
  'Điều hòa',
  'TV',
  'Tủ lạnh',
  'Nước nóng',
  'Ban công',
  'Bồn tắm',
  'Két sắt',
  'Bãi đỗ xe',
  'Ăn sáng',
];

type SubTypeOption = {value: string; label: string};

type Props = {
  visible: boolean;
  resource?: LocationResource | null;
  resourceLabel: string;
  vertical: VerticalConfig;
  existingZones: string[];
  subTypes: SubTypeOption[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: LocationResourcePayload) => Promise<void>;
};

type ProgressiveRate = {hour: string; rate: string};

const moneyDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const displayMoney = (value: string) =>
  value ? value.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  required,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad';
  required?: boolean;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs font-semibold text-slate-600">
        {label}
        {required ? ' *' : ''}
      </Text>
      <SingleLineInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        keyboardType={keyboardType}
        containerClassName="rounded-xl border border-slate-200 bg-white px-3.5"
        inputClassName="text-xs font-medium text-slate-700"
      />
    </View>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  placeholder = '0',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs font-semibold text-slate-600">{label}</Text>
      <SingleLineInput
        value={displayMoney(value)}
        onChangeText={text => onChange(moneyDigits(text))}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        keyboardType="number-pad"
        containerClassName="rounded-xl border border-slate-200 bg-white px-3.5"
        inputClassName="text-right text-xs font-medium text-slate-700"
        trailing={
          <Text className="ml-2 text-xs font-semibold text-slate-400">₫</Text>
        }
      />
    </View>
  );
}

function ChoiceChips({
  values,
  selected,
  onSelect,
}: {
  values: SubTypeOption[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {values.map(item => {
        const active = selected === item.value;
        return (
          <TouchableOpacity
            key={item.value}
            activeOpacity={0.75}
            onPress={() => onSelect(active ? '' : item.value)}
            className={`rounded-full border px-3 py-2 ${
              active
                ? 'border-orange-300 bg-orange-50'
                : 'border-slate-200 bg-white'
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                active ? 'text-orange-700' : 'text-slate-600'
              }`}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function ResourceFormModal({
  visible,
  resource,
  resourceLabel,
  vertical,
  existingZones,
  subTypes,
  saving,
  onClose,
  onSubmit,
}: Props) {
  const template = vertical.resourceTemplate;
  const sections = template?.sections;

  const [name, setName] = useState('');
  const [zone, setZone] = useState('');
  const [capacity, setCapacity] = useState('');
  const [subType, setSubType] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [advancedEnabled, setAdvancedEnabled] = useState(false);
  const [baseHours, setBaseHours] = useState('1');
  const [basePrice, setBasePrice] = useState('');
  const [nextHourlyRate, setNextHourlyRate] = useState('');
  const [graceMinutes, setGraceMinutes] = useState('0');
  const [progressiveRates, setProgressiveRates] = useState<ProgressiveRate[]>([]);
  const [newProgressiveRate, setNewProgressiveRate] = useState('');
  const [bedType, setBedType] = useState('');
  const [weekendRate, setWeekendRate] = useState('');
  const [overnightRate, setOvernightRate] = useState('');
  const [dailyRate, setDailyRate] = useState('');
  const [overnightGraceHours, setOvernightGraceHours] = useState('0');
  const [dailyGraceHours, setDailyGraceHours] = useState('0');
  const [surchargePct, setSurchargePct] = useState('');
  const [checkinTime, setCheckinTime] = useState('14:00');
  const [checkoutTime, setCheckoutTime] = useState('12:00');
  const [depositAmount, setDepositAmount] = useState('');
  const [extraBedFee, setExtraBedFee] = useState('');
  const [amenities, setAmenities] = useState<string[]>([]);
  const [amenityOptions, setAmenityOptions] = useState(DEFAULT_AMENITIES);
  const [newAmenity, setNewAmenity] = useState('');
  const [validationError, setValidationError] = useState('');
  const [originalMetadata, setOriginalMetadata] = useState<ResourceMetadata>({});

  useEffect(() => {
    if (!visible) return;

    const metadata = parseResourceMetadata(resource?.metadata);
    const advanced = metadata.advanced_pricing || {};
    const rates = Object.entries(advanced.progressive_rates || {})
      .map(([hour, rate]) => ({hour, rate: moneyDigits(rate)}))
      .sort((a, b) => Number(a.hour) - Number(b.hour));
    const savedAmenities = Array.isArray(metadata.amenities)
      ? metadata.amenities.filter((item): item is string => typeof item === 'string')
      : [];

    setOriginalMetadata(metadata);
    setName(resource?.name || '');
    setZone(resource?.zone || '');
    setCapacity(resource?.capacity || '');
    setSubType(String(metadata.sub_type || template?.subTypes?.[0]?.value || ''));
    setHourlyRate(moneyDigits(resource?.hourly_rate));
    setAdvancedEnabled(Boolean(advanced.enabled));
    setBaseHours(String(advanced.base_hours ?? 1));
    setBasePrice(moneyDigits(advanced.base_price));
    setNextHourlyRate(moneyDigits(advanced.next_hourly_rate));
    setGraceMinutes(String(advanced.grace_minutes ?? 0));
    setProgressiveRates(rates);
    setNewProgressiveRate('');
    setBedType(String(metadata.bed_type || ''));
    setWeekendRate(moneyDigits(metadata.weekend_rate));
    setOvernightRate(moneyDigits(metadata.overnight_rate));
    setDailyRate(moneyDigits(metadata.daily_rate));
    setOvernightGraceHours(String(metadata.overnight_grace_hours ?? 0));
    setDailyGraceHours(String(metadata.daily_grace_hours ?? 0));
    setSurchargePct(String(metadata.surcharge_pct ?? ''));
    setCheckinTime(String(metadata.checkin_time || '14:00'));
    setCheckoutTime(String(metadata.checkout_time || '12:00'));
    setDepositAmount(moneyDigits(metadata.deposit_amount));
    setExtraBedFee(moneyDigits(metadata.extra_bed_fee));
    setAmenities(savedAmenities);
    setAmenityOptions(Array.from(new Set([...DEFAULT_AMENITIES, ...savedAmenities])));
    setNewAmenity('');
    setValidationError('');
  }, [resource, template, visible]);

  const nextProgressiveHour = useMemo(() => {
    const currentMax = progressiveRates.reduce(
      (max, item) => Math.max(max, Number(item.hour) || 0),
      Number(baseHours) || 1,
    );
    return currentMax + 1;
  }, [baseHours, progressiveRates]);

  const toggleAmenity = (amenity: string) => {
    setAmenities(current =>
      current.includes(amenity)
        ? current.filter(item => item !== amenity)
        : [...current, amenity],
    );
  };

  const addAmenity = () => {
    const value = newAmenity.trim();
    if (!value) return;
    setAmenityOptions(current => Array.from(new Set([...current, value])));
    setAmenities(current => Array.from(new Set([...current, value])));
    setNewAmenity('');
  };

  const addProgressiveRate = () => {
    if (!newProgressiveRate) return;
    setProgressiveRates(current => [
      ...current,
      {hour: String(nextProgressiveHour), rate: newProgressiveRate},
    ]);
    setNewProgressiveRate('');
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setValidationError(`Tên ${resourceLabel.toLowerCase()} không được để trống.`);
      return;
    }

    const metadata: ResourceMetadata = {...originalMetadata};
    const assignOrDelete = (key: keyof ResourceMetadata, value: unknown) => {
      if (value === '' || value === undefined || value === null) {
        delete metadata[key];
      } else {
        metadata[key] = value as never;
      }
    };

    assignOrDelete('sub_type', subType);
    assignOrDelete('bed_type', bedType);
    assignOrDelete('weekend_rate', weekendRate);
    assignOrDelete('overnight_rate', overnightRate);
    assignOrDelete('daily_rate', dailyRate);
    metadata.overnight_grace_hours = Number(overnightGraceHours) || 0;
    metadata.daily_grace_hours = Number(dailyGraceHours) || 0;
    assignOrDelete('surcharge_pct', surchargePct ? Number(surchargePct) : '');
    assignOrDelete('checkin_time', checkinTime);
    assignOrDelete('checkout_time', checkoutTime);
    assignOrDelete('deposit_amount', depositAmount);
    assignOrDelete('extra_bed_fee', extraBedFee);
    assignOrDelete('amenities', amenities.length ? amenities : '');

    if (advancedEnabled) {
      metadata.advanced_pricing = {
        enabled: true,
        base_hours: Number(baseHours) || 1,
        base_price: Number(basePrice) || 0,
        next_hourly_rate: Number(nextHourlyRate) || 0,
        grace_minutes: Number(graceMinutes) || 0,
        progressive_rates: Object.fromEntries(
          progressiveRates.map(item => [item.hour, Number(item.rate) || 0]),
        ),
      };
    } else {
      metadata.advanced_pricing = {enabled: false};
    }

    setValidationError('');
    await onSubmit({
      name: name.trim(),
      type: (vertical.resourceType || 'table') as LocationResource['type'],
      zone: zone.trim(),
      capacity: capacity.replace(/\D/g, ''),
      hourly_rate: advancedEnabled
        ? nextHourlyRate || basePrice || '0'
        : hourlyRate || '0',
      metadata: JSON.stringify(metadata),
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={saving ? undefined : onClose}
    >
      <SafeAreaView className="flex-1 bg-slate-50">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View className="flex-row items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
            <TouchableOpacity
              onPress={onClose}
              disabled={saving}
              className="h-10 w-10 items-center justify-center rounded-full bg-slate-100"
            >
              <Ionicons name="close" size={22} color="#475569" />
            </TouchableOpacity>
            <View className="flex-1 px-3">
              <Text className="text-center text-sm font-bold text-slate-900">
                {resource ? `Sửa ${resourceLabel}` : `Thêm ${resourceLabel}`}
              </Text>
              <Text className="text-center text-xxs text-slate-400">
                Thông tin, giá dịch vụ và tiện nghi
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={saving}
              className="h-10 min-w-16 items-center justify-center rounded-xl bg-orange-500 px-3"
            >
              {saving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-xs font-bold text-white">Lưu</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{padding: 16, paddingBottom: 48, gap: 16}}
          >
            {validationError ? (
              <View className="rounded-xl border border-red-200 bg-red-50 p-3">
                <Text selectable className="text-xs font-semibold text-red-700">
                  {validationError}
                </Text>
              </View>
            ) : null}

            <View className="gap-4 rounded-2xl border border-slate-100 bg-white p-4">
              <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Thông tin cơ bản
              </Text>
              <Field
                label={`Tên ${resourceLabel}`}
                value={name}
                onChangeText={setName}
                placeholder={`Ví dụ: ${resourceLabel} 101`}
                required
              />

              {subTypes.length ? (
                <View className="gap-2">
                  <Text className="text-xs font-semibold text-slate-600">
                    Hạng {resourceLabel.toLowerCase()}
                  </Text>
                  <ChoiceChips
                    values={subTypes}
                    selected={subType}
                    onSelect={setSubType}
                  />
                </View>
              ) : null}

              <Field
                label="Sức chứa"
                value={capacity}
                onChangeText={text => setCapacity(text.replace(/\D/g, ''))}
                placeholder="Số người"
                keyboardType="number-pad"
              />

              <Field
                label="Khu vực / Tầng"
                value={zone}
                onChangeText={setZone}
                placeholder="Ví dụ: Tầng 2"
              />
              {existingZones.length ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{gap: 8}}
                >
                  {existingZones.map(item => (
                    <Pressable
                      key={item}
                      onPress={() => setZone(item)}
                      className={`rounded-full border px-3 py-2 ${
                        zone === item
                          ? 'border-orange-300 bg-orange-50'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <Text className="text-xxs font-semibold text-slate-600">
                        {item}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
            </View>

            {vertical.features.hourly_billing ? (
              <View className="gap-4 rounded-2xl border border-slate-100 bg-white p-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-4">
                    <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Giá dịch vụ theo giờ
                    </Text>
                    <Text className="mt-1 text-xxs text-slate-500">
                      Bật block giờ đầu, ân hạn và giá lũy tiến
                    </Text>
                  </View>
                  <Switch
                    value={advancedEnabled}
                    onValueChange={setAdvancedEnabled}
                  />
                </View>

                {!advancedEnabled ? (
                  <MoneyField
                    label="Giá theo giờ"
                    value={hourlyRate}
                    onChange={setHourlyRate}
                  />
                ) : (
                  <View className="gap-4 rounded-xl border border-orange-100 bg-orange-50/40 p-3">
                    <View className="flex-row gap-3">
                      <View className="flex-1">
                        <Field
                          label="Block giờ đầu"
                          value={baseHours}
                          onChangeText={text => setBaseHours(text.replace(/\D/g, ''))}
                          keyboardType="number-pad"
                          placeholder="1"
                        />
                      </View>
                      <View className="flex-1">
                        <MoneyField
                          label="Giá block đầu"
                          value={basePrice}
                          onChange={setBasePrice}
                        />
                      </View>
                    </View>
                    <View className="flex-row gap-3">
                      <View className="flex-1">
                        <MoneyField
                          label="Giá giờ sau"
                          value={nextHourlyRate}
                          onChange={setNextHourlyRate}
                        />
                      </View>
                      <View className="flex-1">
                        <Field
                          label="Ân hạn (phút)"
                          value={graceMinutes}
                          onChangeText={text =>
                            setGraceMinutes(text.replace(/\D/g, ''))
                          }
                          keyboardType="number-pad"
                          placeholder="0"
                        />
                      </View>
                    </View>

                    <View className="gap-2 border-t border-orange-100 pt-3">
                      <Text className="text-xs font-semibold text-slate-700">
                        Bảng giá lũy tiến
                      </Text>
                      {progressiveRates.map(item => (
                        <View
                          key={item.hour}
                          className="flex-row items-center justify-between rounded-lg bg-white px-3 py-2"
                        >
                          <Text className="text-xs font-medium text-slate-600">
                            Giờ {item.hour}: {displayMoney(item.rate)} ₫
                          </Text>
                          <TouchableOpacity
                            onPress={() =>
                              setProgressiveRates(current =>
                                current.filter(rate => rate.hour !== item.hour),
                              )
                            }
                          >
                            <Ionicons
                              name="close-circle"
                              size={20}
                              color="#ef4444"
                            />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <View className="flex-row items-end gap-2">
                        <View className="flex-1">
                          <MoneyField
                            label={`Giá giờ thứ ${nextProgressiveHour}`}
                            value={newProgressiveRate}
                            onChange={setNewProgressiveRate}
                          />
                        </View>
                        <TouchableOpacity
                          onPress={addProgressiveRate}
                          className="mb-0.5 h-11 items-center justify-center rounded-xl bg-slate-800 px-4"
                        >
                          <Text className="text-xs font-bold text-white">Thêm</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            ) : null}

            {sections?.bedType ||
            sections?.overnightRate ||
            sections?.depositAmount ||
            sections?.expectedReturn ? (
              <View className="gap-4 rounded-2xl border border-slate-100 bg-white p-4">
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Thiết lập lưu trú
                </Text>

                {sections?.bedType ? (
                  <View className="gap-2">
                    <Text className="text-xs font-semibold text-slate-600">
                      Loại giường
                    </Text>
                    <ChoiceChips
                      values={[
                        {value: 'single', label: 'Đơn'},
                        {value: 'double', label: 'Đôi'},
                        {value: 'twin', label: 'Twin'},
                        {value: 'king', label: 'King'},
                      ]}
                      selected={bedType}
                      onSelect={setBedType}
                    />
                  </View>
                ) : null}

                {sections?.overnightRate ? (
                  <>
                    <View className="flex-row gap-3">
                      <View className="flex-1">
                        <MoneyField
                          label="Giá qua đêm"
                          value={overnightRate}
                          onChange={setOvernightRate}
                        />
                      </View>
                      <View className="flex-1">
                        <Field
                          label="Ân hạn đêm (giờ)"
                          value={overnightGraceHours}
                          onChangeText={text =>
                            setOvernightGraceHours(text.replace(/\D/g, ''))
                          }
                          keyboardType="number-pad"
                        />
                      </View>
                    </View>
                    <View className="flex-row gap-3">
                      <View className="flex-1">
                        <MoneyField
                          label="Giá theo ngày"
                          value={dailyRate}
                          onChange={setDailyRate}
                        />
                      </View>
                      <View className="flex-1">
                        <Field
                          label="Ân hạn ngày (giờ)"
                          value={dailyGraceHours}
                          onChangeText={text =>
                            setDailyGraceHours(text.replace(/\D/g, ''))
                          }
                          keyboardType="number-pad"
                        />
                      </View>
                    </View>
                    <View className="flex-row gap-3">
                      <View className="flex-1">
                        <MoneyField
                          label="Giá cuối tuần"
                          value={weekendRate}
                          onChange={setWeekendRate}
                        />
                      </View>
                      <View className="flex-1">
                        <Field
                          label="Phụ thu (%)"
                          value={surchargePct}
                          onChangeText={text =>
                            setSurchargePct(text.replace(/\D/g, ''))
                          }
                          keyboardType="number-pad"
                        />
                      </View>
                    </View>
                  </>
                ) : null}

                {sections?.depositAmount ? (
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <MoneyField
                        label="Tiền đặt cọc"
                        value={depositAmount}
                        onChange={setDepositAmount}
                      />
                    </View>
                    <View className="flex-1">
                      <MoneyField
                        label="Phí giường phụ"
                        value={extraBedFee}
                        onChange={setExtraBedFee}
                      />
                    </View>
                  </View>
                ) : null}

                {sections?.expectedReturn ? (
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Field
                        label="Giờ nhận phòng"
                        value={checkinTime}
                        onChangeText={setCheckinTime}
                        placeholder="14:00"
                      />
                    </View>
                    <View className="flex-1">
                      <Field
                        label="Giờ trả phòng"
                        value={checkoutTime}
                        onChangeText={setCheckoutTime}
                        placeholder="12:00"
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {sections?.amenities ? (
              <View className="gap-3 rounded-2xl border border-slate-100 bg-white p-4">
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Tiện nghi đi kèm
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {amenityOptions.map(item => {
                    const active = amenities.includes(item);
                    return (
                      <TouchableOpacity
                        key={item}
                        onPress={() => toggleAmenity(item)}
                        className={`flex-row items-center rounded-full border px-3 py-2 ${
                          active
                            ? 'border-emerald-300 bg-emerald-50'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        {active ? (
                          <Ionicons
                            name="checkmark"
                            size={14}
                            color="#059669"
                          />
                        ) : null}
                        <Text
                          className={`ml-1 text-xs font-semibold ${
                            active ? 'text-emerald-700' : 'text-slate-600'
                          }`}
                        >
                          {item}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View className="flex-row gap-2">
                  <SingleLineInput
                    value={newAmenity}
                    onChangeText={setNewAmenity}
                    onSubmitEditing={addAmenity}
                    placeholder="Thêm tiện nghi khác..."
                    placeholderTextColor="#94a3b8"
                    containerClassName="flex-1 rounded-xl border border-slate-200 bg-white px-3.5"
                    inputClassName="text-xs font-medium text-slate-700"
                  />
                  <TouchableOpacity
                    onPress={addAmenity}
                    className="items-center justify-center rounded-xl bg-slate-800 px-4"
                  >
                    <Text className="text-xs font-bold text-white">Thêm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

