import { ReactNode } from 'react';

export function AuthSplitLayout({ 
  children, 
  title, 
  subtitle, 
  features 
}: { 
  children: ReactNode, 
  title?: string, 
  subtitle?: ReactNode, 
  features?: {label: string, value: string}[] 
}) {
  return (
    <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Left panel — decorative */}
      <div className="hidden lg:flex lg:w-[55%] relative bg-primary overflow-hidden flex-col justify-center px-16 xl:px-24">
        {/* Decorative shapes */}
        <div className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-white/10 blur-[80px]" />
        <div className="absolute -bottom-20 -right-20 h-[500px] w-[500px] rounded-full bg-blue-400/20 blur-[60px]" />
        <div className="absolute top-1/2 right-1/4 h-[300px] w-[300px] -translate-y-1/2 rounded-full bg-cyan-400/20 blur-[60px]" />
        <div className="absolute top-1/4 left-1/3 h-[250px] w-[250px] rounded-[3rem] rotate-12 bg-white/5 backdrop-blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 h-[150px] w-[150px] rounded-[2rem] -rotate-12 bg-white/5 backdrop-blur-2xl" />
        
        {/* Content */}
        <div className="relative z-10 text-white max-w-xl">
          <div className="mb-8 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight mb-6">
            {title || "Quản lý toàn bộ nền tảng tại một nơi"}
          </h1>
          <div className="text-lg text-blue-100 mb-12 leading-relaxed">
            {subtitle || "Truy cập hệ thống POS, quản lý đơn hàng, công nợ và khách hàng một cách liền mạch với bảo mật tối đa."}
          </div>
          
          <div className="flex flex-wrap gap-x-12 gap-y-6 pt-6 border-t border-white/10">
            {(features || [
              { value: "100%", label: "BẢO MẬT" },
              { value: "24/7", label: "TRUY CẬP" },
              { value: "Real-time", label: "PHÂN TÍCH" },
            ]).map((f, i) => (
              <div key={i}>
                <div className="text-2xl font-bold text-white mb-1 tracking-tight">{f.value}</div>
                <div className="text-xs font-semibold text-blue-200 tracking-wider uppercase">{f.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col justify-center bg-white lg:bg-slate-50 px-6 py-12 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:max-w-md lg:bg-white lg:p-10 lg:rounded-3xl lg:shadow-xl lg:shadow-blue-900/5 lg:border lg:border-slate-100">
          {children}
        </div>
      </div>
    </div>
  );
}
