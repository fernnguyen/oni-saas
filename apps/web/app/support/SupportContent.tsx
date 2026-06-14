'use client';

import { useState } from 'react';
import Image from 'next/image';
import { 
  Mail, 
  ChevronDown, 
  Send, 
  Phone, 
  HelpCircle, 
  MessageSquare,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';

function Facebook({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

interface FAQItem {
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    question: "Phần mềm ONI.vn có những gói cước nào?",
    answer: "ONI.vn cung cấp các giải pháp phần mềm linh hoạt từ quy mô cửa hàng nhỏ đến doanh nghiệp lớn. Đặc biệt, chúng tôi hỗ trợ tùy chỉnh sâu và thiết kế hạ tầng riêng biệt (Private Cloud/BYOD) để tối ưu vận hành cho từng chuỗi kinh doanh. Vui lòng liên hệ trực tiếp với chúng tôi để nhận tư vấn phương án và báo giá phù hợp nhất."
  },
  {
    question: "Tính năng BYOD (Sở hữu dữ liệu riêng) hoạt động thế nào?",
    answer: "Với cơ chế BYOD (Bring Your Own Database), bạn có thể kết nối ONI.vn trực tiếp với tài khoản cơ sở dữ liệu riêng của mình trên Supabase, PostgreSQL hoặc MySQL độc lập. Điều này giúp doanh nghiệp của bạn sở hữu và kiểm soát 100% dữ liệu bán hàng, khách hàng, không phụ thuộc vào máy chủ của bên thứ ba."
  },
  {
    question: "Dữ liệu kinh doanh của tôi có được bảo mật không?",
    answer: "Có, bảo mật là ưu tiên hàng đầu của chúng tôi. Với kiến trúc tách biệt dữ liệu của ONI.vn và lựa chọn lưu trữ trên DB riêng của khách hàng (BYOD), thông tin nội bộ của bạn được bảo vệ tối đa. Chúng tôi sử dụng mã hóa truyền tải SSL/TLS và tuân thủ các quy trình kiểm toán truy cập nghiêm ngặt."
  },
  {
    question: "Tôi có thể đồng bộ hóa dữ liệu giữa Web và App di động không?",
    answer: "Hoàn toàn được. Giao dịch được đồng bộ hóa tức thời qua Web App của thu ngân, màn hình bếp, và ứng dụng di động dành cho chủ quán (iOS/Android). Các thông báo QR Order hay biến động số dư cũng được gửi thông báo đẩy theo thời gian thực."
  },
  {
    question: "Tôi sẽ nhận được hỗ trợ kỹ thuật như thế nào?",
    answer: "Bạn có thể nhận trợ giúp qua 3 kênh chính: tham gia Cộng đồng Zalo hoạt động 24/7 để nhận phản hồi nhanh từ đội ngũ kỹ thuật và cộng đồng, gửi tin nhắn trực tiếp qua Fanpage Facebook chính thức của ONI, hoặc gửi email hỗ trợ/hợp tác về hello@oni.vn."
  }
];

export function SupportContent() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  
  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('technical');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error('Vui lòng nhập họ và tên của bạn!');
      return;
    }
    if (!message.trim()) {
      toast.error('Vui lòng nhập nội dung yêu cầu hỗ trợ!');
      return;
    }

    setIsSubmitting(true);

    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      toast.success('Gửi yêu cầu hỗ trợ thành công! Đội ngũ ONI.vn sẽ liên hệ lại bạn trong thời gian sớm nhất.');
      
      // Reset Form
      setName('');
      setPhone('');
      setEmail('');
      setMessage('');
      setSubject('technical');
    }, 1500);
  };

  return (
    <div className="pt-28 pb-24 bg-slate-50 min-h-screen">
      
      {/* ── HERO SECTION ── */}
      <section className="relative overflow-hidden py-12 lg:py-16 text-center">
        {/* Decorative background gradients */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full pointer-events-none overflow-hidden">
          <div className="absolute -top-[30%] left-[10%] h-[500px] w-[500px] rounded-full bg-blue-100/40 blur-[100px]" />
          <div className="absolute top-[20%] right-[10%] h-[400px] w-[400px] rounded-full bg-orange-100/30 blur-[100px]" />
        </div>

        <div className="relative max-w-4xl mx-auto px-6 z-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/80 px-4 py-1.5 text-xs font-semibold text-primary shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-blue-600 animate-pulse" />
            Trung tâm hỗ trợ khách hàng ONI.vn
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-6 tracking-tight leading-none drop-shadow-sm">
            Chúng tôi có thể giúp gì cho <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-400">bạn?</span>
          </h1>
          <p className="max-w-2xl mx-auto text-base md:text-lg text-slate-500 leading-relaxed font-medium">
            Kết nối ngay với chúng tôi qua các kênh hỗ trợ trực tuyến hoạt động liên tục, hoặc gửi tin nhắn yêu cầu hỗ trợ kỹ thuật chi tiết bên dưới.
          </p>
        </div>
      </section>

      {/* ── CONTACT CHANNELS GRID ── */}
      <section className="max-w-7xl mx-auto px-6 mb-20">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          
          {/* Zalo Card */}
          <div className="group bg-white rounded-3xl p-8 border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all duration-300 flex flex-col justify-between items-start relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full translate-x-10 -translate-y-10 group-hover:scale-110 transition-transform duration-500 opacity-70 -z-0" />
            
            <div className="relative z-10">
              <div className="bg-blue-50/80 p-3 rounded-2xl inline-block mb-6 border border-blue-100 shadow-inner">
                <Image src="/partners/zalo.svg" alt="Zalo Logo" width={40} height={40} className="w-10 h-10 object-contain" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-blue-600 transition-colors">Cộng đồng Zalo hỗ trợ</h3>
              <p className="text-sm text-slate-500 leading-relaxed mb-6 font-medium">
                Kênh phản hồi nhanh nhất. Nhận sự giúp đỡ trực tiếp từ đội ngũ lập trình viên và thảo luận kinh nghiệm cùng các chủ shop khác.
              </p>
            </div>
            
            <a 
              href="https://zalo.me/g/owlxjd9bqfhocunnrjos" 
              target="_blank" 
              rel="noopener noreferrer"
              className="relative z-10 w-full text-center inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-md hover:shadow-lg transition-all hover:scale-[1.02]"
            >
              Tham gia nhóm Zalo
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          {/* Facebook Card */}
          <div className="group bg-white rounded-3xl p-8 border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all duration-300 flex flex-col justify-between items-start relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full translate-x-10 -translate-y-10 group-hover:scale-110 transition-transform duration-500 opacity-70 -z-0" />

            <div className="relative z-10">
              <div className="bg-indigo-50/80 p-4 rounded-2xl inline-block mb-6 border border-indigo-100 shadow-inner">
                <Facebook className="w-8 h-8 text-indigo-600 fill-current" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-indigo-600 transition-colors">Trang Facebook chính thức</h3>
              <p className="text-sm text-slate-500 leading-relaxed mb-6 font-medium">
                Theo dõi các tin tức cập nhật tính năng mới, hướng dẫn sử dụng phần mềm và gửi tin nhắn trực tiếp qua Messenger.
              </p>
            </div>

            <a 
              href="https://www.facebook.com/onisaas/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="relative z-10 w-full text-center inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-md hover:shadow-lg transition-all hover:scale-[1.02]"
            >
              Ghé thăm Fanpage
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          {/* Email Card */}
          <div className="group bg-white rounded-3xl p-8 border border-slate-200 shadow-sm hover:shadow-xl hover:border-orange-200 transition-all duration-300 flex flex-col justify-between items-start relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-full translate-x-10 -translate-y-10 group-hover:scale-110 transition-transform duration-500 opacity-70 -z-0" />

            <div className="relative z-10">
              <div className="bg-orange-50/80 p-4 rounded-2xl inline-block mb-6 border border-orange-100 shadow-inner">
                <Mail className="w-8 h-8 text-orange-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-orange-600 transition-colors">Hòm thư điện tử Email</h3>
              <p className="text-sm text-slate-500 leading-relaxed mb-6 font-medium">
                Gửi yêu cầu bảo hành, đề xuất tính năng, yêu cầu báo giá doanh nghiệp lớn hoặc các vấn đề liên quan tới tài khoản, hợp tác.
              </p>
            </div>

            <a 
              href="mailto:hello@oni.vn" 
              className="relative z-10 w-full text-center inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold shadow-md hover:shadow-lg transition-all hover:scale-[1.02]"
            >
              Gửi email: hello@oni.vn
              <Mail className="h-4 w-4" />
            </a>
          </div>

        </div>
      </section>

      {/* ── FORM & FAQs DOUBLE COLUMN ── */}
      <section className="max-w-7xl mx-auto px-6">
        <div className="grid gap-12 lg:grid-cols-12 items-start">
          
          {/* Left Column: Contact Form (7 cols) */}
          <div className="lg:col-span-7 bg-white rounded-[2.5rem] border border-slate-200 p-8 md:p-12 shadow-xl shadow-slate-100">
            <div className="mb-8">
              <h2 className="text-2xl font-extrabold text-slate-900 mb-3 flex items-center gap-2.5">
                <MessageSquare className="h-6 w-6 text-primary" />
                Gửi tin nhắn cho chúng tôi
              </h2>
              <p className="text-sm text-slate-500 font-medium">
                Để lại thông tin và yêu cầu của bạn, chúng tôi sẽ phản hồi lại qua Email hoặc Số điện thoại trong vòng 24 giờ làm việc.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="support-name" className="text-xs font-bold text-slate-700 uppercase tracking-wider">Họ và tên <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    id="support-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nguyễn Văn A" 
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-sm font-medium text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="support-phone" className="text-xs font-bold text-slate-700 uppercase tracking-wider">Số điện thoại</label>
                  <input 
                    type="tel" 
                    id="support-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0901234567" 
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-sm font-medium text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all"
                  />
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="support-email" className="text-xs font-bold text-slate-700 uppercase tracking-wider">Địa chỉ Email</label>
                  <input 
                    type="email" 
                    id="support-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com" 
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-sm font-medium text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="support-subject" className="text-xs font-bold text-slate-700 uppercase tracking-wider">Chủ đề hỗ trợ</label>
                  <select 
                    id="support-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-sm font-semibold text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all appearance-none cursor-pointer"
                  >
                    <option value="technical">Hỗ trợ kỹ thuật phần mềm</option>
                    <option value="pricing">Tư vấn báo giá & Gói cước</option>
                    <option value="byod">Kết nối Database riêng (BYOD)</option>
                    <option value="partnership">Hợp tác phát triển & Đại lý</option>
                    <option value="other">Yêu cầu khác</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="support-message" className="text-xs font-bold text-slate-700 uppercase tracking-wider">Nội dung yêu cầu <span className="text-red-500">*</span></label>
                <textarea 
                  id="support-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder="Tôi muốn hỏi về cách cấu hình kết nối cơ sở dữ liệu Supabase của tôi vào hệ thống..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-sm font-medium text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all resize-none"
                  required
                />
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl bg-primary px-8 py-4 text-base font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-75 disabled:pointer-events-none cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Đang gửi yêu cầu...
                  </>
                ) : (
                  <>
                    Gửi yêu cầu hỗ trợ
                    <Send className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Right Column: FAQs (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="mb-2">
              <h2 className="text-2xl font-extrabold text-slate-900 mb-3 flex items-center gap-2.5">
                <HelpCircle className="h-6 w-6 text-primary" />
                Câu hỏi thường gặp
              </h2>
              <p className="text-sm text-slate-500 font-medium">
                Tìm nhanh lời giải đáp cho các câu hỏi phổ biến nhất về cách vận hành hệ thống.
              </p>
            </div>

            <div className="space-y-4">
              {FAQS.map((faq, idx) => {
                const isOpen = openFaqIndex === idx;
                return (
                  <div 
                    key={idx} 
                    className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm transition-all"
                  >
                    <button 
                      onClick={() => toggleFaq(idx)}
                      className="w-full flex items-center justify-between p-5 text-left font-bold text-slate-800 hover:text-primary transition-colors focus:outline-none"
                    >
                      <span className="text-sm pr-4">{faq.question}</span>
                      <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-300 flex-shrink-0 ${isOpen ? 'rotate-180 text-primary' : ''}`} />
                    </button>
                    
                    <div 
                      className={`transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-[300px] border-t border-slate-100' : 'max-h-0'}`}
                    >
                      <p className="p-5 text-xs md:text-sm text-slate-500 leading-relaxed font-medium bg-slate-50/50">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-md relative overflow-hidden">
              <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-10">
                <HelpCircle className="w-40 h-40" />
              </div>
              <div className="relative z-10 space-y-3">
                <h4 className="text-base font-extrabold">Cần hướng dẫn chuyên sâu?</h4>
                <p className="text-xs text-blue-100 leading-relaxed font-medium">
                  Hãy truy cập tài liệu HDSD chi tiết của chúng tôi để xem video minh họa từng bước thiết lập.
                </p>
                <a 
                  href="https://tailieu.oni.vn" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-black bg-white text-blue-600 px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-all hover:scale-105"
                >
                  Xem hướng dẫn sử dụng
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>

        </div>
      </section>
      
    </div>
  );
}
