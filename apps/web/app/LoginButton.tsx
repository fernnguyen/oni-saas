'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

export function LoginButton() {
  const [showModal, setShowModal] = useState(false);
  const [domain, setDomain] = useState('');
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('oni_workspace_domain');
    if (saved) {
      setDomain(saved);
    }
  }, []);

  // Autofocus when modal opens
  useEffect(() => {
    if (showModal && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showModal]);

  const handleLoginClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowModal(true);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (domain) {
      let cleanDomain = domain.toLowerCase().trim();
      // Remove protocol if user pastes a full URL
      cleanDomain = cleanDomain.replace(/^https?:\/\//, '');
      // Remove .oni.vn if user types it
      cleanDomain = cleanDomain.replace(/\.oni\.vn.*$/, '');
      
      localStorage.setItem('oni_workspace_domain', cleanDomain);
      window.location.href = `https://${cleanDomain}.oni.vn/auth/signin`;
    }
  };

  return (
    <>
      <button 
        onClick={handleLoginClick} 
        className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
      >
        Đăng nhập
      </button>

      {showModal && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div 
            className="w-full max-w-md rounded-[2rem] bg-white p-8 md:p-10 shadow-2xl relative border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button 
              onClick={() => setShowModal(false)}
              className="absolute top-5 right-5 h-8 w-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-center mb-8 mt-2">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 border border-blue-100 text-primary shadow-inner">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
                </svg>
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Đăng nhập hệ thống</h2>
              <p className="text-slate-500 mt-2 text-sm font-medium">Nhập tên miền gian hàng của bạn để truy cập</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-6">
              <div className="relative group">
                <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-primary to-orange-400 opacity-20 group-hover:opacity-30 transition duration-300 blur" />
                <div className="relative flex items-center rounded-xl border border-slate-200 bg-white overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all shadow-sm">
                  <div className="pl-4 pr-3 py-3.5 text-slate-400">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                  </div>
                  <input
                    ref={inputRef}
                    id="domain"
                    type="text"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="ten-cua-hang"
                    className="flex-1 w-full bg-transparent py-3.5 text-base font-semibold text-slate-900 placeholder-slate-400 focus:outline-none"
                    required
                  />
                  <div className="pr-4 py-3.5 text-base font-medium text-slate-400 select-none">
                    .oni.vn
                  </div>
                </div>
              </div>
              
              <button 
                type="submit"
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-base font-bold text-white shadow-lg shadow-primary/30 hover:bg-primary-dark hover:shadow-xl hover:shadow-primary/40 hover:-translate-y-0.5 transition-all"
              >
                Tiếp tục đến gian hàng
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </button>
            </form>
          </div>
          
          {/* Click outside to close */}
          <div className="absolute inset-0 z-[-1]" onClick={() => setShowModal(false)} />
        </div>,
        document.body
      )}
    </>
  );
}
