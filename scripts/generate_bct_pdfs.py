import os
import sys
from reportlab.lib.pagesizes import A4
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle, PageBreak, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# Register fonts
FONT_REG = 'Arial'
FONT_BOLD = 'Arial-Bold'

font_reg_path = '/System/Library/Fonts/Supplemental/Arial.ttf'
font_bold_path = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'

if not os.path.exists(font_bold_path):
    font_bold_path = font_reg_path

pdfmetrics.registerFont(TTFont(FONT_REG, font_reg_path))
pdfmetrics.registerFont(TTFont(FONT_BOLD, font_bold_path))

LOGO_PATH = '/Users/fern/Coding/ERP/oni-saas-starter/apps/mobile/assets/logo.png'

# Output dir
OUT_DIR = '/Users/fern/Coding/ERP/oni-saas-starter/docs/bct-policies'
os.makedirs(OUT_DIR, exist_ok=True)

def get_styles():
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName=FONT_BOLD,
        fontSize=13,
        leading=17,
        alignment=1, # Center
        textColor=colors.HexColor('#1E293B')
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName=FONT_REG,
        fontSize=9.5,
        leading=13,
        alignment=1,
        textColor=colors.HexColor('#475569')
    )
    
    heading_style = ParagraphStyle(
        'Heading',
        parent=styles['Normal'],
        fontName=FONT_BOLD,
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor('#0F172A'),
        spaceBefore=10,
        spaceAfter=4
    )
    
    subheading_style = ParagraphStyle(
        'SubHeading',
        parent=styles['Normal'],
        fontName=FONT_BOLD,
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor('#1E293B'),
        spaceBefore=6,
        spaceAfter=2
    )

    body_style = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName=FONT_REG,
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#334155'),
        spaceBefore=2,
        spaceAfter=3
    )
    
    bullet_style = ParagraphStyle(
        'Bullet',
        parent=body_style,
        leftIndent=12,
        spaceBefore=1,
        spaceAfter=2
    )
    
    company_info_style = ParagraphStyle(
        'CompanyInfo',
        parent=styles['Normal'],
        fontName=FONT_REG,
        fontSize=8.5,
        leading=11.5,
        textColor=colors.HexColor('#475569')
    )

    return {
        'title': title_style,
        'subtitle': subtitle_style,
        'heading': heading_style,
        'subheading': subheading_style,
        'body': body_style,
        'bullet': bullet_style,
        'company_info': company_info_style
    }

def create_header_flowables(styles, doc_title_text):
    elements = []
    
    # Create Header Table (Logo + Company Info + National Motto)
    logo_img = Image(LOGO_PATH, width=48, height=48)
    
    header_text_left = Paragraph(
        "<b>HỘ KINH DOANH PHẦN MỀM ONI</b><br/>"
        "Nền tảng Đặt hàng Trực tuyến ONI<br/>"
        "Hotline: 0984.666.002 | Email: support@oni.vn<br/>"
        "Địa chỉ: Thôn 4, xã Quỳnh Văn, tỉnh Nghệ An",
        styles['company_info']
    )
    
    header_text_right = Paragraph(
        "<b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br/>"
        "<b>Độc lập - Tự do - Hạnh phúc</b><br/>"
        "-------------------",
        ParagraphStyle('RightHeader', parent=styles['company_info'], alignment=1, fontSize=8.5, leading=11.5)
    )
    
    header_table = Table(
        [[logo_img, header_text_left, header_text_right]],
        colWidths=[55, 260, 195]
    )
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN', (0,0), (0,0), 'LEFT'),
        ('ALIGN', (1,0), (1,0), 'LEFT'),
        ('ALIGN', (2,0), (2,0), 'CENTER'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    
    elements.append(header_table)
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#CBD5E1'), spaceBefore=2, spaceAfter=10))
    
    # Title
    elements.append(Paragraph(doc_title_text.upper(), styles['title']))
    elements.append(Spacer(1, 8))
    
    return elements

SIG_PATH = '/Users/fern/Coding/ERP/oni-saas-starter/docs/signature.png'

def create_footer_flowables(styles):
    elements = []
    elements.append(Spacer(1, 10))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#CBD5E1'), spaceBefore=4, spaceAfter=8))
    
    sig_img = Image(SIG_PATH, width=130, height=86.7)
    
    right_flowables = [
        Paragraph("<i>Nghệ An, ngày 10/07/2026</i>", ParagraphStyle('DateText', parent=styles['body'], alignment=1, fontSize=9)),
        Paragraph("<b>CHỦ HỘ KINH DOANH</b>", ParagraphStyle('RoleHeader', parent=styles['body'], alignment=1, fontSize=9.5, spaceBefore=2, spaceAfter=4)),
        sig_img,
    ]
    
    sign_table = Table([["", right_flowables]], colWidths=[260, 250])
    sign_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('ALIGN', (1,0), (1,0), 'CENTER'),
    ]))
    elements.append(sign_table)
    return elements

