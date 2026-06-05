import React from 'react';
import { View, Text, TouchableOpacity, Image, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';

interface QRTransferModalProps {
  visible: boolean;
  onClose: () => void;
  qrPayload: {
    amount: number;
    orderNo: string;
    fund_id: string;
  } | null;
  onConfirm: () => void;
  paymentFundsList: any[];
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
}

export default function QRTransferModal({ visible, onClose, qrPayload, onConfirm, paymentFundsList }: QRTransferModalProps) {
  if (!qrPayload) return null;

  // Tìm quỹ ngân hàng tương ứng để render tên, stk
  const fund = paymentFundsList.find(f => f.id === qrPayload.fund_id);
  const bankName = fund?.bank_name || 'MBBank';
  const accountNo = fund?.account_number || '8888 9999 6666';
  const accountName = fund?.account_name || 'CONG TY TNHH ONI ERP';
  // Template: `https://img.vietqr.io/image/[bank_code]-[account]-compact.png`
  // API tĩnh qrserver nếu ko xài vietqr
  // const qrUrl = `https://img.vietqr.io/image/${bankName}-${accountNo}-compact2.png?amount=${qrPayload.amount}&addInfo=${qrPayload.orderNo}&accountName=${accountName}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`STK:${accountNo}|ND:${qrPayload.orderNo}|ST:${qrPayload.amount}`)}`;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center items-center px-6" style={{backgroundColor: 'rgba(0, 0, 0, 0.6)'}}>
        <View className="w-full max-w-sm p-6 rounded-2xl bg-white border border-slate-100 items-center" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 10}, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12}}>
          
          {/* Header */}
          <View className="w-full flex-row justify-between items-center mb-4">
            <Text className="text-sm font-semibold text-slate-800">Dynamic QR Code</Text>
            <TouchableOpacity onPress={onClose} className="p-1">
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Bank Card Graphic */}
          <View className="w-full bg-slate-900 p-4 rounded-xl mb-4 relative overflow-hidden" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2}}>
            <View className="absolute w-24 h-24 rounded-full -top-10 -left-10" />
            <Text className="text-micro font-semibold text-slate-400">{bankName.toUpperCase()} INTERCONNECT</Text>
            <Text className="text-white text-xs font-medium mt-2">{accountName.toUpperCase()}</Text>
            <Text className="text-sm font-semibold mt-0.5 text-white">{accountNo}</Text>
          </View>

          {/* QR Image Frame */}
          <View className="p-4 bg-slate-50 border border-slate-200 rounded-2xl mb-4 items-center justify-center relative">
            <Image
              source={{uri: qrUrl}}
              className="w-48 h-48 rounded-xl"
              resizeMode="contain"
            />
            
            <View className="absolute bg-orange-500 px-3 py-1 rounded-full border-2 border-white -bottom-2.5" style={{backgroundColor: '#fa5908'}}>
              <Text className="text-white text-micro font-semibold">VietQR ONIPay</Text>
            </View>
          </View>

          {/* Details */}
          <View className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-5">
            <View className="flex-row justify-between mb-1.5">
              <Text className="text-xxs text-slate-400 font-medium">Số tiền thanh toán:</Text>
              <Text className="text-orange-500 text-xs font-semibold">{formatCurrency(qrPayload.amount)}</Text>
            </View>

            <View className="flex-row justify-between">
              <Text className="text-xxs text-slate-400 font-medium">Nội dung chuyển:</Text>
              <Text className="text-slate-800 text-xs font-semibold">{qrPayload.orderNo}</Text>
            </View>
          </View>

          {/* Confirm */}
          <Button
            variant="primary"
            title="Đã nhận đủ tiền thanh toán"
            icon={<Ionicons name="checkmark-circle" size={14} color="white" />}
            onPress={onConfirm}
            className="w-full py-3.5 rounded-xl bg-emerald-500 border-0" 
            style={{shadowColor: '#10b981', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6}}
          />
        </View>
      </View>
    </Modal>
  );
}
