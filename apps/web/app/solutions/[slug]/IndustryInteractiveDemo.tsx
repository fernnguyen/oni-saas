'use client';

import { useState, useEffect } from 'react';
import { 
  Check, 
  Coffee, 
  Trash2, 
  User, 
  Clock, 
  Smartphone, 
  Plus, 
  Minus, 
  QrCode, 
  AlertCircle, 
  CheckCircle, 
  RotateCcw,
  Sparkles,
  ShoppingBag,
  Grid,
  Zap
} from 'lucide-react';

interface DemoProps {
  slug: string;
}

interface Room {
  id: string;
  name: string;
  type: string;
  status: string;
  pricePerHour: number;
  pricePerDay: number;
  checkInTime?: string;
  guestName?: string;
  deposit?: number;
}

interface Resource {
  id: string;
  name: string;
  type: string;
  status: string;
  pricePerHour: number;
  durationSec: number;
}

export function IndustryInteractiveDemo({ slug }: DemoProps) {
  // Common states
  const [activeTab, setActiveTab] = useState<string>('demo');
  const [qrCodeData, setQrCodeData] = useState<{ amount: number; addInfo: string } | null>(null);

  /* ──────────────────────────────────────────────────────────────
     1. LODGING (NHÀ NGHỈ & KHÁCH SẠN) STATE & LOGIC
     ────────────────────────────────────────────────────────────── */
  const initialRooms: Room[] = [
    { id: '101', name: 'Phòng 101', type: 'Standard', status: 'occupied', checkInTime: '2 giờ trước', guestName: 'Nguyễn Văn A', deposit: 100000, pricePerHour: 80000, pricePerDay: 350000 },
    { id: '102', name: 'Phòng 102', type: 'VIP Double', status: 'available', pricePerHour: 120000, pricePerDay: 550000 },
    { id: '103', name: 'Phòng 103', type: 'Deluxe Suite', status: 'dirty', pricePerHour: 150000, pricePerDay: 750000 },
    { id: '201', name: 'Phòng 201', type: 'Standard', status: 'available', pricePerHour: 80000, pricePerDay: 350000 },
    { id: '202', name: 'Phòng 202', type: 'VIP Double', status: 'occupied', checkInTime: '5 giờ trước', guestName: 'Lê Thị B', deposit: 200000, pricePerHour: 120000, pricePerDay: 550000 },
    { id: '203', name: 'Phòng 203', type: 'Standard Single', status: 'maintenance', pricePerHour: 60000, pricePerDay: 280000 },
  ];
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('101');
  const [minibar, setMinibar] = useState<{ name: string; price: number; qty: number }[]>([
    { name: 'Nước suối Aquafina', price: 10000, qty: 2 },
    { name: 'Bia Heineken', price: 25000, qty: 1 },
    { name: 'Mì ly Omachi', price: 15000, qty: 0 }
  ]);
  const [checkInForm, setCheckInForm] = useState({ guestName: '', mode: 'hourly', hours: 2, deposit: 0 });

  const selectedRoom = rooms.find(r => r.id === selectedRoomId) || rooms[0];

  const updateMinibarQty = (index: number, change: number) => {
    const updated = [...minibar];
    updated[index].qty = Math.max(0, updated[index].qty + change);
    setMinibar(updated);
  };

  const getLodgingInvoice = () => {
    if (!selectedRoom || selectedRoom.status !== 'occupied') return { roomTotal: 0, minibarTotal: 0, total: 0 };
    
    // Simulating time charges: 101 has been occupied for 2 hours
    const hours = selectedRoom.id === '101' ? 2.5 : 5;
    const roomTotal = Math.ceil(hours * selectedRoom.pricePerHour);
    const minibarTotal = minibar.reduce((acc, item) => acc + (item.price * item.qty), 0);
    const total = roomTotal + minibarTotal - (selectedRoom.deposit || 0);
    return { roomTotal, minibarTotal, total: Math.max(0, total) };
  };

  const handleCheckoutRoom = () => {
    const invoice = getLodgingInvoice();
    setQrCodeData({
      amount: invoice.total,
      addInfo: `TT PHONG ${selectedRoom.id}`
    });
  };

  const handleConfirmPayRoom = () => {
    setRooms(rooms.map(r => r.id === selectedRoomId ? { ...r, status: 'dirty', guestName: undefined, checkInTime: undefined } : r));
    setQrCodeData(null);
  };

  const handleCheckInRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkInForm.guestName.trim()) return;
    setRooms(rooms.map(r => r.id === selectedRoomId ? { 
      ...r, 
      status: 'occupied', 
      guestName: checkInForm.guestName,
      checkInTime: checkInForm.mode === 'hourly' ? `${checkInForm.hours} giờ trước` : 'Mới nhận phòng',
      deposit: Number(checkInForm.deposit)
    } : r));
    setCheckInForm({ guestName: '', mode: 'hourly', hours: 2, deposit: 0 });
  };

  const handleCleanRoom = () => {
    setRooms(rooms.map(r => r.id === selectedRoomId ? { ...r, status: 'available' } : r));
  };


  /* ──────────────────────────────────────────────────────────────
     2. BILLIARDS / SPORTS COURT / SERVICE HOURLY STATE & TIMING
     ────────────────────────────────────────────────────────────── */
  const initialResources: Resource[] = [
    { id: '1', name: slug === 'sports-court' ? 'Sân Pickleball 1' : slug === 'service-hourly' ? 'Máy 01 (PC)' : 'Bàn Bi-a 01', type: 'VIP', status: 'occupied', pricePerHour: 80000, durationSec: 4520 }, // ~1h15m
    { id: '2', name: slug === 'sports-court' ? 'Sân Pickleball 2' : slug === 'service-hourly' ? 'Máy 02 (PC)' : 'Bàn Bi-a 02', type: 'Thường', status: 'available', pricePerHour: 50000, durationSec: 0 },
    { id: '3', name: slug === 'sports-court' ? 'Sân Cầu lông 1' : slug === 'service-hourly' ? 'Phòng Karaoke 1' : 'Bàn Bi-a 03', type: 'Thường', status: 'occupied', pricePerHour: 60000, durationSec: 900 }, // 15m
    { id: '4', name: slug === 'sports-court' ? 'Sân Cầu lông 2' : slug === 'service-hourly' ? 'Phòng Karaoke 2' : 'Bàn Bi-a 04', type: 'VIP', status: 'available', pricePerHour: 80000, durationSec: 0 },
  ];
  
  const [resources, setResources] = useState<Resource[]>(initialResources);
  const [selectedResourceId, setSelectedResourceId] = useState('1');
  const [posHourlyMinibar, setPosHourlyMinibar] = useState<{ name: string; price: number; qty: number }[]>([
    { name: 'Nước tăng lực Sting', price: 15000, qty: 3 },
    { name: 'Nước ngọt Coca-cola', price: 12000, qty: 1 },
    { name: 'Khăn lạnh', price: 3000, qty: 4 }
  ]);

  const selectedRes = resources.find(r => r.id === selectedResourceId) || resources[0];

  // Active timers ticking
  useEffect(() => {
    const timer = setInterval(() => {
      setResources(prev => prev.map(res => {
        if (res.status === 'occupied') {
          return { ...res, durationSec: res.durationSec + 1 };
        }
        return res;
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatSecToTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getHourlyBill = () => {
    if (selectedRes.status !== 'occupied') return { timeCharge: 0, minibarTotal: 0, total: 0 };
    const hours = selectedRes.durationSec / 3600;
    const timeCharge = Math.ceil(hours * selectedRes.pricePerHour);
    const minibarTotal = posHourlyMinibar.reduce((acc, item) => acc + (item.price * item.qty), 0);
    return { timeCharge, minibarTotal, total: timeCharge + minibarTotal };
  };

  const handleStartHourly = () => {
    setResources(resources.map(r => r.id === selectedResourceId ? { ...r, status: 'occupied', durationSec: 1 } : r));
  };

  const handleCheckoutHourly = () => {
    const bill = getHourlyBill();
    setQrCodeData({
      amount: bill.total,
      addInfo: `THANH TOAN ${selectedRes.name.replace(/\s+/g, '')}`
    });
  };

  const handleConfirmPayHourly = () => {
    setResources(resources.map(r => r.id === selectedResourceId ? { ...r, status: 'available', durationSec: 0 } : r));
    setQrCodeData(null);
    setPosHourlyMinibar(posHourlyMinibar.map(item => ({ ...item, qty: 0 })));
  };

  /* ──────────────────────────────────────────────────────────────
     3. RETAIL & FASHION STATE & LOGIC
     ────────────────────────────────────────────────────────────── */
  const initialProducts = [
    { id: 'p1', name: 'Amoxicillin kháng sinh 500mg', code: 'SP001', price: 45000, batch: 'L-AMX02', expiry: '10/06/2026', stock: 120, unit: 'Hộp', category: 'Dược phẩm' },
    { id: 'p2', name: 'Paracetamol giảm đau 500mg', code: 'SP002', price: 15000, batch: 'L-PCT05', expiry: '28/11/2026', stock: 240, unit: 'Vỉ', category: 'Dược phẩm' },
    { id: 'p3', name: 'Sữa tươi tiệt trùng 1L', code: 'SP003', price: 32000, batch: 'L-SUA09', expiry: '15/07/2026', stock: 45, unit: 'Hộp', category: 'Thực phẩm' },
    { id: 'p4', name: 'Áo thun Polo Classic Cotton', code: 'SP004', price: 250000, stock: 85, unit: 'Cái', category: 'Thời trang', variants: { sizes: ['S', 'M', 'L', 'XL'], colors: ['Đen', 'Navy', 'Trắng'] } },
    { id: 'p5', name: 'Quần Jean Slimfit co giãn', code: 'SP005', price: 390000, stock: 60, unit: 'Cái', category: 'Thời trang', variants: { sizes: ['29', '30', '31', '32'], colors: ['Xanh Đậm', 'Xanh Sáng'] } },
  ];

  const filteredProducts = initialProducts.filter(p => {
    if (slug === 'fashion') return p.category === 'Thời trang';
    return p.category !== 'Thời trang';
  });

  const [cart, setCart] = useState<{ id: string; name: string; price: number; qty: number; batch?: string; size?: string; color?: string }[]>([]);
  const [fashionVariantModal, setFashionVariantModal] = useState<any | null>(null);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');

  const addToCart = (prod: any) => {
    if (slug === 'fashion' && prod.variants) {
      setFashionVariantModal(prod);
      setSelectedSize(prod.variants.sizes[0]);
      setSelectedColor(prod.variants.colors[0]);
      return;
    }

    const exist = cart.find(c => c.id === prod.id);
    if (exist) {
      setCart(cart.map(c => c.id === prod.id ? { ...c, qty: c.qty + 1 } : c));
    } else {
      setCart([...cart, { id: prod.id, name: prod.name, price: prod.price, qty: 1, batch: prod.batch }]);
    }
  };

  const addFashionToCartFromModal = () => {
    if (!fashionVariantModal) return;
    const cartItemId = `${fashionVariantModal.id}-${selectedSize}-${selectedColor}`;
    const exist = cart.find(c => c.id === cartItemId);
    if (exist) {
      setCart(cart.map(c => c.id === cartItemId ? { ...c, qty: c.qty + 1 } : c));
    } else {
      setCart([...cart, { 
        id: cartItemId, 
        name: `${fashionVariantModal.name} (${selectedSize} / ${selectedColor})`, 
        price: fashionVariantModal.price, 
        qty: 1 
      }]);
    }
    setFashionVariantModal(null);
  };

  const updateCartQty = (id: string, change: number) => {
    const exist = cart.find(c => c.id === id);
    if (!exist) return;
    if (exist.qty + change <= 0) {
      setCart(cart.filter(c => c.id !== id));
    } else {
      setCart(cart.map(c => c.id === id ? { ...c, qty: c.qty + change } : c));
    }
  };

  const getCartTotal = () => {
    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    const vat = Math.round(subtotal * 0.08); // 8% VAT
    return { subtotal, vat, total: subtotal + vat };
  };

  const handleCheckoutRetail = () => {
    const bill = getCartTotal();
    setQrCodeData({
      amount: bill.total,
      addInfo: `POS THANH TOAN`
    });
  };

  const handleConfirmPayRetail = () => {
    setCart([]);
    setQrCodeData(null);
  };


  /* ──────────────────────────────────────────────────────────────
     4. RENDER METHOD MAPS BASED ON SLUG
     ────────────────────────────────────────────────────────────── */
  const renderInteractiveDemo = () => {
    // ════════════════════════════════════════════════════════════
    // LODGING RENDER
    // ════════════════════════════════════════════════════════════
    if (slug === 'lodging') {
      const invoice = getLodgingInvoice();
      return (
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Room Map */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Grid className="h-5 w-5 text-primary" /> Sơ đồ phòng trực quan</h4>
              <div className="flex gap-3 text-xs font-semibold">
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-emerald-500" /> Trống</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-red-500" /> Đang ở</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-amber-500" /> Chưa dọn</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-slate-400" /> Đang sửa</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {rooms.map((room) => {
                let statusColor = 'border-slate-200 hover:border-slate-350 bg-white';
                let textStatus = 'Sẵn sàng';
                if (room.status === 'occupied') {
                  statusColor = 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100/70';
                  textStatus = 'Đang có khách';
                } else if (room.status === 'dirty') {
                  statusColor = 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100/70';
                  textStatus = 'Chưa dọn dẹp';
                } else if (room.status === 'maintenance') {
                  statusColor = 'bg-slate-100 border-slate-200 text-slate-450 cursor-not-allowed';
                  textStatus = 'Đang bảo trì';
                } else {
                  statusColor = 'bg-emerald-50/50 border-emerald-150 text-emerald-700 hover:bg-emerald-50';
                }

                return (
                  <button
                    key={room.id}
                    id={`room-btn-${room.id}`}
                    onClick={() => room.status !== 'maintenance' && setSelectedRoomId(room.id)}
                    className={`flex flex-col text-left p-4 rounded-2xl border-2 transition-all shadow-xs ${statusColor} ${selectedRoomId === room.id ? 'ring-2 ring-primary border-transparent' : ''}`}
                  >
                    <span className="text-xs font-bold text-slate-400 block">{room.type}</span>
                    <span className="text-base font-extrabold mt-1">{room.name}</span>
                    <div className="mt-4 flex items-center justify-between text-xs">
                      <span className="font-bold opacity-80">{textStatus}</span>
                      {room.checkInTime && <span className="text-[10px] bg-red-150 px-1.5 py-0.5 rounded-md font-extrabold">{room.checkInTime}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Checkout & Bill Form */}
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div>
                  <h4 className="font-extrabold text-slate-800 text-base">{selectedRoom.name}</h4>
                  <span className="text-xs text-slate-400 font-bold block mt-0.5">Nghiệp vụ: {selectedRoom.status === 'occupied' ? 'Thanh toán' : selectedRoom.status === 'dirty' ? 'Dọn phòng' : 'Nhận phòng'}</span>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border uppercase ${
                  selectedRoom.status === 'occupied' ? 'bg-red-50 text-red-700 border-red-100' :
                  selectedRoom.status === 'dirty' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                  'bg-emerald-50 text-emerald-700 border-emerald-100'
                }`}>{selectedRoom.status}</span>
              </div>

              {/* Occupied State - Bill Calculation */}
              {selectedRoom.status === 'occupied' && (
                <div className="space-y-4 text-sm font-semibold">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Khách hàng:</span>
                    <span className="text-slate-800 font-bold">{selectedRoom.guestName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Hình thức ở:</span>
                    <span className="text-slate-800 font-bold">Thuê theo giờ ({selectedRoom.id === '101' ? '2.5h' : '5h'})</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                    <span className="text-slate-500">Tiền phòng tạm tính:</span>
                    <span className="text-slate-800 font-bold">{invoice.roomTotal.toLocaleString()}đ</span>
                  </div>

                  {/* Minibar controls */}
                  <div className="space-y-2.5">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Minibar & Dịch vụ</span>
                    {minibar.map((item, idx) => (
                      <div key={item.name} className="flex items-center justify-between">
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-slate-700 block truncate">{item.name}</span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">{item.price.toLocaleString()}đ</span>
                        </div>
                        <div className="flex items-center gap-2 border border-slate-200 rounded-lg p-1 bg-slate-50">
                          <button onClick={() => updateMinibarQty(idx, -1)} className="h-6 w-6 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-550 hover:bg-slate-100 cursor-pointer"><Minus className="h-3 w-3" /></button>
                          <span className="text-xs w-4 text-center font-bold">{item.qty}</span>
                          <button onClick={() => updateMinibarQty(idx, 1)} className="h-6 w-6 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-550 hover:bg-slate-100 cursor-pointer"><Plus className="h-3 w-3" /></button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedRoom.deposit !== undefined && selectedRoom.deposit > 0 && (
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-emerald-600">
                      <span>Đã đặt cọc:</span>
                      <span>-{selectedRoom.deposit.toLocaleString()}đ</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-slate-850 text-base font-extrabold">
                    <span>Tổng cộng trả:</span>
                    <span className="text-primary">{invoice.total.toLocaleString()}đ</span>
                  </div>
                </div>
              )}

              {/* Available State - Form Check-in */}
              {selectedRoom.status === 'available' && (
                <form onSubmit={handleCheckInRoom} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">Tên khách hàng</label>
                    <input 
                      type="text" 
                      id="form-guest-name"
                      required
                      placeholder="Nhập tên khách" 
                      value={checkInForm.guestName}
                      onChange={(e) => setCheckInForm({ ...checkInForm, guestName: e.target.value })}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">Hình thức thuê</label>
                    <select 
                      value={checkInForm.mode}
                      onChange={(e) => setCheckInForm({ ...checkInForm, mode: e.target.value })}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold outline-none bg-white"
                    >
                      <option value="hourly">Theo giờ ({selectedRoom.pricePerHour.toLocaleString()}đ/h)</option>
                      <option value="overnight">Qua đêm (12h đêm - 8h sáng)</option>
                      <option value="daily">Theo ngày ({selectedRoom.pricePerDay.toLocaleString()}đ/ngày)</option>
                    </select>
                  </div>
                  {checkInForm.mode === 'hourly' && (
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500">Thời gian dự kiến (giờ)</label>
                      <input 
                        type="number" 
                        min="1"
                        max="24"
                        value={checkInForm.hours}
                        onChange={(e) => setCheckInForm({ ...checkInForm, hours: Number(e.target.value) })}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500">Tiền đặt cọc trước (nếu có)</label>
                    <input 
                      type="number" 
                      placeholder="0đ"
                      value={checkInForm.deposit || ''}
                      onChange={(e) => setCheckInForm({ ...checkInForm, deposit: Number(e.target.value) })}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
                    />
                  </div>
                  <button 
                    type="submit" 
                    id="submit-checkin"
                    className="w-full rounded-xl bg-primary hover:bg-primary-dark text-white font-bold py-3 text-sm cursor-pointer shadow-md transition-colors mt-4"
                  >
                    Nhận phòng ngay
                  </button>
                </form>
              )}

              {/* Dirty State */}
              {selectedRoom.status === 'dirty' && (
                <div className="text-center py-8 space-y-4">
                  <div className="h-12 w-12 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 mx-auto">
                    <AlertCircle className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-600 max-w-xs mx-auto">Phòng này đang dọn dẹp sau khi khách trả phòng. Vui lòng xác nhận sạch sẽ trước khi tiếp nhận khách mới.</p>
                  <button 
                    onClick={handleCleanRoom}
                    id="btn-mark-cleaned"
                    className="rounded-xl border-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50 font-bold px-6 py-2.5 text-xs cursor-pointer transition-colors"
                  >
                    Xác nhận đã dọn xong
                  </button>
                </div>
              )}
            </div>

            {selectedRoom.status === 'occupied' && (
              <button 
                onClick={handleCheckoutRoom}
                id="btn-checkout-room"
                className="w-full rounded-xl bg-primary hover:bg-primary-dark text-white font-bold py-3 text-sm cursor-pointer shadow-md transition-colors mt-6 flex items-center justify-center gap-2"
              >
                <QrCode className="h-4 w-4" /> Thanh toán & Trả phòng
              </button>
            )}
          </div>
        </div>
      );
    }

    // ════════════════════════════════════════════════════════════
    // BILLIARDS / SPORTS COURT / SERVICE HOURLY RENDER
    // ════════════════════════════════════════════════════════════
    if (slug === 'billiards' || slug === 'sports-court' || slug === 'service-hourly') {
      const bill = getHourlyBill();
      return (
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Map Layout */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Grid className="h-5 w-5 text-primary" /> Sơ đồ dịch vụ hiện tại</h4>
              <div className="flex gap-3 text-xs font-semibold">
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-emerald-500" /> Trống</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-orange-500 animate-pulse" /> Đang dùng</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {resources.map((res) => {
                let statusColor = 'border-slate-200 hover:border-slate-350 bg-white';
                let textStatus = 'Sẵn sàng';
                if (res.status === 'occupied') {
                  statusColor = 'bg-orange-50/50 border-orange-200 text-orange-700 hover:bg-orange-100/40';
                  textStatus = 'Đang hoạt động';
                }

                return (
                  <button
                    key={res.id}
                    id={`res-btn-${res.id}`}
                    onClick={() => setSelectedResourceId(res.id)}
                    className={`flex flex-col text-left p-5 rounded-2xl border-2 transition-all shadow-xs ${statusColor} ${selectedResourceId === res.id ? 'ring-2 ring-primary border-transparent' : ''}`}
                  >
                    <span className="text-xs font-bold text-slate-400 block">{res.type}</span>
                    <span className="text-lg font-extrabold mt-1">{res.name}</span>
                    <span className="text-xs font-bold text-slate-500 mt-0.5">{res.pricePerHour.toLocaleString()}đ/giờ</span>
                    <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-3 text-xs w-full">
                      <span className="font-extrabold opacity-95">{textStatus}</span>
                      {res.status === 'occupied' && (
                        <span className="font-mono bg-orange-150 px-2 py-0.5 rounded-md font-extrabold text-orange-700 flex items-center gap-1">
                          <Clock className="h-3 w-3 shrink-0 text-orange-600" />
                          {formatSecToTime(res.durationSec)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pos Checkout Panel */}
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div>
                  <h4 className="font-extrabold text-slate-800 text-base">{selectedRes.name}</h4>
                  <span className="text-xs text-slate-400 font-bold block mt-0.5">Đơn giá: {selectedRes.pricePerHour.toLocaleString()}đ / giờ</span>
                </div>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-lg border uppercase ${
                  selectedRes.status === 'occupied' ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                }`}>{selectedRes.status}</span>
              </div>

              {selectedRes.status === 'occupied' ? (
                <div className="space-y-4 text-sm font-semibold">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Bắt đầu lúc:</span>
                    <span className="text-slate-800 font-mono">Cách đây {formatSecToTime(selectedRes.durationSec)}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                    <span className="text-slate-500">Tiền giờ tạm tính:</span>
                    <span className="text-slate-850 font-extrabold font-mono">{bill.timeCharge.toLocaleString()}đ</span>
                  </div>

                  {/* Add Drinks */}
                  <div className="space-y-2.5">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Dịch vụ gọi thêm</span>
                    {posHourlyMinibar.map((item, idx) => (
                      <div key={item.name} className="flex items-center justify-between">
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-slate-700 block truncate">{item.name}</span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">{item.price.toLocaleString()}đ</span>
                        </div>
                        <div className="flex items-center gap-2 border border-slate-200 rounded-lg p-1 bg-slate-50">
                          <button onClick={() => {
                            const updated = [...posHourlyMinibar];
                            updated[idx].qty = Math.max(0, updated[idx].qty - 1);
                            setPosHourlyMinibar(updated);
                          }} className="h-6 w-6 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-550 hover:bg-slate-100 cursor-pointer"><Minus className="h-3 w-3" /></button>
                          <span className="text-xs w-4 text-center font-bold">{item.qty}</span>
                          <button onClick={() => {
                            const updated = [...posHourlyMinibar];
                            updated[idx].qty = updated[idx].qty + 1;
                            setPosHourlyMinibar(updated);
                          }} className="h-6 w-6 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-550 hover:bg-slate-100 cursor-pointer"><Plus className="h-3 w-3" /></button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-slate-850 text-base font-extrabold">
                    <span>Tổng tiền bill:</span>
                    <span className="text-primary">{bill.total.toLocaleString()}đ</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 space-y-4">
                  <div className="h-12 w-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mx-auto">
                    <Clock className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-500 max-w-xs mx-auto">Sân/Bàn đang trống. Nhấp bắt đầu để kích hoạt bộ tính giờ tự động theo thời gian thực.</p>
                  <button 
                    onClick={handleStartHourly}
                    id="btn-start-timer"
                    className="w-full rounded-xl bg-primary hover:bg-primary-dark text-white font-bold py-3 text-sm cursor-pointer shadow-md transition-colors mt-4"
                  >
                    Bắt đầu tính giờ
                  </button>
                </div>
              )}
            </div>

            {selectedRes.status === 'occupied' && (
              <button 
                onClick={handleCheckoutHourly}
                id="btn-checkout-hourly"
                className="w-full rounded-xl bg-primary hover:bg-primary-dark text-white font-bold py-3 text-sm cursor-pointer shadow-md transition-colors mt-6 flex items-center justify-center gap-2"
              >
                <QrCode className="h-4 w-4" /> Tạo VietQR thanh toán
              </button>
            )}
          </div>
        </div>
      );
    }

    // ════════════════════════════════════════════════════════════
    // RETAIL / FASHION / POS RENDER
    // ════════════════════════════════════════════════════════════
    if (slug === 'retail' || slug === 'fashion') {
      const cartInfo = getCartTotal();
      return (
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Products Grid */}
          <div className="lg:col-span-2 space-y-6">
            <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2"><ShoppingBag className="h-5 w-5 text-primary" /> Sản phẩm trong quầy POS</h4>
            
            <div className="grid gap-4 sm:grid-cols-2">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  id={`prod-btn-${p.id}`}
                  onClick={() => addToCart(p)}
                  className="flex items-start text-left p-4 rounded-2xl border border-slate-200 bg-white hover:border-primary/20 hover:shadow-md transition-all gap-4 shadow-xs"
                >
                  <div className="h-12 w-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-slate-600 font-extrabold text-sm uppercase">
                    {p.name.substring(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-400">{p.code}</span>
                    <span className="block text-sm font-extrabold text-slate-800 truncate mt-0.5">{p.name}</span>
                    <span className="block text-sm font-extrabold text-primary mt-1">{p.price.toLocaleString()}đ / {p.unit}</span>
                    
                    {/* Batch detail / variants detail */}
                    {p.batch && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-md px-1.5 py-0.5 mt-2">
                        <AlertCircle className="h-3 w-3" /> Hạn dùng: {p.expiry}
                      </span>
                    )}

                    {p.variants && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-150 rounded-md px-1.5 py-0.5 mt-2">
                        <Sparkles className="h-3 w-3 text-indigo-500" /> Size & Màu sắc đa dạng
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Sales Cart */}
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm flex flex-col justify-between min-h-[400px]">
            <div>
              <div className="border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-slate-800 text-base">Đơn hàng hiện tại</h4>
                  <span className="text-xs text-slate-400 font-bold mt-0.5 block">Thu ngân: Quầy chính</span>
                </div>
                <span className="bg-primary text-white font-extrabold text-xs px-2 py-0.5 rounded-full">{cart.reduce((acc, c) => acc + c.qty, 0)} món</span>
              </div>

              {cart.length > 0 ? (
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 text-xs font-bold border-b border-slate-50 pb-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-slate-800 truncate block">{item.name}</span>
                        {item.batch && <span className="text-[10px] text-red-500 block font-semibold mt-0.5">Lô: {item.batch}</span>}
                        <span className="text-slate-400 block font-semibold mt-0.5">{item.price.toLocaleString()}đ</span>
                      </div>
                      
                      <div className="flex items-center gap-2 border border-slate-200 rounded-lg p-1 bg-slate-50 shrink-0">
                        <button onClick={() => updateCartQty(item.id, -1)} className="h-5 w-5 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-550 hover:bg-slate-100 cursor-pointer"><Minus className="h-2.5 w-2.5" /></button>
                        <span className="text-xs w-4 text-center font-bold">{item.qty}</span>
                        <button onClick={() => updateCartQty(item.id, 1)} className="h-5 w-5 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-550 hover:bg-slate-100 cursor-pointer"><Plus className="h-2.5 w-2.5" /></button>
                      </div>
                    </div>
                  ))}
                  
                  <div className="space-y-2 border-t border-slate-100 pt-3 text-sm font-semibold">
                    <div className="flex items-center justify-between text-slate-500">
                      <span>Tạm tính:</span>
                      <span>{cartInfo.subtotal.toLocaleString()}đ</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500">
                      <span>Thuế VAT (8%):</span>
                      <span>{cartInfo.vat.toLocaleString()}đ</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-850 text-base font-extrabold pt-2">
                      <span>Cần thanh toán:</span>
                      <span className="text-primary">{cartInfo.total.toLocaleString()}đ</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 space-y-3">
                  <div className="h-10 w-10 rounded-full bg-slate-50 border border-slate-150 flex items-center justify-center text-slate-400 mx-auto">
                    <ShoppingBag className="h-5 w-5" />
                  </div>
                  <p className="text-xs text-slate-450 font-bold max-w-[200px] mx-auto leading-relaxed">Giỏ hàng trống. Click vào sản phẩm bên trái để thêm vào hóa đơn.</p>
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <button 
                onClick={handleCheckoutRetail}
                id="btn-checkout-retail"
                className="w-full rounded-xl bg-primary hover:bg-primary-dark text-white font-bold py-3 text-sm cursor-pointer shadow-md transition-colors mt-6 flex items-center justify-center gap-2"
              >
                <QrCode className="h-4 w-4" /> Thanh toán hóa đơn (VietQR)
              </button>
            )}
          </div>
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className="relative">
      
      {/* Tab Selectors */}
      <div className="flex items-center justify-center gap-4 mb-8">
        <button 
          onClick={() => setActiveTab('demo')}
          className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold shadow-xs border transition-all ${
            activeTab === 'demo' ? 'bg-primary border-primary text-white scale-105 shadow-md shadow-primary/20' : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-50'
          }`}
        >
          <Zap className="h-4 w-4" /> Trải nghiệm nghiệp vụ thực tế
        </button>
        <button 
          onClick={() => setActiveTab('benefit')}
          className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold shadow-xs border transition-all ${
            activeTab === 'benefit' ? 'bg-primary border-primary text-white scale-105 shadow-md shadow-primary/20' : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-50'
          }`}
        >
          <CheckCircle className="h-4 w-4" /> Lợi ích nổi trội
        </button>
      </div>

      {activeTab === 'demo' ? (
        <div className="bg-slate-50/50 rounded-[2.5rem] border border-slate-200/60 p-6 md:p-8 shadow-inner relative">
          {renderInteractiveDemo()}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-xs hover:shadow-md transition-shadow">
            <h4 className="text-base font-extrabold text-slate-900 mb-3">Tối ưu quy trình nghiệp vụ</h4>
            <p className="text-slate-500 text-sm leading-relaxed font-medium">Được lập trình đo ni đóng giày cho quy trình làm việc chuẩn xác nhất của ngành nghề của bạn, tăng tốc độ phục vụ lên gấp 3 lần.</p>
          </div>
          <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-xs hover:shadow-md transition-shadow">
            <h4 className="text-base font-extrabold text-slate-900 mb-3">Số liệu tự động, tức thời</h4>
            <p className="text-slate-500 text-sm leading-relaxed font-medium">Báo cáo doanh số bán ra, tiền phòng/giờ chạy và hàng tồn kho cập nhật ngay lập tức theo thẻ kho thực tế mà không cần chốt sổ cuối ngày.</p>
          </div>
          <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-xs hover:shadow-md transition-shadow">
            <h4 className="text-base font-extrabold text-slate-900 mb-3">Bảo mật & BYOD</h4>
            <p className="text-slate-500 text-sm leading-relaxed font-medium">Toàn quyền kiểm soát và lưu trữ dữ liệu của bạn trên Google Sheets cá nhân hoặc database riêng an toàn tuyệt đối 100%.</p>
          </div>
        </div>
      )}

      {/* ═══ VIETQR BILL POPUP MODAL ═══ */}
      {qrCodeData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-2xl p-8 max-w-sm w-full space-y-6 text-center transform scale-100 transition-all duration-300">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-sm font-extrabold text-slate-800">Thanh toán hóa đơn VietQR</span>
              <button onClick={() => setQrCodeData(null)} className="h-8 w-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer font-bold">&times;</button>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-450 uppercase block">Số tiền thanh toán</span>
              <span className="text-2.5xl font-black text-primary">{qrCodeData.amount.toLocaleString()}đ</span>
            </div>

            <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50 flex flex-col items-center justify-center gap-3">
              <div className="relative w-36 h-36 bg-white rounded-xl border border-slate-200 p-3 shadow-xs flex items-center justify-center">
                {/* Visual QR Simulator */}
                <div className="grid grid-cols-5 gap-1 w-full h-full opacity-90">
                  {Array.from({ length: 25 }).map((_, i) => (
                    <div 
                      key={i} 
                      className={`rounded-sm ${(i * 7 + 3) % 2 === 0 ? 'bg-slate-800' : 'bg-transparent'} 
                        ${[0, 1, 2, 5, 9, 20, 21, 24].includes(i) ? 'bg-slate-800' : ''}`} 
                    />
                  ))}
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="bg-primary text-white text-[10px] font-black tracking-tighter px-1.5 py-0.5 rounded-md border border-white shadow-md uppercase">ACB</span>
                </div>
              </div>
              
              <div className="text-xs text-left w-full space-y-1 bg-white p-3 rounded-xl border border-slate-100">
                <p className="flex justify-between"><span className="text-slate-400 font-semibold">Tài khoản thụ hưởng:</span> <span className="font-extrabold text-slate-800">ACB 1234567890</span></p>
                <p className="flex justify-between"><span className="text-slate-400 font-semibold">Nội dung chuyển khoản:</span> <span className="font-extrabold text-slate-800 font-mono">{qrCodeData.addInfo}</span></p>
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setQrCodeData(null)}
                className="flex-1 rounded-xl border-2 border-slate-200 hover:bg-slate-50 text-slate-550 font-bold py-3 text-xs cursor-pointer transition-colors"
              >
                Hủy bỏ
              </button>
              <button 
                id="btn-confirm-payment-done"
                onClick={() => {
                  if (slug === 'lodging') handleConfirmPayRoom();
                  else if (slug === 'retail' || slug === 'fashion') handleConfirmPayRetail();
                  else handleConfirmPayHourly();
                }}
                className="flex-1 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 text-xs cursor-pointer shadow-md transition-colors flex items-center justify-center gap-1.5"
              >
                <Check className="h-4 w-4" /> Xác nhận đã chuyển
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ FASHION VARIANT MODAL ═══ */}
      {fashionVariantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-2xl p-6 max-w-sm w-full space-y-5 transform scale-100 transition-all duration-300">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-sm font-extrabold text-slate-800">Chọn thuộc tính sản phẩm</span>
              <button onClick={() => setFashionVariantModal(null)} className="h-8 w-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer font-bold">&times;</button>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-slate-450 block font-bold">{fashionVariantModal.code}</span>
              <h4 className="font-extrabold text-slate-800 text-base">{fashionVariantModal.name}</h4>
              <span className="text-sm font-extrabold text-primary block mt-1">{fashionVariantModal.price.toLocaleString()}đ</span>
            </div>

            {/* Size Matrix */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-500 block">Kích thước (Size):</span>
              <div className="flex flex-wrap gap-2">
                {fashionVariantModal.variants.sizes.map((sz: string) => (
                  <button 
                    key={sz} 
                    onClick={() => setSelectedSize(sz)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      selectedSize === sz ? 'bg-primary border-primary text-white' : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-50'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Matrix */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-500 block">Màu sắc:</span>
              <div className="flex flex-wrap gap-2">
                {fashionVariantModal.variants.colors.map((cl: string) => (
                  <button 
                    key={cl} 
                    onClick={() => setSelectedColor(cl)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      selectedColor === cl ? 'bg-primary border-primary text-white' : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-50'
                    }`}
                  >
                    {cl}
                  </button>
                ))}
              </div>
            </div>

            <button 
              onClick={addFashionToCartFromModal}
              id="btn-add-fashion-cart"
              className="w-full rounded-xl bg-primary hover:bg-primary-dark text-white font-bold py-3 text-sm cursor-pointer shadow-md transition-colors mt-2"
            >
              Thêm vào giỏ hàng
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
