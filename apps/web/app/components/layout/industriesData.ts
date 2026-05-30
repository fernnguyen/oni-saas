import { 
  Store, 
  Utensils, 
  Target, 
  Trophy, 
  Hotel, 
  Shirt, 
  Clock,
  Pill,
  Smartphone,
  Sparkles,
  ShoppingBag,
  Dumbbell,
  Stethoscope,
  Scissors,
  Coffee,
  Mic,
  Home,
  Crown,
  Baby,
  BookOpen,
  Flower2,
  Wrench,
  Factory,
  HelpCircle,
  Wine,
  Activity
} from 'lucide-react';

export const INDUSTRY_GROUPS = [
  {
    id: 'retail',
    title: 'Phân khúc Bán buôn & Bán lẻ',
    description: 'Hệ thống POS thông minh thích ứng tự động với hàng chục ngành hàng bán buôn, bán lẻ, tối ưu quản lý kho hàng và ma trận biến thế sản phẩm.',
    color: 'text-blue-600 bg-blue-50/60 border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/30',
    slugs: ['retail', 'fashion']
  },
  {
    id: 'fnb_ent',
    title: 'Phân khúc F&B & Vui chơi Giải trí',
    description: 'Quản lý sơ đồ bàn trống, sân bãi theo thời gian thực, tự động tính tiền giờ dịch vụ và kết nối luồng order thông suốt.',
    color: 'text-emerald-600 bg-emerald-50/60 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/30',
    slugs: ['fnb', 'billiards', 'sports-court']
  },
  {
    id: 'lodging_beauty',
    title: 'Phân khúc Lưu trú, Làm đẹp & Sức khỏe',
    description: 'Đặt lịch hẹn liệu trình thông minh, quản lý phòng nghỉ theo giờ/qua đêm linh hoạt và theo dõi hồ sơ chăm sóc khách hàng.',
    color: 'text-violet-600 bg-violet-50/60 border-violet-100 dark:bg-violet-950/20 dark:border-violet-900/30',
    slugs: ['lodging', 'service-hourly']
  }
];

export const INDUSTRIES_LIST = [
  {
    slug: 'retail',
    id: 'retail',
    group: 'retail',
    label: 'Bán buôn & Bán lẻ',
    description: 'Tự động tùy biến giao diện & tính năng cho hàng chục mô hình bán lẻ: Tạp hóa, Điện thoại, Thiết bị, Nhà thuốc, VLXD...',
    icon: Store,
    color: 'text-blue-600 bg-blue-50 border-blue-100 dark:bg-blue-950/30 dark:border-blue-900/30',
    hoverBg: 'hover:bg-blue-50/40 dark:hover:bg-blue-950/20',
    subIndustries: [
      { label: 'Tạp hóa & Siêu thị', icon: Store },
      { label: 'Điện thoại & Điện máy', icon: Smartphone },
      { label: 'Mỹ phẩm & Hóa mỹ phẩm', icon: Sparkles },
      { label: 'Vật liệu xây dựng & Sơn', icon: Store },
      { label: 'Nhà thuốc & Quầy dược', icon: Pill },
      { label: 'Nông sản & Thực phẩm sạch', icon: ShoppingBag },
      { label: 'Mẹ & Bé', icon: Baby },
      { label: 'Nội thất & Gia dụng', icon: Home },
      { label: 'Sách & Văn phòng phẩm', icon: BookOpen },
      { label: 'Hoa & Quà tặng', icon: Flower2 },
      { label: 'Xe & Máy móc phụ tùng', icon: Wrench },
      { label: 'Sản xuất & Gia công', icon: Factory },
      { label: 'Ngành hàng bán lẻ khác', icon: HelpCircle }
    ]
  },
  {
    slug: 'fashion',
    id: 'fashion',
    group: 'retail',
    label: 'Shop Thời trang & Phụ kiện',
    description: 'Quản lý ma trận màu sắc, kích thước (size), tem nhãn mã vạch tag sản phẩm chuyên nghiệp cho shop quần áo, giày dép.',
    icon: Shirt,
    color: 'text-rose-600 bg-rose-50 border-rose-100 dark:bg-rose-950/30 dark:border-rose-900/30',
    hoverBg: 'hover:bg-rose-50/40 dark:hover:bg-rose-950/20',
    subIndustries: [
      { label: 'Thời trang & Phụ kiện', icon: Shirt }
    ]
  },
  {
    slug: 'fnb',
    id: 'fnb',
    group: 'fnb_ent',
    label: 'Nhà hàng & Cafe',
    description: 'Order từ xa tại bàn bằng QR, in bếp tự động, quản lý định lượng nguyên vật liệu tránh hao hụt thất thoát.',
    icon: Utensils,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/30',
    hoverBg: 'hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20',
    subIndustries: [
      { label: 'Nhà hàng & Quán ăn', icon: Utensils },
      { label: 'Cafe & Trà sữa', icon: Coffee },
      { label: 'Bar, Pub & Club', icon: Wine }
    ]
  },
  {
    slug: 'billiards',
    id: 'billiards',
    group: 'fnb_ent',
    label: 'Câu lạc bộ Bi-a',
    description: 'Tự động tính tiền giờ thông minh theo bàn, đồng bộ hóa dịch vụ ăn uống và thẻ hội viên.',
    icon: Target,
    color: 'text-violet-600 bg-violet-50 border-violet-100 dark:bg-violet-950/30 dark:border-violet-900/30',
    hoverBg: 'hover:bg-violet-50/40 dark:hover:bg-violet-950/20',
    subIndustries: [
      { label: 'Quán Billiards (Bi-a)', icon: Target }
    ]
  },
  {
    slug: 'sports-court',
    id: 'sports_court',
    group: 'fnb_ent',
    label: 'Sân thể thao & Pickleball',
    description: 'Đặt lịch sân chéo trực quan, thanh toán giờ thuê linh hoạt theo khung giờ cao điểm.',
    icon: Trophy,
    color: 'text-amber-600 bg-amber-50 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900/30',
    hoverBg: 'hover:bg-amber-50/40 dark:hover:bg-amber-950/20',
    subIndustries: [
      { label: 'Sân Pickleball & Thể thao', icon: Trophy }
    ]
  },
  {
    slug: 'lodging',
    id: 'lodging',
    group: 'lodging_beauty',
    label: 'Nhà nghỉ & Khách sạn',
    description: 'Sơ đồ phòng theo tầng, tính bill theo giờ/qua đêm tự động, quản lý vệ sinh dọn dẹp phòng.',
    icon: Hotel,
    color: 'text-indigo-600 bg-indigo-50 border-indigo-100 dark:bg-indigo-950/30 dark:border-indigo-900/30',
    hoverBg: 'hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20',
    subIndustries: [
      { label: 'Khách sạn & Nhà nghỉ', icon: Hotel },
      { label: 'Homestay & Villa', icon: Home }
    ]
  },
  {
    slug: 'service-hourly',
    id: 'service_hourly',
    group: 'lodging_beauty',
    label: 'Dịch vụ & Làm đẹp',
    description: 'Đặt lịch hẹn liệu trình, quản lý thẻ thành viên, hoa hồng kỹ thuật viên Spa, Salon...',
    icon: Clock,
    color: 'text-cyan-600 bg-cyan-50 border-cyan-100 dark:bg-cyan-950/30 dark:border-cyan-900/30',
    hoverBg: 'hover:bg-cyan-50/40 dark:hover:bg-cyan-950/20',
    subIndustries: [
      { label: 'Beauty Spa & Massage', icon: Sparkles },
      { label: 'Hair Salon & Nails', icon: Scissors },
      { label: 'Karaoke & Giải trí', icon: Mic },
      { label: 'Phòng khám tư nhân', icon: Stethoscope },
      { label: 'Fitness & Yoga Center', icon: Dumbbell }
    ]
  }
];

