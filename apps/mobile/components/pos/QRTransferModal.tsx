import React from 'react';
import { View, Text, TouchableOpacity, Image, Modal, Pressable } from 'react-native';
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

// Hàm chuẩn hóa mã ngân hàng theo đặc tả VietQR
function getVietQRBankCode(bankName: string): string {
  const name = bankName.toUpperCase().replace(/[\s-]/g, '');
  if (name.includes('MBBANK') || name === 'MB') return 'MB';
  if (name.includes('VIETCOMBANK') || name === 'VCB') return 'VCB';
  if (name.includes('TECHCOMBANK') || name === 'TCB') return 'TCB';
  if (name.includes('BIDV')) return 'BIDV';
  if (name.includes('AGRIBANK') || name === 'VBA') return 'VBA';
  if (name.includes('VIETINBANK') || name === 'CTG' || name === 'ICB') return 'ICB';
  if (name.includes('ACB')) return 'ACB';
  if (name.includes('VPBANK') || name === 'VPB') return 'VPB';
  if (name.includes('TPBANK') || name === 'TPB') return 'TPB';
  if (name.includes('SACOMBANK') || name === 'STB') return 'STB';
  if (name.includes('HDBANK') || name === 'HDB') return 'HDB';
  if (name.includes('VIB')) return 'VIB';
  if (name.includes('SHB')) return 'SHB';
  if (name.includes('MSB')) return 'MSB';
  if (name.includes('OCB')) return 'OCB';
  if (name.includes('LIENVIET') || name.includes('LPBANK') || name === 'LPB') return 'LPB';
  if (name.includes('SEABANK') || name === 'SEAB') return 'SEAB';
  if (name.includes('EXIMBANK') || name === 'EIB') return 'EIB';
  return bankName; // Trả về mặc định nếu là mã ngắn sẵn
}

export default function QRTransferModal({ visible, onClose, qrPayload, onConfirm, paymentFundsList }: QRTransferModalProps) {
  if (!qrPayload) return null;

  // Tìm quỹ ngân hàng tương ứng để render tên, stk
  const fund = paymentFundsList?.find(f => f.id === qrPayload.fund_id);
  const bankName = fund?.bank_name || '';
  const accountNo = fund?.account_number || '';
  const accountName = fund?.account_name || '';

  // Silent skip: Nếu không có hoặc chưa cài đặt thông tin số tài khoản và ngân hàng thì không hiển thị
  if (!bankName || !accountNo) return null;

  const sanitizedBankCode = getVietQRBankCode(bankName);
  // Loại bỏ các ký tự đặc biệt khỏi nội dung chuyển khoản để đảm bảo VietQR tương thích tốt nhất
  const cleanOrderNo = qrPayload.orderNo.replace(/[^a-zA-Z0-9\s-_]/g, '');

  // Tạo URL ảnh mã QR theo định dạng VietQR chính thức (compact2)
  const qrUrl = `https://img.vietqr.io/image/${sanitizedBankCode}-${accountNo}-compact2.png?amount=${qrPayload.amount}&addInfo=${encodeURIComponent(cleanOrderNo)}&accountName=${encodeURIComponent(accountName)}`;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center items-center px-6">
        <Pressable
          className="absolute inset-0 bg-black/60"
          onPress={onClose}
        />
        <View className="w-full max-w-sm p-6 rounded-2xl bg-white border border-slate-100 items-center relative" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 10}, shadowOpacity: 0.12, shadowRadius: 16, elevation: 12}}>
          
          {/* Header */}
          <View className="w-full flex-row justify-between items-center mb-4">
            <Text className="text-sm font-semibold text-slate-800">Mã QR Chuyển Khoản</Text>
            <TouchableOpacity onPress={onClose} className="p-1">
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Bank Card Graphic */}
          <View className="w-full bg-slate-900 p-4 rounded-xl mb-4 relative overflow-hidden" style={{shadowColor: '#000000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2}}>
            <View className="absolute w-24 h-24 rounded-full -top-10 -left-10" />
            <Text className="text-micro font-semibold text-slate-400">THÔNG TIN TÀI KHOẢN</Text>
            <Text className="text-white text-xs font-semibold mt-2">{accountName.toUpperCase()}</Text>
            <Text className="text-sm font-bold mt-0.5 text-white">{accountNo}</Text>
            <Text className="text-micro text-slate-300 mt-1">{bankName.toUpperCase()}</Text>
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
              <Text className="text-slate-800 text-xs font-semibold">{cleanOrderNo}</Text>
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
