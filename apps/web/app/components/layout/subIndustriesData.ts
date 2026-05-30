import { 
  Pill, 
  Smartphone, 
  Store, 
  Sparkles, 
  ShoppingBag, 
  Baby, 
  Home, 
  BookOpen, 
  Flower2, 
  Wrench, 
  Factory, 
  HelpCircle,
  Shirt,
  Utensils,
  Coffee,
  Wine,
  Target,
  Trophy,
  Hotel,
  Clock,
  Scissors,
  Stethoscope,
  Dumbbell,
  Mic,
  Crown
} from 'lucide-react';

export interface SubIndustryDetail {
  slug: string;
  parentSlug: string;
  label: string;
  icon: any;
  highlight: string;
  painPoints: string[];
  solutions: string[];
  features: string[];
  visualMock: {
    title: string;
    badgeText: string;
    metrics: { label: string; value: string; color: string }[];
    dataList: { label: string; sub: string; status: string; statusColor: string }[];
  };
}

export const SUB_INDUSTRIES_DETAILS: Record<string, SubIndustryDetail> = {
  // === RETAIL ===
  'nha-thuoc-quay-duoc': {
    slug: 'nha-thuoc-quay-duoc',
    parentSlug: 'retail',
    label: 'Nhà thuốc & Quầy dược',
    icon: Pill,
    highlight: 'Kiểm soát chặt chẽ Lô & Hạn sử dụng (Batch/Expiry), quản lý bán thuốc theo đơn mẫu và báo cáo doanh thu chi tiết theo dược sĩ trực.',
    painPoints: [
      'Hàng hóa hết hạn sử dụng cận date không kiểm soát được, gây tổn thất chi phí lớn.',
      'Bán thuốc theo đơn phức tạp, tốn thời gian gõ tìm kiếm từng loại hoạt chất.',
      'Khó theo dõi doanh số và ca trực của các dược sĩ khác nhau tại quầy.'
    ],
    solutions: [
      'Quản lý xuất nhập kho theo nguyên tắc FEFO (Hạn dùng trước - Xuất trước), cảnh báo đỏ hàng cận date trên POS.',
      'Thiết lập liều dùng, đơn thuốc mẫu (Cảm cúm, ho, sốt) giúp thu ngân ra toa chỉ với 1 click.',
      'Phân ca trực và tính hoa hồng doanh số tự động cho từng dược sĩ trực ca.'
    ],
    features: [
      'Quản lý Lô & Hạn dùng (Batch/Expiry tracking)',
      'Bán hàng theo đơn thuốc mẫu & Liều kê sẵn',
      'Tìm kiếm theo tên hoạt chất hoặc tên biệt dược',
      'Đồng bộ báo cáo doanh thu theo ca trực Dược sĩ'
    ],
    visualMock: {
      title: 'Bảng theo dõi Lô cận date',
      badgeText: 'Cảnh báo tự động',
      metrics: [
        { label: 'Tồn cận date', value: '12 hộp', color: 'text-red-600' },
        { label: 'Lô hoạt động', value: '45 lô', color: 'text-slate-700' },
        { label: 'Doanh thu ca', value: '3.8M', color: 'text-primary' }
      ],
      dataList: [
        { label: 'Amoxicillin 500mg', sub: 'Lô: AMX-02 • HSD: 10/06/2026', status: 'CẬN DATE (Đỏ)', statusColor: 'bg-red-50 text-red-700 border-red-100' },
        { label: 'Paracetamol 500mg', sub: 'Lô: PCT-12 • HSD: 15/12/2026', status: 'An toàn', statusColor: 'bg-green-50 text-green-700 border-green-100' },
        { label: 'Panadol Extra', sub: 'Lô: PND-05 • HSD: 20/09/2027', status: 'An toàn', statusColor: 'bg-green-50 text-green-700 border-green-100' }
      ]
    }
  },
  'dien-thoai-dien-may': {
    slug: 'dien-thoai-dien-may',
    parentSlug: 'retail',
    label: 'Điện thoại & Điện máy',
    icon: Smartphone,
    highlight: 'Theo dõi vòng đời sản phẩm chính xác thông qua mã IMEI/Serial duy nhất, tự động quản lý bảo hành điện tử.',
    painPoints: [
      'Nhầm lẫn linh phụ kiện, không kiểm soát được chính xác chiếc máy nào đã bán cho ai.',
      'Tra cứu lịch sử bảo hành thủ công bằng sổ sách mất thời gian, dễ tranh chấp với khách.',
      'Quản lý hoa hồng kỹ thuật viên lắp đặt/sửa chữa phức tạp.'
    ],
    solutions: [
      'Bắt buộc quét mã IMEI/Serial khi nhập và xuất kho, lưu vết lịch sử sở hữu 100%.',
      'Hệ thống tự động kích hoạt bảo hành điện tử theo ngày bán trên hóa đơn, tra cứu tức thời.',
      'Phân bổ hoa hồng sửa chữa, lắp đặt tự động cho kỹ thuật viên theo đơn hàng.'
    ],
    features: [
      'Quản lý mã IMEI/Serial trên từng sản phẩm',
      'Kích hoạt & Tra cứu bảo hành điện tử tự động',
      'Theo dõi lịch sử sửa chữa & Bảo trì máy',
      'Tính hoa hồng kỹ thuật viên sửa chữa'
    ],
    visualMock: {
      title: 'Quản lý IMEI & Bảo hành',
      badgeText: 'IMEI Log',
      metrics: [
        { label: 'Đã kích hoạt', value: '180 máy', color: 'text-emerald-600' },
        { label: 'Đang bảo hành', value: '4 ca', color: 'text-amber-600' },
        { label: 'Tồn Serial', value: '320 mã', color: 'text-slate-700' }
      ],
      dataList: [
        { label: 'iPhone 15 Pro Max 256GB', sub: 'IMEI: 3589...2514 • BH: 12 tháng', status: 'Đã bán - Active', statusColor: 'bg-blue-50 text-blue-700 border-blue-100' },
        { label: 'iPad Pro M2 11inch', sub: 'Serial: DLXG...H34M • BH: Còn 3 tháng', status: 'Bảo hành', statusColor: 'bg-amber-50 text-amber-700 border-amber-100' },
        { label: 'Galaxy S24 Ultra', sub: 'IMEI: 3542...9876 • BH: Chưa kích hoạt', status: 'Trong Kho', statusColor: 'bg-slate-100 text-slate-700 border-slate-200' }
      ]
    }
  },
  'tap-hoa-sieu-thi': {
    slug: 'tap-hoa-sieu-thi',
    parentSlug: 'retail',
    label: 'Tạp hóa & Siêu thị',
    icon: Store,
    highlight: 'Quét barcode siêu tốc tại quầy thu ngân, quản lý hàng nghìn SKU hàng hóa đa dạng và đóng gói combo/lốc khuyến mãi linh hoạt.',
    painPoints: [
      'Hàng nghìn mã hàng đa dạng, thu ngân không nhớ nổi giá bán dẫn đến tính sai tiền.',
      'Xếp hàng thanh toán quá lâu vào giờ cao điểm gây mất khách.',
      'Khó quản lý chính sách bán sỉ/bán lẻ hoặc bán theo lốc/thùng/combo.'
    ],
    solutions: [
      'Hỗ trợ quét mã vạch siêu tốc từ camera hoặc máy quét chuyên dụng, tự động khớp giá bán.',
      'Giao diện POS bán lẻ tối ưu thao tác phím tắt, in hóa đơn trong 2 giây.',
      'Hỗ trợ quy đổi đơn vị tính linh hoạt (Thùng -> Lốc -> Chai) và tự động chiết khấu combo.'
    ],
    features: [
      'Bán hàng bằng quét mã vạch siêu tốc (Barcode POS)',
      'Quy đổi đơn vị tính đa cấp (Thùng, Lốc, Chai)',
      'Quản lý hàng nghìn SKU sản phẩm không giới hạn',
      'Hệ thống khuyến mãi, giảm giá & Tích điểm thành viên'
    ],
    visualMock: {
      title: 'Quầy POS Tạp hóa nhanh',
      badgeText: 'Thao tác nhanh',
      metrics: [
        { label: 'SKU đang bán', value: '4,500', color: 'text-slate-700' },
        { label: 'Đơn hôm nay', value: '185 đơn', color: 'text-primary' },
        { label: 'Tốc độ quét', value: '0.5s/mã', color: 'text-emerald-600' }
      ],
      dataList: [
        { label: 'Sữa tươi Vinamilk 180ml', sub: 'Đơn vị: Thùng (48 hộp) / Lốc (4 hộp) / Hộp', status: 'Đã quy đổi', statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        { label: 'Nước ngọt Coca-Cola 320ml', sub: 'Mã vạch: 893000...0025 • Đang khuyến mãi', status: 'Combo -10%', statusColor: 'bg-amber-50 text-amber-700 border-amber-100' },
        { label: 'Dầu ăn Neptune 1L', sub: 'Tồn kho: 120 chai • Điểm tích lũy: +5đ', status: 'Bán chạy', statusColor: 'bg-blue-50 text-blue-700 border-blue-100' }
      ]
    }
  },
  'my-pham-hoa-my-pham': {
    slug: 'my-pham-hoa-my-pham',
    parentSlug: 'retail',
    label: 'Mỹ phẩm & Hóa mỹ phẩm',
    icon: Sparkles,
    highlight: 'Quản lý hạn sử dụng sản phẩm, theo dõi hoa hồng tư vấn cho nhân viên bán hàng và tích điểm nâng hạng thành viên thân thiết.',
    painPoints: [
      'Sản phẩm hóa mỹ phẩm cận date bị khô hỏng, đổi trả liên tục gây mất uy tín.',
      'Khó phân chia hoa hồng chính xác cho nhân viên trực tiếp tư vấn dòng mỹ phẩm cao cấp.',
      'Khách hàng mua nhiều lần nhưng không có chính sách chăm sóc/tích điểm phù hợp.'
    ],
    solutions: [
      'Hệ thống theo dõi chi tiết hạn dùng từng lô, tự động cảnh báo sản phẩm sắp hết hạn.',
      'Lưu vết nhân viên tư vấn trên từng dòng đơn hàng để tính hoa hồng chính xác.',
      'Hệ thống phân hạng thành viên tự động (Bạc, Vàng, Kim cương) đi kèm khuyến mãi đặc quyền.'
    ],
    features: [
      'Cảnh báo hạn sử dụng hóa mỹ phẩm',
      'Tính hoa hồng tư vấn dòng sản phẩm',
      'Quản lý nhóm thành viên VIP & Đổi thưởng tích điểm',
      'Đồng bộ kênh bán hàng mạng xã hội'
    ],
    visualMock: {
      title: 'Hồ sơ khách hàng VIP Mỹ phẩm',
      badgeText: 'Tích điểm thành viên',
      metrics: [
        { label: 'Thành viên VIP', value: '450 khách', color: 'text-violet-650' },
        { label: 'Hoa hồng tư vấn', value: '1.2M', color: 'text-emerald-600' },
        { label: 'Đơn hàng MXH', value: '38 đơn', color: 'text-primary' }
      ],
      dataList: [
        { label: 'Nguyễn Thị B (Hạng Vàng)', sub: 'Tích lũy: 1,200 điểm • Ưu đãi: Giảm 5%', status: 'Khách VIP', statusColor: 'bg-violet-50 text-violet-755 border-violet-100' },
        { label: 'Son kem lì Black Rouge A12', sub: 'Tư vấn viên: Nguyễn Lan • Hoa hồng: 15K/thỏi', status: 'Tính hoa hồng', statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        { label: 'Kem chống nắng La Roche-Posay', sub: 'HSD: 18/10/2026 • Còn tồn: 25 tuýp', status: 'An toàn', statusColor: 'bg-green-50 text-green-700 border-green-100' }
      ]
    }
  },
  'vat-lieu-xay-dung-son': {
    slug: 'vat-lieu-xay-dung-son',
    parentSlug: 'retail',
    label: 'Vật liệu xây dựng',
    icon: Store,
    highlight: 'Quy đổi đơn vị đa dạng (bao, khối, tấn), quản lý công nợ đại lý gối đầu phức tạp và theo dõi chi phí đội xe chở hàng.',
    painPoints: [
      'Không quản lý được quy đổi đơn vị (ví dụ bán lẻ theo kg nhưng nhập theo Tấn hoặc khối).',
      'Khách hàng công nợ gối đầu liên tục, khó đối soát sổ sách cuối tháng.',
      'Mất kiểm soát chi phí dầu, xe cộ chở hàng cho khách.'
    ],
    solutions: [
      'Công cụ quy đổi đơn vị đo lường thông minh (Tấn -> Bao -> Kg) tự động điều chuyển tồn kho.',
      'Sổ nợ chi tiết từng khách hàng, giới hạn hạn mức nợ gối đầu và nhắc nợ tự động qua Zalo/Telegram.',
      'Tích hợp chi phí giao hàng, xăng xe và hoa hồng tài xế lái xe tải vào hóa đơn.'
    ],
    features: [
      'Quy đổi đơn vị đo lường đa năng (Tấn, Khối, Bao)',
      'Quản lý công nợ đại lý gối đầu & Nhắc nợ tự động',
      'Tính chi phí vận chuyển & Đội xe giao hàng',
      'Theo dõi pha màu sơn & Công thức sản phẩm phụ'
    ],
    visualMock: {
      title: 'Quản lý Công nợ gối đầu',
      badgeText: 'Công nợ đại lý',
      metrics: [
        { label: 'Tổng nợ phải thu', value: '450M', color: 'text-red-600' },
        { label: 'Đại lý hoạt động', value: '18 nhà', color: 'text-slate-700' },
        { label: 'Chuyến xe chạy', value: '12 chuyến', color: 'text-primary' }
      ],
      dataList: [
        { label: 'Đại lý Xây dựng Thành Đạt', sub: 'Dư nợ: 125,000,000đ • Hạn mức nợ: 150M', status: 'TRONG HẠN MỨC', statusColor: 'bg-green-50 text-green-700 border-green-100' },
        { label: 'Thép Hòa Phát Phi 10', sub: 'Nhập: 10 Tấn • Quy đổi: 200 cuộn • Bán: Kg', status: 'Quy đổi sẵn', statusColor: 'bg-blue-50 text-blue-700 border-blue-100' },
        { label: 'Giao hàng công trình CT05', sub: 'Tài xế: Nguyễn Văn Hùng • Phí xe: 250,000đ', status: 'Đang vận chuyển', statusColor: 'bg-amber-50 text-amber-700 border-amber-100' }
      ]
    }
  },
  'nong-san-thuc-pham-sach': {
    slug: 'nong-san-thuc-pham-sach',
    parentSlug: 'retail',
    label: 'Nông sản & Thực phẩm sạch',
    icon: ShoppingBag,
    highlight: 'Kiểm soát hàng tươi sống hao hụt tự nhiên, đóng khay định lượng cân điện tử và theo dõi hạn sử dụng ngắn ngày.',
    painPoints: [
      'Thực phẩm tươi sống hao hụt tự nhiên (bay hơi, dập nát) không được ghi nhận, gây sai lệch sổ sách.',
      'Mất nhiều thời gian dán tem, cân khối lượng lẻ của từng khay thịt, rau.',
      'Hàng hóa hư hỏng nhanh chóng nếu không bán kịp theo ngày.'
    ],
    solutions: [
      'Tính năng khai báo phiếu hao hụt tự hủy tự động trừ vào kho định kỳ.',
      'Tích hợp trực tiếp cân điện tử, tự động in mã vạch khối lượng và dán nhãn POS.',
      'Áp dụng chính sách xả hàng giảm giá tự động theo khung giờ (ví dụ sau 18h giảm 30% rau tươi).'
    ],
    features: [
      'Ghi nhận hao hụt tự nhiên & Phiếu hủy hàng',
      'Tích hợp cân điện tử & In mã vạch trọng lượng',
      'Khuyến mãi tự động theo khung giờ vàng',
      'Quản lý xuất nhập tồn hàng tươi sống ngắn ngày'
    ],
    visualMock: {
      title: 'Quản lý Cân điện tử & Hao hụt',
      badgeText: 'Hàng tươi sống',
      metrics: [
        { label: 'Hao hụt hôm nay', value: '4.5 kg', color: 'text-amber-600' },
        { label: 'Sản phẩm dán nhãn', value: '320 khay', color: 'text-primary' },
        { label: 'Tồn ngắn ngày', value: '15 SKU', color: 'text-slate-700' }
      ],
      dataList: [
        { label: 'Thịt ba rọi bò Mỹ', sub: 'Cân nặng: 0.45kg • Đơn giá: 250,000đ/kg', status: 'In nhãn: 112,500đ', statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        { label: 'Rau cải ngọt hữu cơ', sub: 'Hao hụt bay hơi: 1.2kg • Phiếu hủy hàng #05', status: 'Đã hủy', statusColor: 'bg-red-50 text-red-700 border-red-100' },
        { label: 'Sữa tươi thanh trùng', sub: 'HSD: 05/06/2026 (Còn 5 ngày) • Giảm giá sau 19h', status: 'Xả hàng -30%', statusColor: 'bg-amber-50 text-amber-700 border-amber-100' }
      ]
    }
  },
  'me-be': {
    slug: 'me-be',
    parentSlug: 'retail',
    label: 'Mẹ & Bé',
    icon: Baby,
    highlight: 'Quản lý ma trận phân loại sữa, bỉm, đồ chơi đa dạng, theo dõi tuổi bé để gửi tin nhắn gợi ý sản phẩm phù hợp qua Zalo.',
    painPoints: [
      'Hàng trăm mã bỉm, sữa tương tự nhau về bao bì dễ gây nhầm lẫn khi bán hàng.',
      'Khó tiếp cận khách hàng mua sữa định kỳ khi bé lớn lên.',
      'Khó quản lý date sữa cận hạn.'
    ],
    solutions: [
      'Phân loại thuộc tính sản phẩm chi tiết theo size, thương hiệu, độ tuổi sử dụng.',
      'Lưu thông tin ngày sinh của bé, tự động nhắn tin chúc mừng và gợi ý size bỉm, dòng sữa tiếp theo qua Zalo OA.',
      'Kiểm soát nghiêm ngặt Lô & Hạn sử dụng của các dòng sữa bột cao cấp.'
    ],
    features: [
      'Quản lý biến thế hàng hóa chi tiết',
      'Lưu thông tin ngày sinh bé & Tự động CSKH Zalo',
      'Nhắc lịch mua sữa định kỳ cho mẹ bỉm sữa',
      'Kiểm soát hạn dùng sữa, thực phẩm dinh dưỡng'
    ],
    visualMock: {
      title: 'Hồ sơ Bé & Nhắc lịch Zalo',
      badgeText: 'Chăm sóc khách hàng',
      metrics: [
        { label: 'Bé đăng ký', value: '380 bé', color: 'text-violet-650' },
        { label: 'Lịch nhắc mua', value: '12 khách', color: 'text-primary' },
        { label: 'Date sữa an toàn', value: '100%', color: 'text-emerald-600' }
      ],
      dataList: [
        { label: 'Bé Gia Bảo (Mẹ: Vy)', sub: 'Sinh ngày: 15/09/2025 (9 tháng) • Đề xuất: Bỉm size L', status: 'Zalo nhắc: Bỉm L', statusColor: 'bg-violet-50 text-violet-755 border-violet-100' },
        { label: 'Sữa Meiji nội địa Nhật 0-1', sub: 'Hạn dùng: 28/12/2026 • Còn tồn: 85 lon', status: 'An toàn', statusColor: 'bg-green-50 text-green-700 border-green-100' },
        { label: 'Xe đẩy trẻ em cao cấp', sub: 'Phân loại: Màu xanh lá • Thương hiệu: Chilux', status: 'Trong Kho', statusColor: 'bg-slate-100 text-slate-700 border-slate-200' }
      ]
    }
  },
  'sach-van-phong-pham': {
    slug: 'sach-van-phong-pham',
    parentSlug: 'retail',
    label: 'Sách & Văn phòng phẩm',
    icon: BookOpen,
    highlight: 'Quản lý hàng chục nghìn đầu sách theo tác giả, nhà xuất bản, vị trí kệ sách và mã vạch ISBN quốc tế.',
    painPoints: [
      'Hàng chục nghìn đầu sách đa dạng, nhân viên không thể tìm thấy sách ở kệ nào để lấy cho khách.',
      'Nhập kho tốn thời gian gõ từng đầu sách thủ công.',
      'Khó theo dõi doanh thu văn phòng phẩm nhỏ lẻ.'
    ],
    solutions: [
      'Khai báo vị trí kệ hàng (Kệ A, Kệ B, Hàng 1) trên thẻ sản phẩm để nhân viên tra cứu và lấy sách trong 5 giây.',
      'Hỗ trợ quét mã vạch ISBN quốc tế in sẵn trên bìa sách để nhập kho siêu tốc.',
      'Phân loại mã hàng văn phòng phẩm chi tiết để quản lý hàng tồn siêu mịn.'
    ],
    features: [
      'Quản lý vị trí Kệ/Ngăn chứa sách trực quan',
      'Quét mã ISBN quốc tế để nhập kho tự động',
      'Phân nhóm sách theo Tác giả & Nhà xuất bản',
      'POS bán nhanh tích hợp văn phòng phẩm nhỏ lẻ'
    ],
    visualMock: {
      title: 'Đầu sách & Vị trí Kệ hàng',
      badgeText: 'Tra cứu vị trí',
      metrics: [
        { label: 'Tổng đầu sách', value: '12,000', color: 'text-slate-750' },
        { label: 'ISBN Nhập kho', value: '100%', color: 'text-emerald-600' },
        { label: 'Đơn sách hôm nay', value: '45 đơn', color: 'text-primary' }
      ],
      dataList: [
        { label: 'Đắc Nhân Tâm (Khổ lớn)', sub: 'Tác giả: Dale Carnegie • NXB: Tổng Hợp • Vị trí: Kệ A1-Hàng 3', status: 'Kệ A1-H3', statusColor: 'bg-blue-50 text-blue-700 border-blue-100' },
        { label: 'Sổ tay da cao cấp A5', sub: 'Mã vạch: 89312...04 • Nhóm: Văn phòng phẩm', status: 'Tồn: 450 cuốn', statusColor: 'bg-slate-100 text-slate-700 border-slate-200' },
        { label: 'Bút bi Thiên Long 0.5', sub: 'Mã vạch: 89320...12 • Hộp 20 cây', status: 'Bán lẻ & Hộp', statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-100' }
      ]
    }
  },

  // === FASHION ===
  'thoi-trang-phu-kien': {
    slug: 'thoi-trang-phu-kien',
    parentSlug: 'fashion',
    label: 'Thời trang & Phụ kiện',
    icon: Shirt,
    highlight: 'Quản lý ma trận biến thể thuộc tính Size/Color (Kích thước & Màu sắc) chuyên nghiệp, in tem tag quần áo tích hợp POS.',
    painPoints: [
      'Nhập 1 mẫu áo có 5 size, 4 màu tạo thành 20 dòng sản phẩm thủ công cực kỳ tốn sức.',
      'Khách hỏi size áo màu này còn tồn không, nhân viên phải lục lọi kho mất 10 phút.',
      'Nhầm lẫn, thất thoát hàng quần áo cao cấp.'
    ],
    solutions: [
      'Tạo ma trận thuộc tính (Size/Color) tự động sinh hàng chục biến thể sản phẩm chỉ trong 5 giây.',
      'Màn hình POS hiển thị số lượng tồn chi tiết của từng size và màu sắc theo thời gian thực.',
      'In tem nhãn tag mã vạch dán trực tiếp lên mác quần áo giúp quét bán hàng siêu nhanh.'
    ],
    features: [
      'Tự động sinh ma trận biến thể Size/Color',
      'Tra cứu tồn kho theo thuộc tính trong 1 giây',
      'Thiết kế & In tem nhãn tag quần áo tại quầy',
      'Đồng bộ đơn hàng với các kênh Shopee/Lazada'
    ],
    visualMock: {
      title: 'Ma trận biến thể Size & Màu',
      badgeText: 'Thời trang POS',
      metrics: [
        { label: 'Biến thể tồn', value: '1,500 mã', color: 'text-slate-750' },
        { label: 'Đơn bán lẻ', value: '64 đơn', color: 'text-primary' },
        { label: 'Đã in tem tag', value: '100%', color: 'text-emerald-600' }
      ],
      dataList: [
        { label: 'Áo thun Polo Classic Unisex', sub: 'Biến thể: Đen / Size L • Còn tồn: 12 cái', status: 'Còn hàng (12)', statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        { label: 'Áo thun Polo Classic Unisex', sub: 'Biến thể: Trắng / Size M • Còn tồn: 0 cái', status: 'HẾT HÀNG', statusColor: 'bg-red-50 text-red-700 border-red-100' },
        { label: 'Váy len tăm body nữ', sub: 'Biến thể: Kem / Size S • Tag in mã vạch', status: 'In tag: #V102', statusColor: 'bg-blue-50 text-blue-700 border-blue-100' }
      ]
    }
  },

  // === FNB ===
  'cafe-tra-sua': {
    slug: 'cafe-tra-sua',
    parentSlug: 'fnb',
    label: 'Cafe & Trà sữa',
    icon: Coffee,
    highlight: 'Gọi món tại bàn bằng QR, in tem nhãn dán cốc tự động (Topping, Đường, Đá) và quản lý định lượng nguyên liệu pha chế.',
    painPoints: [
      'Nhân viên ghi chép order giấy hay bị nhầm lẫn món của khách, ghi thiếu topping.',
      'Giờ cao điểm thu ngân không kịp in tem dán ly làm bộ phận pha chế bị rối loạn.',
      'Mất mát nguyên liệu pha chế (sữa, cà phê, siro) không rõ nguyên nhân.'
    ],
    solutions: [
      'Khách tự quét mã QR tại bàn gọi món, order tự động đồng bộ vào màn hình pha chế.',
      'Hệ thống tự động in tem nhãn dán ly (ghi rõ tên món, mức đường, đá, topping kèm theo) ngay khi hóa đơn được thanh toán.',
      'Tự động trừ kho nguyên liệu (hạt cafe, sữa đặc) theo công thức pha chế (BOM) định sẵn.'
    ],
    features: [
      'Khách hàng quét mã QR gọi món tại bàn',
      'Tự động in tem nhãn dán ly cốc trà sữa',
      'Định lượng nguyên vật liệu pha chế (BOM)',
      'Đồng bộ quầy thu ngân & Màn hình pha chế'
    ],
    visualMock: {
      title: 'Order tem ly & Định lượng kho',
      badgeText: 'Pha chế & POS',
      metrics: [
        { label: 'Cốc đã bán', value: '250 ly', color: 'text-primary' },
        { label: 'Sản lượng sữa', value: '-8.5L', color: 'text-slate-650' },
        { label: 'Bàn hoạt động', value: '18 bàn', color: 'text-emerald-600' }
      ],
      dataList: [
        { label: 'Trà sữa Trân châu Đường đen', sub: 'Tem cốc: 50% Đường • 30% Đá • Topping: Trân châu đen', status: 'In tem dán ly', statusColor: 'bg-blue-50 text-blue-700 border-blue-100' },
        { label: 'Cà phê nâu đá sài gòn', sub: 'Định lượng BOM: 20g hạt cafe • 30ml sữa đặc Neptune', status: 'Khấu trừ kho', statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        { label: 'Bàn số 05 (Quét QR)', sub: 'Đang chọn món: 2 trà đào cam sả • Chờ duyệt', status: 'Đợi duyệt (2)', statusColor: 'bg-amber-50 text-amber-700 border-amber-100' }
      ]
    }
  },
  'nha-hang-quan-an': {
    slug: 'nha-hang-quan-an',
    parentSlug: 'fnb',
    label: 'Nhà hàng & Quán ăn',
    icon: Utensils,
    highlight: 'Quản lý sơ đồ bàn trống trực quan, gộp bàn/tách hóa đơn dễ dàng, kết nối đơn món xuống bếp tức thời qua KDS.',
    painPoints: [
      'Khách gọi món xong nhân viên chạy bộ xuống bếp đưa giấy rất lâu, dễ ghi nhầm hoặc sót món.',
      'Khách muốn đổi bàn, gộp bàn hoặc tách bill thanh toán riêng nhân viên tính tay lúng túng.',
      'Không biết bàn nào đang chờ món, bàn nào đã phục vụ xong để điều phối phục vụ.'
    ],
    solutions: [
      'Sử dụng tablet/máy POS cầm tay gọi món tại bàn, đơn món gửi thẳng xuống bếp tức thời.',
      'Thao tác kéo thả trên sơ đồ để đổi bàn, tách món, chia hóa đơn của nhóm khách chỉ trong 3 giây.',
      'Sơ đồ bàn hiển thị sinh động theo màu sắc: Bàn trống, Đang phục vụ, Chờ chế biến, Đã thanh toán.'
    ],
    features: [
      'Sơ đồ bàn theo tầng/khu vực trực quan',
      'Đồng bộ đơn món xuống Kitchen Display (KDS)',
      'Gộp bàn, chuyển bàn & Tách hóa đơn nhanh',
      'Quản lý đặt bàn trước & Phí dịch vụ kèm theo'
    ],
    visualMock: {
      title: 'Sơ đồ Bàn ăn & Kitchen Display',
      badgeText: 'KDS & Tables',
      metrics: [
        { label: 'Bàn đang ngồi', value: '14 bàn', color: 'text-emerald-600' },
        { label: 'Món chờ chế biến', value: '8 món', color: 'text-amber-600' },
        { label: 'Doanh thu bàn', value: '12.5M', color: 'text-primary' }
      ],
      dataList: [
        { label: 'Bàn số 12 (Khu VIP)', sub: 'Trạng thái: Đang ngồi • Món: Lẩu Thái hải sản x1, Bò né x2', status: 'Đang ăn', statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        { label: 'Tách hóa đơn Bàn 08', sub: 'Khách yêu cầu tách bill thanh toán riêng nước ngọt', status: 'Đang tách bill', statusColor: 'bg-blue-50 text-blue-700 border-blue-100' },
        { label: 'Gà hấp lá chanh (KDS)', sub: 'Bàn 04 • Yêu cầu: Không lấy da • Đang chế biến', status: 'Chờ Bếp', statusColor: 'bg-amber-50 text-amber-700 border-amber-100' }
      ]
    }
  },
  'bar-pub-club': {
    slug: 'bar-pub-club',
    parentSlug: 'fnb',
    label: 'Bar, Pub & Club',
    icon: Wine,
    highlight: 'Quản lý gửi rượu/bia ký gửi của khách quen chuyên nghiệp, kiểm kho nguyên vật liệu pha chế định lượng BOM tránh hao hụt và tính phụ thu nhạc sống.',
    painPoints: [
      'Tranh chấp rượu bia ký gửi của khách hàng thân thiết do sổ sách ghi tay mập mờ.',
      'Hao hụt thất thoát lượng rượu ngoại pha chế cao cấp tại quầy bar.',
      'Khó thiết lập và tự động tính phụ thu phí dịch vụ đặc biệt (nhạc sống, sự kiện).'
    ],
    solutions: [
      'Mô-đun quản lý gửi rượu điện tử, tra cứu hạn gửi và số lượng nhanh chóng bằng số điện thoại khách.',
      'Khấu trừ kho tự động theo định lượng công thức pha chế (BOM) chính xác từng ml rượu ngoại.',
      'Áp dụng bảng giá phụ thu dịch vụ hoặc vé sự kiện tự động thêm vào hóa đơn theo khung giờ.'
    ],
    features: [
      'Quản lý ký gửi bia/rượu điện tử thông minh',
      'Định lượng BOM kho nguyên liệu quầy Bar',
      'Tính phụ thu phí dịch vụ/vé sự kiện tự động',
      'Đồng bộ order pha chế xuống quầy Bar tức thời'
    ],
    visualMock: {
      title: 'Quản lý Ký gửi rượu & BOM Bar',
      badgeText: 'Bar Operations',
      metrics: [
        { label: 'Rượu ký gửi', value: '45 chai', color: 'text-amber-600' },
        { label: 'BOM Khấu trừ', value: '100%', color: 'text-emerald-600' },
        { label: 'Doanh số đêm', value: '18.5M', color: 'text-primary' }
      ],
      dataList: [
        { label: 'Chivas 18 gửi lại', sub: 'Khách: Hoàng Hải (0905...12) • Hạn gửi: 30 ngày', status: 'Ký gửi hoạt động', statusColor: 'bg-blue-50 text-blue-700 border-blue-100' },
        { label: 'Ly Cocktail Mojito Classic', sub: 'Khấu trừ BOM: 50ml Bacardi RUM • 15ml Syrup • 2g bạc hà', status: 'Đã trừ kho', statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        { label: 'Phí dịch vụ Live Music', sub: 'Bàn số 05 • Đêm cuối tuần • Phụ thu 50K/khách', status: 'Phụ thu: +200K', statusColor: 'bg-indigo-50 text-indigo-700 border-indigo-100' }
      ]
    }
  },

  // === BILLIARDS ===
  'quan-billiards-bi-a': {
    slug: 'quan-billiards-bi-a',
    parentSlug: 'billiards',
    label: 'Quán Billiards (Bi-a)',
    icon: Target,
    highlight: 'Bộ tính tiền giờ tự động ngầm theo giây chuẩn xác, áp dụng giá giờ linh hoạt theo loại bàn (Pool/Carom) và kết nối hộp rơ-le bật tắt đèn bàn bida.',
    painPoints: [
      'Nhân viên quên ghi nhận giờ chơi của khách lúc vào bàn, gây thất thoát doanh thu giờ.',
      'Khó quản lý bảng giá thuê bàn bida thay đổi linh hoạt theo giờ sáng/tối hoặc ngày lễ.',
      'Khó theo dõi doanh thu bán lẻ nước ngọt, đồ ăn gọi thêm trực tiếp tại bàn.'
    ],
    solutions: [
      'Bộ đếm giờ ngầm tự động tính toán tiền giờ chuẩn xác từng giây ngay khi check-in bàn chơi.',
      'Áp dụng bảng giá giờ chơi phân cấp (bàn lỗ, bàn 3 băng, bàn VIP) tự động nhảy giá theo khung giờ.',
      'Màn hình POS bida gọi dịch vụ ăn uống nhanh, in hóa đơn tổng hợp tiền giờ + dịch vụ rõ ràng.'
    ],
    features: [
      'Tự động tính tiền giờ chơi Bida chuẩn xác',
      'Quản lý sơ đồ bàn bida lỗ (Pool) & 3 băng (Carom)',
      'Order đồ uống, thuốc lá trực tiếp tại bàn chơi',
      'Tích hợp kết nối hộp rơ-le thông minh bật tắt đèn bàn'
    ],
    visualMock: {
      title: 'Quản trị bàn Bida & Tiền giờ',
      badgeText: 'Billiards POS',
      metrics: [
        { label: 'Bàn hoạt động', value: '10 bàn', color: 'text-emerald-600' },
        { label: 'Doanh thu giờ', value: '3.2M', color: 'text-primary' },
        { label: 'Tiền dịch vụ', value: '1.8M', color: 'text-indigo-650' }
      ],
      dataList: [
        { label: 'Bàn số 04 (Bàn VIP Pool)', sub: 'Khách: Anh Minh • Giờ chơi: 1h 45p • Đơn giá: 80K/h', status: 'Tiền giờ: 140,000đ', statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        { label: 'Bàn số 02 (Bàn Carom 3C)', sub: 'Gọi thêm: 3 Pepsi chai • 1 bao thuốc 555', status: 'Dịch vụ: +95,000đ', statusColor: 'bg-blue-50 text-blue-700 border-blue-100' },
        { label: 'Kết nối thiết bị Rơ-le', sub: 'Tự động ngắt đèn bàn 06 ngay khi hoàn tất hóa đơn', status: 'Đèn OFF', statusColor: 'bg-slate-100 text-slate-700 border-slate-200' }
      ]
    }
  },

  // === SPORTS COURT ===
  'san-pickleball-the-thao': {
    slug: 'san-pickleball-the-thao',
    parentSlug: 'sports-court',
    label: 'Sân Pickleball & Thể thao',
    icon: Trophy,
    highlight: 'Sơ đồ đặt sân chéo trực quan Grid View, quản lý thẻ thành viên/thẻ lượt câu lạc bộ cố định và tự động đối soát cọc giữ sân bằng VietQR.',
    painPoints: [
      'Khách hàng đặt lịch trùng giờ chéo sân nhau gây cự cãi, mất uy tín.',
      'Khó theo dõi công nợ thẻ lượt, thẻ tháng của các câu lạc bộ/hội nhóm cố định.',
      'Thất thoát chi phí thuê vợt, mua bóng pickleball tại quầy sân.'
    ],
    solutions: [
      'Giao diện sơ đồ đặt sân trực quan theo lưới thời gian, ngăn chặn hoàn toàn việc đặt trùng sân.',
      'Hệ thống quản lý thông tin hội viên, trừ lượt tự động trên thẻ khi khách ra sân.',
      'Màn hình POS tích hợp dịch vụ thuê vợt, bán nước uống trực tiếp trên bill tính tiền sân.'
    ],
    features: [
      'Sơ đồ đặt sân lưới thời gian Grid View chống trùng',
      'Quản lý thẻ lượt & Thẻ hội viên cố định theo tháng',
      'Tích hợp tính tiền thuê vợt, mua bóng & Dịch vụ nước',
      'Đối soát đặt cọc giữ sân online tự động qua VietQR'
    ],
    visualMock: {
      title: 'Lịch đặt sân Pickleball & Thẻ lượt',
      badgeText: 'Sports Court',
      metrics: [
        { label: 'Sân hoạt động', value: '6 sân', color: 'text-emerald-600' },
        { label: 'Hội viên tháng', value: '120 khách', color: 'text-indigo-650' },
        { label: 'Lượt chơi ngày', value: '45 lượt', color: 'text-primary' }
      ],
      dataList: [
        { label: 'Sân số 02 (Pickleball VIP)', sub: 'Lịch: 17:00 - 19:00 • Hội nhóm: Anh Nam (PT)', status: 'Đã đặt cọc', statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        { label: 'Thẻ lượt CLB Pickleball', sub: 'Khách: Lê Huy • Gói 30 lượt tập • Đã dùng 12/30', status: 'Còn 18 lượt', statusColor: 'bg-violet-50 text-violet-755 border-violet-100' },
        { label: 'Đơn thuê thiết bị sân', sub: 'Bàn giao: 2 vợt Selkirk • 4 bóng Dura Fast 40', status: 'Thuê: +100K', statusColor: 'bg-blue-50 text-blue-700 border-blue-100' }
      ]
    }
  },

  // === LODGING ===
  'khach-san-nha-nghi': {
    slug: 'khach-san-nha-nghi',
    parentSlug: 'lodging',
    label: 'Khách sạn & Nhà nghỉ',
    icon: Hotel,
    highlight: 'Sơ đồ phòng theo tầng chuyên nghiệp, tự động tính tiền phòng theo giờ, qua đêm, ngày đêm và quản lý buồng phòng dọn dẹp.',
    painPoints: [
      'Tính tiền phòng theo giờ, qua đêm thủ công dễ nhầm lẫn bảng giá giữa các phòng thường/VIP.',
      'Khách trả phòng đột xuất mà buồng phòng dọn dẹp chưa kịp cập nhật trạng thái phòng sạch.',
      'Thất thoát chi phí mini-bar đồ uống tiêu hao do nhân viên quên ghi sổ.'
    ],
    solutions: [
      'Thiết lập bảng giá dịch vụ giờ, qua đêm tự động, hệ thống tự tính bill chính xác 100% khi khách trả phòng.',
      'Sơ đồ buồng phòng cập nhật thời gian thực: Phòng trống sạch, Phòng dơ cần dọn, Phòng đang ở.',
      'Tích hợp bảng kê khai đồ dùng tiêu hao mini-bar trực tiếp vào hóa đơn trả phòng.'
    ],
    features: [
      'Quản lý sơ đồ phòng theo tầng & Trạng thái dọn dẹp',
      'Tự động tính tiền phòng theo giờ/qua đêm/ngày đêm',
      'Quản lý mini-bar & Đồ dùng tiêu hao',
      'Xác thực thông tin khách thuê & Khai báo tạm trú'
    ],
    visualMock: {
      title: 'Sơ đồ phòng Khách sạn',
      badgeText: 'Room Grid',
      metrics: [
        { label: 'Phòng đang ở', value: '12 phòng', color: 'text-indigo-600' },
        { label: 'Phòng dơ cần dọn', value: '3 phòng', color: 'text-red-500' },
        { label: 'Công suất dùng', value: '75%', color: 'text-emerald-600' }
      ],
      dataList: [
        { label: 'Phòng 201 (VIP Double)', sub: 'Khách: Nguyễn Văn A • Thuê: Qua đêm • Nhận: 22:00', status: 'Đang ở', statusColor: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
        { label: 'Phòng 104 (Standard)', sub: 'Trạng thái: Trả phòng lúc 11:20 • Đang dọn dẹp', status: 'PHÒNG DƠ (Đỏ)', statusColor: 'bg-red-50 text-red-700 border-red-100' },
        { label: 'Phòng 302 (Deluxe Single)', sub: 'Sẵn sàng đón khách mới • Đã dọn dẹp sạch', status: 'Phòng Sạch', statusColor: 'bg-green-50 text-green-700 border-green-100' }
      ]
    }
  },
  'homestay-villa': {
    slug: 'homestay-villa',
    parentSlug: 'lodging',
    label: 'Homestay & Villa',
    icon: Home,
    highlight: 'Quản lý lịch đặt phòng tập trung OTA chuyên sâu, theo dõi cọc giữ phòng bằng VietQR và tự động hóa phụ thu check-in sớm / check-out trễ.',
    painPoints: [
      'Khó theo dõi lịch đặt phòng từ nhiều kênh OTA (Booking, AirBnb...) gây ra tình trạng overbooking trùng phòng.',
      'Tranh cãi phụ thu check-in sớm hoặc trễ do không có lịch trình cụ thể rõ ràng.',
      'Không kiểm soát được chi phí dọn dẹp vệ sinh buồng phòng thuê ngoài.'
    ],
    solutions: [
      'Lịch đặt phòng trực quan dạng Calendar tập trung, cập nhật trạng thái cọc giữ phòng tức thời.',
      'Cấu hình tự động tính phụ thu theo block phút check-in sớm hoặc check-out trễ linh hoạt.',
      'Theo dõi sát sao nhật ký và chi phí dọn phòng của từng homestay.'
    ],
    features: [
      'Quản lý lịch đặt phòng Calendar tập trung',
      'Tính phụ thu check-in sớm & check-out trễ tự động',
      'Quản lý chi phí dọn dẹp vệ sinh buồng phòng',
      'Đối soát cọc phòng tự động bằng VietQR động'
    ],
    visualMock: {
      title: 'Lịch đặt homestay & Lịch dọn dẹp',
      badgeText: 'Homestay Calendar',
      metrics: [
        { label: 'Homestay thuê', value: '4 căn', color: 'text-indigo-650' },
        { label: 'Cọc giữ chỗ', value: '10.5M', color: 'text-emerald-600' },
        { label: 'Lượt dọn vệ sinh', value: '8 lượt', color: 'text-primary' }
      ],
      dataList: [
        { label: 'Villa Bãi Trước Vũng Tàu', sub: 'Khách: Lê Trang • Check-in: 14:00 • Đã đặt cọc 50%', status: 'Cọc hoạt động', statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        { label: 'Homestay Studio Quận 1', sub: 'Phụ thu check-out trễ 2 tiếng (Dự kiến: 14:00)', status: 'Phụ thu: +300K', statusColor: 'bg-blue-50 text-blue-700 border-blue-100' },
        { label: 'Căn hộ River Gate C302', sub: 'Yêu cầu: Dọn phòng thay ga mới trước 13:00', status: 'Chờ dọn dẹp', statusColor: 'bg-amber-50 text-amber-700 border-amber-100' }
      ]
    }
  },

  // === SERVICE HOURLY ===
  'beauty-spa-massage': {
    slug: 'beauty-spa-massage',
    parentSlug: 'service-hourly',
    label: 'Beauty Spa & Massage',
    icon: Sparkles,
    highlight: 'Quản lý lịch hẹn đặt chỗ liệu trình khoa học, phân bổ kỹ thuật viên thực hiện dịch vụ và theo dõi thẻ liệu trình nhiều buổi.',
    painPoints: [
      'Trùng lịch hẹn khách hàng vào giờ cao điểm, gây trải nghiệm dịch vụ tồi tệ.',
      'Khó theo dõi và phân bổ công bằng kỹ thuật viên rảnh tay thực hiện ca trị liệu.',
      'Quản lý thẻ liệu trình 5-10 buổi của khách bằng giấy dễ rách nát, thất lạc số liệu.'
    ],
    solutions: [
      'Giao diện lịch hẹn Calendar thông minh, hiển thị chi tiết khung giờ và giường trống.',
      'Tự động phân bổ ca hoặc chỉ định kỹ thuật viên theo yêu cầu của khách, tính hoa hồng ca.',
      'Quản lý thẻ liệu trình điện tử, tự động trừ số buổi sử dụng và gửi tin xác nhận qua Zalo OA.'
    ],
    features: [
      'Lịch hẹn Calendar đặt chỗ liệu trình trực quan',
      'Quản lý thẻ liệu trình điện tử đa buổi',
      'Chỉ định kỹ thuật viên & Tính hoa hồng thực hiện',
      'Đồng bộ thông tin liệu trình & Hình ảnh trước/sau'
    ],
    visualMock: {
      title: 'Lịch hẹn liệu trình & Thẻ buổi',
      badgeText: 'Spa Management',
      metrics: [
        { label: 'Lịch hẹn hôm nay', value: '24 ca', color: 'text-primary' },
        { label: 'Kỹ thuật viên rảnh', value: '4 người', color: 'text-emerald-600' },
        { label: 'Thẻ liệu trình', value: '150 thẻ', color: 'text-violet-650' }
      ],
      dataList: [
        { label: 'Khách hàng: Trần Thị C', sub: 'Dịch vụ: Chăm sóc da chuyên sâu • Giờ: 14:00 • Giường 02', status: 'Đã đặt chỗ', statusColor: 'bg-blue-50 text-blue-700 border-blue-100' },
        { label: 'Thẻ liệu trình Trị mụn', sub: 'Khách: Lê Hoài • Liệu trình 10 buổi • Đã dùng 3/10', status: 'Còn 7 buổi', statusColor: 'bg-violet-50 text-violet-755 border-violet-100' },
        { label: 'Kỹ thuật viên: Vy Lan', sub: 'Chỉ định ca: Massage body Bàn 04 • Hoa hồng: +50,000đ', status: 'Đang ca', statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-100' }
      ]
    }
  },
  'hair-salon-nails': {
    slug: 'hair-salon-nails',
    parentSlug: 'service-hourly',
    label: 'Hair Salon & Nails',
    icon: Scissors,
    highlight: 'Đặt lịch làm tóc/nails chọn thợ trực quan, phân chia thợ thực hiện và tự động hóa tính hoa hồng thợ làm móng/tóc.',
    painPoints: [
      'Khách hàng phàn nàn vì phải chờ đợi quá lâu do không có sự chủ động điều phối thợ rảnh.',
      'Nhầm lẫn, sai sót lớn khi cộng dồn hoa hồng làm việc thủ công cuối tháng cho từng thợ.',
      'Khó quản lý tồn kho định mức thuốc nhuộm, sơn móng và hóa chất salon tiêu hao.'
    ],
    solutions: [
      'Cổng đặt lịch hẹn trực tuyến hiển thị các thợ rảnh, khách hàng chủ động chọn khung giờ.',
      'Tự động cộng dồn doanh số hoa hồng dịch vụ chi tiết cho thợ ngay khi hóa đơn hoàn tất.',
      'Hệ thống quản lý định mức hao hụt hóa chất pha màu, sơn móng tự động.'
    ],
    features: [
      'Lịch hẹn làm tóc/nails trực tuyến chọn thợ',
      'Tính toán hoa hồng thợ tự động theo bill',
      'Định lượng tiêu hao hóa chất & Thuốc nhuộm',
      'Báo cáo hiệu suất làm việc chi tiết từng nhân sự'
    ],
    visualMock: {
      title: 'Lịch hẹn Salon & Hoa hồng thợ',
      badgeText: 'Salon Operations',
      metrics: [
        { label: 'Ca làm hôm nay', value: '38 ca', color: 'text-primary' },
        { label: 'Thợ rảnh ca', value: '3 thợ', color: 'text-emerald-600' },
        { label: 'Hoa hồng ngày', value: '850K', color: 'text-indigo-650' }
      ],
      dataList: [
        { label: 'Khách hàng: Phan Thảo', sub: 'Dịch vụ: Làm móng Gel đính đá • Thợ: Minh Anh • 15:30', status: 'Đã nhận ca', statusColor: 'bg-blue-50 text-blue-700 border-blue-100' },
        { label: 'Thợ chính: Hoàng Huy', sub: 'Dịch vụ: Cắt uốn nhuộm Loreal • Hoa hồng: +120,000đ', status: 'Tính hoa hồng', statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        { label: 'Sơn OPI màu đỏ mận', sub: 'Tiêu hao: Định mức 5ml/bộ • Kho tồn: 24 chai', status: 'Trừ kho', statusColor: 'bg-slate-100 text-slate-700 border-slate-200' }
      ]
    }
  },
  'karaoke-giai-tri': {
    slug: 'karaoke-giai-tri',
    parentSlug: 'service-hourly',
    label: 'Karaoke & Giải trí',
    icon: Mic,
    highlight: 'Tự động tính tiền giờ hát chuẩn xác theo phút sử dụng phòng, gọi đồ uống dịch vụ trực tiếp vào số phòng và hỗ trợ đổi phòng giữ bill.',
    painPoints: [
      'Tính tiền giờ hát thủ công dễ bị sai lệch khi khách chuyển phòng thường sang phòng VIP.',
      'Khó quản lý chính xác lượng bia, nước ngọt, đĩa hoa quả gọi thêm gây thất thoát.',
      'Giá giờ hát ban ngày và ban đêm chênh lệch khó tự động hóa đổi giá.'
    ],
    solutions: [
      'Bộ đếm giờ chạy ngầm tính bill chuẩn xác theo số phút sử dụng phòng hát.',
      'POS bán hàng hỗ trợ gọi dịch vụ nhanh, hỗ trợ chuyển phòng chỉ với 1 click giữ nguyên bill.',
      'Cấu hình bảng giá dịch vụ thay đổi linh hoạt theo khung giờ ngày/đêm hoặc cuối tuần.'
    ],
    features: [
      'Tự động tính tiền giờ hát Karaoke theo phút',
      'Bảng giá phân hạng phòng thường/VIP linh hoạt',
      'Gọi đồ uống dịch vụ trực tiếp vào phòng hát',
      'Hỗ trợ chuyển phòng giữ nguyên toàn bộ hóa đơn'
    ],
    visualMock: {
      title: 'Quản lý phòng Karaoke & Giờ hát',
      badgeText: 'Karaoke POS',
      metrics: [
        { label: 'Phòng đang hát', value: '8 phòng', color: 'text-emerald-600' },
        { label: 'Doanh thu giờ', value: '4.5M', color: 'text-primary' },
        { label: 'Bia xuất kho', value: '120 lon', color: 'text-slate-650' }
      ],
      dataList: [
        { label: 'Phòng VIP 102 (Hát giờ)', sub: 'Giờ hát: 2h 15p • Đơn giá: 180K/giờ', status: 'Giờ hát: 405,000đ', statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        { label: 'Phòng 204 (Phòng thường)', sub: 'Gọi thêm: 1 thùng Heineken • 2 đĩa trái cây lớn', status: 'Dịch vụ: +680,000đ', statusColor: 'bg-blue-50 text-blue-700 border-blue-100' },
        { label: 'Yêu cầu Chuyển phòng', sub: 'Chuyển bill từ Phòng 204 sang VIP 105', status: 'Đang chuyển', statusColor: 'bg-amber-50 text-amber-700 border-amber-100' }
      ]
    }
  },
  'phong-kham-tu-nhan': {
    slug: 'phong-kham-tu-nhan',
    parentSlug: 'service-hourly',
    label: 'Phòng khám tư nhân',
    icon: Stethoscope,
    highlight: 'Hồ sơ bệnh án điện tử (EMR) của bệnh nhân bảo mật, đặt lịch hẹn khám bác sĩ khoa học và đồng bộ đơn thuốc ra quầy dược.',
    painPoints: [
      'Hồ sơ bệnh án bằng giấy của bệnh nhân dễ thất lạc, khó tra cứu lịch sử bệnh lý.',
      'Bệnh nhân phải chờ đợi bốc số thủ công mệt mỏi vào giờ cao điểm.',
      'Khó đồng bộ đơn thuốc kê từ bác sĩ phòng khám sang quầy dược nội bộ.'
    ],
    solutions: [
      'Hệ thống lưu trữ bệnh án điện tử, tra cứu lịch sử khám bệnh và toa thuốc cũ trong 2 giây.',
      'Lịch hẹn khám trực quan Calendar theo phòng khám và theo từng bác sĩ chuyên khoa.',
      'Đơn thuốc kê điện tử đồng bộ tức thời ra màn hình POS quầy thuốc quầy dược.'
    ],
    features: [
      'Lưu trữ hồ sơ bệnh án điện tử EMR bệnh nhân',
      'Lịch hẹn bốc số & Đăng ký khám Bác sĩ',
      'Đồng bộ đơn thuốc kê điện tử ra quầy dược',
      'Theo dõi và quản lý vật tư y tế tiêu hao'
    ],
    visualMock: {
      title: 'Hồ sơ Bệnh nhân & Đơn thuốc',
      badgeText: 'Clinic EMR',
      metrics: [
        { label: 'Bệnh nhân khám', value: '45 ca', color: 'text-primary' },
        { label: 'Bác sĩ trực ca', value: '4 người', color: 'text-emerald-600' },
        { label: 'Đơn thuốc kê', value: '38 đơn', color: 'text-indigo-650' }
      ],
      dataList: [
        { label: 'Bệnh nhân: Nguyễn Văn Minh', sub: 'Mã BN: BN-1045 • Triệu chứng: Ho sốt kéo dài', status: 'EMR: Hoạt động', statusColor: 'bg-blue-50 text-blue-700 border-blue-100' },
        { label: 'Lịch khám: ThS. BS Lê Hoàng', sub: 'Khung giờ: 14:30 • Phòng khám Nội tổng quát', status: 'Chờ khám', statusColor: 'bg-amber-50 text-amber-700 border-amber-100' },
        { label: 'Toa thuốc điện tử #TX-05', sub: 'Đồng bộ -> Quầy dược: Augmentin 1g, Decolgen', status: 'Đã kê đơn', statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-100' }
      ]
    }
  },
  'fitness-yoga-center': {
    slug: 'fitness-yoga-center',
    parentSlug: 'service-hourly',
    label: 'Fitness & Yoga Center',
    icon: Dumbbell,
    highlight: 'Check-in hội viên tự động bằng mã QR, quản lý gói tập Gym/Yoga theo buổi/tháng và lên lịch dạy PT huấn luyện viên.',
    painPoints: [
      'Hội viên quá hạn thẻ vẫn vào tập bình thường do không có chốt chặn kiểm soát.',
      'Khó theo dõi lịch dạy và tính hoa hồng chuẩn xác cho các huấn luyện viên cá nhân (PT).',
      'Khách mua thẻ lượt/thẻ buổi hay khiếu nại về số lượng buổi còn rớt.'
    ],
    solutions: [
      'Quét mã vạch/QR check-in cổng tự động, hệ thống cảnh báo còi nếu thẻ quá hạn.',
      'Sơ đồ phân ca PT dạy trực quan, tự động cộng hoa hồng ca dạy PT sau mỗi buổi tập.',
      'Thẻ gói tập điện tử tự động khấu trừ số buổi chơi và cập nhật nhật ký tập luyện.'
    ],
    features: [
      'Check-in hội viên tự động bằng mã QR / vân tay',
      'Quản lý gói tập Gym & Yoga theo buổi/tháng',
      'Lịch dạy PT & Tính toán hoa hồng huấn luyện viên',
      'Cảnh báo tự động gia hạn thẻ hội viên sắp hết hạn'
    ],
    visualMock: {
      title: 'Check-in Hội viên & Lịch PT',
      badgeText: 'Fitness Club',
      metrics: [
        { label: 'Hội viên hoạt động', value: '450 thẻ', color: 'text-indigo-650' },
        { label: 'Lượt check-in', value: '85 lượt', color: 'text-emerald-600' },
        { label: 'PT hoạt động', value: '8 người', color: 'text-primary' }
      ],
      dataList: [
        { label: 'Hội viên: Phạm Thành Nam', sub: 'Thẻ: Gói 12 tháng • HSD: 15/09/2026 • Check-in: 08:30', status: 'Thẻ Hợp lệ', statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        { label: 'Huấn luyện viên: Tiến Đạt', sub: 'Ca dạy PT: Khách Lê Hoài • Buổi 5/20 • Hoa hồng: +80K', status: 'PT ca dạy', statusColor: 'bg-blue-50 text-blue-700 border-blue-100' },
        { label: 'Cảnh báo gia hạn thẻ', sub: 'Thẻ hội viên Trần Vy hết hạn trong 3 ngày tới', status: 'Sắp hết hạn', statusColor: 'bg-amber-50 text-amber-700 border-amber-100' }
      ]
    }
  }
};

// Simple helper to generate beautiful fallback configurations for other sub-industries dynamically
export function getSubIndustryDetail(parentSlug: string, slug: string, label: string): SubIndustryDetail {
  const existing = SUB_INDUSTRIES_DETAILS[slug];
  if (existing) return existing;

  // Fallback dynamic generator with high-quality default values
  return {
    slug,
    parentSlug,
    label,
    icon: HelpCircle,
    highlight: `Giải pháp quản lý ${label} chuyên biệt của ONI, tự động tối ưu hóa quy trình bán hàng quầy POS và quản lý dòng tiền Sổ Quỹ doanh nghiệp hiệu quả.`,
    painPoints: [
      `Gặp khó khăn trong kiểm soát số lượng hàng hóa thực tế và sai lệch sổ sách tồn kho.`,
      `Tính tiền đơn hàng thủ công dễ gây nhầm lẫn chiết khấu và thất thoát tiền thu ngân.`,
      `Khó theo dõi lịch sử mua bán, công nợ khách hàng gối đầu và doanh thu thực tế.`
    ],
    solutions: [
      `Hệ thống tự động đồng bộ hóa kho hàng thời gian thực, cảnh báo khi chạm mức tối thiểu.`,
      `Quầy POS bán hàng chuyên nghiệp, hỗ trợ in hóa đơn tự động và tích hợp VietQR động đối soát dòng tiền.`,
      `Lưu vết lịch sử giao dịch chi tiết, báo cáo công nợ tự động gửi qua Zalo/Telegram.`
    ],
    features: [
      `Giao diện bán hàng POS tối giản siêu tốc`,
      `Đối soát dòng tiền tự động bằng VietQR động`,
      `Quản lý thông tin khách hàng & Công nợ gối đầu`,
      `Báo cáo doanh số và dòng tiền thời gian thực`
    ],
    visualMock: {
      title: `Bảng quản trị ${label}`,
      badgeText: 'Dashboard',
      metrics: [
        { label: 'Tồn kho khả dụng', value: '450 SKU', color: 'text-slate-700' },
        { label: 'Giao dịch ngày', value: '25 đơn', color: 'text-primary' },
        { label: 'Dòng tiền Sổ Quỹ', value: '8.2M', color: 'text-emerald-600' }
      ],
      dataList: [
        { label: `Sản phẩm mẫu ${label} A`, sub: 'Giá bán: 150,000đ • Tồn kho: 24 cái', status: 'Còn hàng', statusColor: 'bg-green-50 text-green-700 border-green-100' },
        { label: `Giao dịch đơn hàng #DH-1045`, sub: 'Khách hàng: Nguyễn Văn A • VietQR đối soát', status: 'Đã thanh toán', statusColor: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        { label: `Cảnh báo tồn tối thiểu`, sub: 'Sản phẩm mẫu B chạm mốc 5 cái', status: 'Nhập hàng', statusColor: 'bg-amber-50 text-amber-700 border-amber-100' }
      ]
    }
  };
}