export const ALL_SECTORS = [
  {
    groupId: 'retail',
    groupLabel: 'Bán buôn & Bán lẻ',
    color: 'border-blue-100 text-blue-700 bg-blue-50/40 dark:bg-blue-950/10 dark:border-blue-900/20',
    items: [
      { label: 'Tạp hóa & Siêu thị', href: '/solutions/retail/tap-hoa-sieu-thi', icon: Store },
      { label: 'Thời trang & Phụ kiện', href: '/solutions/fashion/thoi-trang-phu-kien', icon: Shirt },
      { label: 'Điện thoại & Điện máy', href: '/solutions/retail/dien-thoai-dien-may', icon: Smartphone },
      { label: 'Nhà thuốc & Quầy dược', href: '/solutions/retail/nha-thuoc-quay-duoc', icon: Pill },
      { label: 'Mỹ phẩm & Hóa mỹ phẩm', href: '/solutions/retail/my-pham-hoa-my-pham', icon: Sparkles },
      { label: 'Nông sản & Thực phẩm', href: '/solutions/retail/nong-san-thuc-pham-sach', icon: ShoppingBag },
      { label: 'Mẹ & Bé', href: '/solutions/retail/me-be', icon: Baby },
      { label: 'Vật liệu xây dựng', href: '/solutions/retail/vat-lieu-xay-dung-son', icon: Store },
      { label: 'Sách & Văn phòng phẩm', href: '/solutions/retail/sach-van-phong-pham', icon: BookOpen }
    ]
  },
  {
    groupId: 'fnb_ent',
    groupLabel: 'Ăn uống & Giải trí',
    color: 'border-emerald-100 text-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/10 dark:border-emerald-900/20',
    items: [
      { label: 'Nhà hàng & Quán ăn', href: '/solutions/fnb/nha-hang-quan-an', icon: Utensils },
      { label: 'Cafe & Trà sữa', href: '/solutions/fnb/cafe-tra-sua', icon: Coffee },
      { label: 'Quán Billiards (Bi-a)', href: '/solutions/billiards/quan-billiards-bi-a', icon: Target },
      { label: 'Sân Pickleball & Thể thao', href: '/solutions/sports-court/san-pickleball-the-thao', icon: Trophy },
      { label: 'Bar, Pub & Club', href: '/solutions/fnb/bar-pub-club', icon: Wine },
      { label: 'Karaoke & Giải trí', href: '/solutions/service-hourly/karaoke-giai-tri', icon: Mic }
    ]
  },
  {
    groupId: 'lodging_beauty',
    groupLabel: 'Lưu trú & Làm đẹp',
    color: 'border-violet-100 text-violet-700 bg-violet-50/40 dark:bg-violet-950/10 dark:border-violet-900/20',
    items: [
      { label: 'Khách sạn & Nhà nghỉ', href: '/solutions/lodging/khach-san-nha-nghi', icon: Hotel },
      { label: 'Homestay & Villa', href: '/solutions/lodging/homestay-villa', icon: Home },
      { label: 'Beauty Spa & Massage', href: '/solutions/service-hourly/beauty-spa-massage', icon: Sparkles },
      { label: 'Hair Salon & Nails', href: '/solutions/service-hourly/hair-salon-nails', icon: Scissors },
      { label: 'Phòng khám tư nhân', href: '/solutions/service-hourly/phong-kham-tu-nhan', icon: Stethoscope },
      { label: 'Fitness & Yoga Center', href: '/solutions/service-hourly/fitness-yoga-center', icon: Dumbbell }
    ]
  }
];
export const ALL_SECTORS_LIST = ALL_SECTORS.flatMap(g => g.items);
