'use client';
import { useState } from 'react';

export function PrivacyContent() {
  const [lang, setLang] = useState<'en' | 'vi'>('en');

  return (
    <div className="pt-32 pb-24 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto px-6">
        <div className="mb-10 text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-6 tracking-tight drop-shadow-sm">
            {lang === 'en' ? 'Privacy Policy' : 'Chính sách bảo mật'}
          </h1>
          <p className="text-slate-500 font-medium mb-8">
            {lang === 'en' ? 'Last updated: June 10, 2026' : 'Cập nhật lần cuối: 10/06/2026'}
          </p>
          <div className="inline-flex bg-slate-200/80 rounded-full p-1 shadow-inner border border-slate-200">
            <button 
              onClick={() => setLang('en')}
              className={`px-8 py-2 rounded-full text-sm font-bold transition-all ${lang === 'en' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              English
            </button>
            <button 
              onClick={() => setLang('vi')}
              className={`px-8 py-2 rounded-full text-sm font-bold transition-all ${lang === 'vi' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Tiếng Việt
            </button>
          </div>
        </div>

        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-8 md:p-12 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-10 [&_h2]:mb-4 [&_p]:mb-4 [&_p]:text-slate-600 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_ul]:mb-6 [&_li]:text-slate-600 [&_a]:text-blue-600 [&_a:hover]:underline">
          {lang === 'en' ? (
            <>
              <h2>1. Information We Collect</h2>
              <p>Welcome to ONI.vn. We understand that privacy is important and are committed to protecting your personal and business data. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our services and platforms, including our mobile applications and extensions.</p>
              <ul>
                <li><strong>Personal Information:</strong> Name, email address, phone number, and other contact details provided during registration.</li>
                <li><strong>Business Data:</strong> Data from sales activities, customer information, products, and transactions. (Note: For BYOD configurations, this data resides entirely on your own servers/databases and ONI.vn does not store it unless granted explicit permission.)</li>
                <li><strong>Device and Usage Logs:</strong> IP addresses, browser types, operating system versions, access times, and your interactions on our platform/application.</li>
              </ul>

              <h2>2. How We Use Information</h2>
              <p>The information collected is used for the following purposes:</p>
              <ul>
                <li>To provide, maintain, and improve ONI.vn services.</li>
                <li>To provide customer support, troubleshoot technical issues, and respond to your requests.</li>
                <li>To send important notices regarding your account, security, and service updates.</li>
                <li>To analyze and optimize the user experience on our platform.</li>
              </ul>

              <h2>3. Information Sharing and Disclosure</h2>
              <p>We are committed to NOT selling, renting, or sharing your personal and business data to third parties for marketing purposes. We may only share information under the following circumstances:</p>
              <ul>
                <li>With your explicit consent.</li>
                <li>To comply with legal obligations required by competent state authorities according to the laws of Vietnam.</li>
                <li>With third-party service providers (such as cloud hosting, email services) who have signed strict confidentiality agreements to support the operation of ONI.vn.</li>
              </ul>

              <h2>4. Data Security</h2>
              <p>We apply rigorous technical and organizational security measures to protect your information against unauthorized access, alteration, disclosure, or destruction. ONI.vn utilizes data encryption in transit, robust firewalls, and isolated database architecture to ensure maximum safety, especially with the Bring Your Own Database (BYOD) option.</p>

              <h2>5. Your Rights</h2>
              <p>You have the right to:</p>
              <ul>
                <li>Access, update, and correct your personal information in the Account Settings.</li>
                <li>Request the deletion of all data (subject to legal retention obligations if any).</li>
                <li>Withdraw your consent to receive marketing communications (excluding mandatory system-related notifications).</li>
              </ul>

              <h2>6. Changes to This Policy</h2>
              <p>We may update this Privacy Policy from time to time to reflect changes in our data collection practices or legal requirements. Any changes will be directly notified on the ONI.vn platform or via email before they officially take effect.</p>

              <h2>7. Contact Us</h2>
              <p>If you have any questions or concerns about this Privacy Policy, please contact our support team at:</p>
              <ul>
                <li><strong>Email:</strong> support@oni.vn</li>
                <li><strong>Support Community:</strong> <a href="https://zalo.me/g/owlxjd9bqfhocunnrjos" target="_blank" rel="noopener noreferrer">Zalo Support Group</a></li>
              </ul>
            </>
          ) : (
            <>
              <h2>1. Thông tin chúng tôi thu thập</h2>
              <p>Chào mừng bạn đến với ONI.vn. Chúng tôi hiểu rằng quyền riêng tư là một vấn đề quan trọng và chúng tôi cam kết bảo vệ thông tin cá nhân cũng như dữ liệu kinh doanh của bạn. Chính sách bảo mật này giải thích cách chúng tôi thu thập, sử dụng, tiết lộ và bảo vệ thông tin của bạn khi bạn sử dụng dịch vụ và nền tảng của ONI.vn, bao gồm cả ứng dụng di động và các tiện ích mở rộng (extensions).</p>
              <ul>
                <li><strong>Thông tin cá nhân:</strong> Tên, địa chỉ email, số điện thoại, và các thông tin liên hệ khác khi bạn đăng ký tài khoản.</li>
                <li><strong>Dữ liệu kinh doanh:</strong> Dữ liệu từ các hoạt động bán hàng, thông tin khách hàng, sản phẩm và giao dịch (lưu ý: đối với cấu hình BYOD, dữ liệu này hoàn toàn nằm trên máy chủ/cơ sở dữ liệu của bạn và ONI.vn không trực tiếp lưu trữ nếu không được cấp quyền).</li>
                <li><strong>Thông tin thiết bị và nhật ký sử dụng:</strong> Địa chỉ IP, loại trình duyệt, phiên bản hệ điều hành, thời gian truy cập và các tương tác của bạn trên nền tảng/ứng dụng.</li>
              </ul>

              <h2>2. Cách chúng tôi sử dụng thông tin</h2>
              <p>Thông tin thu thập được sử dụng cho các mục đích sau:</p>
              <ul>
                <li>Cung cấp, duy trì và cải thiện dịch vụ của ONI.vn.</li>
                <li>Hỗ trợ khách hàng, giải quyết các sự cố kỹ thuật và phản hồi các yêu cầu của bạn.</li>
                <li>Gửi các thông báo quan trọng về tài khoản, bảo mật và các bản cập nhật dịch vụ.</li>
                <li>Phân tích và tối ưu hóa trải nghiệm người dùng trên nền tảng.</li>
              </ul>

              <h2>3. Chia sẻ và Tiết lộ thông tin</h2>
              <p>Chúng tôi cam kết KHÔNG bán, cho thuê hoặc chia sẻ thông tin cá nhân và dữ liệu kinh doanh của bạn cho bên thứ ba vì mục đích tiếp thị. Chúng tôi chỉ có thể chia sẻ thông tin trong các trường hợp:</p>
              <ul>
                <li>Khi có sự đồng ý rõ ràng từ phía bạn.</li>
                <li>Để tuân thủ các yêu cầu hợp pháp của cơ quan nhà nước có thẩm quyền theo quy định của pháp luật Việt Nam.</li>
                <li>Với các đối tác cung cấp dịch vụ bên thứ ba (như dịch vụ lưu trữ đám mây, dịch vụ gửi email) đã ký thỏa thuận bảo mật chặt chẽ để hỗ trợ quá trình vận hành của ONI.vn.</li>
              </ul>

              <h2>4. Bảo mật dữ liệu</h2>
              <p>Chúng tôi áp dụng các biện pháp bảo mật kỹ thuật và tổ chức nghiêm ngặt để bảo vệ thông tin của bạn khỏi việc truy cập, thay đổi, tiết lộ hoặc phá hủy trái phép. ONI.vn áp dụng mã hóa dữ liệu truyền tải, hệ thống tường lửa mạnh mẽ, và kiến trúc phân tách cơ sở dữ liệu để đảm bảo an toàn tối đa, đặc biệt là với tùy chọn BYOD (Bring Your Own Database).</p>

              <h2>5. Quyền lợi của bạn</h2>
              <p>Bạn có quyền:</p>
              <ul>
                <li>Truy cập, cập nhật và chỉnh sửa thông tin cá nhân trong phần Cài đặt tài khoản.</li>
                <li>Yêu cầu xóa toàn bộ dữ liệu (tùy thuộc vào các nghĩa vụ lưu trữ pháp lý nếu có).</li>
                <li>Rút lại sự đồng ý về việc nhận các thông báo truyền thông (ngoại trừ các thông báo bắt buộc liên quan đến hệ thống).</li>
              </ul>

              <h2>6. Thay đổi chính sách</h2>
              <p>Chúng tôi có thể cập nhật Chính sách bảo mật này theo thời gian để phản ánh các thay đổi trong thực tiễn thu thập dữ liệu hoặc các yêu cầu pháp lý. Các thay đổi sẽ được thông báo trực tiếp trên nền tảng của ONI.vn hoặc qua email trước khi chính thức áp dụng.</p>

              <h2>7. Liên hệ với chúng tôi</h2>
              <p>Nếu bạn có bất kỳ câu hỏi hoặc thắc mắc nào về Chính sách bảo mật này, vui lòng liên hệ với bộ phận hỗ trợ của chúng tôi tại:</p>
              <ul>
                <li><strong>Email:</strong> support@oni.vn</li>
                <li><strong>Cộng đồng hỗ trợ:</strong> <a href="https://zalo.me/g/owlxjd9bqfhocunnrjos" target="_blank" rel="noopener noreferrer">Zalo Support Group</a></li>
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
