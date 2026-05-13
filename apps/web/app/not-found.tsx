import Link from 'next/link';
import Image from 'next/image';
import { headers } from 'next/headers';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';

export default async function NotFound() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';
  
  const rootBase = rootDomain.split(':')[0];
  const hostBase = host.split(':')[0];
  
  let subdomain: string | null = null;
  if (hostBase !== rootBase && hostBase.endsWith(`.${rootBase}`)) {
    const sub = hostBase.slice(0, hostBase.length - rootBase.length - 1);
    if (sub && sub !== 'www') {
      subdomain = sub;
    }
  }

  let isWorkspaceMissing = false;

  if (subdomain) {
    const admin = getSupabaseAdminClient();
    const { data } = await admin.from('tenants').select('id').eq('slug', subdomain).maybeSingle();
    if (!data) {
      isWorkspaceMissing = true;
    }
  }

  const protocol = host.includes('localhost') ? 'http' : 'https';
  const mainDomainUrl = `${protocol}://${rootDomain}`;
  const registerUrl = `${mainDomainUrl}/register?domain=${subdomain}`;

  // Workspace Not Found UI
  if (isWorkspaceMissing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-6">
        <div className="text-center max-w-md w-full">
          <div className="flex justify-center mb-8">
            <div className="relative w-24 h-24 drop-shadow-md">
              <Image src="/logo.png" alt="ONI Logo" fill className="object-contain" priority />
            </div>
          </div>
          
          <h1 className="text-8xl font-extrabold text-primary tracking-tighter drop-shadow-sm mb-4">
            404
          </h1>
          
          <div className="space-y-3 mb-10">
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
              Workspace Không Tồn Tại
            </h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Không gian làm việc <span className="font-semibold text-slate-800">"{subdomain}"</span> hiện chưa được đăng ký trên hệ thống của <span className="font-semibold text-slate-700">ONI</span>.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <a
              href={registerUrl}
              className="inline-flex items-center justify-center px-8 py-3.5 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95 gap-2"
            >
              Đăng ký "{subdomain}" ngay
            </a>
            <a
              href={mainDomainUrl}
              className="inline-flex items-center justify-center px-8 py-3.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-sm active:scale-95 gap-2"
            >
              Trở về Trang Chủ
            </a>
          </div>
        </div>

        <div className="absolute bottom-8 text-center">
          <p className="text-xs text-slate-400">
            &copy; {new Date().getFullYear()} <span className="font-medium">ONI Platform</span>. All rights reserved.
          </p>
        </div>
      </div>
    );
  }

  // Standard 404 UI
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-6">
      <div className="text-center max-w-md w-full">
        <div className="flex justify-center mb-8">
          <div className="relative w-24 h-24 drop-shadow-md">
            <Image src="/logo.png" alt="ONI Logo" fill className="object-contain" priority />
          </div>
        </div>
        
        <h1 className="text-9xl font-extrabold text-primary tracking-tighter drop-shadow-sm mb-4">
          404
        </h1>
        
        <div className="space-y-3 mb-10">
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
            Oops! Không tìm thấy trang
          </h2>
          <p className="text-slate-500 text-sm leading-relaxed">
            Có vẻ như trang bạn đang tìm kiếm không tồn tại hoặc đã bị xóa khỏi hệ thống.
          </p>
        </div>

        <a
          href={mainDomainUrl}
          className="inline-flex items-center justify-center px-8 py-3.5 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95 gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Trở về Trang Chủ
        </a>
      </div>

      <div className="absolute bottom-8 text-center">
        <p className="text-xs text-slate-400">
          &copy; {new Date().getFullYear()} <span className="font-medium">ONI Platform</span>. All rights reserved.
        </p>
      </div>
    </div>
  );
}