policies_data = [
    {
        'id': '01',
        'file_name': '01_Chinh_Sach_Bao_Mat.pdf',
        'title': 'CHÍNH SÁCH BẢO MẬT VÀ BẢO VỆ THÔNG TIN CÁ NHÂN KHIẾU NẠI',
        'sections': [
            ("1. Đơn vị thu thập và quản lý thông tin", [
                "Tên đơn vị: <b>HỘ KINH DOANH PHẦN MỀM ONI</b>",
                "Tên nền tảng: Nền tảng đặt hàng trực tuyến ONI (ONI / Phần mềm ONI)",
                "Địa chỉ HKD: Thôn 4, xã Quỳnh Văn, tỉnh Nghệ An",
                "Điện thoại hotline: 0984.666.002",
                "Email tiếp nhận: support@oni.vn"
            ]),
            ("2. Mục đích thu thập thông tin cá nhân", [
                "Cung cấp và duy trì dịch vụ phần mềm đặt hàng trực tuyến ONI cho khách hàng.",
                "Khởi tạo, xác thực và quản lý tài khoản truy cập hệ thống của khách hàng.",
                "Xử lý đơn đặt hàng, thanh toán và gia hạn gói dịch vụ phần mềm.",
                "Gửi thông báo xác nhận giao dịch, hóa đơn và hỗ trợ kỹ thuật trong quá trình sử dụng.",
                "Giải quyết các thắc mắc, phản ánh hoặc khiếu nại của người tiêu dùng.",
                "Tuân thủ các quy định pháp luật hiện hành về quản lý giao dịch thương mại điện tử và bảo vệ dữ liệu cá nhân."
            ]),
            ("3. Phạm vi thu thập thông tin", [
                "Thông tin định danh: Họ tên, số điện thoại, địa chỉ email, tên cơ sở/hộ kinh doanh/doanh nghiệp.",
                "Thông tin địa chỉ: Địa chỉ giao dịch, địa chỉ cơ sở kinh doanh để cài đặt phần mềm và hỗ trợ.",
                "Thông tin thanh toán: Lịch sử giao dịch, mã đơn hàng, xác nhận chuyển khoản ngân hàng (ONI không trực tiếp lưu giữ thông tin thẻ/mật khẩu ngân hàng của khách hàng)."
            ]),
            ("4. Thời gian lưu trữ thông tin", [
                "Thông tin cá nhân và dữ liệu tài khoản của khách hàng sẽ được lưu trữ trong suốt thời gian người dùng duy trì tài khoản và sử dụng dịch vụ trên nền tảng ONI.",
                "Thông tin sẽ được lưu trữ an toàn đến khi khách hàng có yêu cầu hủy bỏ hoặc tự đăng nhập hủy bỏ tài khoản, trừ trường hợp pháp luật có quy định khác về thời gian lưu trữ chứng từ giao dịch."
            ]),
            ("5. Những người hoặc tổ chức có thể được tiếp cận thông tin", [
                "Bộ phận quản trị, hỗ trợ khách hàng và kỹ thuật thuộc Hộ kinh doanh Phần mềm ONI.",
                "Các đối tác cung cấp dịch vụ thanh toán trung gian (Ngân hàng, cổng thanh toán) để hoàn tất giao dịch theo yêu cầu của khách hàng.",
                "Cơ quan nhà nước có thẩm quyền khi có yêu cầu bằng văn bản theo đúng quy định của pháp luật Việt Nam."
            ]),
            ("6. Phương thức và công cụ để người dùng tiếp cận và chỉnh sửa dữ liệu cá nhân", [
                "Khách hàng có quyền tự đăng nhập vào tài khoản ONI trên website/ứng dụng để kiểm tra, cập nhật, điều chỉnh thông tin cá nhân của mình.",
                "Khách hàng có thể liên hệ bộ phận hỗ trợ của ONI qua Hotline: 0984.666.002 hoặc Email: support@oni.vn để yêu cầu nhân viên hỗ trợ cập nhật hoặc xóa thông tin."
            ]),
            ("7. Cơ chế tiếp nhận và giải quyết khiếu nại liên quan đến thông tin cá nhân", [
                "Khi phát hiện thông tin cá nhân bị sử dụng sai mục đích hoặc phạm vi đã thông báo, khách hàng gửi email khiếu nại về support@oni.vn hoặc gọi điện trực tiếp đến 0984.666.002.",
                "HKD Phần mềm ONI có trách nhiệm thực hiện các biện pháp kỹ thuật, nghiệp vụ để xác minh và xử lý trong thời hạn tối đa 03 ngày làm việc kể từ khi nhận được khiếu nại."
            ])
        ]
    },
    {
        'id': '02',
        'file_name': '02_Phuong_Thuc_Giai_Quyet_Khieu_Nai.pdf',
        'title': 'PHƯƠNG THỨC TIẾP NHẬN VÀ GIẢI QUYẾT PHẢN ÁNH, YÊU CẦU, KHIẾU NẠI',
        'sections': [
            ("1. Nguyên tắc giải quyết khiếu nại", [
                "Hộ kinh doanh Phần mềm ONI tôn trọng và nghiêm túc thực hiện các quy định pháp luật về bảo vệ quyền lợi người tiêu dùng.",
                "Mọi phản ánh, thắc mắc hoặc khiếu nại của khách hàng liên quan đến việc cung cấp và sử dụng dịch vụ phần mềm ONI đều được tiếp nhận, xử lý nhanh chóng, minh bạch và hòa giải trên tinh thần thương lượng hai bên cùng có lợi."
            ]),
            ("2. Các kênh tiếp nhận khiếu nại", [
                "<b>Hotline hỗ trợ:</b> 0984.666.002 (Hoạt động từ 08h00 - 18h00 từ Thứ 2 đến Thứ 7)",
                "<b>Email tiếp nhận:</b> support@oni.vn (Tiếp nhận thông tin 24/7)",
                "<b>Địa chỉ trực tiếp:</b> Hộ kinh doanh Phần mềm ONI - Thôn 4, xã Quỳnh Văn, tỉnh Nghệ An."
            ]),
            ("3. Quy trình giải quyết khiếu nại (04 Bước)", [
                "<b>Bước 1 - Tiếp nhận thông tin:</b> Khách hàng gửi phản ánh/khiếu nại qua Hotline, Email hoặc trực tiếp. Bộ phận Chăm sóc khách hàng của ONI tiếp nhận và xác nhận đã nhận thông tin trong vòng 24 giờ làm việc.",
                "<b>Bước 2 - Phân loại & Xác minh:</b> ONI kiểm tra lịch sử hệ thống, nhật ký giao dịch (log) và làm rõ nội dung khiếu nại với khách hàng.",
                "<b>Bước 3 - Xử lý & Phản hồi:</b> ONI đưa ra phương án xử lý (khắc phục sự cố kỹ thuật, bù thời gian sử dụng, hoàn tiền...) và gửi thông báo phản hồi chính thức cho khách hàng trong vòng 03 - 05 ngày làm việc.",
                "<b>Bước 4 - Đóng khiếu nại:</b> Khách hàng nghiệm thu kết quả xử lý và thống nhất đóng hồ sơ khiếu nại."
            ]),
            ("4. Cơ chế giải quyết tranh chấp pháp lý", [
                "Trong trường hợp hai bên không đạt được thỏa thuận qua thương lượng hoặc hòa giải, một trong hai bên có quyền đưa vụ việc ra Tòa án nhân dân có thẩm quyền tại Việt Nam để giải quyết theo quy định của pháp luật."
            ])
        ]
    },
    {
        'id': '03',
        'file_name': '03_Chinh_Sach_Gia.pdf',
        'title': 'CHÍNH SÁCH GIÁ DỊCH VỤ PHẦN MỀM ONI',
        'sections': [
            ("1. Nguyên tắc niêm yết giá", [
                "Mọi bảng giá dịch vụ phần mềm ONI (bao gồm gói mua mới và gói gia hạn dịch vụ) đều được niêm yết công khai, rõ ràng bằng Đồng Việt Nam (VNĐ) trên website và ứng dụng chính thức của ONI.",
                "Giá niêm yết là giá thanh toán cuối cùng mà khách hàng phải chi trả cho gói dịch vụ phần mềm được lựa chọn."
            ]),
            ("2. Quy định về Thuế và Phí dịch vụ phát sinh", [
                "<b>Thuế GTGT:</b> Giá niêm yết áp dụng theo chính sách thuế hiện hành của Hộ kinh doanh Phần mềm ONI.",
                "<b>Phí phát sinh:</b> ONI không thu thêm bất kỳ khoản phí ẩn nào ngoài giá gói cước dịch vụ đã niêm yết, ngoại trừ trường hợp khách hàng có yêu cầu riêng về việc tích hợp thiết bị phần cứng đặc thù hoặc tùy chỉnh tính năng theo hợp đồng dịch vụ riêng."
            ]),
            ("3. Quy định điều chỉnh giá dịch vụ", [
                "ONI có quyền thay đổi, cập nhật bảng giá niêm yết các gói dịch vụ phần mềm nhằm phù hợp với thị trường và tính năng mới nâng cấp.",
                "Việc thay đổi giá dịch vụ không áp dụng hồi truy cho các gói dịch vụ khách hàng đã thanh toán thành công và đang còn thời hạn sử dụng.",
                "Đối với việc gia hạn dịch vụ, bảng giá gia hạn mới nhất sẽ được thông báo công khai trước tối thiểu 07 ngày để khách hàng chủ động lựa chọn."
            ])
        ]
    },
    {
        'id': '04',
        'file_name': '04_Chinh_Sach_Thanh_Toan.pdf',
        'title': 'CHÍNH SÁCH VỀ THANH TOÁN',
        'sections': [
            ("1. Các hình thức thanh toán được chấp nhận", [
                "<b>Thanh toán chuyển khoản ngân hàng:</b> Khách hàng thực hiện chuyển khoản trực tuyến qua mã VietQR hoặc chuyển tiền vào số tài khoản ngân hàng chính thức của Hộ kinh doanh Phần mềm ONI.",
                "<b>Thanh toán trực tuyến qua Cổng thanh toán trung gian:</b> Chấp nhận thanh toán bằng Thẻ ATM nội địa, Thẻ quốc tế (Visa/Mastercard) hoặc Ví điện tử (VNPAY, MOMO,...) được tích hợp trên hệ thống ONI."
            ]),
            ("2. Quy định về an toàn thanh toán", [
                "Giao dịch thanh toán trực tuyến được thực hiện thông qua kết nối bảo mật mã hóa SSL/TLS.",
                "Hệ thống ONI tuân thủ các tiêu chuẩn an toàn thông tin thanh toán, không trực tiếp lưu trữ thông tin mật khẩu ngân hàng hay số thẻ thanh toán của khách hàng."
            ]),
            ("3. Quy trình xác nhận thanh toán và Kích hoạt dịch vụ", [
                "Sau khi khách hàng thực hiện giao dịch thanh toán thành công, hệ thống ONI sẽ đối soát và tự động gửi thông báo xác nhận thanh toán thành công qua Email/Ứng dụng.",
                "Dịch vụ phần mềm ONI (mua mới hoặc gia hạn) sẽ được kích hoạt tự động trong vòng 05 - 15 phút kể từ thời điểm nhận đủ tiền thanh toán."
            ])
        ]
    },
    {
        'id': '05',
        'file_name': '05_Dieu_Kien_Va_Han_Che_Cung_Cap_Dich_Vu.pdf',
        'title': 'ĐIỀU KIỆN VÀ HẠN CHẾ TRONG VIỆC CỦNG CẤP DỊCH VỤ ONI',
        'sections': [
            ("1. Đối tượng và Phạm vi cung cấp dịch vụ", [
                "Nền tảng đặt hàng trực tuyến ONI cung cấp dịch vụ phần mềm SaaS cho các cá nhân, hộ kinh doanh, cửa hàng và doanh nghiệp hoạt động hợp pháp trên toàn quốc.",
                "Khách hàng cần đăng ký tài khoản hợp lệ và cung cấp đầy đủ, chính xác thông tin đăng ký theo hướng dẫn trên hệ thống."
            ]),
            ("2. Quy định hạn chế và Các trường hợp từ chối cung cấp dịch vụ", [
                "<b>Mục đích sử dụng trái pháp luật:</b> Nghiêm cấm sử dụng phần mềm ONI để kinh doanh hàng cấm, lừa đảo, phát tán thông tin độc hại, vi phạm thuần phong mỹ tục hoặc quy định pháp luật Việt Nam.",
                "<b>Xâm phạm hệ thống:</b> Nghiêm cấm các hành vi tấn công, phá hoại, can thiệp trái phép, sao chép hoặc phân phối lại mã nguồn, cơ sở dữ liệu của phần mềm ONI.",
                "<b>Từ chối dịch vụ:</b> ONI có quyền tạm khóa hoặc chấm dứt vĩnh viễn tài khoản cung cấp dịch vụ mà không hoàn tiền nếu phát hiện khách hàng vi phạm nghiêm trọng các hạn chế trên."
            ]),
            ("3. Quyền và Trách nhiệm của Khách hàng", [
                "Khách hàng có trách nhiệm tự bảo mật tài khoản và mật khẩu đăng nhập.",
                "Khách hàng tự chịu trách nhiệm về toàn bộ nội dung dữ liệu, đơn hàng, thông tin sản phẩm do khách hàng tạo và quản lý trên phần mềm ONI."
            ]),
            ("4. Giới hạn trách nhiệm của ONI", [
                "ONI nỗ lực đảm bảo hạ tầng vận hành ổn định 24/7. Tuy nhiên, ONI được miễn trừ trách nhiệm trong các trường hợp gián đoạn do sự cố cáp quang biển, nhà mạng viễn thông hoặc sự cố bất khả kháng theo quy định pháp luật."
            ])
        ]
    },
    {
        'id': '06',
        'file_name': '06_Phuong_Thuc_Cung_Cap_Dich_Vu_Chamdut_HoanTien.pdf',
        'title': 'PHƯƠNG THỨC CỦNG CẤP DỊCH VỤ, CHÍNH SÁCH CHẤM DỨT DỊCH VỤ VÀ HOÀN TIỀN',
        'sections': [
            ("1. Phương thức cung cấp dịch vụ phần mềm", [
                "<b>Phương thức giao nhận:</b> Dịch vụ phần mềm ONI được cung cấp hoàn toàn qua phương thức điện tử (SaaS - Software as a Service).",
                "<b>Kích hoạt & Sử dụng:</b> Ngay sau khi hoàn tất đăng ký và thanh toán thành công, hệ thống sẽ tự động cấp quyền và gửi thông tin xác nhận kích hoạt tài khoản qua Email/Ứng dụng để khách hàng truy cập sử dụng ngay mà không cần chờ giao nhận vật lý."
            ]),
            ("2. Quy định về gia hạn và Chấm dứt dịch vụ", [
                "<b>Gia hạn dịch vụ:</b> Trước khi hết hạn sử dụng gói cước, ONI sẽ gửi thông báo nhắc gia hạn qua ứng dụng/email. Khách hàng thực hiện thanh toán gói gia hạn để tiếp tục sử dụng.",
                "<b>Chấm dứt dịch vụ:</b> Dịch vụ sẽ tự động ngưng khi hết hạn cước mà không được gia hạn. Dữ liệu của khách hàng sẽ được bảo lưu hỗ trợ tối đa 30 ngày kể từ ngày hết hạn.",
                "Khách hàng có quyền gửi yêu cầu chấm dứt dịch vụ trước hạn qua Email support@oni.vn."
            ]),
            ("3. Chính sách đổi trả và Hoàn tiền (Refund Policy)", [
                "<b>Điều kiện được hoàn tiền 100%:</b> Khách hàng được hoàn lại 100% số tiền đã thanh toán nếu hệ thống phần mềm ONI gặp sự cố kỹ thuật nghiêm trọng dẫn đến không thể truy cập/sử dụng và ONI không thể khắc phục được trong thời gian 48 giờ làm việc kể từ khi nhận phản ánh.",
                "<b>Thời hạn gửi yêu cầu hoàn tiền:</b> Trong vòng 07 ngày kể từ ngày thanh toán dịch vụ.",
                "<b>Các trường hợp KHÔNG hoàn tiền:</b> Khách hàng hủy dịch vụ vì lý do cá nhân sau 07 ngày kể từ ngày thanh toán; hoặc tài khoản bị chấm dứt do vi phạm quy định sử dụng dịch vụ của ONI.",
                "<b>Thời gian & Phương thức hoàn tiền:</b> Hoàn tiền qua tài khoản ngân hàng của khách hàng trong thời hạn từ 03 - 07 ngày làm việc sau khi yêu cầu hoàn tiền được xác minh chấp thuận."
            ])
        ]
    }
]

