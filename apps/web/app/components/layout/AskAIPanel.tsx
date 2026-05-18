'use client';

import { useState } from 'react';

export function AskAIPanel() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative inline-flex h-8 items-center justify-center overflow-hidden rounded-lg p-[1px] focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 cursor-pointer shrink-0 hidden sm:flex"
      >
        <span className="absolute inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#c7d2fe_0%,#4f46e5_50%,#c7d2fe_100%)]" />
        <span className="inline-flex h-full w-full items-center justify-center gap-1.5 rounded-[7px] bg-white px-3 py-1.5 text-sm font-semibold text-indigo-600 backdrop-blur-3xl hover:bg-indigo-50/50 transition-colors">
          <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
          </svg>
          <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">Hỏi AI</span>
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] overflow-hidden">
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity" onClick={() => setOpen(false)} />
          <section className="absolute inset-y-0 right-0 flex max-w-full pl-10">
            <div className="w-screen max-w-sm transform transition-transform">
              <div className="flex h-full flex-col bg-white shadow-2xl">
                <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur-md">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white tracking-wide">ONI AI ASSISTANT</h2>
                      <p className="text-[10px] text-indigo-100 font-medium">BETA VERSION</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    className="rounded-md text-indigo-100 hover:text-white focus:outline-none focus:ring-2 focus:ring-white cursor-pointer"
                  >
                    <span className="sr-only">Đóng panel</span>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="relative flex-1 px-4 py-6 overflow-y-auto bg-slate-50/50">
                  <div className="flex flex-col gap-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-sm">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div className="rounded-2xl rounded-tl-none bg-white p-3 shadow-sm text-sm text-slate-700 border border-slate-100 leading-relaxed">
                        Chào bạn! Tôi là trợ lý AI của ONI. Tôi có thể giúp bạn tra cứu doanh thu, kiểm tra tồn kho, hoặc phân tích hoạt động kinh doanh.
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3 flex-row-reverse">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 font-bold text-[10px]">
                        AT
                      </div>
                      <div className="rounded-2xl rounded-tr-none bg-indigo-600 p-3 shadow-sm text-sm text-white leading-relaxed">
                        Hôm nay cửa hàng có bao nhiêu đơn hàng mới?
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-sm">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div className="rounded-2xl rounded-tl-none bg-white p-3 shadow-sm text-sm text-slate-700 border border-slate-100 leading-relaxed">
                        <p>Hôm nay chi nhánh của bạn đã có <strong className="text-indigo-600">12 đơn hàng mới</strong>.</p>
                        <p className="mt-1.5">Tổng doanh thu tạm tính là <strong className="text-emerald-600">4,500,000 đ</strong>.</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="border-t border-slate-200 bg-white p-4 shrink-0">
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1 pl-3 focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-1 focus-within:ring-indigo-500 transition-colors shadow-sm">
                    <input 
                      type="text" 
                      placeholder="Hỏi ONI AI..." 
                      className="flex-1 bg-transparent text-sm focus:outline-none placeholder-slate-400 py-1.5"
                    />
                    <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer transition-colors shadow-sm">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </button>
                  </div>
                  <p className="mt-2.5 text-center text-[10px] text-slate-400">AI có thể cung cấp thông tin chưa chính xác. Vui lòng kiểm tra lại.</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
