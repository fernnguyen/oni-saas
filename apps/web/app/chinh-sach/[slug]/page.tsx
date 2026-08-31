import { notFound } from 'next/navigation';
import { POLICIES } from '../policiesData';
import { Navbar } from '../../components/layout/Navbar';
import { Footer } from '../../components/layout/Footer';
import { FloatingZalo } from '../../components/layout/FloatingZalo';
import type { Metadata } from 'next';

export function generateStaticParams() {
  return POLICIES.map((policy) => ({
    slug: policy.slug,
  }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const policy = POLICIES.find((p) => p.slug === params.slug);
  if (!policy) return { title: 'Không tìm thấy trang' };
  
  return {
    title: `${policy.title} - ONI.vn`,
    description: policy.title,
  };
}

export default function PolicyPage({ params }: { params: { slug: string } }) {
  const policy = POLICIES.find((p) => p.slug === params.slug);

  if (!policy) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
      <Navbar />
      
      <main className="pt-32 pb-24">
        <div className="max-w-4xl mx-auto px-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 mb-8 text-center uppercase">
              {policy.title}
            </h1>
            
            <div className="space-y-10">
              {policy.sections.map((section, idx) => (
                <div key={idx} className="space-y-4">
                  <h2 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-2">
                    {section.title}
                  </h2>
                  <ul className="space-y-3">
                    {section.items.map((item, itemIdx) => {
                      const isBoldPrefix = item.includes(':');
                      if (isBoldPrefix) {
                        const [prefix, ...rest] = item.split(':');
                        return (
                          <li key={itemIdx} className="text-slate-600 leading-relaxed text-sm flex gap-3">
                            <span className="text-primary mt-1">•</span>
                            <span>
                              <span className="font-semibold text-slate-800">{prefix}:</span>
                              {rest.join(':')}
                            </span>
                          </li>
                        );
                      }
                      
                      return (
                        <li key={itemIdx} className="text-slate-600 leading-relaxed text-sm flex gap-3">
                          <span className="text-primary mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            
          </div>
        </div>
      </main>

      <Footer />
      <FloatingZalo />
    </div>
  );
}
