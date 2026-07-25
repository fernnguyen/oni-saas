import React, {useState, useEffect} from 'react';
import {View, Text, TouchableOpacity, ScrollView} from 'react-native';
import {Ionicons} from '@expo/vector-icons';

interface PosDatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (dateStr: string) => void;
  targetField: 'dob' | 'expiry_date' | string;
  initialDate?: string; // DD/MM/YYYY
  title?: string;
}

export function PosDatePicker({isOpen, onClose, onConfirm, targetField, initialDate, title}: PosDatePickerProps) {
  const [pickerDay, setPickerDay] = useState(new Date().getDate());
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth() + 1);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const [datePickerView, setDatePickerView] = useState<'calendar' | 'year'>('calendar');

  useEffect(() => {
    if (isOpen) {
      if (initialDate && initialDate.includes('/')) {
        const [d, m, y] = initialDate.split('/');
        setPickerDay(parseInt(d, 10) || new Date().getDate());
        setPickerMonth(parseInt(m, 10) || new Date().getMonth() + 1);
        setPickerYear(parseInt(y, 10) || new Date().getFullYear());
      } else {
        const now = new Date();
        setPickerDay(now.getDate());
        setPickerMonth(now.getMonth() + 1);
        setPickerYear(now.getFullYear());
      }
      setDatePickerView('calendar');
    }
  }, [isOpen, initialDate]);

  if (!isOpen) return null;

  return (
    <View style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 999999, justifyContent: 'center', alignItems: 'center'}}>
      <View className="w-full max-w-[340px] bg-white rounded-3xl p-5 shadow-2xl items-center border border-slate-100 overflow-hidden">
        {/* Modal Title */}
        <Text className="text-xs font-semibold text-slate-400 mb-3">
          {title || (targetField === 'dob' ? 'Chọn ngày sinh' : 'Chọn ngày hết hạn')}
        </Text>

        {/* Premium Header Display */}
        <View className="flex-row items-center justify-center bg-orange-50/50 rounded-2xl w-full py-3 mb-4 border border-orange-100/50">
          <Text className="text-orange-500 text-2xl font-semibold">
            {pickerDay.toString().padStart(2, '0')}
          </Text>
          <Text className="text-slate-300 text-xl font-medium mx-2">/</Text>
          <Text className="text-orange-500 text-2xl font-semibold">
            {pickerMonth.toString().padStart(2, '0')}
          </Text>
          <Text className="text-slate-300 text-xl font-medium mx-2">/</Text>
          <TouchableOpacity 
            activeOpacity={0.7}
            onPress={() => setDatePickerView(prev => prev === 'calendar' ? 'year' : 'calendar')}
            className="bg-orange-100 px-2 py-0.5 rounded-lg border border-orange-200"
          >
            <Text className="text-orange-600 text-xl font-semibold">
              {pickerYear} ⚙️
            </Text>
          </TouchableOpacity>
        </View>

        {datePickerView === 'calendar' ? (
          <View className="w-full">
            {/* Month Navigation */}
            <View className="flex-row justify-between items-center mb-3 w-full px-2">
              <TouchableOpacity 
                activeOpacity={0.7}
                onPress={() => {
                  if (pickerMonth === 1) {
                    setPickerMonth(12);
                    setPickerYear(y => y - 1);
                  } else {
                    setPickerMonth(m => m - 1);
                  }
                }}
                className="p-1.5 bg-slate-50 border border-slate-100 rounded-lg"
              >
                <Ionicons name="chevron-back" size={16} color="#475569" />
              </TouchableOpacity>
              
              <TouchableOpacity 
                activeOpacity={0.7}
                onPress={() => setDatePickerView('year')}
              >
                <Text className="text-xs font-semibold text-slate-700">
                  Tháng {pickerMonth.toString().padStart(2, '0')}, {pickerYear}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                activeOpacity={0.7}
                onPress={() => {
                  if (pickerMonth === 12) {
                    setPickerMonth(1);
                    setPickerYear(y => y + 1);
                  } else {
                    setPickerMonth(m => m + 1);
                  }
                }}
                className="p-1.5 bg-slate-50 border border-slate-100 rounded-lg"
              >
                <Ionicons name="chevron-forward" size={16} color="#475569" />
              </TouchableOpacity>
            </View>

            {/* Week Day Labels */}
            <View className="flex-row justify-start w-full mb-1">
              {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((w, wi) => (
                <View key={wi} className="w-[14.28%] items-center justify-center py-1">
                  <Text className="text-tiny text-slate-400 font-medium">{w}</Text>
                </View>
              ))}
            </View>

            {/* Days Grid */}
            <View className="flex-row flex-wrap justify-start w-full">
              {(() => {
                const firstDayIndex = new Date(pickerYear, pickerMonth - 1, 1).getDay();
                const firstDayOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
                const daysInMonth = new Date(pickerYear, pickerMonth, 0).getDate();
                
                const cells = [];
                for (let i = 0; i < firstDayOffset; i++) {
                  cells.push(
                    <View key={`empty-${i}`} className="w-[14.28%] aspect-square items-center justify-center p-0.5" />
                  );
                }
                for (let d = 1; d <= daysInMonth; d++) {
                  const isSelected = pickerDay === d;
                  cells.push(
                    <TouchableOpacity
                      key={`day-${d}`}
                      activeOpacity={0.8}
                      onPress={() => setPickerDay(d)}
                      className="w-[14.28%] aspect-square items-center justify-center p-0.5"
                    >
                      <View className={`w-full h-full items-center justify-center rounded-full ${
                        isSelected ? 'bg-orange-500' : 'bg-transparent'
                      }`}>
                        <Text className={`text-xs font-medium ${
                          isSelected ? 'text-white font-semibold' : 'text-slate-700'
                        }`}>
                          {d}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }
                return cells;
              })()}
            </View>
          </View>
        ) : (
          <View className="w-full">
            {/* Header for Year Picker */}
            <View className="flex-row justify-between items-center mb-3.5 px-2">
              <Text className="text-xs font-semibold text-slate-700">Chọn năm sinh/hạn giấy tờ:</Text>
              <TouchableOpacity 
                activeOpacity={0.7}
                onPress={() => setDatePickerView('calendar')}
                className="bg-orange-50 border border-orange-100 px-2 py-1 rounded-lg"
              >
                <Text className="text-orange-600 text-tiny font-semibold">← Lịch</Text>
              </TouchableOpacity>
            </View>

            {/* Years Grid */}
            <View className="max-h-56 bg-slate-50 rounded-2xl border border-slate-100 p-2">
              <ScrollView nestedScrollEnabled={true} showsVerticalScrollIndicator={true}>
                <View className="flex-row flex-wrap justify-start">
                  {(() => {
                    const years = [];
                    const currentYear = new Date().getFullYear();
                    for (let y = currentYear + 15; y >= 1930; y--) {
                      const isSelected = pickerYear === y;
                      years.push(
                        <TouchableOpacity
                          key={y}
                          activeOpacity={0.8}
                          onPress={() => {
                            setPickerYear(y);
                            setDatePickerView('calendar');
                          }}
                          className="w-[33.3%] p-1.5"
                        >
                          <View className={`py-2 rounded-xl items-center justify-center ${
                            isSelected ? 'bg-orange-500' : 'bg-white border border-slate-200'
                          }`}>
                            <Text className={`text-xs font-medium ${
                              isSelected ? 'text-white font-semibold' : 'text-slate-700'
                            }`}>
                              {y}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    }
                    return years;
                  })()}
                </View>
              </ScrollView>
            </View>
          </View>
        )}

        {/* Modal Actions */}
        <View className="flex-row gap-3 mt-4 border-t border-slate-100 pt-4 w-full">
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onClose}
            className="flex-1 py-3 bg-slate-100 rounded-xl items-center justify-center border border-slate-200"
          >
            <Text className="text-slate-600 text-xs font-semibold">Hủy bỏ</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              const formattedDate = `${pickerDay.toString().padStart(2, '0')}/${pickerMonth.toString().padStart(2, '0')}/${pickerYear}`;
              onConfirm(formattedDate);
            }}
            className="flex-1 py-3 bg-orange-500 rounded-xl items-center justify-center shadow-lg shadow-orange-500/20"
          >
            <Text className="text-white text-xs font-semibold">Xác nhận</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
