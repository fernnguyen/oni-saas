import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { FloatingZalo } from '../components/layout/FloatingZalo';
import { PrivacyContent } from './PrivacyContent';

export const metadata = {
  title: 'Privacy Policy - ONI.vn',
  description: 'Privacy Policy for ONI.vn',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
      <Navbar />
      <PrivacyContent />
      <Footer />
      <FloatingZalo />
    </div>
  );
}
