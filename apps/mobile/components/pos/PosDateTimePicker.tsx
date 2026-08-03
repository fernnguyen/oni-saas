import React, {useState, useEffect, useRef} from 'react';
import {View, Text, TouchableOpacity, ScrollView, Modal} from 'react-native';
import {Ionicons} from '@expo/vector-icons';

interface PosDateTimePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (dateStr: string, hourStr: string, minuteStr: string) => void;
  initialDate?: string; // DD/MM/YYYY
  initialHour?: string; // HH
  initialMinute?: string; // mm
  title?: string;
  originalTimeStr?: string; // Hiển thị giờ gốc
}

export function PosDateTimePicker({isOpen, onClose, onConfirm, initialDate, initialHour, initialMinute, title, originalTimeStr}: PosDateTimePickerProps) {
  const [pickerDay, setPickerDay] = useState(new Date().getDate());
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth() + 1);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  
  const [pickerHour, setPickerHour] = useState(new Date().getHours());
  const [pickerMinute, setPickerMinute] = useState(new Date().getMinutes());

  const [datePickerView, setDatePickerView] = useState<'calendar' | 'year' | 'time'>('calendar');

  const hourScrollRef = useRef<ScrollView>(null);
  const minuteScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (datePickerView === 'time') {
      setTimeout(() => {
        hourScrollRef.current?.scrollTo({ y: pickerHour * 44, animated: false });
        minuteScrollRef.current?.scrollTo({ y: pickerMinute * 44, animated: false });
      }, 50);
    }
  }, [datePickerView, pickerHour, pickerMinute]);

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
      
      if (initialHour !== undefined) {
        setPickerHour(parseInt(initialHour, 10) || 0);
      } else {
        setPickerHour(new Date().getHours());
      }
      
      if (initialMinute !== undefined) {
        setPickerMinute(parseInt(initialMinute, 10) || 0);
      } else {
        setPickerMinute(new Date().getMinutes());
      }
      
      setDatePickerView('calendar');
    }
  }, [isOpen, initialDate, initialHour, initialMinute]);

  if (!isOpen) return null;

  return (
    <View style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 999999, justifyContent: 'center', alignItems: 'center'}}>
      <View className="w-full max-w-[340px] bg-white rounded-3xl p-5 shadow-2xl items-center border border-slate-100 overflow-hidden">
        {/* Modal Title */}
        <Text className="text-xs font-semibold text-slate-400 mb-3">
          {title || 'Chọn ngày giờ'}
        </Text>

        <View className="flex-row items-center justify-center bg-orange-50/50 rounded-2xl w-full py-3 mb-4 border border-orange-100/50">
          <TouchableOpacity 
            activeOpacity={0.7}
            onPress={() => setDatePickerView('time')}
            className={`flex-row items-center justify-center px-3 py-1.5 rounded-xl ${datePickerView === 'time' ? 'bg-orange-100 border border-orange-200' : ''}`}
          >
            <Text className="text-orange-500 text-2xl font-semibold">
              {pickerHour.toString().padStart(2, '0')}:{pickerMinute.toString().padStart(2, '0')}
            </Text>
          </TouchableOpacity>
          <View className="w-[1px] h-8 bg-orange-200 mx-2" />
          <TouchableOpacity 
            activeOpacity={0.7}
            onPress={() => setDatePickerView('calendar')}
            className={`flex-row items-center justify-center px-3 py-1.5 rounded-xl ${datePickerView === 'calendar' || datePickerView === 'year' ? 'bg-orange-100 border border-orange-200' : ''}`}
          >
            <Text className="text-orange-500 text-2xl font-semibold">
              {pickerDay.toString().padStart(2, '0')}/{pickerMonth.toString().padStart(2, '0')}
            </Text>
            <Text className="text-slate-300 text-xl font-medium mx-1">/</Text>
            <Text className="text-orange-600 text-lg font-semibold">
              {pickerYear}
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
                const today = new Date();
                for (let d = 1; d <= daysInMonth; d++) {
                  const isSelected = pickerDay === d;
                  const isToday = today.getDate() === d && today.getMonth() + 1 === pickerMonth && today.getFullYear() === pickerYear;
                  cells.push(
                    <TouchableOpacity
                      key={`day-${d}`}
                      activeOpacity={0.8}
                      onPress={() => setPickerDay(d)}
                      className="w-[14.28%] aspect-square items-center justify-center p-0.5"
                    >
                      <View className={`w-full h-full items-center justify-center rounded-full ${
                        isSelected ? 'bg-orange-500' : isToday ? 'bg-orange-100 border border-orange-200' : 'bg-transparent'
                      }`}>
                        <Text className={`text-xs ${
                          isSelected ? 'text-white font-bold' : isToday ? 'text-orange-600 font-bold' : 'text-slate-700 font-medium'
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
        ) : datePickerView === 'year' ? (
          <View className="w-full">
            {/* Header for Year Picker */}
            <View className="flex-row justify-between items-center mb-3.5 px-2">
              <Text className="text-xs font-semibold text-slate-700">Chọn năm:</Text>
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
                    for (let y = currentYear + 15; y >= currentYear - 15; y--) {
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
        ) : (
          <View className="w-full h-56 flex-row">
            {/* Hour Picker */}
            <View className="w-[45%] items-center">
              <Text className="text-xs font-semibold text-slate-500 mb-2">Giờ</Text>
              <ScrollView 
                ref={hourScrollRef}
                nestedScrollEnabled={true} 
                showsVerticalScrollIndicator={false}
                className="w-full bg-slate-50 rounded-2xl border border-slate-100"
                contentContainerStyle={{ paddingVertical: 10 }}
              >
                {Array.from({length: 24}).map((_, h) => {
                  const isSelected = pickerHour === h;
                  return (
                    <TouchableOpacity
                      key={h}
                      activeOpacity={0.8}
                      onPress={() => setPickerHour(h)}
                      className={`w-full py-2.5 items-center justify-center ${isSelected ? 'bg-orange-100' : ''}`}
                    >
                      <Text className={`text-base font-medium ${isSelected ? 'text-orange-600 font-bold' : 'text-slate-700'}`}>
                        {h.toString().padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View className="w-[10%] items-center justify-center">
              <Text className="text-xl font-bold text-slate-300">:</Text>
            </View>

            {/* Minute Picker */}
            <View className="w-[45%] items-center">
              <Text className="text-xs font-semibold text-slate-500 mb-2">Phút</Text>
              <ScrollView 
                ref={minuteScrollRef}
                nestedScrollEnabled={true} 
                showsVerticalScrollIndicator={false}
                className="w-full bg-slate-50 rounded-2xl border border-slate-100"
                contentContainerStyle={{ paddingVertical: 10 }}
              >
                {Array.from({length: 60}).map((_, m) => {
                  const isSelected = pickerMinute === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      activeOpacity={0.8}
                      onPress={() => setPickerMinute(m)}
                      className={`w-full py-2.5 items-center justify-center ${isSelected ? 'bg-orange-100' : ''}`}
                    >
                      <Text className={`text-base font-medium ${isSelected ? 'text-orange-600 font-bold' : 'text-slate-700'}`}>
                        {m.toString().padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        )}

        {/* Modal Actions */}
        <View className="flex-row items-center gap-3 w-full mt-4">
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
              const formattedHour = pickerHour.toString().padStart(2, '0');
              const formattedMinute = pickerMinute.toString().padStart(2, '0');
              onConfirm(formattedDate, formattedHour, formattedMinute);
            }}
            className="flex-1 py-3 bg-orange-500 rounded-xl items-center justify-center shadow-lg shadow-orange-500/20"
          >
            <Text className="text-white text-xs font-semibold">Xác nhận</Text>
          </TouchableOpacity>
        </View>
        {originalTimeStr && (
          <Text className="text-[10px] font-medium text-slate-400 mt-3 text-center">
            Giờ gốc lúc bắt đầu: {originalTimeStr}
          </Text>
        )}
      </View>
    </View>
  );
}
