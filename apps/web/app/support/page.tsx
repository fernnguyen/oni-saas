import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { FloatingZalo } from '../components/layout/FloatingZalo';
import { SupportContent } from './SupportContent';

export const metadata = {
  title: 'Liên hệ & Hỗ trợ - ONI.vn',
  description: 'Trung tâm liên hệ hỗ trợ khách hàng ONI.vn. Kết nối qua Zalo, Facebook, Email hoặc gửi yêu cầu hỗ trợ trực tiếp.',
};

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
      <Navbar />
      <SupportContent />
      <Footer />
      <FloatingZalo />
    </div>
  );
}