def build_pdf(filename, title, sections):
    styles = get_styles()
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=40,
        rightMargin=40,
        topMargin=40,
        bottomMargin=40
    )
    
    story = []
    story.extend(create_header_flowables(styles, title))
    
    for sec_title, sec_bullets in sections:
        story.append(Paragraph(sec_title, styles['heading']))
        for b in sec_bullets:
            story.append(Paragraph(f"• {b}", styles['bullet']))
        story.append(Spacer(1, 4))
        
    story.extend(create_footer_flowables(styles))
    doc.build(story)

# Generate 6 individual PDFs
generated_files = []
for p in policies_data:
    out_path1 = os.path.join(OUT_DIR, p['file_name'])
    build_pdf(out_path1, p['title'], p['sections'])
    generated_files.append(out_path1)

# Generate 1 Master Combined PDF
master_filename = "Chinh_Sach_Ban_Hang_Va_Dich_Vu_ONI_Full.pdf"
master_out1 = os.path.join(OUT_DIR, master_filename)

styles = get_styles()

def build_master_pdf(target_path):
    doc = SimpleDocTemplate(
        target_path,
        pagesize=A4,
        leftMargin=40,
        rightMargin=40,
        topMargin=40,
        bottomMargin=40
    )
    story = []
    
    # Combined Document Header
    story.extend(create_header_flowables(styles, "TỔNG HỢP CÁC CHÍNH SÁCH BÁN HÀNG VÀ CỦNG CẤP DỊCH VỤ NỀN TẢNG ONI"))
    story.append(Paragraph("<i>(Bộ tài liệu niêm yết công khai & Đăng ký thông báo với Bộ Công Thương Việt Nam)</i>", styles['subtitle']))
    story.append(Spacer(1, 12))
    
    for idx, p in enumerate(policies_data):
        story.append(Paragraph(f"PHẦN {p['id']}: {p['title']}", styles['heading']))
        story.append(HRFlowable(width="100%", thickness=0.8, color=colors.HexColor('#0284C7'), spaceBefore=2, spaceAfter=6))
        
        for sec_title, sec_bullets in p['sections']:
            story.append(Paragraph(sec_title, styles['subheading']))
            for b in sec_bullets:
                story.append(Paragraph(f"• {b}", styles['bullet']))
            story.append(Spacer(1, 2))
        story.append(Spacer(1, 8))
    
    story.extend(create_footer_flowables(styles))
    doc.build(story)

build_master_pdf(master_out1)
generated_files.append(master_out1)

print(f"Successfully generated {len(generated_files)} PDF files.")
