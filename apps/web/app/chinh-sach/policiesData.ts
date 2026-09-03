export interface PolicySection {
  title: string;
  items: string[];
}

export interface Policy {
  slug: string;
  aliases?: string[];
  title: string;
  sections: PolicySection[];
}

export const POLICIES: Policy[] = [
  {
    slug: 'bao-mat',
    aliases: ['chinh-sach-bao-mat', 'privacy'],
    title: 'CHÍNH SÁCH BẢO MẬT VÀ BẢO VỆ THÔNG TIN CÁ NHÂN KHIẾU NẠI',
    sections: [
      {
        title: '1. Đơn vị thu thập và quản lý thông tin',
        items: [
          'Tên đơn vị: HỘ KINH DOANH PHẦN MỀM ONI',
          'Tên nền tảng: Nền tảng đặt hàng trực tuyến ONI (ONI / Phần mềm ONI)',
          'Địa chỉ HKD: Thôn 4, xã Quỳnh Văn, tỉnh Nghệ An',
          'Điện thoại hotline: 0984.666.002',
          'Email tiếp nhận: support@oni.vn'
        ]
      },
      {
        title: '2. Mục đích thu thập thông tin cá nhân',
        items: [
          'Cung cấp và duy trì dịch vụ phần mềm đặt hàng trực tuyến ONI cho khách hàng.',
          'Khởi tạo, xác thực và quản lý tài khoản truy cập hệ thống của khách hàng.',
          'Xử lý đơn đặt hàng, thanh toán và gia hạn gói dịch vụ phần mềm.',
          'Gửi thông báo xác nhận giao dịch, hóa đơn và hỗ trợ kỹ thuật trong quá trình sử dụng.',
          'Giải quyết các thắc mắc, phản ánh hoặc khiếu nại của người tiêu dùng.',
          'Tuân thủ các quy định pháp luật hiện hành về quản lý giao dịch thương mại điện tử và bảo vệ dữ liệu cá nhân.'
        ]
      },
      {
        title: '3. Phạm vi thu thập thông tin',
        items: [
          'Thông tin định danh: Họ tên, số điện thoại, địa chỉ email, tên cơ sở/hộ kinh doanh/doanh nghiệp.',
          'Thông tin địa chỉ: Địa chỉ giao dịch, địa chỉ cơ sở kinh doanh để cài đặt phần mềm và hỗ trợ.',
          'Thông tin thanh toán: Lịch sử giao dịch, mã đơn hàng, xác nhận chuyển khoản ngân hàng (ONI không trực tiếp lưu giữ thông tin thẻ/mật khẩu ngân hàng của khách hàng).'
        ]
      },
      {
        title: '4. Thời gian lưu trữ thông tin',
        items: [
          'Thông tin cá nhân và dữ liệu tài khoản của khách hàng sẽ được lưu trữ trong suốt thời gian người dùng duy trì tài khoản và sử dụng dịch vụ trên nền tảng ONI.',
          'Thông tin sẽ được lưu trữ an toàn đến khi khách hàng có yêu cầu hủy bỏ hoặc tự đăng nhập hủy bỏ tài khoản, trừ trường hợp pháp luật có quy định khác về thời gian lưu trữ chứng từ giao dịch.'
        ]
      },
      {
        title: '5. Những người hoặc tổ chức có thể được tiếp cận thông tin',
        items: [
          'Bộ phận quản trị, hỗ trợ khách hàng và kỹ thuật thuộc Hộ kinh doanh Phần mềm ONI.',
          'Các đối tác cung cấp dịch vụ thanh toán trung gian (Ngân hàng, cổng thanh toán) để hoàn tất giao dịch theo yêu cầu của khách hàng.',
          'Cơ quan nhà nước có thẩm quyền khi có yêu cầu bằng văn bản theo đúng quy định của pháp luật Việt Nam.'
        ]
      },
      {
        title: '6. Phương thức và công cụ để người dùng tiếp cận và chỉnh sửa dữ liệu cá nhân',
        items: [
          'Khách hàng có quyền tự đăng nhập vào tài khoản ONI trên website/ứng dụng để kiểm tra, cập nhật, điều chỉnh thông tin cá nhân của mình.',
          'Khách hàng có thể liên hệ bộ phận hỗ trợ của ONI qua Hotline: 0984.666.002 hoặc Email: support@oni.vn để yêu cầu nhân viên hỗ trợ cập nhật hoặc xóa thông tin.'
        ]
      },
      {
        title: '7. Cơ chế tiếp nhận và giải quyết khiếu nại liên quan đến thông tin cá nhân',
        items: [
          'Khi phát hiện thông tin cá nhân bị sử dụng sai mục đích hoặc phạm vi đã thông báo, khách hàng gửi email khiếu nại về support@oni.vn hoặc gọi điện trực tiếp đến 0984.666.002.',
          'HKD Phần mềm ONI có trách nhiệm thực hiện các biện pháp kỹ thuật, nghiệp vụ để xác minh và xử lý trong thời hạn tối đa 03 ngày làm việc kể từ khi nhận được khiếu nại.'
        ]
      }
    ]
  },
  {
    slug: 'giai-quyet-khieu-nai',
    aliases: ['khieu-nai', 'phuong-thuc-giai-quyet-khieu-nai'],
    title: 'PHƯƠNG THỨC TIẾP NHẬN VÀ GIẢI QUYẾT PHẢN ÁNH, YÊU CẦU, KHIẾU NẠI',
    sections: [
      {
        title: '1. Nguyên tắc giải quyết khiếu nại',
        items: [
          'Hộ kinh doanh Phần mềm ONI tôn trọng và nghiêm túc thực hiện các quy định pháp luật về bảo vệ quyền lợi người tiêu dùng.',
          'Mọi phản ánh, thắc mắc hoặc khiếu nại của khách hàng liên quan đến việc cung cấp và sử dụng dịch vụ phần mềm ONI đều được tiếp nhận, xử lý nhanh chóng, minh bạch và hòa giải trên tinh thần thương lượng hai bên cùng có lợi.'
        ]
      },
      {
        title: '2. Các kênh tiếp nhận khiếu nại',
        items: [
          'Hotline hỗ trợ: 0984.666.002 (Hoạt động từ 08h00 - 18h00 từ Thứ 2 đến Thứ 7)',
          'Email tiếp nhận: support@oni.vn (Tiếp nhận thông tin 24/7)',
          'Địa chỉ trực tiếp: Hộ kinh doanh Phần mềm ONI - Thôn 4, xã Quỳnh Văn, tỉnh Nghệ An.'
        ]
      },
      {
        title: '3. Quy trình giải quyết khiếu nại (04 Bước)',
        items: [
          'Bước 1 - Tiếp nhận thông tin: Khách hàng gửi phản ánh/khiếu nại qua Hotline, Email hoặc trực tiếp. Bộ phận Chăm sóc khách hàng của ONI tiếp nhận và xác nhận đã nhận thông tin trong vòng 24 giờ làm việc.',
          'Bước 2 - Phân loại & Xác minh: ONI kiểm tra lịch sử hệ thống, nhật ký giao dịch (log) và làm rõ nội dung khiếu nại với khách hàng.',
          'Bước 3 - Xử lý & Phản hồi: ONI đưa ra phương án xử lý (khắc phục sự cố kỹ thuật, bù thời gian sử dụng, hoàn tiền...) và gửi thông báo phản hồi chính thức cho khách hàng trong vòng 03 - 05 ngày làm việc.',
          'Bước 4 - Đóng khiếu nại: Khách hàng nghiệm thu kết quả xử lý và thống nhất đóng hồ sơ khiếu nại.'
        ]
      },
      {
        title: '4. Cơ chế giải quyết tranh chấp pháp lý',
        items: [
          'Trong trường hợp hai bên không đạt được thỏa thuận qua thương lượng hoặc hòa giải, một trong hai bên có quyền đưa vụ việc ra Tòa án nhân dân có thẩm quyền tại Việt Nam để giải quyết theo quy định của pháp luật.'
        ]
      }
    ]
  },
  {
    slug: 'chinh-sach-gia',
    aliases: ['gia', 'bang-gia'],
    title: 'CHÍNH SÁCH GIÁ DỊCH VỤ PHẦN MỀM ONI',
    sections: [
      {
        title: '1. Nguyên tắc niêm yết giá',
        items: [
          'Mọi bảng giá dịch vụ phần mềm ONI (bao gồm gói mua mới và gói gia hạn dịch vụ) đều được niêm yết công khai, rõ ràng bằng Đồng Việt Nam (VNĐ) trên website và ứng dụng chính thức của ONI.',
          'Giá niêm yết là giá thanh toán cuối cùng mà khách hàng phải chi trả cho gói dịch vụ phần mềm được lựa chọn.'
        ]
      },
      {
        title: '2. Quy định về Thuế và Phí dịch vụ phát sinh',
        items: [
          'Thuế GTGT: Giá niêm yết áp dụng theo chính sách thuế hiện hành của Hộ kinh doanh Phần mềm ONI.',
          'Phí phát sinh: ONI không thu thêm bất kỳ khoản phí ẩn nào ngoài giá gói cước dịch vụ đã niêm yết, ngoại trừ trường hợp khách hàng có yêu cầu riêng về việc tích hợp thiết bị phần cứng đặc thù hoặc tùy chỉnh tính năng theo hợp đồng dịch vụ riêng.'
        ]
      },
      {
        title: '3. Quy định điều chỉnh giá dịch vụ',
        items: [
          'ONI có quyền thay đổi, cập nhật bảng giá niêm yết các gói dịch vụ phần mềm nhằm phù hợp với thị trường và tính năng mới nâng cấp.',
          'Việc thay đổi giá dịch vụ không áp dụng hồi truy cho các gói dịch vụ khách hàng đã thanh toán thành công và đang còn thời hạn sử dụng.',
          'Đối với việc gia hạn dịch vụ, bảng giá gia hạn mới nhất sẽ được thông báo công khai trước tối thiểu 07 ngày để khách hàng chủ động lựa chọn.'
        ]
      }
    ]
  },
  {
    slug: 'thanh-toan',
    aliases: ['chinh-sach-thanh-toan'],
    title: 'CHÍNH SÁCH VỀ THANH TOÁN',
    sections: [
      {
        title: '1. Các hình thức thanh toán được chấp nhận',
        items: [
          'Thanh toán chuyển khoản ngân hàng: Khách hàng thực hiện chuyển khoản trực tuyến qua mã VietQR hoặc chuyển tiền vào số tài khoản ngân hàng chính thức của Hộ kinh doanh Phần mềm ONI.',
          'Thanh toán trực tuyến qua Cổng thanh toán trung gian: Chấp nhận thanh toán bằng Thẻ ATM nội địa, Thẻ quốc tế (Visa/Mastercard) hoặc Ví điện tử (VNPAY, MOMO,...) được tích hợp trên hệ thống ONI.'
        ]
      },
      {
        title: '2. Quy định về an toàn thanh toán',
        items: [
          'Giao dịch thanh toán trực tuyến được thực hiện thông qua kết nối bảo mật mã hóa SSL/TLS.',
          'Hệ thống ONI tuân thủ các tiêu chuẩn an toàn thông tin thanh toán, không trực tiếp lưu trữ thông tin mật khẩu ngân hàng hay số thẻ thanh toán của khách hàng.'
        ]
      },
      {
        title: '3. Quy trình xác nhận thanh toán và Kích hoạt dịch vụ',
        items: [
          'Sau khi khách hàng thực hiện giao dịch thanh toán thành công, hệ thống ONI sẽ đối soát và tự động gửi thông báo xác nhận thanh toán thành công qua Email/Ứng dụng.',
          'Dịch vụ phần mềm ONI (mua mới hoặc gia hạn) sẽ được kích hoạt tự động trong vòng 05 - 15 phút kể từ thời điểm nhận đủ tiền thanh toán.'
        ]
      }
    ]
  },
  {
    slug: 'dieu-kien-giao-dich',
    aliases: ['dieu-kien-va-han-che', 'dieu-khoan-su-dung'],
    title: 'ĐIỀU KIỆN VÀ HẠN CHẾ TRONG VIỆC CUNG CẤP DỊCH VỤ ONI',
    sections: [
      {
        title: '1. Đối tượng và Phạm vi cung cấp dịch vụ',
        items: [
          'Nền tảng đặt hàng trực tuyến ONI cung cấp dịch vụ phần mềm SaaS cho các cá nhân, hộ kinh doanh, cửa hàng và doanh nghiệp hoạt động hợp pháp trên toàn quốc.',
          'Khách hàng cần đăng ký tài khoản hợp lệ và cung cấp đầy đủ, chính xác thông tin đăng ký theo hướng dẫn trên hệ thống.'
        ]
      },
      {
        title: '2. Quy định hạn chế và Các trường hợp từ chối cung cấp dịch vụ',
        items: [
          'Mục đích sử dụng trái pháp luật: Nghiêm cấm sử dụng phần mềm ONI để kinh doanh hàng cấm, lừa đảo, phát tán thông tin độc hại, vi phạm thuần phong mỹ tục hoặc quy định pháp luật Việt Nam.',
          'Xâm phạm hệ thống: Nghiêm cấm các hành vi tấn công, phá hoại, can thiệp trái phép, sao chép hoặc phân phối lại mã nguồn, cơ sở dữ liệu của phần mềm ONI.',
          'Từ chối dịch vụ: ONI có quyền tạm khóa hoặc chấm dứt vĩnh viễn tài khoản cung cấp dịch vụ mà không hoàn tiền nếu phát hiện khách hàng vi phạm nghiêm trọng các hạn chế trên.'
        ]
      },
      {
        title: '3. Quyền và Trách nhiệm của Khách hàng',
        items: [
          'Khách hàng có trách nhiệm tự bảo mật tài khoản và mật khẩu đăng nhập.',
          'Khách hàng tự chịu trách nhiệm về toàn bộ nội dung dữ liệu, đơn hàng, thông tin sản phẩm do khách hàng tạo và quản lý trên phần mềm ONI.'
        ]
      },
      {
        title: '4. Giới hạn trách nhiệm của ONI',
        items: [
          'ONI nỗ lực đảm bảo hạ tầng vận hành ổn định 24/7. Tuy nhiên, ONI được miễn trừ trách nhiệm trong các trường hợp gián đoạn do sự cố cáp quang biển, nhà mạng viễn thông hoặc sự cố bất khả kháng theo quy định pháp luật.'
        ]
      }
    ]
  },
  {
    slug: 'cung-cap-va-hoan-tien',
    aliases: ['doi-tra', 'hoan-tien', 'bao-hanh', 'chinh-sach-doi-tra', 'chinh-sach-bao-hanh', 'chinh-sach-hoan-tien'],
    title: 'PHƯƠNG THỨC CUNG CẤP DỊCH VỤ, CHÍNH SÁCH CHẤM DỨT DỊCH VỤ VÀ HOÀN TIỀN',
    sections: [
      {
        title: '1. Phương thức cung cấp dịch vụ phần mềm',
        items: [
          'Phương thức giao nhận: Dịch vụ phần mềm ONI được cung cấp hoàn toàn qua phương thức điện tử (SaaS - Software as a Service).',
          'Kích hoạt & Sử dụng: Ngay sau khi hoàn tất đăng ký và thanh toán thành công, hệ thống sẽ tự động cấp quyền và gửi thông tin xác nhận kích hoạt tài khoản qua Email/Ứng dụng để khách hàng truy cập sử dụng ngay mà không cần chờ giao nhận vật lý.'
        ]
      },
      {
        title: '2. Quy định về gia hạn và Chấm dứt dịch vụ',
        items: [
          'Gia hạn dịch vụ: Trước khi hết hạn sử dụng gói cước, ONI sẽ gửi thông báo nhắc gia hạn qua ứng dụng/email. Khách hàng thực hiện thanh toán gói gia hạn để tiếp tục sử dụng.',
          'Chấm dứt dịch vụ: Dịch vụ sẽ tự động ngưng khi hết hạn cước mà không được gia hạn. Dữ liệu của khách hàng sẽ được bảo lưu hỗ trợ tối đa 30 ngày kể từ ngày hết hạn.',
          'Khách hàng có quyền gửi yêu cầu chấm dứt dịch vụ trước hạn qua Email support@oni.vn.'
        ]
      },
      {
        title: '3. Chính sách đổi trả và Hoàn tiền (Refund Policy)',
        items: [
          'Điều kiện được hoàn tiền 100%: Khách hàng được hoàn lại 100% số tiền đã thanh toán nếu hệ thống phần mềm ONI gặp sự cố kỹ thuật nghiêm trọng dẫn đến không thể truy cập/sử dụng và ONI không thể khắc phục được trong thời gian 48 giờ làm việc kể từ khi nhận phản ánh.',
          'Thời hạn gửi yêu cầu hoàn tiền: Trong vòng 07 ngày kể từ ngày thanh toán dịch vụ.',
          'Các trường hợp KHÔNG hoàn tiền: Khách hàng hủy dịch vụ vì lý do cá nhân sau 07 ngày kể từ ngày thanh toán; hoặc tài khoản bị chấm dứt do vi phạm quy định sử dụng dịch vụ của ONI.',
          'Thời gian & Phương thức hoàn tiền: Hoàn tiền qua tài khoản ngân hàng của khách hàng trong thời hạn từ 03 - 07 ngày làm việc sau khi yêu cầu hoàn tiền được xác minh chấp thuận.'
        ]
      }
    ]
  }
];

export function findPolicyBySlug(slug: string): Policy | undefined {
  return POLICIES.find((p) => p.slug === slug || p.aliases?.includes(slug));
}

export function getAllPolicySlugs(): string[] {
  const slugs = new Set<string>();
  for (const p of POLICIES) {
    slugs.add(p.slug);
    if (p.aliases) {
      for (const alias of p.aliases) {
        slugs.add(alias);
      }
    }
  }
  return Array.from(slugs);
}
