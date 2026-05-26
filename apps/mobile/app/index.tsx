import React from 'react';
import { Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { VERTICAL_REGISTRY } from '@oni/core';

export default function HomeScreen() {
  return (
    <ScrollView className="flex-1 bg-slate-950 px-6 py-12">
      <View className="py-8 items-center">
        <Text className="text-4xl font-extrabold text-emerald-400 tracking-tight">ONI Mobile</Text>
        <Text className="text-slate-400 text-center mt-2 text-base">
          Hệ sinh thái quản trị gian hàng SaaS đa nền tảng
        </Text>
      </View>

      <View className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl mb-8">
        <Text className="text-xl font-bold text-slate-100 mb-4">Tổng quan phân hệ Mobile</Text>
        <Text className="text-slate-400 leading-6 mb-6">
          Giải pháp bán hàng tại quầy (POS) & quản trị offline-first mượt mà được biên dịch native bằng Expo.
        </Text>

        <TouchableOpacity 
          className="bg-emerald-500 active:bg-emerald-600 py-4 rounded-2xl items-center shadow-lg shadow-emerald-500/20"
        >
          <Text className="text-slate-950 font-bold text-lg">Bắt đầu phiên bán hàng</Text>
        </TouchableOpacity>
      </View>

      <View className="mb-12">
        <Text className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
          Phân hệ Ngành Hàng Đang Hoạt Động (Shared Core)
        </Text>
        
        <View className="flex-row flex-wrap justify-between">
          {Object.entries(VERTICAL_REGISTRY).map(([key, config]) => (
            <View 
              key={key} 
              className="w-[48%] bg-slate-900 border border-slate-850 rounded-2xl p-4 mb-4"
            >
              <Text className="text-2xl mb-2">{config.icon}</Text>
              <Text className="text-slate-100 font-bold text-sm">{config.label}</Text>
              <Text className="text-slate-500 text-xs mt-1" numberOfLines={2}>
                {config.description}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
